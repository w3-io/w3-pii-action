# w3-pii-action

> **DRAFT scaffold — Story 1.2 (W3-797, Epic 1 W3-767).** The two-command contract
> (no `tombstone`; orchestrator passes `deletion-attested`) is pending RJ's nod on
> w3-give #104. Implementation lands via the Story 1.2 dev pass. Do not publish
> until the contract is confirmed.

Self-hosted donor-PII envelope for w3-give workflows, mirroring the `w3-sxt-action`
shape (scaffolded from `w3-io/w3-action-template`).

## What it does

- **`encrypt-and-store`** — generates a per-user **DEK** inside the action's runtime
  (Node CSPRNG; no protocol random primitive needed), AES-256-GCM-encrypts the PII
  payload, uploads the ciphertext to **Storj** at a tenant-scoped key
  (`pii/{user-id}/{blob-id}`), wraps the DEK under the **tenant master KEK**, and
  returns `{ wrapped_dek, pii_blob_key }`. Plaintext, the raw DEK, and raw
  ciphertext never leave the action.
- **`decrypt-for-read`** — fail-closed on `deletion-attested: true` (ACCESS_DENIED;
  no fetch, no plaintext). Otherwise fetches the blob, unwraps the DEK under the
  KEK, decrypts, and returns `{ plaintext }`.

## Design rules

- **Stateless / decoupled:** the action never reads workflow state. The caller
  (orchestrator) performs the `UserDeletion` tombstone check and passes the result
  in via `deletion-attested`. The tombstone *write* is a state write (the state
  action), not a command here.
- **Tenant isolation:** per-tenant KEK; blob keys are tenant-scoped.
- **Secrets:** `kek` / `storj-access-key` / `storj-secret-key` arrive as
  secret-backed inputs (`${{ secrets.* }}`); never inlined, never logged.
- **v0 = policy tombstone**, not crypto-erasure (the wrapped DEK and KEK persist);
  true erasure is the W3-797 hardening follow-up.

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
- [x] Draft invocation contract (`w3-action.yaml` + `action.yml`)
- [ ] Contract confirmed (RJ, w3-give #104)
- [ ] Implementation (`src/`): crypto + Storj client + command router
- [ ] Tests + conformance: byte-exact round-trip (multibyte fixture),
      deletion-refusal (no plaintext), tenant isolation, idempotent re-put
- [ ] Publish `@v0`
