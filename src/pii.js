/**
 * PII envelope — the core logic of the action.
 *
 * Crypto design (Story 1.2 / W3-797):
 *   - Per-user DEK: 32 random bytes from Node's CSPRNG, generated here,
 *     never returned to the caller in the clear.
 *   - Blob: AES-256-GCM under the DEK. Layout: iv(12) || tag(16) || ciphertext.
 *   - Wrapped DEK: AES-256-GCM under the tenant KEK, same layout, base64.
 *   - AAD binds every seal to `${tenantId}|${userId}` — a blob or wrapped
 *     DEK replayed under another tenant/user fails authentication even if
 *     the key-prefix guard were bypassed (cryptographic tenant isolation,
 *     defense in depth on top of the `${tenantId}/` key prefix).
 *
 * Deletion gate (fail-closed): decrypt-for-read proceeds ONLY when the
 * caller passes deletion-attested === 'false'. 'true' → ACCESS_DENIED;
 * anything else → INVALID_INPUT. Both refuse before any storage fetch.
 *
 * This module is independent of @actions/core (template rule): inputs
 * arrive as plain arguments, storage is injected (S3 in production, a
 * memory fake in tests).
 */

import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { W3ActionError } from '@w3-io/action-core'

const IV_LEN = 12
const TAG_LEN = 16
const KEY_LEN = 32

/**
 * Typed error for the pii action. ACCESS_DENIED is the contract-specified
 * code for the deletion gate (and tenant-scope violations); DECRYPT_FAILED
 * deliberately does not distinguish wrong-key / wrong-scope / tampered so
 * the error is not an oracle.
 */
export class PiiError extends W3ActionError {
  constructor(code, message, { statusCode, details } = {}) {
    super(code, message, { statusCode, details })
    this.name = 'PiiError'
  }
}

/** Decode a KEK supplied as 64-char hex or base64; must be exactly 32 bytes. */
export function decodeKey(raw, label = 'kek') {
  if (!raw || typeof raw !== 'string') {
    throw new PiiError('INVALID_INPUT', `${label} is required`)
  }
  const trimmed = raw.trim()
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex')
  }
  const b64 = Buffer.from(trimmed, 'base64')
  if (b64.length === KEY_LEN && b64.toString('base64') === normalizeB64(trimmed)) {
    return b64
  }
  throw new PiiError(
    'INVALID_INPUT',
    `${label} must decode to ${KEY_LEN} bytes (64-char hex or base64)`,
  )
}

/** Canonical base64 (strip padding differences) for round-trip validation. */
function normalizeB64(s) {
  return Buffer.from(s, 'base64').toString('base64')
}

/**
 * AAD that binds ciphertext to its tenant/user scope. The JSON-array encoding
 * is INJECTIVE: unlike `${tenantId}|${userId}`, no two distinct (tenant, user)
 * pairs can serialize to the same bytes (e.g. ('a|b','c') vs ('a','b|c') both
 * once mapped to 'a|b|c'). That closes a cross-principal decrypt path that a
 * shared or leaked KEK would otherwise open — the AAD is the cryptographic
 * tenant/user boundary, so it must be unambiguous.
 */
function scopeAad(tenantId, userId) {
  return Buffer.from(JSON.stringify([tenantId, userId]), 'utf8')
}

/** AES-256-GCM seal: iv(12) || tag(16) || ciphertext. */
function seal(key, plaintextBuf, aad) {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad)
  const ct = Buffer.concat([cipher.update(plaintextBuf), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct])
}

/** AES-256-GCM open; throws DECRYPT_FAILED on any authentication failure. */
function open(key, sealedBuf, aad) {
  if (!Buffer.isBuffer(sealedBuf) || sealedBuf.length < IV_LEN + TAG_LEN) {
    throw new PiiError('DECRYPT_FAILED', 'sealed payload is malformed')
  }
  const iv = sealedBuf.subarray(0, IV_LEN)
  const tag = sealedBuf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = sealedBuf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(aad)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()])
  } catch {
    throw new PiiError(
      'DECRYPT_FAILED',
      'authentication failed (wrong key, wrong tenant/user scope, or corrupted data)',
    )
  }
}

function requireString(value, label) {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    throw new PiiError('INVALID_INPUT', `${label} is required`)
  }
  return value
}

export class PiiClient {
  /**
   * @param {object} opts
   * @param {string} opts.kek      Tenant master KEK (64-char hex or base64, 32 bytes).
   * @param {object} opts.storage  Storage client with put({bucket,key,body,contentType})
   *                               and get({bucket,key}) → Buffer. Injected: S3/Storj in
   *                               production, a memory fake in tests.
   */
  constructor({ kek, storage } = {}) {
    this.kek = decodeKey(kek, 'kek')
    if (!storage || typeof storage.put !== 'function' || typeof storage.get !== 'function') {
      throw new PiiError('INVALID_INPUT', 'storage client with put/get is required')
    }
    this.storage = storage
  }

  /**
   * Generate a DEK, seal the plaintext, store the blob, wrap the DEK.
   * Returns { wrapped_dek, pii_blob_key } — never the DEK or ciphertext.
   */
  async encryptAndStore({ tenantId, userId, plaintext, bucket }) {
    requireString(tenantId, 'tenant-id')
    requireString(userId, 'user-id')
    requireString(bucket, 'bucket')
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
      throw new PiiError('INVALID_INPUT', 'plaintext is required')
    }

    const aad = scopeAad(tenantId, userId)
    const dek = randomBytes(KEY_LEN)
    const blob = seal(dek, Buffer.from(plaintext, 'utf8'), aad)
    const piiBlobKey = `${tenantId}/pii/${userId}/${randomUUID()}`

    // Store first, wrap last: if the upload fails nothing references the blob,
    // and re-running simply mints a fresh blob id (the caller's own idempotency
    // key governs whether a retry happens at all). Same (bucket, key) re-put is
    // a safe overwrite — the key is the natural idempotency token.
    await this.storage.put({
      bucket,
      key: piiBlobKey,
      body: blob,
      contentType: 'application/octet-stream',
    })

    const wrappedDek = seal(this.kek, dek, aad).toString('base64')
    return { wrapped_dek: wrappedDek, pii_blob_key: piiBlobKey }
  }

  /**
   * Deletion gate → tenant-scope guard → unwrap → fetch → open.
   * The gate and the scope guard both refuse BEFORE any storage fetch.
   */
  async decryptForRead({ tenantId, userId, wrappedDek, piiBlobKey, bucket, deletionAttested }) {
    requireString(tenantId, 'tenant-id')
    requireString(userId, 'user-id')
    requireString(wrappedDek, 'wrapped-dek')
    requireString(piiBlobKey, 'pii-blob-key')
    requireString(bucket, 'bucket')

    // Fail-closed deletion gate: only an explicit 'false' proceeds.
    const attested = String(deletionAttested ?? '')
      .trim()
      .toLowerCase()
    if (attested === 'true') {
      throw new PiiError('ACCESS_DENIED', 'deletion attested — refusing to decrypt')
    }
    if (attested !== 'false') {
      throw new PiiError(
        'INVALID_INPUT',
        "deletion-attested must be 'true' or 'false' (fail-closed: refusing to decrypt)",
      )
    }

    // Structural tenant isolation: the blob key must live under this tenant's
    // prefix. (The AAD check below enforces the same boundary cryptographically.)
    if (!piiBlobKey.startsWith(`${tenantId}/`)) {
      throw new PiiError('ACCESS_DENIED', 'blob key is outside the tenant scope')
    }

    const aad = scopeAad(tenantId, userId)
    const dek = open(this.kek, Buffer.from(wrappedDek, 'base64'), aad)
    if (dek.length !== KEY_LEN) {
      throw new PiiError('DECRYPT_FAILED', 'unwrapped DEK has the wrong length')
    }

    const blob = await this.storage.get({ bucket, key: piiBlobKey })
    const plaintext = open(dek, blob, aad)
    return { plaintext: plaintext.toString('utf8') }
  }
}
