/**
 * W3 Action entrypoint.
 *
 * Thin wrapper that calls run() from main.js. The split exists so that
 * tests can import run() directly without triggering execution at module
 * load time.
 *
 * Do not add logic here — keep it in main.js.
 */

import { run } from './main.js'

// Suppress noisy unhandled rejection warnings; main.js's try/catch handles
// them via core.setFailed and structured error reporting.
process.on('unhandledRejection', () => {})

run()
