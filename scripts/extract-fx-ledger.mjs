import { financeEnvironment } from './finance-paths.mjs'
import { spawn } from 'node:child_process'
import { loadLocalEnv } from './env.mjs'
import { resolvePythonBin } from './python-bin.mjs'

loadLocalEnv()

const child = spawn(resolvePythonBin(), ['scripts/extract-fx-ledger.py'], {
  cwd: process.cwd(),
  env: financeEnvironment(),
  stdio: 'inherit',
})

child.on('close', (code) => {
  process.exitCode = code ?? 1
})
