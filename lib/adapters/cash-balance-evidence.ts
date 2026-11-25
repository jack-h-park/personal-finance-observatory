import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CashAccountBalance } from '@/lib/net-worth'

type CashKey = Pick<CashAccountBalance, 'institution' | 'account' | 'currency'>

export type CashBalanceEvidence = {
  statementStart: string
  statementEnd: string
  statementPage: number
  closingMinor: number
  confirmationDate: string
  confirmationMinor: number
  csvPeriod: 'unconfirmed'
}

const months = 'January February March April May June July August September October November December'.split(' ')

function date(year: number, month: string, day: string) {
  const monthNumber = months.indexOf(month) + 1
  const value = `${year}-${String(monthNumber).padStart(2, '0')}-${day.padStart(2, '0')}`
  const parsed = new Date(value)
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function usdMinor(text: string) {
  const match = /^(?:USD |\$)(-?(?:\d+|\d{1,3}(?:,\d{3})+))\.(\d{2})$/.exec(text)
  if (!match) return null
  const amount = Number(`${match[1].replaceAll(',', '')}${match[2]}`)
  return Number.isSafeInteger(amount) ? amount : null
}

const cells = (line: string) => line.trim().slice(1, -1).split('|').map(cell => cell.trim())

/** Reads the existing Robinhood Banking balance-confirmation section. Other
 * index sections and original document links are outside this projection. */
export function readCashBalanceEvidence(index: string) {
  const byAccount = new Map<string, CashBalanceEvidence>()
  const conflicts = new Set<string>()
  for (const section of index.replaceAll('\r\n', '\n').split(/^## /m).slice(1)) {
    const [title, ...lines] = section.split('\n')
    const heading = /^Robinhood Banking — ([A-Za-z]+) (\d{4}) and ([A-Za-z]+) (\d{1,2}) balance confirmation$/.exec(title.trimEnd())
    if (!heading) continue
    const [, statementMonth, yearText, confirmationMonth, confirmationDay] = heading
    const year = Number(yearText)
    const text = lines.join('\n')
    const period = /\bThe statements cover ([A-Za-z]+) (\d{1,2})[–-](\d{1,2}), (\d{4})\./.exec(text)
    if (!period || period[1] !== statementMonth || period[4] !== yearText ||
      !text.includes('The selected export start and end dates remain unconfirmed for both CSVs.')) continue
    const statementStart = date(year, statementMonth, period[2])
    const statementEnd = date(year, statementMonth, period[3])
    const confirmationDate = date(year, confirmationMonth, confirmationDay)
    if (!statementStart || !statementEnd || !confirmationDate || statementStart > statementEnd || confirmationDate < statementEnd) continue

    const header = ['Existing account', 'Issuer statement PDF', `${statementMonth} ${period[3]} ending balance`, `${confirmationMonth} ${confirmationDay} owner-confirmed balance`, 'Existing transaction CSV']
    const start = lines.findIndex(line => line.startsWith('|') && JSON.stringify(cells(line)) === JSON.stringify(header))
    if (start < 0 || !/^\|(?:[\s:|-])+\|$/.test(lines[start + 1] ?? '')) continue
    for (const line of lines.slice(start + 2)) {
      if (!/^\|.*\|$/.test(line)) break
      const [account, statement, closing, confirmation, csv, ...extra] = cells(line)
      if (!account || !csv || extra.length) continue
      const page = /^\[([^\]]+), PDF page ([1-9]\d*)\]\(\.\.\/inbox\/[^)]+\.pdf\)$/.exec(statement)
      if (!page || page[1] !== `${statementMonth} statement` || !/^\[[^\]]+\]\(\.\.\/bank-statements\/[^)]+\.csv\)$/.test(csv)) continue
      const statementPage = Number(page[2])
      const closingMinor = usdMinor(closing)
      const confirmationMinor = usdMinor(confirmation)
      if (!Number.isSafeInteger(statementPage) || closingMinor == null || confirmationMinor == null) continue
      const previous = byAccount.get(account)
      if (!previous || previous.confirmationDate < confirmationDate) {
        byAccount.set(account, { statementStart, statementEnd, statementPage, closingMinor, confirmationDate, confirmationMinor, csvPeriod: 'unconfirmed' })
        conflicts.delete(account)
      } else if (previous.confirmationDate === confirmationDate) {
        conflicts.add(account)
      }
    }
  }
  return ({ institution, account, currency }: CashKey) =>
    institution === 'robinhood-bank' && currency === 'USD' && !conflicts.has(account)
      ? byAccount.get(account)
      : undefined
}

export function loadCashBalanceEvidence(recordsDir: string) {
  let index = ''
  try {
    index = readFileSync(join(recordsDir, 'docs', 'evidence-index.md'), 'utf8')
  } catch {
    // Optional evidence is independent of the displayed balance.
  }
  return readCashBalanceEvidence(index)
}
