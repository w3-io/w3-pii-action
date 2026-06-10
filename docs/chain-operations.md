# Chain Operations

Actions can interact with blockchains (Ethereum, Solana, Bitcoin) through the W3 bridge.
The bridge is provided by the protocol runtime — no SDK dependencies needed beyond `@w3-io/action-core`.

## Setup

```javascript
import { bridge, ethereum, solana, bitcoin } from '@w3-io/action-core'
```

The bridge connects automatically via `$W3_BRIDGE_SOCKET` (production) or `$W3_BRIDGE_URL` (local dev).

## Ethereum

### Read contract

```javascript
const { result } = await ethereum.readContract({
  contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  method: 'balanceOf(address) returns (uint256)',
  args: [userAddress],
})
```

### Call contract (state-changing)

```javascript
const receipt = await ethereum.callContract({
  contract: vaultAddress,
  method: 'deposit(uint256,uint256,address)',
  args: [amount, projectId, receiver],
})
// receipt.txHash, receipt.status, receipt.gasUsed
```

### Gas control

By default, gas is estimated via `eth_estimateGas` with a 1.3x safety multiplier.
Override when needed:

```javascript
// Custom multiplier (e.g., 2x for complex DeFi operations)
await ethereum.callContract({
  contract,
  method,
  args,
  gasMultiplier: '2.0',
})

// Hard gas limit (skips estimation entirely)
await ethereum.callContract({
  contract,
  method,
  args,
  gasLimit: '5000000',
})
```

| Param           | Type   | Default                          | Behavior                                            |
| --------------- | ------ | -------------------------------- | --------------------------------------------------- |
| `gasLimit`      | string | —                                | Hard override, skips estimation                     |
| `gasMultiplier` | string | 1.3 (contracts), 1.0 (transfers) | Applied to `eth_estimateGas` result. Range: (0, 10] |

When `gasLimit` is set, `gasMultiplier` is ignored.

### Transfer ETH

```javascript
const receipt = await ethereum.transfer({
  to: '0x...',
  amount: '0.1',
  unit: 'ether',
})
```

### Token operations

```javascript
// Approve
await ethereum.approveToken({
  token: 'USDC',
  spender: contractAddress,
  amount: '1000',
})

// Transfer
await ethereum.transferToken({
  token: 'USDC',
  to: recipientAddress,
  amount: '100.50',
})
```

## Solana

### Call program

```javascript
const { signature } = await solana.callProgram({
  programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  accounts: [
    { pubkey: sourceAta, isSigner: false, isWritable: true },
    { pubkey: destAta, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: false },
  ],
  data: instructionData,
})
```

### Compute budget

Set compute unit limit and priority fees for congested networks:

```javascript
await solana.callProgram({
  programId,
  accounts,
  data,
  computeUnitLimit: '400000',
  computeUnitPrice: '50000',
})
```

| Param              | Type   | Default                   | Behavior                                                           |
| ------------------ | ------ | ------------------------- | ------------------------------------------------------------------ |
| `computeUnitLimit` | string | omitted (runtime default) | Prepends `SetComputeUnitLimit` instruction. Must be positive.      |
| `computeUnitPrice` | string | omitted (zero priority)   | Prepends `SetComputeUnitPrice` instruction. Micro-lamports per CU. |

### Transfer SOL

```javascript
const { signature } = await solana.transfer({
  to: recipientPubkey,
  amount: '0.5',
})
```

### Helper methods

```javascript
// Get payer's public key (for deriving ATAs/PDAs)
const { pubkey } = await solana.payerAddress()

// Generate ephemeral keypair (for Anchor init patterns)
const { pubkey: ephemeralPk } = await solana.generateKeypair()
```

## Bitcoin

### Send BTC

```javascript
const result = await bitcoin.send({
  to: 'bc1q...',
  amount: '0.001',
})
// result.txid, result.fee, result.feeRate
```

### Fee control

```javascript
// Explicit fee rate (sat/vB)
await bitcoin.send({
  to,
  amount,
  feeRate: '25',
})

// Target specific confirmation time
await bitcoin.send({
  to,
  amount,
  confirmationTarget: '3',
})
```

| Param                | Type   | Default | Behavior                                   |
| -------------------- | ------ | ------- | ------------------------------------------ |
| `feeRate`            | string | —       | Hard override in sat/vB. Skips estimation. |
| `confirmationTarget` | string | 6       | Block target for fee estimation.           |

When `feeRate` is set, `confirmationTarget` is ignored.

## Generic API

For full control or custom chains, use `bridge.chain()` directly:

```javascript
const result = await bridge.chain(
  'ethereum',
  'call-contract',
  {
    contract: '0x...',
    method: 'myFunction(uint256)',
    args: ['42'],
    gasMultiplier: '1.5',
  },
  'ethereum-sepolia',
)
```

The fourth argument (`network`) defaults to the chain name.
Use it to target specific networks like `ethereum-sepolia`, `solana-devnet`, or `bitcoin-testnet`.

## Signers

Chain operations that modify state require a signer.
Signers are configured in the workflow YAML, not in action code:

```yaml
jobs:
  my-job:
    signer: ${{ secrets.ETH_PRIVATE_KEY }}
    steps:
      - uses: w3-io/w3-yourpartner-action@v0
        with:
          command: deposit
```

The protocol injects the signer automatically.
Actions never handle private keys directly.

## Error handling

Chain operations throw `W3ActionError` with structured error codes:

```javascript
import { ethereum, W3ActionError } from '@w3-io/action-core'

try {
  await ethereum.callContract({ contract, method, args })
} catch (err) {
  if (err instanceof W3ActionError) {
    switch (err.code) {
      case 'REVERTED':
        // Contract execution reverted — check args/state
        break
      case 'PROVIDER_ERROR':
        // RPC issue — retry or check rpcUrl
        break
      case 'INVALID_PARAM':
        // Bad input — check param values
        break
    }
  }
}
```
