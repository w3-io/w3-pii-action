import * as core from '@actions/core'
import { createCommandRouter, setJsonOutput, handleError } from '@w3-io/action-core'
// TODO: Import your client and error class
import { Client, ClientError } from './client.js'

/**
 * W3 Action — command dispatch.
 *
 * Each command handler is an async function that:
 *   1. Reads inputs via @actions/core
 *   2. Calls a method on your client
 *   3. Sets the JSON output via setJsonOutput
 *
 * createCommandRouter from @w3-io/action-core handles dispatch by command
 * name and reports unknown commands with the available list.
 *
 * To add a command:
 *   1. Write a handler in the `handlers` object below
 *   2. Add a matching method on your client
 *   3. Document it in action.yml, w3-action.yaml, and docs/guide.md
 */

// TODO: Initialize your client
function getClient() {
  return new Client({
    apiKey: core.getInput('api-key', { required: true }),
    baseUrl: core.getInput('api-url') || undefined,
  })
}

const handlers = {
  // TODO: Replace with your commands
  'example-command': async () => {
    const client = getClient()
    const input = core.getInput('input', { required: true })
    const result = await client.exampleCommand(input)
    setJsonOutput('result', result)
  },
}

const router = createCommandRouter(handlers)

/**
 * Top-level run wrapper. Catches structured client errors separately so
 * the partner-specific error code reaches `core.setFailed`, falling back
 * to action-core's generic handler for everything else.
 */
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
