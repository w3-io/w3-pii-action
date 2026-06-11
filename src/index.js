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

// Command-handler errors are handled inside the router (action-core attaches
// handleError to the handler promise); this only suppresses the noisy default
// unhandledRejection warning.
process.on('unhandledRejection', () => {})

run()
