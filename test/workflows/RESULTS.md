# E2E Test Results

> Last verified: YYYY-MM-DD

## Environment

- **Test method**: `w3 workflow test --execute` with standalone bridge
- **Bridge**: `w3 bridge serve --port 8232 --signer-ethereum $KEY --allow "*"`
- **Bridge URL**: `W3_BRIDGE_URL=http://host.docker.internal:8232`
- **Protocol version**: master (commit hash)
- **Runner image**: w3io/w3-runner (Node 20/24)

## Prerequisites

| Credential | Env var       | Source                        |
| ---------- | ------------- | ----------------------------- |
| TODO       | `SECRET_NAME` | https://example.com/dashboard |

### On-chain funding (if applicable)

| Network | Token | Amount | Purpose |
| ------- | ----- | ------ | ------- |
| —       | —     | —      | —       |

## Results

| #   | Step      | Command   | Status | Duration | Notes |
| --- | --------- | --------- | ------ | -------- | ----- |
| 1   | Step name | `command` | PASS   | 1.2s     |       |

## Skipped Commands

| Command | Reason |
| ------- | ------ |
| —       | —      |

## How to run

```bash
# 1. Export credentials
export SECRET_NAME="..."

# 2. Start bridge (if action uses on-chain operations)
w3 bridge serve --port 8232 --signer-ethereum "$W3_SECRET_ETHEREUM" --allow "*" &

# 3. Set bridge URL (if bridge started)
export W3_BRIDGE_URL="http://host.docker.internal:8232"

# 4. Run tests
w3 workflow test --execute test/workflows/e2e.yaml
```
