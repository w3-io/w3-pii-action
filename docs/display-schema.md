# `display:` Schema for `w3-action.yaml`

Actions opt into branded rendering in W3 UIs (Explorer, MCP-aware chat,
runbooks, etc.) by adding a top-level `display:` block to their
`w3-action.yaml`. Renderers read it once and render every command's
runs with the action's brand and per-command summary widgets — no
explorer-side code per partner.

This file is the canonical reference. Renderers (e.g. the W3 Explorer's
`MetadataDrivenWidget`) implement what's here; action authors copy
this shape into their own `w3-action.yaml`.

## Shape

```yaml
display:
  brand:                          # required if display: is present
    name: string                  # human-readable, e.g. "ForDefi"
    short_name: string?           # compact label, defaults to name
    description: string?          # one-line tagline
    logo: string?                 # absolute URL to SVG/PNG
    color: string?                # hex accent for the card border/icon

  commands:                       # keys must match command: input values
    <command-name>:
      icon: string?               # named icon from renderer's set
      title_template: string      # main card title (templated)
      subtitle_template: string?  # secondary line
      summary: list?              # bullet rows under title
        - label: string
          value: string           # templated
      outputs: object?            # named output paths (optional renderer hints)
      tx_hash_path: string?       # dot-path to a transaction hash in outputs
      chain_explorer: object?     # tx hash → explorer URL by chain id
```

Anything not listed above is reserved for future use; renderers should
ignore unknown keys without failing.

## Templating

Values in `title_template`, `subtitle_template`, and `summary[*].value`
are templated. Syntax:

```
{{ path.to.value | filter | filter2 }}
```

Rules:

- **Variables**: dot-path resolved against a context object. Context
  shape: `{ inputs: <action input map>, outputs: <action output map>,
step: <workflow step meta> }`.
- **Filters**: piped left to right. Each filter is a pure function
  registered by the renderer.
- **Default**: `| default: "x"` — fallback when the upstream value is
  empty/undefined.
- **No conditionals, loops, expressions, or partials in v1.** Keep
  templates readable.

If a path resolves to undefined and no `default:` filter is chained,
the renderer should display an em-dash (`—`).

## Registered filters (v1)

Implemented by every conforming renderer. Action authors compose them
but never define their own.

### Generic

| Filter          | Input → Output                                 | Example                                     |
| --------------- | ---------------------------------------------- | ------------------------------------------- |
| `truncate_addr` | hex address → `0xabcd…1234`                    | `0xd8dA…6045`                               |
| `chain_pretty`  | chain id string → human label                  | `evm_avalanche_chain` → `Avalanche C-Chain` |
| `default: "x"`  | undefined/empty → `"x"`; otherwise passthrough |                                             |
| `length`        | array → integer count                          |                                             |
| `format_rate`   | scaled-int (1e18 base) → decimal string        | `1039232297669032845` → `1.0392`            |

### USDC formatting

| Filter              | Input → Output                                  | Example                      |
| ------------------- | ----------------------------------------------- | ---------------------------- |
| `format_usdc_base`  | base-units (6 dec) string/int → `"$N,NNN USDC"` | `4000000000` → `$4,000 USDC` |
| `format_usdc_whole` | base-units → `"$X.XX"` (no suffix)              | `4000000000` → `$4,000.00`   |

### Calldata decoders (used by ForDefi-style raw-tx widgets)

These read the `hex_data` of an EVM `create-transaction` payload and
return a human label or amount. Authors should ensure the calldata is
already in scope (i.e. `inputs.data.details.data.hex_data`).

| Filter                        | Returns                                                                     | Notes                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `decode_calldata_action`      | `"Approve"`, `"Deposit"`, `"Mint vault shares"`, `"Redeem"`, or `"Unknown"` | Dispatched by 4-byte selector                                                                                               |
| `decode_calldata_amount_usdc` | amount field formatted as USDC                                              | Works for `approve(spender, amount)`, ERC-4626 `deposit(amount, receiver)`, Yelay `mint(amount, projectId, receiver)`, etc. |
| `decode_calldata_spender`     | spender address (for approve calldata)                                      |                                                                                                                             |

### Contract registry

| Filter                 | Returns                                                    | Notes |
| ---------------------- | ---------------------------------------------------------- | ----- |
| `known_contract_name`  | full name (`"Fidelity USDC Money Market Fund"`) or address |       |
| `known_contract_short` | short label (`"Fidelity MMF"`) or `truncate_addr` fallback |       |
| `known_contract_brand` | brand-only (`"Fidelity"`) or address                       |       |

The registry is provided by the renderer (e.g. the explorer ships
`known-contracts.json`). Action authors don't define it — they consume
it via these filters.

## Example: full display block

```yaml
display:
  brand:
    name: 'ForDefi'
    short_name: 'ForDefi'
    description: 'MPC custody · institutional-grade signing'
    logo: 'https://raw.githubusercontent.com/w3-io/w3-fordefi-action/main/assets/logo.svg'
    color: '#1A1A2E'

  commands:
    create-transaction:
      icon: 'lock'
      title_template: "{{ inputs.data.note | default: 'ForDefi-signed transaction' }}"
      subtitle_template: '{{ inputs.data.details.chain | chain_pretty }} · to {{ inputs.data.details.to | known_contract_short }}'
      summary:
        - {
            label: 'Action',
            value: '{{ inputs.data.details.data.hex_data | decode_calldata_action }}',
          }
        - {
            label: 'Amount',
            value: "{{ inputs.data.details.data.hex_data | decode_calldata_amount_usdc | default: '—' }}",
          }
        - { label: 'Destination', value: '{{ inputs.data.details.to | known_contract_brand }}' }
        - { label: 'Signer', value: 'ForDefi MPC' }
      tx_hash_path: 'outputs.result.transaction_id'
      chain_explorer:
        evm_ethereum_mainnet: 'https://etherscan.io/tx/{{tx_hash}}'
        evm_avalanche_chain: 'https://snowtrace.io/tx/{{tx_hash}}'
        evm_base_mainnet: 'https://basescan.org/tx/{{tx_hash}}'
        evm_ethereum_sepolia: 'https://sepolia.etherscan.io/tx/{{tx_hash}}'
```

## What action authors get for free

- Branded card per step in the W3 Explorer's workflow run view
- AI-agent-aware summaries (MCP-discoverable; chat assistants can
  describe what a step will do before triggering)
- Chain explorer links (Etherscan, Snowtrace, etc.) auto-wired by chain id
- Consistent styling across the W3 ecosystem without writing any TSX

## Versioning

- `display:` is purely additive. Actions that omit it render via the
  renderer's syscall-kind default (no regression).
- Renderers MUST ignore unknown fields under `display:`.
- This document tracks the v1 schema. Breaking changes go to v2 with
  side-by-side support during migration.
