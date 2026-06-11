/**
 * PII envelope tests — the Story 1.2 mandated cases plus edge cases:
 *   1. Round-trip byte-exact with a MULTIBYTE fixture (not ASCII-only)
 *   2. Deletion-refusal: attested → ACCESS_DENIED, no fetch, no plaintext
 *   3. Fail-closed gate: anything other than explicit 'false' refuses
 *   4. Tenant isolation: prefix guard AND cryptographic (AAD) layer
 *   5. Idempotent re-put: same (bucket, key) → one object, safe overwrite
 *   6. Hygiene: result carries only the contract fields; no DEK leak
 *
 * Real crypto, fake storage: MemoryStorage implements the injected
 * storage interface and records every call so tests can assert "no fetch
 * happened" on refusal paths.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PiiClient, PiiError, decodeKey } from '../src/pii.js'

const TENANT_A = 'hope-give'
const TENANT_B = 'fortheblue'
const USER = 'usr_01HZX5T9'
const BUCKET = 'hope-give-pii'
// Multibyte fixture: em-dash, accents, CJK, emoji, RTL — byte-exactness here
// catches encoding bugs an ASCII fixture would hide.
const PII_FIXTURE = JSON.stringify({
  email: 'dônor—试@példa.example',
  legal_name: 'Zoë 大久保 Ωمحمد 🎁',
  note: 'line1\nline2\twith nbsp',
})

const KEK_A = randomBytes(32).toString('base64')
const KEK_B = randomBytes(32).toString('base64')

class MemoryStorage {
  constructor() {
    this.objects = new Map()
    this.calls = []
  }
  async put({ bucket, key, body, contentType }) {
    this.calls.push({ op: 'put', bucket, key })
    this.objects.set(`${bucket}/${key}`, { body: Buffer.from(body), contentType })
    return { key }
  }
  async get({ bucket, key }) {
    this.calls.push({ op: 'get', bucket, key })
    const obj = this.objects.get(`${bucket}/${key}`)
    if (!obj) throw new PiiError('NOT_FOUND', `blob not found (get ${bucket}/${key})`)
    return Buffer.from(obj.body)
  }
}

let storage
beforeEach(() => {
  storage = new MemoryStorage()
})

function client(kek = KEK_A) {
  return new PiiClient({ kek, storage })
}

async function expectPiiError(promise, code) {
  try {
    await promise
  } catch (err) {
    assert.ok(err instanceof PiiError, `expected PiiError, got ${err?.constructor?.name}: ${err}`)
    assert.equal(err.code, code)
    return err
  }
  assert.fail(`expected PiiError ${code}, but the call succeeded`)
}

describe('encrypt-and-store', () => {
  it('returns exactly { wrapped_dek, pii_blob_key } and stores one sealed blob', async () => {
    const result = await client().encryptAndStore({
      tenantId: TENANT_A,
      userId: USER,
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
    assert.deepEqual(Object.keys(result).sort(), ['pii_blob_key', 'wrapped_dek'])
    assert.match(
      result.pii_blob_key,
      new RegExp(`^${TENANT_A}/pii/${USER}/[0-9a-f-]{36}$`),
      'blob key is tenant-prefixed and uuid-suffixed',
    )
    // wrapped_dek decodes to iv(12) + tag(16) + dek(32) = 60 bytes
    assert.equal(Buffer.from(result.wrapped_dek, 'base64').length, 60)
    assert.equal(storage.objects.size, 1)
    const stored = storage.objects.get(`${BUCKET}/${result.pii_blob_key}`).body
    assert.ok(!stored.includes(Buffer.from('dônor')), 'stored blob is not plaintext')
    assert.ok(stored.length >= 12 + 16 + Buffer.byteLength(PII_FIXTURE, 'utf8'))
  })

  it('rejects missing inputs with INVALID_INPUT', async () => {
    await expectPiiError(
      client().encryptAndStore({ tenantId: '', userId: USER, plaintext: 'x', bucket: BUCKET }),
      'INVALID_INPUT',
    )
    await expectPiiError(
      client().encryptAndStore({ tenantId: TENANT_A, userId: USER, plaintext: '', bucket: BUCKET }),
      'INVALID_INPUT',
    )
  })

  it('rejects a malformed KEK with INVALID_INPUT; accepts hex and base64 KEKs', async () => {
    assert.throws(() => new PiiClient({ kek: 'not-a-key', storage }), PiiError)
    assert.equal(decodeKey(randomBytes(32).toString('hex')).length, 32)
    assert.equal(decodeKey(randomBytes(32).toString('base64')).length, 32)
  })
})

describe('decrypt-for-read: round trip', () => {
  it('round-trips the multibyte fixture byte-exactly', async () => {
    const c = client()
    const enc = await c.encryptAndStore({
      tenantId: TENANT_A,
      userId: USER,
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
    const dec = await c.decryptForRead({
      tenantId: TENANT_A,
      userId: USER,
      wrappedDek: enc.wrapped_dek,
      piiBlobKey: enc.pii_blob_key,
      bucket: BUCKET,
      deletionAttested: 'false',
    })
    assert.deepEqual(Object.keys(dec), ['plaintext'])
    assert.equal(dec.plaintext, PII_FIXTURE)
    assert.equal(
      Buffer.from(dec.plaintext, 'utf8').compare(Buffer.from(PII_FIXTURE, 'utf8')),
      0,
      'byte-exact',
    )
  })

  it('round-trips with a fresh client instance (no in-memory coupling)', async () => {
    const enc = await client().encryptAndStore({
      tenantId: TENANT_A,
      userId: USER,
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
    const dec = await client().decryptForRead({
      tenantId: TENANT_A,
      userId: USER,
      wrappedDek: enc.wrapped_dek,
      piiBlobKey: enc.pii_blob_key,
      bucket: BUCKET,
      deletionAttested: 'false',
    })
    assert.equal(dec.plaintext, PII_FIXTURE)
  })
})

describe('decrypt-for-read: deletion gate (fail-closed)', () => {
  let enc
  beforeEach(async () => {
    enc = await client().encryptAndStore({
      tenantId: TENANT_A,
      userId: USER,
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
    storage.calls = [] // reset so refusal tests can assert "no fetch"
  })

  const attempt = (deletionAttested) =>
    client().decryptForRead({
      tenantId: TENANT_A,
      userId: USER,
      wrappedDek: enc.wrapped_dek,
      piiBlobKey: enc.pii_blob_key,
      bucket: BUCKET,
      deletionAttested,
    })

  it("'true' → ACCESS_DENIED, no storage fetch, no plaintext in the error", async () => {
    const err = await expectPiiError(attempt('true'), 'ACCESS_DENIED')
    assert.equal(storage.calls.length, 0, 'refused before any storage call')
    assert.ok(!String(err.message).includes('dônor'), 'error carries no plaintext')
  })

  it("'TRUE ' (case/whitespace) still refuses", async () => {
    await expectPiiError(attempt('  TRUE '), 'ACCESS_DENIED')
    assert.equal(storage.calls.length, 0)
  })

  it("anything other than explicit 'false' fails closed with INVALID_INPUT", async () => {
    for (const v of ['', '1', 'yes', 'no', 'attested', 'null', 'undefined']) {
      await expectPiiError(attempt(v), 'INVALID_INPUT')
    }
    assert.equal(storage.calls.length, 0, 'no fetch on any malformed gate value')
  })

  it("'false' proceeds", async () => {
    const dec = await attempt('false')
    assert.equal(dec.plaintext, PII_FIXTURE)
  })
})

describe('decrypt-for-read: tenant isolation', () => {
  it('structural: tenant B cannot read a tenant-A blob key (prefix guard, no fetch)', async () => {
    const enc = await client().encryptAndStore({
      tenantId: TENANT_A,
      userId: USER,
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
    storage.calls = []
    await expectPiiError(
      client(KEK_B).decryptForRead({
        tenantId: TENANT_B,
        userId: USER,
        wrappedDek: enc.wrapped_dek,
        piiBlobKey: enc.pii_blob_key, // still hope-give/...
        bucket: BUCKET,
        deletionAttested: 'false',
      }),
      'ACCESS_DENIED',
    )
    assert.equal(storage.calls.length, 0, 'refused before any storage call')
  })

  it('cryptographic: a blob copied into tenant B fails authentication (AAD scope)', async () => {
    const enc = await client().encryptAndStore({
      tenantId: TENANT_A,
      userId: USER,
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
    // Adversarial copy: replicate tenant A's sealed blob under a tenant-B key,
    // and try to unwrap with the SAME KEK (worst case: shared/leaked KEK).
    const blob = storage.objects.get(`${BUCKET}/${enc.pii_blob_key}`).body
    const foreignKey = `${TENANT_B}/pii/${USER}/copied`
    storage.objects.set(`${BUCKET}/${foreignKey}`, { body: blob })
    await expectPiiError(
      client(KEK_A).decryptForRead({
        tenantId: TENANT_B,
        userId: USER,
        wrappedDek: enc.wrapped_dek,
        piiBlobKey: foreignKey,
        bucket: BUCKET,
        deletionAttested: 'false',
      }),
      'DECRYPT_FAILED',
    )
  })

  it('a seeded foreign-tenant blob is ignored by a tenant-A read', async () => {
    storage.objects.set(`${BUCKET}/${TENANT_B}/pii/${USER}/foreign`, {
      body: Buffer.from('unrelated'),
    })
    const c = client()
    const enc = await c.encryptAndStore({
      tenantId: TENANT_A,
      userId: USER,
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
    const dec = await c.decryptForRead({
      tenantId: TENANT_A,
      userId: USER,
      wrappedDek: enc.wrapped_dek,
      piiBlobKey: enc.pii_blob_key,
      bucket: BUCKET,
      deletionAttested: 'false',
    })
    assert.equal(dec.plaintext, PII_FIXTURE)
  })

  it('AAD is injective: a delimiter in an id cannot collide two principals under a shared KEK', async () => {
    // ('acme|x','y') and ('acme','x|y') would both serialize to 'acme|x|y' under
    // a naive `${tenant}|${user}` AAD. Principal P1 seals; P2 — which collides
    // only under that naive encoding — reuses P1's wrapped_dek and copies the
    // blob under its own valid 'acme/' prefix. It must STILL fail to decrypt.
    const c = client() // shared KEK_A: worst case, one KEK wrapping both DEKs
    const p1 = await c.encryptAndStore({
      tenantId: 'acme|x',
      userId: 'y',
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
    const blob = storage.objects.get(`${BUCKET}/${p1.pii_blob_key}`).body
    const forgedKey = 'acme/pii/x|y/forged' // lives under P2's own 'acme/' prefix
    storage.objects.set(`${BUCKET}/${forgedKey}`, { body: blob })
    await expectPiiError(
      c.decryptForRead({
        tenantId: 'acme',
        userId: 'x|y',
        wrappedDek: p1.wrapped_dek,
        piiBlobKey: forgedKey,
        bucket: BUCKET,
        deletionAttested: 'false',
      }),
      'DECRYPT_FAILED',
    )
  })

  it('wrong user in the same tenant fails authentication (AAD binds user too)', async () => {
    const c = client()
    const enc = await c.encryptAndStore({
      tenantId: TENANT_A,
      userId: USER,
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
    await expectPiiError(
      c.decryptForRead({
        tenantId: TENANT_A,
        userId: 'usr_SOMEONE_ELSE',
        wrappedDek: enc.wrapped_dek,
        piiBlobKey: enc.pii_blob_key,
        bucket: BUCKET,
        deletionAttested: 'false',
      }),
      'DECRYPT_FAILED',
    )
  })
})

describe('decrypt-for-read: integrity + failure modes', () => {
  let c, enc
  beforeEach(async () => {
    c = client()
    enc = await c.encryptAndStore({
      tenantId: TENANT_A,
      userId: USER,
      plaintext: PII_FIXTURE,
      bucket: BUCKET,
    })
  })

  it('wrong KEK → DECRYPT_FAILED (no plaintext)', async () => {
    await expectPiiError(
      client(KEK_B).decryptForRead({
        tenantId: TENANT_A,
        userId: USER,
        wrappedDek: enc.wrapped_dek,
        piiBlobKey: enc.pii_blob_key,
        bucket: BUCKET,
        deletionAttested: 'false',
      }),
      'DECRYPT_FAILED',
    )
  })

  it('tampered blob → DECRYPT_FAILED', async () => {
    const slot = storage.objects.get(`${BUCKET}/${enc.pii_blob_key}`)
    slot.body[slot.body.length - 1] ^= 0xff
    await expectPiiError(
      c.decryptForRead({
        tenantId: TENANT_A,
        userId: USER,
        wrappedDek: enc.wrapped_dek,
        piiBlobKey: enc.pii_blob_key,
        bucket: BUCKET,
        deletionAttested: 'false',
      }),
      'DECRYPT_FAILED',
    )
  })

  it('missing blob → NOT_FOUND', async () => {
    await expectPiiError(
      c.decryptForRead({
        tenantId: TENANT_A,
        userId: USER,
        wrappedDek: enc.wrapped_dek,
        piiBlobKey: `${TENANT_A}/pii/${USER}/does-not-exist`,
        bucket: BUCKET,
        deletionAttested: 'false',
      }),
      'NOT_FOUND',
    )
  })

  it('garbage wrapped-dek → DECRYPT_FAILED', async () => {
    await expectPiiError(
      c.decryptForRead({
        tenantId: TENANT_A,
        userId: USER,
        wrappedDek: Buffer.from('garbage').toString('base64'),
        piiBlobKey: enc.pii_blob_key,
        bucket: BUCKET,
        deletionAttested: 'false',
      }),
      'DECRYPT_FAILED',
    )
  })
})

describe('storage semantics', () => {
  it('same (bucket, key) re-put is a safe overwrite — one object, no duplicate', async () => {
    const key = `${TENANT_A}/pii/${USER}/fixed-id`
    await storage.put({ bucket: BUCKET, key, body: Buffer.from('v1') })
    await storage.put({ bucket: BUCKET, key, body: Buffer.from('v1') })
    assert.equal(storage.objects.size, 1, 'idempotent re-put')
    await storage.put({ bucket: BUCKET, key, body: Buffer.from('v2') })
    assert.equal(storage.objects.size, 1)
    assert.equal((await storage.get({ bucket: BUCKET, key })).toString(), 'v2', 'last write wins')
  })

  it('two encrypts for the same user mint distinct blob keys and DEKs', async () => {
    const c = client()
    const args = { tenantId: TENANT_A, userId: USER, plaintext: PII_FIXTURE, bucket: BUCKET }
    const a = await c.encryptAndStore(args)
    const b = await c.encryptAndStore(args)
    assert.notEqual(a.pii_blob_key, b.pii_blob_key)
    assert.notEqual(a.wrapped_dek, b.wrapped_dek, 'fresh CSPRNG DEK per call')
    assert.equal(storage.objects.size, 2)
  })
})
