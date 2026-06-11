import * as core from '@actions/core'
import { createCommandRouter, setJsonOutput, handleError } from '@w3-io/action-core'
import { PiiClient, PiiError } from './pii.js'
import { StorjStorage } from './storj.js'

/**
 * W3 PII Envelope Action — command dispatch.
 *
 * Two commands (contract: w3-action.yaml, confirmed w3-give #104):
 *   encrypt-and-store  → { wrapped_dek, pii_blob_key }
 *   decrypt-for-read   → { plaintext } | ACCESS_DENIED when deletion-attested
 *
 * Secret hygiene: kek / storj keys are registered with core.setSecret so
 * the runner masks them in any log line; plaintext and the DEK are never
 * logged at all (plaintext leaves only as the decrypt result JSON).
 */

function getClient() {
  const kek = core.getInput('kek', { required: true })
  const accessKey = core.getInput('storj-access-key', { required: true })
  const secretKey = core.getInput('storj-secret-key', { required: true })
  core.setSecret(kek)
  core.setSecret(accessKey)
  core.setSecret(secretKey)

  // `provider` reserves room for a KMS-backed KEK; v0 supports self-hosted only.
  const provider = core.getInput('provider') || 'self-hosted'
  if (provider !== 'self-hosted') {
    throw new PiiError('NOT_SUPPORTED', `provider '${provider}' is not supported (v0: self-hosted)`)
  }

  const storage = new StorjStorage({
    accessKey,
    secretKey,
    endpoint: core.getInput('storj-endpoint') || undefined,
  })
  return new PiiClient({ kek, storage })
}

const handlers = {
  'encrypt-and-store': async () => {
    const client = getClient()
    const result = await client.encryptAndStore({
      tenantId: core.getInput('tenant-id', { required: true }),
      userId: core.getInput('user-id', { required: true }),
      plaintext: core.getInput('plaintext', { required: true }),
      bucket: core.getInput('bucket', { required: true }),
    })
    setJsonOutput('result', result)
    core.info(`encrypt-and-store: stored ${result.pii_blob_key}`)
  },

  'decrypt-for-read': async () => {
    const client = getClient()
    const result = await client.decryptForRead({
      tenantId: core.getInput('tenant-id', { required: true }),
      userId: core.getInput('user-id', { required: true }),
      wrappedDek: core.getInput('wrapped-dek', { required: true }),
      piiBlobKey: core.getInput('pii-blob-key', { required: true }),
      bucket: core.getInput('bucket', { required: true }),
      deletionAttested: core.getInput('deletion-attested', { required: true }),
    })
    setJsonOutput('result', result)
    core.info('decrypt-for-read: ok') // never log the plaintext
  },
}

const router = createCommandRouter(handlers)

/**
 * Top-level run wrapper.
 *
 * Failure surface for downstream (1.3/1.4) authors: a command handler that
 * throws a PiiError is caught INSIDE createCommandRouter via action-core's
 * `handleError`, which sets the `error-code` output (e.g. ACCESS_DENIED) and
 * fails the step with `[CODE] message`. The try/catch below only guards a
 * synchronous throw from the router itself (a missing `command` input — a plain
 * Error); the `instanceof PiiError` branch mirrors the w3-sxt-action reference
 * and is defensive (no handler PiiError reaches it today).
 */
export async function run() {
  try {
    await router()
  } catch (error) {
    if (error instanceof PiiError) {
      handleError(error) // → error-code output + `[CODE] message`, same as the router path
    } else {
      handleError(error)
    }
  }
}
