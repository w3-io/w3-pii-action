# E2E Test Results

> Two verification levels. **Level 1 (action binary vs real S3) is DONE** and
> recorded below. **Level 2 (the action deployed + triggered via the W3 runtime
> against real Storj) is pending** a devnet + Storj credentials.

## Level 1 — published `dist/` vs real S3 (MinIO) — ✅ 12/12 (2026-06-12)

The published action binary (`dist/index.js`) invoked exactly as an orchestrator
would (GHA `INPUT_*` env → `core.getInput` → router → `result` output), with the
real `@aws-sdk/client-s3` talking to a local MinIO S3 endpoint. MinIO and Storj
expose the same S3 API; the action uses only plain `PutObject`/`GetObject`.

| Check | AC | Result |
| --- | --- | --- |
| `encrypt-and-store` exits 0, returns `{ wrapped_dek, pii_blob_key }` | 2 | ✅ |
| blob key is `{tenant}/pii/{user}/{uuid}` | 2, 6 | ✅ |
| object at rest is ciphertext (no plaintext in the stored blob) | 2 | ✅ |
| `decrypt-for-read` (gate open) round-trips the multibyte payload byte-exact | 3 | ✅ |
| `decrypt-for-read` (gate closed) → `ACCESS_DENIED`, exit 1, no plaintext | 3, 4 | ✅ |
| cross-tenant read (`tenant=evil`) refused with a typed error | 6 | ✅ |
| KEK appears only in the `::add-mask::` registration (masked, never logged) | 7 | ✅ |

Reproduce: `docker run -d -p 9100:9000 -e MINIO_ROOT_USER=… -e MINIO_ROOT_PASSWORD=… minio/minio server /data`,
create the bucket, then invoke `dist/index.js` with `INPUT_STORJ-ENDPOINT=http://localhost:9100`
and the `INPUT_*` command inputs.

## Level 2 — W3 runtime + real Storj (`e2e.yaml`) — ⏳ pending

What Level 1 does **not** cover: Storj's specific S3 gateway behavior, and the W3
runner invoking the action via `uses: w3-io/w3-pii-action@v0`. Run `e2e.yaml` to
close it.

## Prerequisites (Level 2)

| Credential        | Env var            | Source                          |
| ----------------- | ------------------ | ------------------------------- |
| Tenant master KEK | `PII_KEK_E2E`      | 32-byte key (hex or base64)     |
| Storj access key  | `STORJ_ACCESS_KEY` | Storj S3 gateway credentials    |
| Storj secret key  | `STORJ_SECRET_KEY` | Storj S3 gateway credentials    |

A writable test bucket must exist (default `w3-pii-e2e`).

## How to run (Level 2)

```bash
# Secrets: PII_KEK_E2E, STORJ_ACCESS_KEY, STORJ_SECRET_KEY (+ a writable bucket)
w3 workflow deploy test/workflows/e2e.yaml
w3 workflow "e2e-test-pii" trigger
```
