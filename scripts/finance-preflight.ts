/** Explicit recorded-observation assessment. No operating configuration or endpoint reads. */
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { evaluateFinancePreflight } from '../lib/domain/finance-preflight'

const usage = 'Usage: pnpm --silent finance:preflight --input observations.json\nRead-only assessment of provided observations, not a live filesystem or job check. Exit 0: matched; 1: valid nonmatched; 2: invalid invocation/input. No write or publish authorization.\n'
const maxBytes = 1024 * 1024
function readInput(file: string): unknown {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0))
  try {
    const info = fstatSync(fd)
    if (!info.isFile() || info.size > maxBytes) throw new Error('Invalid input')
    const buffer = Buffer.alloc(maxBytes + 1)
    let size = 0
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null)
      if (!count) break
      size += count
    }
    if (size > maxBytes) throw new Error('Invalid input')
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size)))
  } finally { closeSync(fd) }
}
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') process.stdout.write(usage)
else if (args.length !== 2 || args[0] !== '--input' || !args[1] || args[1].startsWith('--')) {
  process.stderr.write(usage); process.exitCode = 2
} else {
  try {
    const result = evaluateFinancePreflight(readInput(args[1]))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exitCode = result.status === 'matched' ? 0 : 1
  } catch {
    process.stderr.write('Finance preflight failed: expected a regular UTF-8 JSON file up to 1 MiB matching the supported observation contract.\n')
    process.exitCode = 2
  }
}
