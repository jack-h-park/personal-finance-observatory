import { prepareSpendingPublication } from '../lib/adapters/spending-view'

const [ledger, asOf, bankSaladObservation] = process.argv.slice(2)
if (!ledger || !asOf) {
  process.stderr.write('Usage: export-spending-view <absolute-ledger-path> <YYYY-MM-DD> [absolute-BankSalad-observation-path]\n')
  process.exitCode = 1
} else {
  try {
    const publication = prepareSpendingPublication(ledger, asOf, bankSaladObservation)
    process.stdout.write(JSON.stringify(publication) + '\n')
  } catch {
    process.stderr.write('Could not prepare the private spending snapshot. Check the ledger and evidence files.\n')
    process.exitCode = 1
  }
}
