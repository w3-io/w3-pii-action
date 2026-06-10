# YourPartner Integration

<!-- TODO: Replace with your partner name and context -->

## What is YourPartner?

<!-- TODO: One paragraph — who they are, what their service does, why
someone would use it in a workflow. This context matters as much as
the technical reference. -->

## Quick Start

```yaml
- uses: w3-io/w3-yourpartner-action@v0
  with:
    command: example-command
    api-key: ${{ secrets.PARTNER_API_KEY }}
    input: 'value'
```

## Commands

<!-- TODO: One section per command with inputs, outputs, and example YAML -->

### example-command

**Inputs:**

| Input   | Type   | Required | Description     |
| ------- | ------ | -------- | --------------- |
| `input` | string | Yes      | What to process |

**Output:**

```json
{ "result": "..." }
```

## Authentication

<!-- TODO: How to get API key, where to store it -->

## Error Handling

<!-- TODO: Common errors and resolutions -->

## Examples

<!-- TODO: Real workflow patterns, not just API calls -->
