/**
 * Storj storage client (S3-compatible gateway).
 *
 * Thin wrapper over @aws-sdk/client-s3 pointed at the Storj S3 gateway.
 * Satisfies the storage interface PiiClient expects:
 *   put({ bucket, key, body, contentType })  → { key }
 *   get({ bucket, key })                     → Buffer
 *
 * S3 PUT semantics make a same-(bucket, key) re-put a safe overwrite —
 * the key is the natural idempotency token (AC 5).
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { Buffer } from 'node:buffer'
import { PiiError } from './pii.js'

// Storj's hosted S3-compatible gateway. Override via the optional
// `storj-endpoint` input for staging/local (e.g. MinIO) testing.
const DEFAULT_ENDPOINT = 'https://gateway.storjshare.io'

export class StorjStorage {
  constructor({ accessKey, secretKey, endpoint = DEFAULT_ENDPOINT } = {}) {
    if (!accessKey || !secretKey) {
      throw new PiiError('INVALID_INPUT', 'storj-access-key and storj-secret-key are required')
    }
    this.s3 = new S3Client({
      endpoint,
      region: 'us1', // the gateway accepts any region label; Storj docs use us1
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    })
  }

  async put({ bucket, key, body, contentType }) {
    try {
      await this.s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      )
      return { key }
    } catch (err) {
      throw mapS3Error(err, `put ${bucket}/${key}`)
    }
  }

  async get({ bucket, key }) {
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      return Buffer.from(await res.Body.transformToByteArray())
    } catch (err) {
      throw mapS3Error(err, `get ${bucket}/${key}`)
    }
  }
}

/** Map S3 failures onto the typed error codes the contract uses. */
function mapS3Error(err, op) {
  if (err instanceof PiiError) return err
  const name = err?.name || ''
  const status = err?.$metadata?.httpStatusCode
  if (name === 'NoSuchKey' || name === 'NotFound' || status === 404) {
    return new PiiError('NOT_FOUND', `blob not found (${op})`, { statusCode: 404 })
  }
  // Credential/permission problems and everything else are upstream failures;
  // never echo credentials or payloads into the message.
  return new PiiError('UPSTREAM_FAILURE', `storage error on ${op}: ${name || 'unknown'}`, {
    statusCode: status,
  })
}
