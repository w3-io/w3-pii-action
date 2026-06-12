# TODO

Known gaps and follow-ups, newest version first.

## v0 (Story 1.2 / W3-797)

- [x] **Published `@v0`** (v0.1.0, 2026-06-12). `uses: w3-io/w3-pii-action@v0`.
      `test/workflows/e2e.yaml` still pins `@master` to exercise the tip.
- [ ] **Fill `test/workflows/RESULTS.md`** from a real devnet run against Storj
      (round-trip + the expected ACCESS_DENIED refusal). Currently the unit
      suite (`test/pii.test.js`) is the conformance evidence; the e2e is wired
      but unrun (no sandbox Storj creds yet).
- [ ] **KMS-backed KEK** — the `provider` input reserves the surface; v0 only
      supports `self-hosted` (in-secret KEK). A `kms` provider is future work.

## W3-797 hardening (post-v0)

- [ ] **Crypto-erasure** — v0 is a _policy_ tombstone (the wrapped DEK and the
      tenant KEK both persist, so a path that bypasses the orchestrator's
      `UserDeletion` check could still decrypt). True erasure means destroying
      or rotating a per-user wrapping key so the DEK becomes unrecoverable.
