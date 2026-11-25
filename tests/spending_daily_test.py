import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('spending_daily', Path(__file__).parents[1] / 'scripts/spending-daily.py')
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)

TOKEN = 'a' * 64
ROW = dict(accountId='checking', postedDate='2026-11-24', activityDate='2026-11-24',
           currency='USD', amountMinor=-300, kind='purchase', description='Sample charge')


class DailySpendingTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root / 'latest-good.json'
        self.binding = self.root / 'binding.json'
        self.config = {'pointer': str(self.source), 'binding': str(self.binding)}
        self.binding.write_bytes(daily.encode(dict(accountId='checking')))
        self.source.write_bytes(daily.encode(dict(runId='day-one')))
        self.remote = self.root / 'operating.json'
        self.original = daily.encode(dict(version=1, asOf='2026-11-23', accounts={},
            snapshot=dict(rows=[], coverage=[], holds=['keep-existing-hold'], reviewIncomplete=False)))
        self.remote.write_bytes(self.original)
        base = self.root / 'runs/seed'
        ledger = base / daily.STORAGE
        ledger.parent.mkdir(parents=True)
        db = sqlite3.connect(ledger)
        db.execute('CREATE TABLE spending_transaction (id TEXT PRIMARY KEY,account_id,posted_date,currency,payload)')
        db.close()
        archived = ledger.parent.parent / 'records'
        archived.mkdir()
        (archived / 'receipt.json').write_bytes(b'original evidence')
        (ledger.parent.parent / 'account-labels.json').write_bytes(b'{}')
        (base / 'snapshot.json').write_bytes(self.original)
        (self.root / 'current.json').write_bytes(daily.encode(dict(run='seed')))

    def cli(self, config, directory, apply_token=None):
        result = {}
        if apply_token:
            self.assertEqual(apply_token, TOKEN)
            db = sqlite3.connect(directory / daily.STORAGE)
            db.execute('INSERT INTO spending_transaction VALUES (?,?,?,?,?)',
                       ('tx', ROW['accountId'], ROW['postedDate'], ROW['currency'], json.dumps(ROW)))
            db.commit()
            db.close()
            if config.get('carryDecisions'):
                data = daily.read(directory / 'decisions.json')
                pointer = daily.read(directory / 'pointer.json')
                body = daily.encode(dict(decisions=data['decisions'], manifestSha256=pointer['manifestSha256'],
                                         run=dict(manifest=dict(runId=directory.name))))
                evidence_hash = daily.digest(body)
                records = (directory / daily.STORAGE).parent.parent / 'records/spending'
                records.mkdir(exist_ok=True)
                (records / (evidence_hash + '.json')).write_bytes(body)
                result['evidenceSha256'] = evidence_hash
        return dict(status='applied' if apply_token else 'preview', reviewToken=TOKEN, held=[], issues=[],
                    inserted=1, matched=0, totals=[dict(netMinor='300')], **result)

    def publish(self, _, expected, candidate):
        return daily.receive(self.remote, expected, candidate, lambda *_: None)

    def test_workbook_intake_pins_identity_and_exact_hold_approval(self):
        issuer = self.root / 'issuer.xlsx'
        bank = self.root / 'bank.xlsx'
        issuer.write_bytes(b'issuer fixture')
        bank.write_bytes(b'bank fixture')
        self.config.update(kind='workbook', pointer=str(self.root / 'workbook-latest.json'))
        config = {'sources': {'korea': self.config}}
        first = daily.enqueue_workbook(self.root, config, 'korea', bank, issuer, '2026-10-01', '2026-11-30')
        self.assertEqual(first, daily.enqueue_workbook(self.root, config, 'korea', bank, issuer,
                                                      '2026-10-01', '2026-11-30'))
        directory = self.root / 'runs' / first['run']
        self.assertEqual((directory / 'banksalad.xlsx').read_bytes(), b'bank fixture')
        reviewed = dict(status='preview', reviewToken=TOKEN, issues=[],
                        held=[{'workbook': 'banksalad', 'row': 5}], inserted=0, matched=0, evidenceLinked=2, keepHoldsAllowed=True)
        (directory / 'preview.json').write_bytes(daily.encode(reviewed))
        with self.assertRaisesRegex(ValueError, 'unresolved_review'):
            daily.approve(self.root, first['run'], TOKEN)
        daily.approve(self.root, first['run'], TOKEN, keep_holds=True)
        self.assertTrue(daily.accepted(directory, reviewed))
        self.assertFalse(daily.accepted(directory, {**reviewed, 'held': []}))
        bank.write_bytes(b'overlapping bank fixture')
        with self.assertRaisesRegex(ValueError, 'workbook_review_pending'):
            daily.enqueue_workbook(self.root, config, 'korea', bank, issuer, '2026-11-01', '2026-12-31')
        (directory / 'published.json').write_bytes(b'{}')
        second = daily.enqueue_workbook(self.root, config, 'korea', bank, issuer, '2026-11-01', '2026-12-31')
        self.assertNotEqual(first, second)
        self.assertEqual((directory / 'banksalad.xlsx').read_bytes(), b'bank fixture')

    def test_workbook_rejection_preserves_unapplied_inputs_and_allows_a_new_upload(self):
        issuer = self.root / 'issuer.xlsx'
        bank = self.root / 'bank.xlsx'
        issuer.write_bytes(b'issuer fixture')
        bank.write_bytes(b'malformed input')
        cfg = {'sources': {'korea': {**self.config, 'kind': 'workbook',
                                    'pointer': str(self.root / 'workbook-latest.json')}}}
        before = daily.enqueue_workbook(self.root, cfg, 'korea', bank, issuer, '2026-10-01', '2026-11-30')
        self.assertEqual(daily.reject_workbook(self.root, cfg, 'korea', before['run'])['status'], 'rejected')
        self.assertEqual(daily.tick(self.root, cfg)['sources']['korea']['status'], 'awaiting_source')
        bank.write_bytes(b'corrected input')
        after = daily.enqueue_workbook(self.root, cfg, 'korea', bank, issuer, '2026-10-01', '2026-11-30')
        self.assertNotEqual(before['run'], after['run'])
        self.assertEqual((self.root / 'runs' / before['run'] / 'banksalad.xlsx').read_bytes(), b'malformed input')

    def test_workbook_tick_publishes_an_accepted_hold_without_repeating_a_purchase(self):
        issuer = self.root / 'issuer.xlsx'
        bank = self.root / 'bank.xlsx'
        issuer.write_bytes(b'issuer fixture')
        bank.write_bytes(b'bank fixture')
        cfg = {'sources': {'korea': {**self.config, 'kind': 'workbook',
                                    'pointer': str(self.root / 'workbook-latest.json')}}}
        queued = daily.enqueue_workbook(self.root, cfg, 'korea', bank, issuer, '2026-10-01', '2026-11-30')
        def cli(config, directory, apply_token=None):
            return dict(status='applied' if apply_token else 'preview', reviewToken=TOKEN, issues=[],
                        held=[{'workbook': 'banksalad', 'row': 5, 'reason': 'ambiguous_match'}],
                        inserted=0, matched=1, evidenceLinked=1, totals=[])
        with patch.object(daily, 'cli', cli), patch.object(daily, 'publish', self.publish):
            self.assertEqual(daily.tick(self.root, cfg)['sources']['korea']['held'], 1)
            self.assertEqual(self.remote.read_bytes(), self.original)
            daily.approve(self.root, queued['run'], TOKEN, keep_holds=True)
            self.assertEqual(daily.tick(self.root, cfg)['sources']['korea']['status'], 'published')
            published = self.remote.read_bytes()
            snap = json.loads(published)['snapshot']
            self.assertEqual(snap['rows'], [])
            self.assertEqual(snap['holds'][1]['source'], 'banksalad')
            self.assertEqual(snap['holds'][1]['row'], 5)
            self.assertEqual(daily.tick(self.root, cfg)['sources']['korea']['status'], 'already_published')
            self.assertEqual(self.remote.read_bytes(), published)
            second = daily.enqueue_workbook(self.root, cfg, 'korea', bank, issuer, '2026-12-01', '2026-12-31')
            def clean(config, directory, apply_token=None):
                return {**cli(config, directory, apply_token), 'held': []}
            with patch.object(daily, 'cli', clean):
                daily.tick(self.root, cfg)
                daily.approve(self.root, second['run'], TOKEN)
                self.assertEqual(daily.tick(self.root, cfg)['sources']['korea']['status'], 'published')
                self.assertEqual(self.remote.read_bytes(), published)

    def test_bank_evidence_runner_keeps_existing_rows_and_only_adds_reviewed_fees(self):
        import os
        import subprocess
        import sys

        python = os.environ.get('STOCK_PYTHON_BIN', sys.executable)
        fixture = """
from openpyxl import Workbook
from datetime import datetime
import sys
b=Workbook()
s=b.active
s.title='가계부 내역'
s.append(['날짜','시간','타입','대분류','소분류','내용','금액','화폐','결제수단','메모'])
for day, text, value in [(1, 'Confirmed shop', -500), (2, '당발송금수수료(Ref No: REF123)', -1000),
                         (3, 'Unverified purchase', -700)]:
    s.append([datetime(2026,11,day), None, '지출', None, None, text, value, 'KRW', 'fixture', None])
b.save(sys.argv[1])
"""
        bank = self.root / 'bank.xlsx'
        issuer = self.root / 'issuer.xls'
        issuer.write_bytes(b'reviewed issuer fixture')
        subprocess.run([python, '-c', fixture, str(bank)], check=True)
        self.binding.write_bytes(daily.encode(dict(accountId='checking', bankSaladPaymentMethod='fixture',
                                                   product='bank', matchExact=True, showUnmatched=True)))
        cfg = dict(sources={'korea': {**self.config, 'kind': 'banksalad-evidence',
                                    'pointer': str(self.root / 'workbook-latest.json')}},
                   checkout=str(Path(__file__).parents[1].resolve()), workbookPython=python)
        event = {**ROW, 'currency':'KRW', 'amountMinor':-500, 'postedDate':'2026-11-01',
                 'activityDate':'2026-11-01', 'description':'Confirmed shop'}
        seed = self.root / 'runs/seed'
        with sqlite3.connect(seed / daily.STORAGE) as db:
            db.execute('DROP TABLE spending_transaction')
            db.execute('CREATE TABLE spending_transaction (id PRIMARY KEY,source,account_id,posted_date,currency,amount_minor,source_id,payload)')
            db.execute('CREATE TABLE spending_batch (id TEXT PRIMARY KEY,source,period_start,period_end,record_sha256,record_path,adapter,row_count,applied_at)')
            db.execute('CREATE TABLE spending_observation (batch_id,row_number,transaction_id)')
            db.execute('INSERT INTO spending_transaction VALUES (?,?,?,?,?,?,?,?)',
                       ('known', 'fixture', 'checking', '2026-11-01', 'KRW', -500, None, json.dumps(event)))
        packet = json.loads(self.original)
        packet['snapshot']['rows'] = [{'id':'known', **event}]
        before = daily.encode(packet)
        (seed / 'snapshot.json').write_bytes(before)
        self.remote.write_bytes(before)
        q = daily.enqueue_workbook(self.root, cfg, 'korea', bank, issuer, '2026-11-01', '2026-11-30')
        run = self.root / 'runs' / q['run']
        pointer = daily.read(run / 'pointer.json')
        (run / 'decisions.json').write_bytes(daily.encode(dict(
            bankSaladSha256=pointer['bankSaladSha256'], issuerSha256=pointer['issuerSha256'],
            issuerFees=[dict(row=3,date='2026-11-02',amountMinor=-1000,reference='REF123')])))
        with patch.object(daily, 'publish', self.publish):
            preview = daily.tick(self.root, cfg)['sources']['korea']
            self.assertEqual((preview['inserted'], preview['matched'], preview['held']), (1, 1, 1))
            daily.approve(self.root, q['run'], daily.read(run / 'preview.json')['reviewToken'], keep_holds=True)
            self.assertEqual(daily.tick(self.root, cfg)['sources']['korea']['status'], 'published')
            after = self.remote.read_bytes()
            snapshot = json.loads(after)['snapshot']
            self.assertEqual(len(snapshot['rows']), 2)
            self.assertEqual(sum(x['amountMinor'] for x in snapshot['rows']), -1500)
            self.assertEqual(daily.tick(self.root, cfg)['sources']['korea']['status'], 'already_published')
            self.assertEqual(self.remote.read_bytes(), after)

            with sqlite3.connect(run / daily.STORAGE) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM spending_batch').fetchone(), (1,))
                self.assertEqual(db.execute('SELECT count(*) FROM spending_observation').fetchone(), (2,))
            second = daily.enqueue_workbook(self.root, cfg, 'korea', bank, issuer, '2026-11-01', '2026-11-29')
            second_dir = self.root / 'runs' / second['run']
            (second_dir / 'decisions.json').write_bytes((run / 'decisions.json').read_bytes())
            replay = daily.tick(self.root, cfg)['sources']['korea']
            self.assertEqual((replay['inserted'], replay['matched']), (0, 2))

            old_binding = daily.read(self.binding)
            old_binding['accountId'] = 'unknown-account'
            self.binding.write_bytes(daily.encode(old_binding))
            state = daily.read(second_dir / 'pointer.json')
            state['bindingSha256'] = daily.digest(self.binding.read_bytes())
            (second_dir / 'pointer.json').write_bytes(daily.encode(state))
            cmd = [python, str(Path(cfg['checkout']) / 'scripts/banksalad-evidence.py'),
                   str(second_dir / daily.STORAGE), str(second_dir), str(self.binding)]
            refused = subprocess.run(cmd, capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn('unknown_account', refused.stderr)

    def test_banksalad_groups_cannot_offset_refunds(self):
        import os
        import subprocess
        import sys

        python = os.environ.get('STOCK_PYTHON_BIN', sys.executable)
        script = """
import runpy,sys
app=runpy.run_path(sys.argv[1])
items={2:{'day':'2026-11-01','kind':'지출','amount':-1200,'description':'Bus'},
       3:{'day':'2026-11-02','kind':'지출','amount':200,'description':'Bus refund'}}
target={'t':{'day':'2026-11-02','amount':-1000,'description':'Bus group'}}
binding={'product':'card','matchExact':False,'showUnmatched':True}
review={'links':[{'rows':[2,3],'transactionId':'t','basis':'issuer_aggregate'}]}
try:
    app['plan'](items,target,binding,review)
except ValueError as issue:
    assert str(issue)=='invalid_banksalad_aggregate'
else:
    raise AssertionError('mixed-sign aggregate accepted')
"""
        subprocess.run([python, '-c', script,
                        str(Path(__file__).parents[1] / 'scripts/banksalad-evidence.py')], check=True)

    def test_saved_us_evidence_holds_new_card_observations_and_links_approved_history(self):
        import sys
        provider = self.root / 'card.json'
        issuer = self.root / 'card.csv'
        issuer.write_bytes(b'Date,Description,Amount\n2026-11-24,Sample charge,-3.00\n')
        self.binding.write_bytes(daily.encode(dict(accountId='checking', provider='simplefin-card',
            providerAccountId='sample', connectionId='approved', suffix='0001', domain='example.com')))
        stamp = int(daily.datetime.fromisoformat('2026-11-24T12:00:00+00:00').timestamp())
        provider.write_bytes(daily.encode(dict(response=dict(errlist=[], connections=[
            dict(conn_id='approved', org_url='https://www.example.com')], accounts=[
            dict(id='sample', conn_id='approved', currency='USD', name='Example (0001)', transactions=[
                dict(id='confirmed', posted=stamp, amount='-3', description='Sample charge'),
                dict(id='unknown', posted=stamp, amount='20', description='Unknown credit')])]))))
        config = dict(sources={'archive': {**self.config, 'kind':'us-evidence', 'keepHeld':True,
                                           'pointer': str(self.root / 'archive-latest.json')}},
                      checkout=str(Path(__file__).parents[1].resolve()), workbookPython=sys.executable,
                      accounts=str(self.root / 'accounts.json'))
        Path(config['accounts']).write_bytes(daily.encode(dict(accounts=[dict(inventory=dict(
            accountId='checking', role='primary', owner=dict(state='confirmed')))])))
        seed = self.root / 'runs/seed'
        credit = {**ROW, 'amountMinor': 2000, 'kind': 'refund', 'description': 'Credit'}
        with sqlite3.connect(seed / daily.STORAGE) as db:
            db.execute('ALTER TABLE spending_transaction ADD COLUMN amount_minor')
            db.execute('CREATE TABLE spending_batch (id TEXT PRIMARY KEY,source,period_start,period_end,record_sha256,record_path,adapter,row_count,applied_at)')
            db.execute('CREATE TABLE spending_observation (batch_id,row_number,transaction_id)')
            db.execute('INSERT INTO spending_transaction VALUES (?,?,?,?,?,?)',
                       ('prior', 'checking', '2026-11-24', 'USD', json.dumps(ROW), -300))
            db.execute('INSERT INTO spending_transaction VALUES (?,?,?,?,?,?)',
                       ('refund', 'checking', '2026-11-24', 'USD', json.dumps(credit), 2000))
        packet = json.loads(self.original)
        packet['snapshot']['rows'] = [{'id':'prior', **ROW}, {'id':'refund', **credit}]
        packet['snapshot']['holds'].append(dict(accountId='checking', source='simplefin', row=2,
            reason='unconfirmed_credit', date='2026-11-24', amountMinor=2000, currency='USD'))
        start = daily.encode(packet)
        (seed / 'snapshot.json').write_bytes(start)
        self.remote.write_bytes(start)
        queued = daily.enqueue_workbook(self.root, config, 'archive', provider, issuer, '2026-11-24', '2026-11-24', True)
        run = self.root / 'runs' / queued['run']
        marker = daily.read(run / 'pointer.json')
        (run / 'decisions.json').write_bytes(daily.encode(dict(providerSha256=marker['providerSha256'],
            issuerSha256=marker['issuerSha256'], rows=[dict(sourceId='confirmed', postedDate='2026-11-24',
                amountMinor=-300, descriptionSha256=daily.digest(b'Sample charge'), transactionId='prior')])))
        with patch.object(daily, 'publish', self.publish):
            preview = daily.tick(self.root, config)['sources']['archive']
            self.assertEqual((preview['inserted'], preview['matched'], preview['held']), (0, 1, 1))
            self.assertEqual(self.remote.read_bytes(), start)
            daily.approve(self.root, queued['run'], daily.read(run / 'preview.json')['reviewToken'], keep_holds=True)
            self.assertEqual(daily.tick(self.root, config)['sources']['archive']['status'], 'published')
            after = self.remote.read_bytes()
            self.assertEqual(json.loads(after)['snapshot']['rows'], packet['snapshot']['rows'])
            old = json.loads(after)['snapshot']['holds']
            self.assertEqual(len(old), 2)
            self.assertEqual(old[1]['amountMinor'], 2000)
            self.assertEqual(old[1]['reason'], 'unconfirmed_credit')
            self.assertIn('observationKey', old[1])
            self.assertEqual(daily.tick(self.root, config)['sources']['archive']['status'], 'already_published')
            self.assertEqual(self.remote.read_bytes(), after)
            from importlib.util import module_from_spec, spec_from_file_location
            spec = spec_from_file_location('us_evidence', Path(config['checkout']) / 'scripts/spending-us-evidence.py')
            us_evidence = module_from_spec(spec)
            spec.loader.exec_module(us_evidence)
            with sqlite3.connect(run / daily.STORAGE) as db:
                scope, = db.execute('SELECT provider_scope FROM spending_us_provider_evidence LIMIT 1').fetchone()
                copied = dict(sourceId='second-id', postedDate='2026-11-24', amountMinor=-300,
                              descriptionSha256=daily.digest(b'Sample charge'), transactionId='prior')
                with self.assertRaisesRegex(ValueError, 'us_evidence_link_mismatch'):
                    us_evidence.review_rows(db, [(1, 'second-id', '2026-11-24', -300, 'Sample charge')],
                                            'checking', {'rows': [copied]}, marker, 'simplefin-card', scope)
            issuer.write_bytes(issuer.read_bytes() + b'2026-11-24,Credit,20.00\n')
            next_batch = daily.enqueue_workbook(self.root, config, 'archive', provider, issuer,
                                                '2026-11-24', '2026-11-24', True)
            new_run = self.root / 'runs' / next_batch['run']
            marker = daily.read(new_run / 'pointer.json')
            (new_run / 'decisions.json').write_bytes(daily.encode(dict(providerSha256=marker['providerSha256'],
                issuerSha256=marker['issuerSha256'], rows=[dict(sourceId='unknown', postedDate='2026-11-24',
                    amountMinor=2000, descriptionSha256=daily.digest(b'Unknown credit'), transactionId='refund')])))
            later = daily.tick(self.root, config)['sources']['archive']
            self.assertEqual((later['inserted'], later['matched'], later['held']), (0, 1, 0))
            daily.approve(self.root, next_batch['run'], daily.read(new_run / 'preview.json')['reviewToken'])
            self.assertEqual(daily.tick(self.root, config)['sources']['archive']['status'], 'published')
            final = daily.read(self.remote)['snapshot']
            self.assertEqual(final['rows'], packet['snapshot']['rows'])
            self.assertEqual(final['holds'], ['keep-existing-hold'])

    def test_simplefin_pending_only_does_not_request_approval_or_publish(self):
        empty = dict(status='preview', reviewToken=TOKEN, issues=[], held=[], inserted=0, matched=0, pendingIgnored=2)
        with patch.object(daily, 'cli', return_value=empty), patch.object(daily, 'publish', wraps=self.publish) as publish:
            status = daily.tick(self.root, self.config)
            self.assertEqual(status['status'], 'no_posted_activity')
            self.assertEqual(status['pendingIgnored'], 2)
            with self.assertRaisesRegex(ValueError, 'no_posted_activity'):
                daily.approve(self.root, 'day-one', TOKEN)
            publish.assert_not_called()
        self.assertEqual(self.remote.read_bytes(), self.original)

    def test_review_gate_then_exact_replay(self):
        with patch.object(daily, 'cli', self.cli), patch.object(daily, 'publish', self.publish):
            self.assertEqual(daily.tick(self.root, self.config)['status'], 'awaiting_review')
            self.assertEqual(self.remote.read_bytes(), self.original)
            with self.assertRaisesRegex(ValueError, 'stale_review_token'):
                daily.approve(self.root, 'day-one', 'b' * 64)
            daily.approve(self.root, 'day-one', TOKEN)
            self.assertEqual(daily.tick(self.root, self.config)['status'], 'published')
            after = self.remote.read_bytes()
            view = json.loads(after)['snapshot']
            self.assertEqual(view['rows'], [{'id':'tx', **ROW}])
            self.assertEqual(view['holds'], ['keep-existing-hold'])
            self.assertEqual(daily.tick(self.root, self.config)['status'], 'already_published')
            self.assertEqual(self.remote.read_bytes(), after)
            active = self.root / 'runs/day-one' / daily.STORAGE
            self.assertEqual((active.parent.parent / 'records/receipt.json').read_bytes(), b'original evidence')
            self.assertEqual((active.parent.parent / 'account-labels.json').read_bytes(), b'{}')

    def test_restart_adopts_the_prepared_batch_after_publish_transport_failure(self):
        with patch.object(daily, 'cli', self.cli), patch.object(daily, 'publish', self.publish):
            daily.tick(self.root, self.config)
            daily.approve(self.root, 'day-one', TOKEN)

            def lost_response(config, expected, candidate):
                self.publish(config, expected, candidate)
                raise OSError('lost response')

            with patch.object(daily, 'publish', lost_response), self.assertRaises(OSError):
                daily.tick(self.root, self.config)
            self.assertEqual(daily.read(self.root / 'current.json')['run'], 'seed')
            self.assertTrue(daily.tick(self.root, self.config)['unchanged'])
            self.assertEqual(daily.read(self.root / 'current.json')['run'], 'day-one')

    def test_receiver_preserves_snapshot_on_conflicts_and_failed_live_checks(self):
        candidate = daily.encode(dict(version=1, snapshot=dict(rows=[ROW])))
        with self.assertRaisesRegex(ValueError, 'operating_snapshot_changed'):
            daily.receive(self.remote, '0' * 64, candidate, lambda *_: None)

        def unavailable(*_):
            raise OSError('site unavailable')

        with self.assertRaises(OSError):
            daily.receive(self.remote, daily.digest(self.original), candidate, unavailable)
        self.assertEqual(self.remote.read_bytes(), self.original)

    def test_receiver_restores_prior_state_if_process_dies_before_check(self):
        candidate = daily.encode(dict(version=1, snapshot=dict(rows=[ROW])))
        previous = daily.digest(self.original)

        def interrupted(*_):
            raise KeyboardInterrupt()

        with self.assertRaises(KeyboardInterrupt):
            daily.receive(self.remote, previous, candidate, interrupted)
        self.assertEqual(self.remote.read_bytes(), candidate)

        def unavailable(*_):
            raise OSError('site unavailable')

        with self.assertRaises(OSError):
            daily.receive(self.remote, previous, candidate, unavailable)
        self.assertEqual(self.remote.read_bytes(), self.original)
        self.assertFalse(daily.receive(self.remote, previous, candidate, lambda *_: None)['unchanged'])

    def test_multiple_sources_keep_approvals_and_carried_decisions_account_scoped(self):
        self.source.write_bytes(daily.encode(dict(runId='day-one', connectionKey='checking')))
        card = self.root / 'card-latest.json'
        card.write_bytes(daily.encode(dict(runId='card-one', connectionKey='card', manifestSha256=TOKEN)))
        config = dict(sources={'card': {**self.config, 'pointer': str(card), 'carryDecisions': True},
                               'checking': self.config})
        with patch.object(daily, 'cli', self.cli), patch.object(daily, 'publish', self.publish):
            first = daily.tick(self.root, config)
            self.assertEqual(first['status'], 'checked')
            self.assertEqual(first['sources']['card']['status'], 'awaiting_review')
            self.assertEqual(first['sources']['checking']['status'], 'awaiting_review')
            evidence = self.root / 'runs/card-one/decisions.json'
            evidence.write_bytes(daily.encode(dict(schemaVersion=1, decisions=[])))
            daily.approve(self.root, 'card-one', TOKEN)
            card.unlink()
            status = daily.tick(self.root, config)['sources']
            self.assertEqual(status['card']['status'], 'awaiting_source')
            self.assertEqual(status['checking']['status'], 'awaiting_review')
            self.assertEqual(self.remote.read_bytes(), self.original)
            card.write_bytes(daily.encode(dict(runId='card-two', connectionKey='card', manifestSha256=TOKEN)))
            status = daily.tick(self.root, config)['sources']
            self.assertEqual(status['card']['status'], 'published')
            carried = self.root / 'runs/card-two/carried-decisions.json'
            self.assertFalse(carried.exists())
            approved = evidence.read_bytes()
            evidence.write_bytes(daily.encode(dict(schemaVersion=1, decisions=['tampered'])))
            status = daily.tick(self.root, config)['sources']
            self.assertEqual(status['checking']['status'], 'awaiting_review')
            self.assertEqual(carried.read_bytes(), approved)
            self.assertFalse((self.root / 'runs/day-one/decisions.json').exists())

    def test_held_batch_cannot_be_approved(self):
        def held(config, directory, apply_token=None):
            return {**self.cli(config, directory, apply_token), 'held':[dict(row=1)]}

        with patch.object(daily, 'cli', held):
            self.assertEqual(daily.tick(self.root, self.config)['held'], 1)
            with self.assertRaisesRegex(ValueError, 'unresolved_review'):
                daily.approve(self.root, 'day-one', TOKEN)
        self.assertEqual(self.remote.read_bytes(), self.original)


if __name__ == '__main__':
    unittest.main()
