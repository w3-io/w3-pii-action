# PII Envelope — usage guide

## What is this?

The self-hosted donor-PII envelope for w3-give (Story 1.2 / W3-797). It keeps
donor PII out of workflow state: the payload lives as an AES-256-GCM blob in
Storj, encrypted with a per-user **DEK** that the action generates internally
(Node CSPRNG) and returns only **wrapped** under the tenant master **KEK**.
GDPR/CCPA deletion is enforced by the caller-supplied `deletion-attested` gate
(the orchestrator reads the `UserDeletion` attestation from state; the action
itself is stateless).

## Quick start

```yaml
- name: Encrypt + store donor PII
  id: pii
  uses: w3-io/w3-pii-action@v0
  with:
    command: encrypt-and-store
    tenant-id: ${{ inputs.tenant_id }}
    user-id: ${{ inputs.user_id }}
    plaintext: ${{ steps.payload.outputs.pii_json }}
    bucket: hope-give-pii
    kek: ${{ secrets.HOPE_GIVE_PII_KEK }}
    storj-access-key: ${{ secrets.STORJ_ACCESS_KEY }}
    storj-secret-key: ${{ secrets.STORJ_SECRET_KEY }}
# Persist via the state action (NOT this action's job):
#   wrapped_dek  = ${{ fromJSON(steps.pii.outputs.result).wrapped_dek }}
#   pii_blob_key = ${{ fromJSON(steps.pii.outputs.result).pii_blob_key }}
```

```yaml
- name: Read donor PII (deletion-gated)
  id: read
  uses: w3-io/w3-pii-action@v0
  with:
    command: decrypt-for-read
    tenant-id: ${{ inputs.tenant_id }}
    user-id: ${{ inputs.user_id }}
    wrapped-dek: ${{ fromJSON(steps.user.outputs.result).wrapped_dek }}
    pii-blob-key: ${{ fromJSON(steps.user.outputs.result).pii_blob_key }}
    bucket: hope-give-pii
    deletion-attested: ${{ steps.deletion_check.outputs.exists }}
    kek: ${{ secrets.HOPE_GIVE_PII_KEK }}
    storj-access-key: ${{ secrets.STORJ_ACCESS_KEY }}
    storj-secret-key: ${{ secrets.STORJ_SECRET_KEY }}
# result: { plaintext } — or the step FAILS with ACCESS_DENIED when attested.
```

## Commands

| Command             | Result JSON                     | Notes                                                            |
| ------------------- | ------------------------------- | ---------------------------------------------------------------- |
| `encrypt-and-store` | `{ wrapped_dek, pii_blob_key }` | DEK generated in-action; plaintext/DEK/ciphertext never leave it |
| `decrypt-for-read`  | `{ plaintext }`                 | Fail-closed: only `deletion-attested: 'false'` proceeds          |

## Key + blob format (implementation contract)

- **KEK input:** 64-char hex or base64; must decode to exactly 32 bytes.
- **Sealed layout:** `iv(12) || gcm-tag(16) || ciphertext`; `wrapped_dek` is that
  layout over the 32-byte DEK, base64-encoded (60 bytes → 80 b64 chars).
- **AAD:** every seal is bound to `tenantId|userId` — ciphertext replayed under
  another tenant/user fails authentication (cryptographic tenant isolation, on
  top of the `tenantId/` blob-key prefix guard).
- **Blob key:** `{tenant-id}/pii/{user-id}/{uuid}` inside the tenant bucket.

## Error codes

| Code               | When                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `ACCESS_DENIED`    | `deletion-attested: 'true'`, or a blob key outside the tenant scope                                |
| `INVALID_INPUT`    | missing/malformed inputs; non-`true`/`false` gate value (fail-closed); bad KEK                     |
| `DECRYPT_FAILED`   | wrong KEK, wrong tenant/user scope, tampered or malformed payload (deliberately not distinguished) |
| `NOT_FOUND`        | blob missing from the bucket                                                                       |
| `UPSTREAM_FAILURE` | Storj/S3 transport or permission errors                                                            |
| `NOT_SUPPORTED`    | `provider` other than `self-hosted` (v0)                                                           |

## v0 tombstone caveat

This is a **policy** tombstone: the wrapped DEK and the KEK both persist, so a
path that bypasses the orchestrator's `UserDeletion` check could still decrypt.
True crypto-erasure (per-user key destruction/rotation) is the W3-797 hardening
follow-up.
