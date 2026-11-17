import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'

const extractor = path.resolve(import.meta.dirname, '../scripts/extract-kr-statements.py')
const python = process.env.STOCK_PYTHON_BIN || 'python3'
function amount(rawType, wonAmount, foreignAmount, currency) {
  const script = `
import importlib.util,json,sys,types
sys.modules.setdefault('pdfplumber',types.ModuleType('pdfplumber'))
spec=importlib.util.spec_from_file_location('extract',sys.argv[1]);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
a=['']*12;b=['']*12;c=['']*12
a[1],a[6],a[8],b[10]=sys.argv[2:]
print(json.dumps(mod.amount_of(a,b,c)))
`
  return JSON.parse(execFileSync(python, ['-c', script, extractor, rawType, wonAmount, foreignAmount, currency], { encoding: 'utf8' }))
}

test('a no-cash fractional foreign transfer preserves the explicit source currency', () => {
  assert.deepEqual(amount('소수해외대체입고', '', '', 'USD'), ['USD', 0, '', ''])
})

test('ordinary won and foreign-currency cash amounts retain their source interpretation', () => {
  assert.deepEqual(amount('주식매수입고', '1000', '', ''), ['KRW', 1000, '', 1000])
  assert.deepEqual(amount('해외주식매도출고', '', '7.48', 'USD'), ['USD', 7.48, '', ''])
  assert.deepEqual(amount('소수해외대체입고', '', '', ''), ['KRW', 0, '', 0])
})
