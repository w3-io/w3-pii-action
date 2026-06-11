# w3-pii-action

> **Story 1.2 (W3-797, Epic 1 W3-767).** The two-command contract (no `tombstone`;
> orchestrator passes `deletion-attested`) was confirmed on w3-give #104
> (RJ, 2026-06-10). Implementation lands via the Story 1.2 dev pass.

Self-hosted donor-PII envelope for w3-give workflows, mirroring the `w3-sxt-action`
shape (scaffolded from `w3-io/w3-action-template`).

## What it does

- **`encrypt-and-store`** — generates a per-user **DEK** inside the action's runtime
  (Node CSPRNG; no protocol random primitive needed), AES-256-GCM-encrypts the PII
  payload, uploads the ciphertext to **Storj** at a tenant-scoped key
  (`{tenant-id}/pii/{user-id}/{blob-id}`), wraps the DEK under the **tenant master KEK**, and
  returns `{ wrapped_dek, pii_blob_key }`. Plaintext, the raw DEK, and raw
  ciphertext never leave the action.
- **`decrypt-for-read`** — fail-closed on `deletion-attested: true` (ACCESS_DENIED;
  no fetch, no plaintext). Otherwise fetches the blob, unwraps the DEK under the
  KEK, decrypts, and returns `{ plaintext }`.

## Design rules

- **Stateless / decoupled:** the action never reads workflow state. The caller
  (orchestrator) performs the `UserDeletion` tombstone check and passes the result
  in via `deletion-attested`. The tombstone _write_ is a state write (the state
  action), not a command here.
- **Tenant isolation:** per-tenant KEK; blob keys are tenant-scoped.
- **Secrets:** `kek` / `storj-access-key` / `storj-secret-key` arrive as
  secret-backed inputs (`${{ secrets.* }}`); never inlined, never logged.
- **v0 = policy tombstone**, not crypto-erasure (the wrapped DEK and KEK persist);
  true erasure is the W3-797 hardening follow-up.

## Authentication

The action needs three **secret-backed** inputs; pass each via `${{ secrets.* }}`
and never inline a literal. They are registered with `core.setSecret` at startup so
the runner masks them in logs.

| Input              | What                                                                                | Source                                       |
| ------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| `kek`              | Tenant master key-encryption key (32 bytes, hex or base64) — wraps the per-user DEK | Per-tenant secret (e.g. `HOPE_GIVE_PII_KEK`) |
| `storj-access-key` | Storj S3 gateway access key                                                         | Storj credentials                            |
| `storj-secret-key` | Storj S3 gateway secret key                                                         | Storj credentials                            |

The KEK is symmetric (not a blockchain signing key); each tenant has its own, so a
compromised KEK is contained to one tenant. `storj-endpoint` (optional) overrides the
gateway for staging/MinIO. No other auth: the action reads no workflow state and holds
no signing keys.

## Invocation (from a w3-give orchestrator)

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
# then persist via the state action:
#   wrapped_dek  = ${{ fromJSON(steps.pii.outputs.result).wrapped_dek }}
#   pii_blob_key = ${{ fromJSON(steps.pii.outputs.result).pii_blob_key }}
```

Contract source of truth: [`w3-action.yaml`](w3-action.yaml). Design inputs:
`w3-give/_bmad-output/implementation-artifacts/1-2-storj-and-pii-envelope.md`.

## Status

- [x] Scaffold from `w3-io/w3-action-template`
- [x] Invocation contract confirmed (RJ, w3-give #104, 2026-06-10)
- [x] Implementation (`src/`): envelope crypto, Storj S3 client, command router
- [x] Unit suite (`test/pii.test.js`): byte-exact multibyte round-trip,
      deletion-refusal (no plaintext, no fetch), tenant isolation (structural +
      cryptographic AAD), idempotent re-put, integrity/failure modes
- [ ] First real Storj e2e recorded in `test/workflows/RESULTS.md` (see `TODO.md`)
- [ ] Publish `@v0` tag

See [`TODO.md`](TODO.md) for known gaps and the W3-797 crypto-erasure follow-up.
