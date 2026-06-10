/**
 * Client unit tests.
 *
 * These test your API client in isolation by mocking `global.fetch`.
 * No GitHub Actions runtime, no real API calls, no Jest — just node:test
 * + node:assert/strict.
 *
 * Pattern:
 *   - mockFetch([{ body, status }, ...]) installs a sequenced fetch mock
 *   - Each call consumes the next response in order
 *   - Assert on the URL, request body, and parsed result
 *   - Test the happy path, error paths, and edge cases
 *
 * TODO: Update imports and tests for your renamed client.
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Client, ClientError } from '../src/client.js'

const API_KEY = 'test-key'
const BASE_URL = 'https://api.example.com'

let originalFetch
let calls

beforeEach(() => {
  originalFetch = global.fetch
  calls = []
})

afterEach(() => {
  global.fetch = originalFetch
})

/**
 * Install a fetch mock that returns the supplied responses in order.
 * Each response is an object with at least `{ body }` and optionally `status`.
 */
function mockFetch(responses) {
  let index = 0
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    const response = responses[index++]
    if (!response) {
      throw new Error(`Unexpected fetch call ${index}: ${url}`)
    }
    const status = response.status ?? 200
    const ok = status >= 200 && status < 300
    return {
      ok,
      status,
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify(response.body ?? {}),
      json: async () => response.body ?? {},
    }
  }
}

describe('Client: construction', () => {
  it('rejects construction without an api key', () => {
    assert.throws(
      () => new Client({}),
      (err) => err instanceof ClientError && err.code === 'MISSING_API_KEY',
    )
  })

  it('strips trailing slashes from the base url', () => {
    const client = new Client({ apiKey: API_KEY, baseUrl: 'https://api.example.com///' })
    assert.equal(client.baseUrl, 'https://api.example.com')
  })

  it('uses the default base url when none is provided', () => {
    const client = new Client({ apiKey: API_KEY })
    assert.equal(client.baseUrl, 'https://api.yourpartner.com')
  })
})

describe('Client.exampleCommand', () => {
  it('calls the correct endpoint with the api key header', async () => {
    mockFetch([{ body: { result: 'ok' } }])
    const client = new Client({ apiKey: API_KEY, baseUrl: BASE_URL })

    const result = await client.exampleCommand('test-input')

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, `${BASE_URL}/v1/example/test-input`)
    assert.equal(calls[0].options.headers['X-Api-Key'], API_KEY)
    assert.deepEqual(result, { result: 'ok' })
  })

  it('url-encodes the input', async () => {
    mockFetch([{ body: {} }])
    const client = new Client({ apiKey: API_KEY, baseUrl: BASE_URL })

    await client.exampleCommand('hello world/foo')

    assert.equal(calls[0].url, `${BASE_URL}/v1/example/hello%20world%2Ffoo`)
  })

  it('throws MISSING_INPUT on empty input', async () => {
    const client = new Client({ apiKey: API_KEY })
    await assert.rejects(
      () => client.exampleCommand(''),
      (err) => err instanceof ClientError && err.code === 'MISSING_INPUT',
    )
  })

  it('translates non-2xx responses into ClientError API_ERROR', async () => {
    mockFetch([{ status: 500, body: { error: 'internal server error' } }])
    const client = new Client({ apiKey: API_KEY, baseUrl: BASE_URL })

    await assert.rejects(
      () => client.exampleCommand('test'),
      (err) => err instanceof ClientError && err.code === 'API_ERROR' && err.statusCode === 500,
    )
  })
})
