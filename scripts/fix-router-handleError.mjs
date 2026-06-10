#!/usr/bin/env node
// fix-router-handleError.mjs — wrap a bare router() call with handleError.
//
// Many older actions had:
//
//   import { createCommandRouter, setJsonOutput, handleError } from '...'
//   ...
//   router()
//
// This pattern fails lint with "handleError is defined but never used".
// Wrap the bare router() call in a try/catch with handleError so the
// import becomes used and errors get reported via core.setFailed.
//
// The wrapped form:
//
//   process.on('unhandledRejection', () => {})
//   ;(async () => {
//     try {
//       await router()
//     } catch (error) {
//       handleError(error)
//     }
//   })()
//
// Idempotent: if the file already has the wrapped pattern, no-op.
//
// Usage:
//   node scripts/fix-router-handleError.mjs <path-to-src/index.js>

import { readFileSync, writeFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('usage: fix-router-handleError.mjs <path>')
  process.exit(1)
}

const original = readFileSync(path, 'utf-8')

// Already wrapped? Skip.
if (
  original.includes('await router()') ||
  original.includes('handleError(error)') ||
  original.includes('handleError(err)')
) {
  console.log(`${path}: already wrapped`)
  process.exit(0)
}

// Match a bare router() call at end-of-file (with optional semicolon).
const wrapped = original.replace(
  /\nrouter\(\);?\s*$/,
  `

// Suppress noisy unhandled rejection warnings; the wrapper below
// catches via handleError, which calls core.setFailed.
process.on('unhandledRejection', () => {})

;(async () => {
  try {
    await router()
  } catch (error) {
    handleError(error)
  }
})()
`,
)

if (wrapped === original) {
  console.log(`${path}: no bare router() call found — leaving as-is`)
  process.exit(0)
}

writeFileSync(path, wrapped)
console.log(`${path}: wrapped router() with handleError`)
