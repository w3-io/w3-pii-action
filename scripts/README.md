# scripts/

Reusable helpers for the W3 partner action ecosystem. Each script is
self-contained, idempotent, and documented at the top of its source.

These scripts are versioned with the template so anyone forking it gets
them automatically. They're also used by the consistency audit and the
modernize-action workflow described in `../AGENTS.md`.

## What's here

| Script                                                       | Purpose                                                                                                                                                                                                                       | When to use                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`audit.sh`](./audit.sh)                                     | Walks every `w3-*-action` repo in the parent workspace and checks each against the 21-item standards checklist in `../AGENTS.md`. Reads from `origin/<default-branch>`, not the local working tree. Outputs a markdown table. | Run periodically to detect drift, or before a release to verify consistency.                                |
| [`modernize-pkg.mjs`](./modernize-pkg.mjs)                   | Updates a partner action's `package.json` to add the standard scripts, bump `@w3-io/action-core`, drop legacy fields, set ESM. Idempotent.                                                                                    | When modernizing an older action that has stale conventions.                                                |
| [`fix-router-handleError.mjs`](./fix-router-handleError.mjs) | Wraps a bare `router()` call in `src/index.js` with a try/catch + `handleError` so the imported `handleError` becomes used (silences the lint error and produces structured failure reports).                                 | When migrating an older action where the router is invoked at the end of `index.js` without error handling. |

## Conventions

- All bash scripts start with `set -o errexit`, `set -o nounset`, `set -o pipefail`
- Node scripts use ESM (`import` / `export`) and `node:` imports for stdlib
- Every script supports `<script> --help` (or has clear usage in its first comment block)
- Scripts that mutate files are **idempotent** — running them twice is a no-op the second time
- Read-only scripts exit 0 if everything is OK and 1 if any check fails

## Running

From the template root:

```bash
# Audit every w3 action in the workspace
./scripts/audit.sh

# Audit a single repo
./scripts/audit.sh w3-bitgo-action

# Skip the git fetch (faster, may be stale)
./scripts/audit.sh --no-fetch

# Modernize a target action's package.json
node ./scripts/modernize-pkg.mjs ../w3-foo-action/package.json

# Fix the router/handleError pattern in a target action
node ./scripts/fix-router-handleError.mjs ../w3-foo-action/src/index.js
```

## Adding a new script

If you find yourself doing the same mechanical fix across multiple action
repos more than twice, it's a candidate for becoming a script here.

Requirements:

1. Self-contained — no extra dependencies beyond Node 22+ stdlib and POSIX shell
2. Idempotent — running twice is a no-op
3. Documented — comment block at the top explaining what, why, when
4. Read-only or in-place — never write to a path the user didn't specify
5. Listed in this README's table

Don't promote one-time migration scripts (e.g., the Wave 2 Node 20→24 sweep)
to permanent assets. Those belong in commit history, not in `scripts/`.
