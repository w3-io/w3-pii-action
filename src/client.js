/**
 * TODO: Rename this file to match your partner (e.g. cube3.js, stripe.js).
 *
 * This is your API client — the core logic of the action. It should:
 *
 *   1. Be independent of @actions/core (no imports from it here).
 *   2. Use `request` from @w3-io/action-core for HTTP — handles
 *      timeout, retry on 429/5xx, and structured errors.
 *   3. Throw your partner-specific error class (extends W3ActionError)
 *      on failures with machine-readable codes.
 *   4. Return clean, well-structured objects.
 *
 * Pattern:
 *   - Constructor takes config (apiKey, baseUrl)
 *   - One public method per command
 *   - Private helpers for formatting, parsing
 */

import { request, W3ActionError } from '@w3-io/action-core'

// TODO: Replace with your partner's API URL
const DEFAULT_BASE_URL = 'https://api.yourpartner.com'

/**
 * Partner-specific error class. Extends W3ActionError so action-core's
 * handleError reports the structured code and downstream consumers can
 * pattern-match on err.code.
 *
 * TODO: Rename to match your partner (e.g. Cube3Error, StripeError).
 */
export class ClientError extends W3ActionError {
  constructor(code, message, { statusCode, details } = {}) {
    super(code, message, { statusCode, details })
    this.name = 'ClientError'
  }
}

// TODO: Rename this class (e.g. Cube3Client, StripeClient)
export class Client {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL } = {}) {
    // TODO: Remove this check if your API doesn't need auth
    if (!apiKey) {
      throw new ClientError('MISSING_API_KEY', 'API key is required')
    }
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  /**
   * TODO: Replace with your first command.
   *
   * Example:
   *   async inspect(address) { ... }
   *   async getLatestPrices(ids) { ... }
   */
  async exampleCommand(input) {
    if (!input) {
      throw new ClientError('MISSING_INPUT', 'Input is required')
    }

    try {
      return await request(`${this.baseUrl}/v1/example/${encodeURIComponent(input)}`, {
        headers: {
          // TODO: Adjust auth header to match your partner's API.
          // Common patterns:
          //   'X-Api-Key': this.apiKey
          //   'Authorization': `Bearer ${this.apiKey}`
          'X-Api-Key': this.apiKey,
        },
      })
    } catch (err) {
      // action-core throws W3ActionError on non-2xx with the response body
      // jammed into the message. Translate into a typed ClientError so
      // downstream consumers can pattern-match on err.code.
      if (err && typeof err === 'object' && 'statusCode' in err) {
        throw new ClientError('API_ERROR', err.message || `HTTP ${err.statusCode}`, {
          statusCode: err.statusCode,
        })
      }
      throw err
    }
  }
}
