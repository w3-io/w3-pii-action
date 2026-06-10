# W3 Action Standards

This document is the **canonical standards reference** for every W3 partner action repo. It's read by both AI agents (Claude Code, Cursor, Codex) and human contributors.

If you're forking this template to build a new action, follow this doc verbatim. If you're modernizing an existing action that has drifted, run the consistency audit (`scripts/audit.sh`) and fix anything it flags using the recipes below.

## Audience

| Reader                 | What you need from this doc                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **AI agents**          | The 36-item checklist with grep/inspect commands and per-item fix recipes. Skip the prose.                                              |
| **Human contributors** | The "why" sections — they encode the lessons we learned the hard way. The full set of standards is short enough to read in one sitting. |
| **Both**               | The file structure pattern and the canonical `src/` + `test/` shapes.                                                                   |

---

## How to use this document

1. **Adding a new partner integration?** Fork this template, then walk the checklist top to bottom. Most items are inherited from the template — the work is implementing your client and tests.
2. **Modernizing an existing action?** Run `scripts/audit.sh` from this repo against the target action's directory. It produces a per-check PASS/FAIL table. Fix each FAIL using the matching recipe below.
3. **Auditing the whole ecosystem?** Run `scripts/audit.sh --all` (no arg). It walks every `w3-*-action` directory in the parent workspace and produces a consolidated table.

---

## The 36-item standards checklist

Every active W3 partner action must satisfy **all** of these. If you're tempted to skip one, read the "why" first — most of these were paid for in real bugs.

### A. CI workflow (`.github/workflows/ci.yml`)

The workflow lives in `.github/workflows/ci.yml` and runs on push and pull_request to the default branch. The canonical version is in this template — copy it verbatim to new actions.

**A1. Workflow file exists.** Trivial but worth checking; some early actions never got one.

**A2. Node 24** in `setup-node`. Not 20 (deprecated for GHA in June 2026), not 22 (works but inconsistent).

- **Why**: GitHub deprecated Node 20 for actions runtimes. Bumping prevents future breakage and keeps the runtime consistent across the ecosystem.
- **Verify**: `grep "node-version: 24" .github/workflows/ci.yml`

**A3. `permissions: contents: read, packages: read`** at the workflow level.

- **Why**: Without `packages: read`, `npm ci` cannot download `@w3-io/action-core` from GitHub Packages. CI fails with `403 read_package`.
- **Verify**: `grep -A2 "permissions:" .github/workflows/ci.yml`

**A4. `setup-node` includes `registry-url: 'https://npm.pkg.github.com'` and `scope: '@w3-io'`.**

- **Why**: Without these, `npm ci` 404s on `@w3-io/*` packages even with auth. The two settings together tell npm "look at GitHub Packages for `@w3-io` scoped packages."
- **Verify**: `grep -E "registry-url|scope" .github/workflows/ci.yml`

**A5. `npm ci` step has `env: NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.**

- **Why**: Required so npm can authenticate to GitHub Packages. The default `GITHUB_TOKEN` works because `@w3-io/action-core` is now public.
- **Verify**: `grep -A1 "npm ci" .github/workflows/ci.yml | grep NODE_AUTH_TOKEN`

**A6. Build step uses `npm run build` (not `npm run package`).**

- **Why**: Old template versions used `npm run package` but the package.json script is `build`. The mismatch silently broke CI.
- **Verify**: `grep "npm run package" .github/workflows/ci.yml` should return nothing.

**A7. Triggers on `[main, master]`.** Use both branch names so the same workflow file works on repos with either default.

- **Verify**: `grep -A2 "branches:" .github/workflows/ci.yml`

### B. Prettier configuration

**B8. `.prettierignore` exists** and excludes at minimum `dist/`, `node_modules/`, `package-lock.json`.

- **Why**: Without `dist/` excluded, `npm run all` enters a chicken-and-egg loop: `format` reformats the NCC build output, then `build` immediately overwrites it with raw NCC output, then `format:check` fails. The exact failure mode we hit on `w3-bitgo-action`.
- **Verify**: `cat .prettierignore` should include `dist/`

### C. Source code

**C9. `@w3-io/action-core` at `^0.4.1`** or newer.

- **Why**: 0.4.1 is the first public release. Earlier versions were on a private package that broke CI for public repos. Any newer minor (`^0.5.x`, `^0.6.x`, ...) or major (`^1.x`, etc.) passes — some actions run ahead of the template.
- **Verify**: `grep '"@w3-io/action-core"' package.json`

**C10. `"type": "module"`** in `package.json` (ESM only).

- **Why**: All shared infrastructure (action-core, the bridge client) is ESM. CommonJS actions need awkward dynamic imports and break the standard `import` patterns.
- **Verify**: `grep '"type": "module"' package.json`

**C11. No usage of `core.getBooleanInput()`** in `src/`.

- **Why**: `core.getBooleanInput` throws on empty strings even when `action.yml` declares a default. The default only kicks in via GHA invocation, NOT via local testing or workflows that don't explicitly set the input. We hit this on `w3-bitgo-action`'s `register-webhook-on-pending` flag.
- **Use instead**: `core.getInput('foo') === 'true'`
- **Verify**: `grep -r "getBooleanInput" src/` should return nothing.

### D. Test infrastructure

**D12. Uses `node:test` (no Jest).**

- **Why**: `node:test` ships with Node, has zero install cost, and is the runtime W3 actions are built for. Jest adds 100MB+ of devDeps, requires `--experimental-vm-modules` for ESM, and uses non-standard module mocking that doesn't carry to other contexts. We migrated the whole ecosystem off Jest in Wave 3 of the consistency pass.
- **Verify**: `grep -E '"jest"' package.json` should return nothing.

**D13. Tests live in `test/` directory** (not `__tests__/`).

- **Why**: The `__tests__/` convention is a Jest-ism. `test/` is the Node-native default and matches `node --test test/*.test.js`.
- **Verify**: `ls test/`. The `__tests__/` directory should not exist.

### E. Action manifest (`action.yml`)

**E14. `runs.using: 'node24'`** (matches the CI build version).

- **Why**: GHA executes the action's `dist/index.js` under whatever runtime `runs.using` declares. If CI builds with Node 24 but the runtime says `node20`, you can ship code that uses Node-24-only APIs and not notice until production.
- **Verify**: `grep "using:" action.yml`

**E15. Single `result` output** (no `success`/`status-code`/etc. as separate outputs).

- **Why**: Workflow authors parse the result as JSON: `${{ fromJSON(steps.foo.outputs.result).status }}`. Multiple top-level outputs encourage workflow authors to write code that reads them directly, then breaks when the action grows another field. Single result keeps the contract stable.
- **Exception**: If a partner has a strong UX argument for top-level outputs (e.g., `success` for fast-fail logic), document it explicitly in the action's README.
- **Verify**: `grep -A1 "outputs:" action.yml` should show only `result:`

### F. Build artifact

**F16. `dist/index.js` is committed.**

- **Why**: GHA actions are run from a git ref. The runner clones the repo and executes `dist/index.js` directly — there's no install/build step on the consumer side. If `dist/` isn't committed, the action is broken from the moment it's tagged.
- **Verify**: `git ls-tree HEAD -- dist/index.js` should return one entry.

### G. ESLint config

**G17. `eslint.config.js` exists** (flat config v9, not legacy `.eslintrc.json`).

- **Why**: ESLint 9 deprecated the legacy config format. The flat config is the only forward-compatible option.
- **Verify**: `test -f eslint.config.js && ! test -f .eslintrc.json`

### H. Documentation

**H18. `README.md` exists** and reflects the action's actual surface (not stale template text like "TODO: Your action description").

- **Verify**: `head -5 README.md` should not contain `TODO`

**H19. `docs/guide.md` exists** with per-command reference, error codes, and at least one worked example.

- **Why**: The README is for discovery — "should I use this?" The guide is for execution — "how do I use this?" Splitting them keeps both readable.
- **Verify**: `test -f docs/guide.md`

### I. Standard package.json scripts

**I20. All present**: `format`, `format:check`, `lint`, `test`, `build`, `all`.

```json
{
  "scripts": {
    "build": "ncc build src/index.js -o dist",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint src/",
    "test": "node --test test/*.test.js",
    "all": "npm run format && npm run lint && npm run test && npm run build"
  }
}
```

- **Why these names**: `format`/`format:check`/`lint`/`test`/`build` are the de facto standard across the JS ecosystem. The `all` umbrella script is what you run locally before pushing.
- **Note**: The order in `all` matters. `format` MUST run before `build` because `format` reformats source files (including `dist/` if `.prettierignore` doesn't exclude it — see B8).

### J. Committed `.npmrc`

**J21. `.npmrc` is tracked** (not gitignored) and contains `@w3-io:registry=https://npm.pkg.github.com` (no auth token).

```
@w3-io:registry=https://npm.pkg.github.com
```

- **Why**: The package is public so no token is needed for `npm install`. Committing the scope mapping makes the repo work on a fresh clone with zero config. Older actions had `.npmrc` gitignored to protect tokens — that's no longer needed and creates a friction point for new contributors.
- **`.gitignore` should explicitly NOT include `.npmrc`.** Add a comment explaining why:

```
node_modules/
.env
# .npmrc is committed (token-free, just scope mapping for the public
# @w3-io/action-core package). If you add a publish token locally, do
# NOT commit it — use ~/.npmrc or NODE_AUTH_TOKEN env var instead.
```

- **Verify**: `git ls-tree HEAD -- .npmrc` should return one entry.

### K. Consistency

**K22. `dist/index.js` is up to date with source.**

- **Why**: F16 checks that `dist/index.js` exists, but a stale dist is just as broken as a missing one. If source changed but dist wasn't rebuilt, the shipped action runs old code. CI catches this with `npm run build && git diff --quiet dist/`, but the audit should too.
- **Verify**: `npm run build && git diff --quiet dist/` (no changes = up to date)

**K23. `action.yml` inputs match `core.getInput()` calls in source.**

- **Why**: When an action adds or removes parameters, `action.yml` and `src/main.js` can drift. A declared input with no corresponding `getInput()` confuses users; a `getInput()` with no declaration silently fails.
- **Verify**: Extract input names from `action.yml` and `core.getInput()` calls in `src/`; the sets should match (excluding `command` and `network` which are universal).

**K24. `command` is required; per-command inputs are not.**

- **Why**: `command` must always be required. Per-command inputs (`asset`, `amount`, `user`, `vault`, `oapp`, `shares`, `to`) are conditionally required depending on the command — they should be `required: false` in `action.yml` and validated in the action code. Auth inputs (`api-key`, `environment-id`, `network`) may also be required — that's correct for REST API actions that need credentials on every call.
- **Verify**: `command` appears in required inputs. Per-command inputs (`asset`, `amount`, `user`, etc.) do not.

**K25. E2E test workflow exists.**

```
test/workflows/e2e.yaml
```

A real W3 workflow YAML that exercises the action's commands against real APIs or contracts. Must:

- Exist as a file in `test/workflows/`
- Be a valid W3 workflow (name, on: workflow_dispatch, jobs)
- Document prerequisites (required env vars) in comments
- Cover at least the primary read and write command groups

- **Why**: Unit tests with mocked fetch prove the code works in isolation, but can't catch API contract drift, auth misconfiguration, or bridge integration bugs. The E2E workflow is the only artifact that proves the action works end-to-end through the W3 protocol against real infrastructure.
- **Verify**: `ls test/workflows/e2e.yaml` (or any `.yaml` in `test/workflows/`)

**K26. E2E results documented.**

```
test/workflows/RESULTS.md
```

Documents verified E2E test results with:

- Last verified date
- Environment and test method
- Prerequisites table (credentials, env vars, signup URLs)
- Per-step results table (command, status, duration)
- Skipped commands with reasons
- Runnable "How to run" instructions

Updated after each verified test run. Stale results (>30 days) are a warning, not a failure.

- **Why**: The E2E workflow proves the action _can_ work, but RESULTS.md proves it _does_ work and documents what's needed to reproduce. Without it, a new developer can't set up E2E testing.
- **Verify**: `ls test/workflows/RESULTS.md`

### L. Polish (post-launch usability)

These three checks are what separates "code merged" from "ready for a live customer demo." They surfaced from the SxT and Circle button-up passes (April 2026): the gap between a passing test suite and an action a stranger can actually adopt is mostly documentation and repo hygiene that nobody thinks to write down.

**L27. README has an `## Authentication` (or `## Auth`) section.**

The Quick Start should show one path; the Authentication section should enumerate **every** auth mode the action supports, not just the simplest one. SxT shipped for weeks with a Quick Start that showed only api-key mode — anyone following it would hit a brick wall on DDL because login mode wasn't even mentioned.

- **Why**: Half-documented auth is worse than undocumented auth. Quick Start gets users to "hello world"; the Authentication section gets them to "production." Skipping it means the next person rediscovers the gap.
- **Verify**: `grep -E "^## (Authentication|Auth)" README.md`

**L28. `TODO.md` exists at the repo root.**

A short, version-grouped checklist of known gaps and follow-ups. Not a roadmap — a candid list of "things we know we haven't done yet" so the next contributor isn't surprised. Established pattern: see `w3-chainlink-action/TODO.md` and `w3-paypal-action/TODO.md`.

- **Why**: Skips and gaps that live only in PR descriptions evaporate. Skips and gaps in TODO.md are durable. The audit catches the file's existence; humans read the contents to decide priority.
- **Verify**: `test -f TODO.md`

**L29. RESULTS.md has a `## Prerequisites` section.**

The list of credentials, env vars, faucet links, one-time setup steps, and any signup URLs needed to reproduce the E2E. Without it, "I ran the E2E and it passed" is unverifiable by anyone else.

- **Why**: We've twice now lost a Circle entity secret (or a bridge signer key) because the recovery instructions weren't written down at registration time. RESULTS.md's Prerequisites is the place for those instructions to live.
- **Verify**: `grep -E "^## Prerequisites" test/workflows/RESULTS.md`

#### Soft polish patterns (not auto-checked, but expected)

These are real patterns from the SxT and Circle work that are too squishy to mechanize cleanly. Apply them where applicable; the audit doesn't enforce them but PR review should.

- **"Secret names are illustrative" caveat.** Both README and RESULTS.md should state explicitly that the `SECRET_FOO` names shown in examples are the names _this repo_ uses; consumers can name their secrets however they like. The fixed contract is the action-input names (`api-key`, `user-id`, etc.), not the secret names. Without this, users see `${{ secrets.SXT_API_KEY }}` in the README and assume the action requires that exact secret name.

- **Quick Start covers all major use cases.** If the action has a read path and a write path, show both. If it has multiple auth modes, show each in a labeled subsection. Quick Start that only demonstrates one path will leave users assuming the others don't exist.

- **Helper scripts in `scripts/` for one-time provisioning.** When an action requires irreversible setup (registering an entity secret, generating + uploading a biscuit, deploying a stable test wallet), wrap it in a script under `scripts/` that's idempotent and discoverable via `npm run`. Examples: `w3-sxt-action/scripts/generate-biscuit.mjs`, the planned `w3-circle-action/scripts/register-entity-secret.mjs`. The action command exists in `src/`; the script exists for the repeatable setup _story_.

- **Two-tier test workflows.** Actions with both Platform-API features and on-chain features (Circle Platform + CCTP, SxT REST + on-chain queries) should split their E2E into two workflow files:
  - `test/workflows/e2e.yaml` — the canonical Platform-API E2E (always required by K25).
  - `test/workflows/<feature>.yaml` — separate file per integration story (e.g., `cctp-roundtrip.yaml`).

  Each gets its own row in RESULTS.md. Mixing them in one workflow makes failure attribution painful and forces all-or-nothing reruns.

- **Gated integration CI.** If `.github/workflows/test.yml` (or any workflow that uses `${{ secrets.* }}` for live-cred testing) exists in the repo, gate each job on a repo variable (`if: ${{ vars.X_ENABLED == 'true' }}`) so the job skips cleanly when secrets aren't configured. This keeps the PR check green for forks and freshly-cloned repos. Triggers should be `workflow_dispatch` + `schedule` (weekly cron) + `push: tags: ['v*']` — not `push: branches: <username>/*` which both ties CI to a specific person and creates noise on every commit.

### M. MCP manifest content (`w3-action.yaml`)

The MCP manifest is the primary interface between the action and AI agents. It determines whether an agent can discover, understand, and correctly invoke the action. A structurally valid but content-empty manifest is invisible to users — the manifest must answer **why** to use this partner, not just **what** commands exist.

**M30. Every command has fully typed inputs.**

Every input on every command must have `type`, `required`, and `description`. No stubs — if a command isn't ready to document, don't list it. A stub command (`getset: "Getset."`) is worse than no command: it occupies registry space and gives AI agents a broken tool.

- **Type policy**: All input types are `type: string`. The action code handles parsing with `Number()`, `JSON.parse()`, etc. This matches GitHub Actions behavior (all inputs are strings) and avoids ambiguity about who does numeric coercion.
- **Verify**: Every `name:` under `commands:` must have `inputs:` with per-field `type:`, `required:`, and `description:`.

**M31. Every command has a `result` output.**

Single output named `result` with `type` and `description`. This is the contract consumers rely on: `${{ fromJSON(steps.foo.outputs.result).field }}`. Multiple named outputs (like `is-sanctioned` + `identifications`) break the standard pattern.

- **Verify**: Every command's `outputs:` block contains `result:` with `type:` and `description:`.

**M32. No stub commands.**

A command's description must not be a restated version of its name. `getset: "Getset."` and `check-limit: "Check limit."` are stubs. Minimum: one sentence explaining what the command does AND when or why you'd use it.

Good: `"Get a locked-rate quote for a fiat-to-crypto conversion. Returns exchange rate, fees, and amounts. Rate locked for 20 minutes. Always call this before create-autoramp."`

Bad: `"Get quote."`

- **Why**: AI agents use the description to decide whether a command fits the user's intent. A restated name provides zero signal.
- **Verify**: No command where `description` matches a mechanical expansion of `name` (e.g., `get-foo` → `"Get foo."`)

**M33. `partner` field present and lowercase.**

Always present. Always a lowercase slug matching the repo pattern `w3-<partner>-action`.

Good: `partner: stripe`, `partner: paypal`, `partner: venice`
Bad: `partner: PayPal`, `partner: Iron`, missing entirely

- **Verify**: `grep "^partner:" w3-action.yaml` returns a lowercase value.

**M34. `name` field is a short proper name.**

1-4 words. The partner's display name for humans, not a description of what it does.

Good: `name: Stripe`, `name: Venice AI`, `name: Space and Time`
Bad: `name: "Redis key-value store, caching, counters, lists, hashes, sets, and distributed locks"`

If you need more than 4 words, the extra text belongs in `description`.

- **Verify**: `name:` field has fewer than 5 space-separated words.

**M35. Top-level `description` exists and is substantive (> 20 chars).**

One paragraph answering: _What does this partner do? What makes it different from alternatives?_

Mention: compliance posture, supported chains/currencies/networks, key differentiators, the trust model. This is the first thing an AI agent reads when evaluating whether to present this action to a user.

Good:

```yaml
description: >
  Payment processing for 135+ currencies. Card payments, ACH, SEPA, wire,
  and 40+ local payment methods. PCI-compliant — card numbers never touch
  your workflow. Test mode with deterministic test cards.
```

Bad: `description: Stripe payments` (too terse to differentiate)

- **Verify**: `description:` field exists and has > 20 characters.

**M36. Top-level `context` exists and guides agent routing (> 50 chars).**

The most important field for agent usability. Must answer "when should an AI agent reach for this action?" Include:

- **When to use**: "Use X when the workflow needs..."
- **When NOT to use** (invaluable for routing): "For crypto-to-crypto, use the bridge directly."
- **Cost model**: per-request, per-token, subscription, free tier
- **Safety notes**: which commands are irreversible, what requires human approval
- **Prerequisites**: API keys, KYB, account setup
- **Workflow patterns**: typical command sequences ("get-quote → create-autoramp → list-transactions")

Good:

```yaml
context: >
  Use Stripe when the workflow needs to collect payment from end users via
  cards, bank transfers, or local payment methods. For B2B payouts, consider
  PayPal. For crypto settlements, use the bridge directly.

  Pay-per-transaction (2.9% + $0.30 per card charge). No per-API-call cost.
  Write operations (create-payment, create-refund) are irreversible after
  settlement. All operations are idempotent with an idempotency key.

  Requires a Stripe API key. Test keys start with sk_test_.
  Typical: create-payment → confirm → get-payment (check status).
```

Bad: missing entirely, or `context: "Use for payments."` (tells the agent nothing actionable)

- **Verify**: `context:` field exists and has > 50 characters.

#### Command description content guidance

Beyond M32's minimum bar, good command descriptions cover:

| Aspect          | Example                                                |
| --------------- | ------------------------------------------------------ |
| What it returns | "Returns exchange rate, fees, and settlement amounts." |
| Prerequisites   | "Always call get-quote first to lock a rate."          |
| Sequencing      | "Use after create-order and before capture-order."     |
| Cost/fees       | "Aave charges 0.09% flash loan premium."               |
| Safety          | "Irreversible after settlement window closes."         |
| Units/format    | "Amount in smallest currency unit (cents for USD)."    |
| Idempotency     | "Idempotent if you pass an idempotency key."           |

---

## File structure (canonical layout)

```
w3-yourpartner-action/
├── .github/
│   └── workflows/
│       └── ci.yml              # canonical CI from this template
├── .gitignore                  # node_modules, .env, NOT .npmrc
├── .npmrc                      # @w3-io scope mapping (committed, no token)
├── .prettierignore             # dist/, node_modules/, package-lock.json
├── action.yml                  # GHA manifest, runs.using: node24
├── dist/
│   ├── index.js                # NCC bundle (committed)
│   └── package.json            # NCC metadata
├── docs/
│   └── guide.md                # per-command reference
├── eslint.config.js            # flat v9 config
├── package.json                # @w3-io/action-core ^0.4.1, standard scripts
├── package-lock.json           # committed
├── README.md                   # quick start, commands, inputs, outputs, auth
├── src/
│   ├── client.js               # API client (no @actions/core imports)
│   ├── index.js                # entrypoint (calls run() from main.js)
│   └── main.js                 # createCommandRouter + handlers + run()
├── test/
│   ├── client.test.js          # node:test + node:assert/strict
│   └── workflows/
│       └── e2e.yaml            # E2E test workflow for manual validation
└── w3-action.yaml              # machine-readable schema for MCP registry
```

### `src/index.js` + `src/main.js` split

The split exists so tests can `import { run } from '../src/main.js'` without triggering execution at module load time. `index.js` is a thin wrapper:

```javascript
// src/index.js
import { run } from './main.js'

// Suppress noisy unhandled rejection warnings; main.js's try/catch
// catches via handleError, which calls core.setFailed.
process.on('unhandledRejection', () => {})

run()
```

```javascript
// src/main.js
import * as core from '@actions/core'
import { createCommandRouter, setJsonOutput, handleError } from '@w3-io/action-core'
import { Client, ClientError } from './client.js'

function getClient() {
  return new Client({
    apiKey: core.getInput('api-key', { required: true }),
    baseUrl: core.getInput('api-url') || undefined,
  })
}

const handlers = {
  'example-command': async () => {
    const client = getClient()
    const result = await client.exampleCommand(core.getInput('input', { required: true }))
    setJsonOutput('result', result)
  },
}

const router = createCommandRouter(handlers)

export async function run() {
  try {
    await router()
  } catch (error) {
    if (error instanceof ClientError) {
      core.setFailed(`${error.code}: ${error.message}`)
    } else {
      handleError(error)
    }
  }
}
```

### Test pattern (the BitGo / template gold standard)

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Client, ClientError } from '../src/client.js'

let originalFetch
let calls

beforeEach(() => {
  originalFetch = global.fetch
  calls = []
})

afterEach(() => {
  global.fetch = originalFetch
})

function mockFetch(responses) {
  let index = 0
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    const response = responses[index++]
    if (!response) throw new Error(`Unexpected fetch call ${index}: ${url}`)
    const status = response.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify(response.body ?? {}),
      json: async () => response.body ?? {},
    }
  }
}

describe('Client.exampleCommand', () => {
  it('calls the right endpoint', async () => {
    mockFetch([{ body: { result: 'ok' } }])
    const client = new Client({ apiKey: 'test', baseUrl: 'https://api.example.com' })
    const result = await client.exampleCommand('input')
    assert.equal(calls[0].url, 'https://api.example.com/v1/example/input')
    assert.deepEqual(result, { result: 'ok' })
  })
})
```

**Don't mock `@actions/core`.** Test the client in isolation against `global.fetch`. If you need to test the GHA integration (input reading, output setting), do it in a live test against the real action invocation, not via mocked imports.

### Custom error class pattern

Each partner client should define its own error class extending `W3ActionError`. The error class enables `error instanceof ClientError` checks downstream and lets the action wrap structured codes into `core.setFailed`:

```javascript
import { W3ActionError } from '@w3-io/action-core'

export class ClientError extends W3ActionError {
  constructor(code, message, { statusCode, details } = {}) {
    super(code, message, { statusCode, details })
    this.name = 'ClientError'
  }
}
```

Throw it from your client methods with stable codes (`MISSING_INPUT`, `API_ERROR`, `RATE_LIMITED`, etc.) so downstream consumers can match on `err.code`.

---

## Required: `@w3-io/action-core`

Every W3 action uses `@w3-io/action-core`. Do not build without it.

### What it provides (use these, don't reinvent them)

| Import                | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `createCommandRouter` | Dispatches on the `command` input. Handles unknown commands.    |
| `setJsonOutput`       | Sets output, serializes exactly once. Prevents double-encoding. |
| `handleError`         | Structured error reporting via `core.setFailed`.                |
| `request`             | HTTP with timeout, retry on 429/5xx, auth helpers.              |
| `bridge`              | Syscall bridge client for chain and crypto operations.          |
| `requireInput`        | Throws clear error if input missing.                            |
| `parseJsonInput`      | Parses JSON input with error handling.                          |
| `W3ActionError`       | Base error class with code and statusCode.                      |

---

## Do NOT bundle blockchain SDKs

If your action needs chain operations (read contracts, send transactions, get balances, transfer tokens), use the syscall bridge — NOT ethers.js, web3.js, `@solana/web3.js`, or any other blockchain SDK.

```javascript
import { bridge } from '@w3-io/action-core'

const balance = await bridge.chain(
  'ethereum',
  'get-balance',
  {
    address: '0x...',
  },
  'base',
)
```

**Why**: The bridge runs on the host. It handles signing via `W3_SECRET_*` keys that never enter the container. Bundling ethers adds 300KB+ to your action and requires private keys as inputs — a security risk.

**Available bridge operations:**

- **Ethereum**: read-contract, call-contract, send-transaction, get-balance, transfer, approve-token, transfer-token, get-token-balance, get-events, deploy-contract
- **Bitcoin**: get-balance, send, get-utxos, get-fee-rate
- **Solana**: get-balance, transfer, call-program, get-token-balance
- **Crypto**: keccak256, aes-encrypt/decrypt, ed25519-sign/verify, hkdf, jwt-sign/verify, totp

**Bridge param names** (must be exact):

- `contractAddress` not `contract` or `to`
- `functionSignature` not `method` or `abi`
- `args` as JSON string: `JSON.stringify(['arg1', 'arg2'])`

---

## Do NOT use WASM, Rollup, or copy bridge code

- **WASM**: Use the bridge for crypto (`bridge.crypto('keccak256', ...)`) and Node built-ins for encoding (`Buffer.from()`, `node:crypto`). Do NOT create a `wasm-bridge/` directory.
- **Rollup**: Use `@vercel/ncc`. The single-file output is what GHA expects.
- **Bridge SDK code**: Do NOT copy `lib/bridge.js` or any bridge client into your repo. Import it: `import { bridge } from '@w3-io/action-core'`.

---

## Two-tier documentation

Every action needs docs in two places:

### 1. `docs/guide.md` in the action repo (deep)

The complete reference. Per-command tables (inputs, outputs, error codes), worked examples, authentication setup, error debugging. This is the source of truth.

### 2. MCP integration brief (short)

A brief orientation in `w3-mcp/content/integrations/yourpartner.md`:

- One paragraph: what it does, when to use it
- One quick-start YAML example
- Link to the full guide in the action repo

This is what AI agents read first when discovering actions. It should answer "should I use this?" and point at `docs/guide.md` for "how do I use this?"

### After creating both

Register the action in `w3-mcp/registry.yaml` with all commands and typed schemas. The registry entry is what `list-actions` and `get-action` MCP tools surface.

---

## Common pitfalls (lessons learned the hard way)

### Pitfall: `npm ci` fails with `403 read_package`

**Cause**: Workflow doesn't have GitHub Packages auth set up.

**Fix**: Make sure your CI workflow has all of A2-A5 (Node 24, permissions, registry-url + scope, NODE_AUTH_TOKEN). The whole stack must be present — missing any one piece breaks `npm ci`.

### Pitfall: `format:check` fails on `dist/index.js` in CI

**Cause**: `.prettierignore` doesn't exclude `dist/`. Prettier reformats the NCC output, then `build` overwrites it with raw NCC output, and the next `format:check` fails.

**Fix**: Add `dist/` to `.prettierignore` (B8). The chicken-and-egg goes away.

### Pitfall: Action crashes when a boolean input isn't set

**Cause**: `core.getBooleanInput('foo')` throws on empty string even when `action.yml` declares a default for `foo`.

**Fix**: Use `core.getInput('foo') === 'true'` instead. Document the input as "string `'true'`" in the action.yml description.

### Pitfall: Tests pass locally but fail in CI

**Cause**: Either Node version mismatch (CI on 20, local on 24+) OR `dist/index.js` was regenerated locally but not committed.

**Fix**: Bump CI to Node 24 (A2). Run `npm run build && git add dist && git commit` before pushing.

### Pitfall: Action.yml runtime mismatch

**Cause**: `runs.using: 'node20'` but CI builds with Node 24. Code can use Node 24 APIs and ship without local detection.

**Fix**: Set `runs.using: 'node24'` (E14) so the action executes under the same version it was built against.

### Pitfall: Mocked tests pass but the action fails in production

**Cause**: Tests mocked `fetch` but the URL the test "validated" doesn't actually exist on the partner API. The classic version of this is mocking BitGo's `/sendcoins` endpoint, which exists in BitGo Express but NOT on the platform API.

**Fix**: Always supplement mocked unit tests with at least one **live integration test** that hits the real partner API (or test environment). Gate via env var so the live tests don't run in normal CI. See `w3-bitgo-action/test/live.test.js` for the canonical pattern.

---

## Scripts directory

This template ships three reusable scripts in `scripts/`:

| Script                               | Purpose                                                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/audit.sh`                   | Walks the parent workspace and checks every `w3-*-action` repo against the standards in this doc. Outputs a markdown table. Read-only. Run with no arg for "all repos" or with a single repo name for one. |
| `scripts/modernize-pkg.mjs`          | Updates a partner action's `package.json` to add the standard scripts, bump `@w3-io/action-core`, drop legacy fields, set ESM. Idempotent. Use when modernizing an older action.                           |
| `scripts/fix-router-handleError.mjs` | Wraps a bare `router()` call in `src/index.js` with a try/catch + `handleError` so the imported `handleError` becomes used (silences the lint error and produces structured failure reports).              |

See `scripts/README.md` for invocation details.

---

## When to update this document

- When the standards genuinely change (e.g., Node 26 is the new default)
- When you discover a new pitfall worth saving (add to "Common pitfalls")
- When you add a new reusable script to `scripts/`
- When a partner integration needs an exception worth documenting (e.g., the multi-output case for `w3-email-action` if we ever decide to keep them)

**Do NOT** update this document for one-off action specifics — those belong in the action's own `docs/guide.md`. This file is the cross-cutting standard.
