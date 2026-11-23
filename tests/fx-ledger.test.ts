import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PYTHON_BIN } from '../scripts/python-bin.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

function runPython(program: string, env: Record<string, string> = {}) {
  return JSON.parse(
    execFileSync(PYTHON_BIN, ['-c', program], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    })
  )
}

test('Hana PDF/XLS overlap is deduplicated and the XLS actual rate wins', () => {
  const result = runPython(`
import importlib.util, json
spec=importlib.util.spec_from_file_location('fx', 'scripts/extract-fx-ledger.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
pdf={'date':'2025-02-17','time':None,'kind':'원화대가','memo':'FX마켓 살래요','branch':'','deposit':100.0,'withdrawal':0.0,'balance':0.0,'applied_rate':None,'source':'synthetic.pdf','source_path':'synthetic.pdf','page':5}
xls={**pdf,'time':'12:34:56','balance':None,'applied_rate':1203.0,'source':'synthetic.xls','source_path':'synthetic.xls','page':None}
merged=m.merge_hana_rows([pdf],[xls])
events=m.hana_events(merged, {'2025-02-17':{'base':1190.0,'ttSend':1220.0,'cashBuy':1230.0}}, overrides={}, observations={})
print(json.dumps({'rows':len(merged),'event':events[0]}))
`)
  assert.equal(result.rows, 1)
  assert.equal(result.event.rate_status, 'actual')
  assert.equal(result.event.applied_rate, 1203)
  assert.equal(result.event.reference_base_rate, 1190)
})

// Matching uses the second-precision XLS time instead of the screenshot's minute.
test('private FX inputs preserve transaction-time reference rates and reviewed transfer overrides', () => {
  const result = runPython(`
import importlib.util, json, tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('fx', 'scripts/extract-fx-ledger.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    m.SOURCE_DIR=root/'statements'
    m.OUT_PATH=root/'ledger.json'
    m.OVERRIDES_PATH=root/'overrides.json'
    m.OBSERVATIONS_PATH=root/'observations.json'
    m.SCREENSHOT_EVIDENCE_PATH=root/'screenshots.json'
    day='2025-02-17'
    m.OVERRIDES_PATH.write_text(json.dumps({'version':1,'overrides':[{'institution':'Hana Bank','date':day,'direction':'OUT','usdAmount':20.0,'counterparty':'Synthetic bank','confidence':'high','matchStatus':'matched','provenance':'invented'}]}))
    m.OBSERVATIONS_PATH.write_text(json.dumps({'version':1,'observations':[{'institution':'Hana Bank','date':day,'transactionTime':'12:34:56','baseRate':1200.0,'ttSendRate':1230.0,'publishedRound':7,'publishedTime':'12:30','source':'synthetic-reference'}]}))
    m.SCREENSHOT_EVIDENCE_PATH.write_text(json.dumps({'version':1,'rows':[{'date':day,'time':'12:34','status':'거래완료','usdAmount':100.0,'appliedRate':1203.0,'sourceScreenshot':'invented.png'}]}))
    base={'date':day,'time':'12:34:56','kind':'원화대가','memo':'FX마켓 살래요','branch':'','deposit':100.0,'withdrawal':0.0,'balance':None,'applied_rate':1203.0,'source':'synthetic.xls','source_path':'synthetic.xls','page':None}
    transfer={**base,'time':'14:00','kind':'외화대체','memo':'','deposit':0.0,'withdrawal':20.0}
    m.parse_hana_xls=lambda: ([base,transfer],[],[])
    m.reference_rates=lambda days: ({day:{'base':1190.0,'ttSend':1220.0,'cashBuy':1230.0}},[])
    m.toss_events=lambda: ([],[],[])
    import contextlib, io
    with contextlib.redirect_stdout(io.StringIO()):
        assert m.main()==0
    print(m.OUT_PATH.read_text())
`)
  assert.equal(result.events.length, 2)
  const [exchange, transfer] = result.events
  assert.equal(exchange.time, '12:34:56')
  assert.equal(exchange.reference_base_rate, 1200)
  assert.equal(exchange.reference_customer_rate, 1230)
  assert.equal(exchange.applied_rate, 1203)
  assert.equal(transfer.counterparty, 'Synthetic bank')
  assert.equal(result.sources[0].rows, 1)
})

test('a screenshot keeps its own time when the bank row disagrees on the minute', () => {
  const result = runPython(`
import importlib.util, json
spec=importlib.util.spec_from_file_location('fx', 'scripts/extract-fx-ledger.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
xls={'date':'2025-10-30','time':'09:01:12','kind':'원화대가','memo':'FX마켓 살래요','branch':'','deposit':100.0,'withdrawal':0.0,'balance':None,'applied_rate':1433.0,'source':'recent.xls','source_path':'recent.xls','page':None}
shot={**xls,'date':'2025-10-29','time':'15:54','source':'shot','source_path':'shot.json'}
merged=m.merge_hana_screenshot_rows([xls], [shot])
print(json.dumps({'rows':len(merged),'time':merged[0]['time']}))
`)
  // Matched across a posting-date shift, so the bank's time is a different
  // moment, not a more precise reading of the same one.
  assert.equal(result.rows, 1)
  assert.equal(result.time, '15:54')
})

test('Hana historical FX Market rate applies 90% preference and remains estimated', () => {
  const result = runPython(`
import importlib.util, json
spec=importlib.util.spec_from_file_location('fx', 'scripts/extract-fx-ledger.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
row={'date':'2024-04-15','time':None,'kind':'원화대가','memo':'FX마켓 살래요','branch':'','deposit':1000.0,'withdrawal':0.0,'balance':1000.0,'applied_rate':None,'source':'annual.pdf','source_path':'annual.pdf','page':1}
event=m.hana_events([row], {'2024-04-15':{'base':1400.0,'ttSend':1414.0,'cashBuy':1424.5}})[0]
print(json.dumps(event))
`)
  assert.equal(result.applied_rate, 1401.4)
  assert.equal(result.rate_status, 'estimated')
  assert.equal(result.preference_rate, 0.9)
  assert.ok(Math.abs(result.spread_cost_krw - 1400) < 1e-6)
  assert.ok(Math.abs(result.spread_savings_krw - 12600) < 1e-6)
  assert.equal(result.realized_fx_gl_krw, null)
})

test('Toss exact statement legs become one exchange and a cancellation stays separate', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'fx-ledger-'))
  const statements = path.join(temp, 'kr')
  mkdirSync(statements)
  const headers = ['Date', 'Account', 'Raw Type', 'FX Rate', 'Native Amount', 'Source', 'Page']
  const rows = [
    ['2025-01-02', 'Toss', '환전원화출금', '1400', '14000', 'toss.pdf', '1'],
    ['2025-01-02', 'Toss', '환전외화입금', '1400', '14000', 'toss.pdf', '2'],
    ['2025-01-03', 'Toss', '환전원화입금', '1400', '14000', 'toss.pdf', '1'],
    ['2025-01-03', 'Toss', '환전외화입금취소', '1400', '14000', 'toss.pdf', '2'],
  ]
  writeFileSync(path.join(statements, 'transactions.tsv'), [headers, ...rows].map((row) => row.join('\t')).join('\n'))
  const result = runPython(`
import importlib.util, json
spec=importlib.util.spec_from_file_location('fx', 'scripts/extract-fx-ledger.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
events,sources,findings=m.toss_events()
print(json.dumps({'events':events,'findings':findings}))
`, { STOCK_KR_STATEMENTS_DIR: statements })
  assert.equal(result.findings.length, 0)
  assert.deepEqual(result.events.map((event: any) => event.event_type), ['EXCHANGE', 'EXCHANGE_CANCEL'])
  assert.deepEqual(result.events.map((event: any) => event.usd_amount), [10, 10])
})

// The cron's PATH has no `soffice`, and the macOS installer does not add one, so
// the lookup has to find the app bundle itself or the Hana XLS rows go missing.
function findSoffice(env: Record<string, string> = {}) {
  const temp = mkdtempSync(path.join(tmpdir(), 'fx-soffice-'))
  const bundled = path.join(temp, 'LibreOffice.app/Contents/MacOS/soffice')
  mkdirSync(path.dirname(bundled), { recursive: true })
  writeFileSync(bundled, '#!/bin/sh\n', { mode: 0o755 })
  const emptyPath = path.join(temp, 'empty-path')
  mkdirSync(emptyPath)
  const result = runPython(`
import importlib.util, json, os
from pathlib import Path
spec=importlib.util.spec_from_file_location('fx', 'scripts/extract-fx-ledger.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
os.environ['PATH']=${JSON.stringify(emptyPath)}
os.environ['HOME']=${JSON.stringify(temp)}
m.MACOS_SOFFICE_PATHS=[Path(${JSON.stringify(path.join(temp, 'missing/soffice'))}), Path(${JSON.stringify(bundled)})]
print(json.dumps(m.soffice_binary()))
`, env)
  return { result, bundled }
}

test('soffice is found in the macOS app bundle when nothing puts it on PATH', () => {
  const { result, bundled } = findSoffice({ STOCK_SOFFICE_BIN: '' })
  assert.equal(result, bundled)
})

test('a configured STOCK_SOFFICE_BIN still wins over the app bundle', () => {
  const configured = path.join(mkdtempSync(path.join(tmpdir(), 'fx-soffice-bin-')), 'soffice')
  writeFileSync(configured, '#!/bin/sh\n', { mode: 0o755 })
  const { result } = findSoffice({ STOCK_SOFFICE_BIN: configured })
  assert.equal(result, configured)
})

test('Hana extraction fails before reading statements or replacing output if curated inputs are absent or malformed', () => {
  const result = runPython(`
import importlib.util, json, tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('fx', 'scripts/extract-fx-ledger.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    m.SOURCE_DIR=root/'statements'; m.SOURCE_DIR.mkdir()
    (m.SOURCE_DIR/'hana-usd-history-synthetic.pdf').touch()
    m.OVERRIDES_PATH=root/'overrides.json'
    m.OBSERVATIONS_PATH=root/'observations.json'
    m.SCREENSHOT_EVIDENCE_PATH=root/'screenshots.json'
    m.OUT_PATH=root/'ledger.json'
    m.OUT_PATH.write_text('last-good-ledger')
    failures=[]
    for malformed in [False, True]:
        if malformed:
            m.OVERRIDES_PATH.write_text('{"version":1,"overrides":[]}')
            m.OBSERVATIONS_PATH.write_text('{"version":1,"observations":[]}')
            m.SCREENSHOT_EVIDENCE_PATH.write_text('{"version":1,"rows":{}}')
        try:
            m.main()
        except ValueError as error:
            failures.append(str(error))
    print(json.dumps({'failures':failures,'output':m.OUT_PATH.read_text()}))
`)
  assert.equal(result.failures.length, 2)
  assert.match(result.failures[0], /Curated FX input is missing/)
  assert.match(result.failures[1], /Curated FX input is invalid/)
  assert.equal(result.output, 'last-good-ledger')
})
