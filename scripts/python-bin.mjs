import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The Python the extract steps and their tests run.
 *
 * 1. `STOCK_PYTHON_BIN`, when set: the cron wrappers and CI pin it.
 * 2. The checkout's `.venv/bin/python`, built by `make python-env` from
 *    `.python-version`, `pyproject.toml` and `uv.lock` (#359).
 * 3. `python3` from PATH, last.
 *
 * Before this, every caller fell straight back to `python3`, so on a machine
 * without `STOCK_PYTHON_BIN` the tests ran whatever interpreter PATH put first.
 * On one MacBook that was Anaconda, which happened to carry pdfplumber and
 * openpyxl, so the suite passed until a shell started without conda on PATH and
 * 38 tests failed with ModuleNotFoundError although nothing was uninstalled.
 */
const CHECKOUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function resolvePythonBin({ env = process.env, root = CHECKOUT, exists = fs.existsSync } = {}) {
  if (env.STOCK_PYTHON_BIN) return env.STOCK_PYTHON_BIN
  const venv = path.join(root, '.venv', 'bin', 'python')
  return exists(venv) ? venv : 'python3'
}

export const PYTHON_BIN = resolvePythonBin()
