# E2E Test Results

> Last verified: PENDING — not yet run against real Storj (no sandbox creds in CI).
> The unit suite (`test/pii.test.js`, 20 cases) is the current conformance
> evidence; the e2e below round-trips through the real action + Storj and must
> be recorded here after the first devnet run (see TODO.md).

## Environment

- **Test method**: deploy the workflow to a local W3 network, then trigger it.
- **Protocol version**: master (record commit hash on run)
- **Runner image**: w3io/w3-runner (Node 24)

## Prerequisites

| Credential        | Env var            | Source                       |
| ----------------- | ------------------ | ---------------------------- |
| Tenant master KEK | `PII_KEK_E2E`      | 32-byte key (hex or base64)  |
| Storj access key  | `STORJ_ACCESS_KEY` | Storj S3 gateway credentials |
| Storj secret key  | `STORJ_SECRET_KEY` | Storj S3 gateway credentials |

A writable test bucket must exist (default `w3-pii-e2e`).

## Results

| #   | Step                           | Command             | Status  | Notes                        |
| --- | ------------------------------ | ------------------- | ------- | ---------------------------- |
| 1   | encrypt-and-store              | `encrypt-and-store` | PENDING | multibyte fixture            |
| 2   | decrypt-for-read (gate open)   | `decrypt-for-read`  | PENDING | expect byte-exact round-trip |
| 3   | decrypt-for-read (gate closed) | `decrypt-for-read`  | PENDING | expect ACCESS_DENIED refusal |

## How to run

```bash
# Secrets: PII_KEK_E2E, STORJ_ACCESS_KEY, STORJ_SECRET_KEY (+ a writable bucket)
w3 workflow deploy test/workflows/e2e.yaml
w3 workflow "e2e-test-pii" trigger
```
