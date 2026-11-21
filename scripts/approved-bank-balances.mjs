const sha256 = /^[a-f0-9]{64}$/
const timestampWithOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/

export function approvedBankBalanceRows(receipts, existingRows, source) {
  if (!Array.isArray(receipts)) throw new Error('expected a list of approved bank balances')
  const approvedDates = new Set()
  return receipts.flatMap(receipt => {
    const { institution, account, currency, observedAt, balanceCents, balanceWon } = receipt ?? {}
    const date = typeof observedAt === 'string' ? observedAt.slice(0, 10) : ''
    const day = new Date(`${date}T00:00:00Z`)
    let balance = null
    if (currency === 'USD' && balanceWon === undefined && Number.isSafeInteger(balanceCents)) {
      balance = balanceCents / 100
    }
    if (currency === 'KRW' && balanceCents === undefined && Number.isSafeInteger(balanceWon)) {
      balance = balanceWon
    }
    if (!timestampWithOffset.test(observedAt) || !Number.isFinite(Date.parse(observedAt))
        || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date
        || balance === null
        || ![receipt?.reportSha256, receipt?.statementSha256, receipt?.connectorManifestSha256].every(hash => sha256.test(hash))) {
      throw new Error('invalid approved bank balance evidence')
    }

    const key = JSON.stringify([institution, account, currency, date])
    if (approvedDates.has(key)) throw new Error('duplicate approved bank balance date')
    approvedDates.add(key)

    const history = existingRows.filter(row => row.institution === institution
      && row.account === account && row.currency === currency)
    const identities = new Set(history.map(row => JSON.stringify([row.owner, row.kind])))
    if (identities.size !== 1) throw new Error('approved balance must match one existing bank account')
    // A bank-sourced balance for the same date takes precedence.
    if (history.some(row => row.as_of_date === date)) return []
    const { owner, kind } = history[0]
    return [{
      institution, account, currency, owner, kind, as_of_date: date,
      balance, day_max_balance: null, source, derived: 0,
    }]
  })
}
