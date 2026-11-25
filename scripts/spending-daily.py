#!/usr/bin/env python3
"""Review saved SimpleFIN runs and publish approved spending snapshots."""
import argparse
from contextlib import closing, contextmanager
from datetime import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile
import urllib.request
from zoneinfo import ZoneInfo

STORAGE = Path('private-data/personal-finance-offline/state/spending.sqlite')
HEX = re.compile(r'[0-9a-f]{64}')
RUN_ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,100}')


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()


def read(path):
    return json.loads(path.read_bytes())


def atomic(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        stage = Path(handle.name)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    try:
        os.replace(stage, path)
    finally:
        stage.unlink(missing_ok=True)


@contextmanager
def locked(path):
    with path.open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def db_at(path):
    return sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)


def clone(source, target):
    with tempfile.TemporaryDirectory(dir=target.parent) as directory:
        staged = Path(directory) / 'ledger.sqlite'
        with closing(db_at(source)) as old, closing(sqlite3.connect(staged)) as new:
            old.backup(new)
        os.replace(staged, target)


def projection(before, after, published, account, expected_inserts):
    packet = json.loads(published)
    view = packet['snapshot']
    with closing(db_at(before)) as baseline, closing(db_at(after)) as staged:
        require(staged.execute('PRAGMA integrity_check').fetchone() == ('ok',), 'invalid_staged_ledger')
        require(not staged.execute('PRAGMA foreign_key_check').fetchall(), 'invalid_staged_references')
        old = dict(baseline.execute('SELECT id,payload FROM spending_transaction'))
        current = dict(staged.execute('SELECT id,payload FROM spending_transaction'))
        ids = {row['id'] for row in view['rows']}
        require(len(ids) == len(view['rows']) and ids == old.keys(), 'ledger_snapshot_diverged')
        for row in view['rows']:
            event = json.loads(old[row['id']])
            require(all(row[key] == event[key] for key in ('accountId', 'postedDate', 'currency', 'amountMinor', 'kind')),
                    'ledger_snapshot_diverged')
        require(all(current.get(tx) == payload for tx, payload in old.items()), 'existing_ledger_row_changed')
        added = sorted(current.keys() - old.keys())
        require(len(added) == expected_inserts, 'unexpected_insert_count')
        if not added:
            return published
        for tx in added:
            row = json.loads(current[tx])
            require(row['accountId'] == account and row['currency'] == 'USD', 'unexpected_insert_scope')
            view['rows'].append(dict(id=tx, accountId=account, postedDate=row['postedDate'],
                activityDate=(row.get('transactionDate') or row['postedDate']) if row['kind'] == 'purchase' else row['postedDate'],
                currency='USD', amountMinor=row['amountMinor'], kind=row['kind'], description=row['description']))
        view['coverage'] = [dict(zip(('accountId', 'currency', 'first', 'last', 'count'), row))
            for row in staged.execute('SELECT account_id,currency,min(posted_date),max(posted_date),count(*) '
                                      'FROM spending_transaction GROUP BY account_id,currency ORDER BY currency DESC,account_id')]
    packet['asOf'] = datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat()
    return encode(packet)


def approve(root, run, token):
    require(RUN_ID.fullmatch(run) and HEX.fullmatch(token), 'invalid_approval')
    directory = root / 'runs' / run
    result = read(directory / 'preview.json')
    require(result['status'] == 'preview' and result['reviewToken'] == token, 'stale_review_token')
    require(not result['held'] and not result['issues'], 'unresolved_review')
    atomic(directory / 'approval.json', encode(dict(reviewToken=token)))


def cli(config, directory, apply_token=None):
    command = [config['node'], config['tsx'], str(Path(config['checkout']) / 'scripts/import-spending.ts'),
               '--workspace', str(directory), '--accounts', config['accounts'], '--binding', config['binding'],
               '--input', str(directory / 'pointer.json'), '--simplefin-config', config['simplefinConfig'],
               '--connector-repo', config['connectorRepo']]
    decisions = directory / 'decisions.json'
    if decisions.is_file():
        command.extend(['--decisions', str(decisions)])
    if apply_token:
        command.extend(['--apply', '--review-token', apply_token])
    result = subprocess.run(command, cwd=config['checkout'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    require(result.returncode == 0, 'spending_cli_failed')
    return json.loads(result.stdout)


def public_check(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'spending-publication-check'})
    with urllib.request.urlopen(request, timeout=15) as response:
        require(response.status == 200 and 'no-store' in response.headers.get('Cache-Control', ''), 'live_route_unavailable')
        require(b'id="spending-lead"' in response.read(), 'live_summary_missing')


def receive(snapshot, expected, body, check):
    require(HEX.fullmatch(expected), 'invalid_previous_hash')
    candidate = json.loads(body)
    require(candidate['version'] == 1 and isinstance(candidate['snapshot']['rows'], list), 'invalid_publication')
    with locked(snapshot.parent / '.daily-publish.lock'):
        prior = snapshot.read_bytes()
        if prior == body:
            check()
            return dict(snapshotSha256=digest(body), unchanged=True)
        require(digest(prior) == expected, 'operating_snapshot_changed')
        atomic(snapshot, body)
        try:
            check()
            require(snapshot.read_bytes() == body, 'operating_snapshot_changed')
        except Exception:
            if snapshot.read_bytes() == body:
                atomic(snapshot, prior)
            raise
        return dict(snapshotSha256=digest(body), unchanged=False)


def publish(config, expected, candidate):
    result = subprocess.run([*config['publishCommand'], expected], input=candidate,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    require(result.returncode == 0, 'operating_publication_failed')
    receipt = json.loads(result.stdout)
    require(receipt['snapshotSha256'] == digest(candidate), 'operating_receipt_mismatch')
    return receipt


def finish(root, config, run, pending):
    directory = root / 'runs' / run
    candidate = (directory / 'snapshot.json').read_bytes()
    require(digest(candidate) == pending['snapshotSha256'], 'prepared_snapshot_changed')
    require(digest((directory / STORAGE).read_bytes()) == pending['ledgerSha256'], 'prepared_ledger_changed')
    with closing(db_at(directory / STORAGE)) as ledger:
        require(ledger.execute('PRAGMA integrity_check').fetchone() == ('ok',), 'invalid_prepared_ledger')
    receipt = publish(config, pending['parentSnapshotSha256'], candidate)
    atomic(root / 'current.json', encode(dict(run=run)))
    atomic(directory / 'published.json', encode({**pending, **receipt}))
    return dict(status='published', run=run, **receipt)


def tick(root, config):
    runs = root / 'runs'
    runs.mkdir(exist_ok=True)
    active = read(root / 'current.json')['run']
    require(RUN_ID.fullmatch(active), 'invalid_active_run')
    for directory in sorted(runs.iterdir()):
        journal = directory / 'prepared.json'
        if journal.is_file() and not (directory / 'published.json').is_file():
            pending = read(journal)
            require(active in (directory.name, pending['parentRun']), 'prepared_parent_changed')
            return finish(root, config, directory.name, pending)
    pointer = Path(config['pointer']).read_bytes()
    run = json.loads(pointer)['runId']
    require(RUN_ID.fullmatch(run), 'invalid_run_id')
    directory = runs / run
    published = directory == runs / active or (directory / 'published.json').is_file()
    if not published:
        directory.mkdir(exist_ok=True)
        pinned = directory / 'pointer.json'
        if pinned.exists():
            require(pinned.read_bytes() == pointer, 'source_pointer_changed')
        else:
            atomic(pinned, pointer)
    for item in sorted(runs.iterdir()):
        if item.name == active or (item / 'published.json').is_file() or not (item / 'approval.json').is_file():
            continue
        if item != directory:
            result = preview(root, config, active, item)
            if accepted(item, result):
                return apply(root, config, active, item, result)
    if published:
        prior = (runs / active / 'snapshot.json').read_bytes()
        receipt = publish(config, digest(prior), prior)
        return dict(status='already_published', run=run, **receipt)
    result = preview(root, config, active, directory)
    if accepted(directory, result):
        return apply(root, config, active, directory, result)
    return dict(status='awaiting_review', run=run, held=len(result['held']), inserted=result['inserted'], matched=result['matched'])


def preview(root, config, active, directory):
    require(RUN_ID.fullmatch(directory.name) and read(directory / 'pointer.json')['runId'] == directory.name,
            'invalid_review_directory')
    ledger = directory / STORAGE
    ledger.parent.mkdir(parents=True, exist_ok=True)
    clone(root / 'runs' / active / STORAGE, ledger)
    result = cli(config, directory)
    require(result['status'] == 'preview', 'unexpected_preview_status')
    atomic(directory / 'preview.json', encode(result))
    return result


def accepted(directory, result):
    approval = directory / 'approval.json'
    return (approval.is_file() and read(approval).get('reviewToken') == result['reviewToken']
            and not result['held'] and not result['issues'])


def apply(root, config, active, directory, preview_result):
    result = cli(config, directory, preview_result['reviewToken'])
    require(result['status'] == 'applied' and not result['held'] and not result['issues']
            and all(result[key] == preview_result[key] for key in ('inserted', 'matched', 'totals')), 'approval_result_changed')
    parent = root / 'runs' / active
    before = (parent / 'snapshot.json').read_bytes()
    account = read(Path(config['binding']))['accountId']
    after = projection(parent / STORAGE, directory / STORAGE, before, account, result['inserted'])
    atomic(directory / 'snapshot.json', after)
    journal = dict(parentRun=active, parentSnapshotSha256=digest(before), snapshotSha256=digest(after),
                   ledgerSha256=digest((directory / STORAGE).read_bytes()), inserted=result['inserted'],
                   matched=result['matched'])
    atomic(directory / 'prepared.json', encode(journal))
    return finish(root, config, directory.name, journal)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    for name in ('tick', 'approve'):
        item = sub.add_parser(name)
        item.add_argument('config', type=Path)
        if name == 'approve':
            item.add_argument('run')
            item.add_argument('token')
    item = sub.add_parser('receive')
    item.add_argument('snapshot', type=Path)
    item.add_argument('url')
    item.add_argument('previous')
    args = parser.parse_args()
    if args.action == 'receive':
        body = sys.stdin.buffer.read(25_000_001)
        require(len(body) <= 25_000_000, 'publication_too_large')
        result = receive(args.snapshot, args.previous, body, lambda: public_check(args.url))
    else:
        config = read(args.config)
        root = args.config.resolve().parent
        with locked(root / '.runner.lock'):
            if args.action == 'approve':
                approve(root, args.run, args.token)
                result = dict(status='approved', run=args.run)
            else:
                try:
                    result = tick(root, config)
                except Exception as error:
                    atomic(root / 'status.json', encode(dict(status='failed', reason=safe_reason(error))))
                    raise
                atomic(root / 'status.json', encode(result))
    print(encode(result).decode().rstrip())


def safe_reason(error):
    reason = str(error)
    return reason if re.fullmatch(r'[a-z_]+', reason) else 'spending_pipeline_failed'


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except Exception as error:
        print(safe_reason(error), file=sys.stderr)
        sys.exit(1)
