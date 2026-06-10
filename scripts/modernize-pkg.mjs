#!/usr/bin/env node
// modernize-pkg.mjs — bring a w3 partner action's package.json up to standards.
//
// Updates the file in place. Idempotent.
//
// What it does:
//   1. Sets `"type": "module"` (ESM)
//   2. Drops the legacy `main` field if present
//   3. Adds the standard scripts (format, format:check, lint, test, build, all)
//      preserving any extras the repo already has
//   4. Replaces stale `npx @vercel/ncc build ...` with the cleaner `ncc build ...`
//   5. Bumps `@w3-io/action-core` to ^0.4.1 if present
//   6. Adds the standard devDeps (@eslint/js, @vercel/ncc, eslint, prettier)
//      without clobbering existing versions
//   7. Detects and fixes the duplicate `"type"` key bug (was a paypal regression)
//
// Usage:
//   node scripts/modernize-pkg.mjs <path-to-package.json>
//
// After running, do:
//   rm -rf node_modules package-lock.json && npm install && npm run all

import { readFileSync, writeFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('usage: modernize-pkg.mjs <path-to-package.json>')
  process.exit(1)
}

// Read raw text first to detect duplicate "type" keys.
const raw = readFileSync(path, 'utf-8')
const dupCount = (raw.match(/^\s*"type":/gm) || []).length

const pkg = JSON.parse(raw)

// Always set ESM.
pkg.type = 'module'

// Drop legacy `main` field if present — actions don't use it.
if (pkg.main) delete pkg.main

// Standard scripts. Preserve any extras the repo already has.
const standardScripts = {
  build: 'ncc build src/index.js -o dist',
  format: 'prettier --write .',
  'format:check': 'prettier --check .',
  lint: 'eslint src/',
  test: 'node --test test/*.test.js',
  all: 'npm run format && npm run lint && npm run test && npm run build',
}
pkg.scripts = { ...pkg.scripts, ...standardScripts }

// Replace stale `npx @vercel/ncc build ...` with the cleaner form.
if (pkg.scripts.build && pkg.scripts.build.startsWith('npx @vercel/ncc build')) {
  pkg.scripts.build = 'ncc build src/index.js -o dist'
}

// Bump action-core to ^0.4.1 (the public release) if present.
if (pkg.dependencies?.['@w3-io/action-core']) {
  pkg.dependencies['@w3-io/action-core'] = '^0.4.1'
}

// Ensure standard devDeps are present without clobbering existing versions.
const standardDevDeps = {
  '@eslint/js': '^9.0.0',
  '@vercel/ncc': '^0.38.4',
  eslint: '^9.0.0',
  prettier: '^3.4.0',
}
pkg.devDependencies = { ...standardDevDeps, ...pkg.devDependencies }

writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')

console.log(
  `${path}: ${dupCount > 1 ? '(fixed duplicate type key) ' : ''}` +
    `${Object.keys(pkg.scripts).length} scripts, ` +
    `action-core=${pkg.dependencies?.['@w3-io/action-core'] || 'n/a'}`,
)
