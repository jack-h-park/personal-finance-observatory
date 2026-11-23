import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PYTHON_BIN, resolvePythonBin } from '../scripts/python-bin.mjs'

const root = '/repo'
const venv = path.join(root, '.venv', 'bin', 'python')

test('an explicit STOCK_PYTHON_BIN wins', () => {
  assert.equal(resolvePythonBin({ env: { STOCK_PYTHON_BIN: '/opt/py/bin/python3' }, root, exists: () => true }), '/opt/py/bin/python3')
})

test('without it, the checkout venv built by make python-env is used', () => {
  assert.equal(resolvePythonBin({ env: {}, root, exists: (file) => file === venv }), venv)
})

test('with neither, python3 from PATH is the last resort', () => {
  assert.equal(resolvePythonBin({ env: {}, root, exists: () => false }), 'python3')
  assert.equal(resolvePythonBin({ env: { STOCK_PYTHON_BIN: '' }, root, exists: () => false }), 'python3')
})

test('the default resolves against this checkout', () => {
  const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  assert.equal(PYTHON_BIN, resolvePythonBin({ root: checkout }))
})
