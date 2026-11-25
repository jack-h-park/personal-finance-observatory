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
        db.execute('CREATE TABLE spending_transaction (id,account_id,posted_date,currency,payload)')
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
