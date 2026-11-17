/** Explicit-file read-only comparison. No config/env loading, automatic pinning or output writer. */
import path from 'node:path'
import { readAnnualFederalComparison, type ReadOnlyAnnualComparisonRequest } from '../lib/adapters/annual-tax-comparison'

const usage = `Usage: pnpm --silent tax:annual:compare --input /absolute/input.json --history /absolute/history.json --review /absolute/review.json --records-root /absolute/records (--tax-root /absolute/tax | --no-tax-root) --review-id ID --review-revision N --review-sha256 SHA256
Read-only selected-history/evidence comparison; all file/root paths and external review pins are required. JSON to stdout only.
Exit 0: compared; 1: adapter-blocked JSON (including unavailable/invalid sources); 2: invalid invocation or unexpected failure. No write, deployment or private-use authorization.
`
const valued = new Set(['--input', '--history', '--review', '--records-root', '--tax-root', '--review-id', '--review-revision', '--review-sha256'])
const required = ['--input', '--history', '--review', '--records-root', '--review-id', '--review-revision', '--review-sha256']
function absolute(value: string) { return path.isAbsolute(value) && path.normalize(value) === value && !value.includes('\0') }

function requestFromArguments(args: string[]): ReadOnlyAnnualComparisonRequest {
  const values = new Map<string, string>()
  let noTaxRoot = false
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (flag === '--no-tax-root') {
      if (noTaxRoot) throw new Error('Duplicate flag')
      noTaxRoot = true
      continue
    }
    const value = args[++i]
    if (!valued.has(flag) || values.has(flag) || typeof value !== 'string' || !value.trim() || value.startsWith('--')) throw new Error('Invalid arguments')
    values.set(flag, value)
  }
  if (!required.every(flag => values.has(flag)) || noTaxRoot === values.has('--tax-root')) throw new Error('Missing or conflicting arguments')
  for (const flag of ['--input', '--history', '--review', '--records-root', ...(!noTaxRoot ? ['--tax-root'] : [])]) {
    if (!absolute(values.get(flag)!)) throw new Error('Noncanonical path')
  }
  const revision = values.get('--review-revision')!, sha256 = values.get('--review-sha256')!
  if (!/^[1-9][0-9]*$/.test(revision) || !Number.isSafeInteger(Number(revision)) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid review pin')
  return {
    inputFile: values.get('--input')!, historyFile: values.get('--history')!, reviewFile: values.get('--review')!,
    evidenceRoots: { records: values.get('--records-root')!, tax: noTaxRoot ? null : values.get('--tax-root')! },
    expectedReview: { id: values.get('--review-id')!, revision: Number(revision), sha256 },
  }
}

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') process.stdout.write(usage)
else {
  let request: ReadOnlyAnnualComparisonRequest | undefined
  try { request = requestFromArguments(args) }
  catch { process.stderr.write(usage); process.exitCode = 2 }
  if (request) {
    try {
      const result = readAnnualFederalComparison(request)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      process.exitCode = result.status === 'compared' && result.comparisonEligible ? 0 : 1
    } catch {
      // Errors may include private arguments, source content or filesystem paths.
      process.stderr.write('Annual comparison failed unexpectedly; no result was emitted.\n')
      process.exitCode = 2
    }
  }
}
