#!/usr/bin/env python3
"""Review saved SimpleFIN runs and publish approved spending snapshots."""
import argparse
from contextlib import closing, contextmanager
from datetime import date, datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from urllib.parse import urlencode
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


def projection(before, after, published, account, expected_inserts, labels=None, currency='USD',
               source_key=None, reviewed_holds=None, resolved_keys=()):
    packet = json.loads(published)
    view = packet['snapshot']
    previous_holds = list(view['holds'])
    if source_key and reviewed_holds is not None:
        view['holds'] = [hold for hold in previous_holds
                         if not isinstance(hold, dict) or
                         (hold.get('ingestSource') != source_key and hold.get('observationKey') not in resolved_keys)]
        for hold in reviewed_holds:
            fingerprint = hold.get('fingerprint', {})
            source = {'issuer': 'samsung', 'banksalad': 'banksalad'}.get(hold.get('workbook'), hold.get('source', 'simplefin'))
            item = dict(accountId=account, source=source, row=hold['row'], reason=hold['reason'],
                        date=fingerprint.get('postedDate'), amountMinor=fingerprint.get('amountMinor'),
                        currency=currency, ingestSource=source_key)
            if hold.get('observationKey'):
                item['observationKey'] = hold['observationKey']
            # Older reviewed snapshots may already surface this exact archived observation.
            identity = ('accountId', 'source', 'row', 'date', 'amountMinor', 'currency')
            if item['date'] is None or not any(
                isinstance(old, dict) and (old.get('observationKey') == item['observationKey']
                    if old.get('observationKey') and item.get('observationKey')
                    else all(old.get(k) == item[k] for k in identity)) for old in view['holds']
            ):
                view['holds'].append(item)
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
        if not added and previous_holds == view['holds']:
            return published
        for tx in added:
            row = json.loads(current[tx])
            require(row['accountId'] == account and row['currency'] == currency, 'unexpected_insert_scope')
            view['rows'].append(dict(id=tx, accountId=account, postedDate=row['postedDate'],
                activityDate=(row.get('transactionDate') or row['postedDate']) if row['kind'] == 'purchase' else row['postedDate'],
                currency=currency, amountMinor=row['amountMinor'], kind=row['kind'], description=row['description']))
        view['coverage'] = [dict(zip(('accountId', 'currency', 'first', 'last', 'count'), row))
            for row in staged.execute('SELECT account_id,currency,min(posted_date),max(posted_date),count(*) '
                                      'FROM spending_transaction GROUP BY account_id,currency ORDER BY currency DESC,account_id')]
    for language, label in (labels or {}).items():
        require(language in ('en', 'ko') and isinstance(label, str) and label.strip(), 'invalid_account_label')
        packet['accounts'].setdefault(language, {}).setdefault(account, dict(label=label))
    packet['asOf'] = datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat()
    return encode(packet)


def approve(root, run, token, keep_holds=False):
    require(RUN_ID.fullmatch(run) and HEX.fullmatch(token), 'invalid_approval')
    directory = root / 'runs' / run
    require(not (directory / 'rejected.json').is_file(), 'workbook_rejected')
    result = read(directory / 'preview.json')
    require(result['status'] == 'preview' and result['reviewToken'] == token, 'stale_review_token')
    require(not result['issues'] and (not result['held'] or (
        keep_holds and result.get('keepHoldsAllowed') and
        (result['inserted'] or result['matched'] or result.get('evidenceLinked')))), 'unresolved_review')
    receipt = dict(reviewToken=token)
    if result['held']:
        receipt['keptHolds'] = result['held']
    atomic(directory / 'approval.json', encode(receipt))


def cli(config, directory, apply_token=None):
    helper = {'banksalad-evidence': 'banksalad-evidence.py', 'us-evidence': 'spending-us-evidence.py'}.get(config.get('kind'))
    if helper:
        command = [config['workbookPython'], str(Path(config['checkout']) / 'scripts' / helper),
                   str(directory / STORAGE), str(directory), config['binding']]
        if config.get('kind') == 'us-evidence':
            command.append(config['accounts'])
        if apply_token:
            command.extend(['--apply-token', apply_token])
        result = subprocess.run(command, cwd=config['checkout'], capture_output=True, timeout=120)
        require(result.returncode == 0, 'reviewed_evidence_failed')
        return json.loads(result.stdout)
    command = [config['node'], config['tsx'], str(Path(config['checkout']) / 'scripts/import-spending.ts'),
               '--workspace', str(directory), '--accounts', config['accounts'], '--binding', config['binding']]
    if config.get('kind') == 'snaptrade-card':
        pointer = read(directory / 'pointer.json')
        for path, key in ((Path(config['binding']), 'bindingSha256'), (directory / 'provider.json', 'providerSha256'),
                          (directory / 'issuer.csv', 'issuerSha256')):
            require(digest(path.read_bytes()) == pointer[key], 'us_evidence_input_changed')
        command.extend(['--input', str(directory / 'provider.json'), '--chase-csv', str(directory / 'issuer.csv'),
                        '--from', pointer['from'], '--to', pointer['to']])
    elif config.get('kind') == 'workbook':
        pointer = read(directory / 'pointer.json')
        require(digest(Path(config['binding']).read_bytes()) == pointer['bindingSha256'], 'workbook_binding_changed')
        for name, key in (('issuer.xlsx', 'issuerSha256'), ('banksalad.xlsx', 'bankSaladSha256')):
            require(digest((directory / name).read_bytes()) == pointer[key], 'workbook_input_changed')
        command.extend(['--input', str(directory / 'issuer.xlsx'), '--banksalad', str(directory / 'banksalad.xlsx'),
                        '--from', pointer['from'], '--to', pointer['to']])
    else:
        command.extend(['--input', str(directory / 'pointer.json'), '--simplefin-config', config['simplefinConfig'],
                        '--connector-repo', config['connectorRepo']])
        decisions = directory / 'decisions.json'
        if not decisions.is_file():
            decisions = directory / 'carried-decisions.json'
        if decisions.is_file():
            command.extend(['--decisions', str(decisions)])
    if apply_token:
        command.extend(['--apply', '--review-token', apply_token])
    env = os.environ.copy()
    if config.get('workbookPython'):
        env['STOCK_PYTHON_BIN'] = config['workbookPython']
    result = subprocess.run(command, cwd=config['checkout'], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=120, env=env)
    require(result.returncode == 0, 'spending_cli_failed')
    return json.loads(result.stdout)


def public_check(url, candidate, previous):
    def verify(url_to_check, marker):
        request = urllib.request.Request(url_to_check, headers={
            'User-Agent': 'spending-publication-check', 'Cookie': 'jhp_lang=en',
        })
        with urllib.request.urlopen(request, timeout=15) as response:
            require(response.status == 200 and 'no-store' in response.headers.get('Cache-Control', ''),
                    'live_route_unavailable')
            require(marker in response.read(), 'live_spending_data_missing')

    verify(url, b'id="spending-lead"')
    rows = json.loads(candidate)['snapshot']['rows']
    earlier = {row['id'] for row in json.loads(previous)['snapshot']['rows']}
    added = [row for row in rows if row['id'] not in earlier]
    probes = added or [max(rows, key=lambda row: row['activityDate'])]
    for row in probes:
        query = urlencode(dict(view='transactions', account=row['accountId'], transaction=row['id'],
                               month=row['activityDate'][:7], kinds='all', period='24'))
        verify(url + '?' + query, b'Selected transaction')


def receive(snapshot, expected, body, check):
    require(HEX.fullmatch(expected), 'invalid_previous_hash')
    candidate = json.loads(body)
    require(candidate['version'] == 1 and isinstance(candidate['snapshot']['rows'], list), 'invalid_publication')
    journal_path = snapshot.parent / '.daily-publish.pending.json'
    backup_path = snapshot.parent / '.daily-publish.previous'
    with locked(snapshot.parent / '.daily-publish.lock'):
        prior = snapshot.read_bytes()
        if journal_path.is_file():
            journal = read(journal_path)
            backup = backup_path.read_bytes()
            require(digest(backup) == journal['parent'], 'receiver_backup_changed')
            if digest(prior) == journal['candidate']:
                try:
                    verify_publication(snapshot, prior, backup, check)
                except Exception:
                    if snapshot.read_bytes() == backup:
                        journal_path.unlink()
                    raise
            else:
                require(digest(prior) == journal['parent'], 'operating_snapshot_changed')
            journal_path.unlink()
        if prior == body:
            check(body, prior)
            require(snapshot.read_bytes() == body, 'operating_snapshot_changed')
            return dict(snapshotSha256=digest(body), unchanged=True)
        require(digest(prior) == expected, 'operating_snapshot_changed')
        atomic(backup_path, prior)
        atomic(journal_path, encode(dict(parent=expected, candidate=digest(body))))
        require(snapshot.read_bytes() == prior, 'operating_snapshot_changed')
        atomic(snapshot, body)
        try:
            verify_publication(snapshot, body, prior, check)
        except Exception:
            if snapshot.read_bytes() == prior:
                journal_path.unlink()
            raise
        journal_path.unlink()
        return dict(snapshotSha256=digest(body), unchanged=False)


def verify_publication(snapshot, candidate, prior, check):
    try:
        check(candidate, prior)
        require(snapshot.read_bytes() == candidate, 'operating_snapshot_changed')
    except Exception:
        if snapshot.read_bytes() == candidate:
            atomic(snapshot, prior)
        raise


def publish(config, expected, candidate):
    result = subprocess.run([*config['publishCommand'], expected], input=candidate,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
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
    if 'evidenceSha256' in pending:
        applied_evidence(directory, pending['evidenceSha256'])
    receipt = publish(config, pending['parentSnapshotSha256'], candidate)
    atomic(root / 'current.json', encode(dict(run=run)))
    atomic(directory / 'published.json', encode({**pending, **receipt}))
    return dict(status='published', run=run, **receipt)


def recover(root, config, runs, active):
    for directory in sorted(runs.iterdir()):
        journal = directory / 'prepared.json'
        if journal.is_file() and not (directory / 'published.json').is_file():
            pending = read(journal)
            require(active in (directory.name, pending['parentRun']), 'prepared_parent_changed')
            return finish(root, config, directory.name, pending)
    return None


def tick(root, config):
    runs = root / 'runs'
    runs.mkdir(exist_ok=True)
    active = active_run(root)
    recovered = recover(root, config, runs, active)
    if recovered:
        return recovered
    sources = config.get('sources')
    if sources is None:
        return tick_source(root, config, runs, active)
    require(isinstance(sources, dict) and bool(sources), 'invalid_review_sources')
    results = {}
    for key, source in sources.items():
        require(RUN_ID.fullmatch(key) and isinstance(source, dict) and
                source.keys() <= {'pointer', 'binding', 'simplefinConfig', 'accountLabels', 'carryDecisions', 'kind', 'keepHeld'},
                'invalid_review_source')
        try:
            results[key] = tick_source(root, {**config, **source, 'sourceKey': key}, runs, active_run(root), key)
        except Exception as error:
            results[key] = dict(status='failed', reason=safe_reason(error))
            # Finish an interrupted publication before any later source stages changes.
            if any((item / 'prepared.json').is_file() and not (item / 'published.json').is_file()
                   for item in runs.iterdir()):
                break
    return dict(status='attention_required' if any(item['status'] == 'failed' for item in results.values())
                else 'checked', sources=results)


def active_run(root):
    active = read(root / 'current.json')['run']
    require(RUN_ID.fullmatch(active), 'invalid_active_run')
    return active


def has_source(directory, key):
    pointer = directory / 'pointer.json'
    return pointer.is_file() and read(pointer).get('connectionKey') == key


def applied_evidence(directory, evidence_hash):
    require(isinstance(evidence_hash, str) and HEX.fullmatch(evidence_hash), 'invalid_applied_evidence')
    stored = (directory / STORAGE).parent.parent / 'records/spending' / (evidence_hash + '.json')
    body = stored.read_bytes()
    require(digest(body) == evidence_hash, 'applied_evidence_changed')
    evidence = json.loads(body)
    pointer = read(directory / 'pointer.json')
    require(evidence['manifestSha256'] == pointer['manifestSha256'] and
            evidence['run']['manifest']['runId'] == directory.name and
            isinstance(evidence['decisions'], list), 'invalid_applied_evidence')
    return evidence


def carry_decisions(runs, directory, key, active):
    if (directory / 'decisions.json').is_file():
        return
    carried = directory / 'carried-decisions.json'
    seen = set()
    while active:
        require(RUN_ID.fullmatch(active) and active not in seen, 'invalid_publication_history')
        seen.add(active)
        item = runs / active
        receipt = item / 'published.json'
        if not receipt.is_file():
            break
        published = read(receipt)
        evidence_hash = published.get('evidenceSha256')
        if evidence_hash and has_source(item, key):
            evidence = applied_evidence(item, evidence_hash)
            atomic(carried, encode(dict(schemaVersion=1, decisions=evidence['decisions'])))
            return
        active = published['parentRun']
    carried.unlink(missing_ok=True)


def enqueue_workbook(root, config, key, banksalad, issuer, start, end, us=False):
    require(RUN_ID.fullmatch(key) and key in config.get('sources', {}), 'invalid_workbook_source')
    source = config['sources'][key]
    allowed = ('us-evidence', 'snaptrade-card') if us else ('workbook', 'banksalad-evidence')
    require(source.get('kind') in allowed, 'invalid_workbook_source')
    require(date.fromisoformat(start).isoformat() == start and date.fromisoformat(end).isoformat() == end
            and start <= end, 'invalid_workbook_period')
    def load(path, suffixes):
        require(path.is_file() and path.suffix.lower() in suffixes and 0 < path.stat().st_size <= 16 * 1024 * 1024,
                'invalid_workbook_file')
        return path.read_bytes()
    if us:
        bank = load(banksalad, ('.json',))
        card = load(issuer, ('.csv',))
        input_name, issuer_name, field, prefix = 'provider.json', 'issuer.csv', 'providerSha256', 'us-'
    else:
        bank = load(banksalad, ('.xlsx',))
        card = load(issuer, ('.xlsx', '.xls', '.pdf') if source['kind'] == 'banksalad-evidence' else ('.xlsx',))
        input_name, issuer_name, field, prefix = 'banksalad.xlsx', 'issuer' + issuer.suffix.lower(), 'bankSaladSha256', 'workbook-'
    metadata = {'connectionKey': key, 'issuerSha256': digest(card), field: digest(bank),
                'from': start, 'to': end, 'bindingSha256': digest(Path(source['binding']).read_bytes())}
    if source['kind'] == 'banksalad-evidence':
        metadata['issuerFile'] = issuer_name
    metadata['runId'] = prefix + digest(encode(metadata))
    pointer = Path(source['pointer'])
    if pointer.is_file():
        previous = read(pointer)['runId']
        require(RUN_ID.fullmatch(previous), 'invalid_run_id')
        open_run = root / 'runs' / previous
        open_preview = open_run / 'preview.json'
        require(previous == metadata['runId'] or (open_run / 'published.json').is_file() or
                (open_run / 'rejected.json').is_file() or (open_preview.is_file() and read(open_preview)['status'] == 'already_applied'), 'workbook_review_pending')
    directory = root / 'runs' / metadata['runId']
    require(not (directory / 'rejected.json').is_file(), 'workbook_rejected')
    directory.mkdir(parents=True, exist_ok=True)
    for name, body in ((input_name, bank), (issuer_name, card), ('pointer.json', encode(metadata))):
        target = directory / name
        if target.is_file():
            require(target.read_bytes() == body, 'workbook_input_changed')
        else:
            atomic(target, body)
    pointer.parent.mkdir(parents=True, exist_ok=True)
    atomic(pointer, encode(metadata))
    return dict(status='queued', run=metadata['runId'])


def reject_workbook(root, config, key, run):
    require(RUN_ID.fullmatch(key) and RUN_ID.fullmatch(run), 'invalid_run_id')
    source = config.get('sources', {}).get(key, {})
    require(source.get('kind') in ('workbook', 'banksalad-evidence', 'us-evidence', 'snaptrade-card'), 'invalid_workbook_source')
    pointer = read(Path(source['pointer']))
    require(pointer['connectionKey'] == key and pointer['runId'] == run, 'workbook_pointer_changed')
    directory = root / 'runs' / run
    require(not any((directory / item).is_file()
                    for item in ('approval.json', 'prepared.json', 'published.json')), 'workbook_already_reviewed')
    atomic(directory / 'rejected.json', encode(dict(run=run, source=key)))
    return dict(status='rejected', run=run)


def tick_source(root, config, runs, active, key=None):
    file = Path(config['pointer'])
    if key is not None and not file.is_file():
        return dict(status='awaiting_source')
    pointer = file.read_bytes()
    info = json.loads(pointer)
    require(key is None or info.get('connectionKey') == key, 'source_pointer_mismatch')
    run = info['runId']
    require(RUN_ID.fullmatch(run), 'invalid_run_id')
    directory = runs / run
    if (directory / 'rejected.json').is_file():
        return dict(status='awaiting_source')
    published = directory == runs / active or (directory / 'published.json').is_file()
    if not published:
        directory.mkdir(exist_ok=True)
        pinned = directory / 'pointer.json'
        if pinned.exists():
            require(pinned.read_bytes() == pointer, 'source_pointer_changed')
        else:
            atomic(pinned, pointer)
    for item in sorted(runs.iterdir()):
        if item.name == active or (item / 'published.json').is_file() or (item / 'rejected.json').is_file() or not (item / 'approval.json').is_file():
            continue
        if item != directory and (key is None or has_source(item, key)):
            result = preview(root, config, active, item)
            if accepted(item, result):
                return apply(root, config, active, item, result)
    if published:
        prior = (runs / active / 'snapshot.json').read_bytes()
        receipt = publish(config, digest(prior), prior)
        return dict(status='already_published', run=run, **receipt)
    if key is not None and config.get('carryDecisions'):
        carry_decisions(runs, directory, key, active)
    result = preview(root, config, active, directory)
    if result['status'] == 'already_applied':
        return dict(status='already_applied', run=run, inserted=0, matched=0)
    if accepted(directory, result):
        return apply(root, config, active, directory, result)
    return dict(status='awaiting_review', run=run, held=len(result['held']), inserted=result['inserted'], matched=result['matched'])


def preview(root, config, active, directory):
    require(RUN_ID.fullmatch(directory.name) and read(directory / 'pointer.json')['runId'] == directory.name,
            'invalid_review_directory')
    ledger = directory / STORAGE
    ledger.parent.mkdir(parents=True, exist_ok=True)
    parent = root / 'runs' / active / STORAGE
    clone(parent, ledger)
    copy_evidence(parent, ledger)
    result = cli(config, directory)
    require(result['status'] == 'preview' or (config.get('kind') in ('workbook', 'banksalad-evidence', 'us-evidence', 'snaptrade-card') and
            result['status'] == 'already_applied'), 'unexpected_preview_status')
    if config.get('kind') in ('workbook', 'banksalad-evidence') or config.get('keepHeld') is True:
        result['keepHoldsAllowed'] = True
    atomic(directory / 'preview.json', encode(result))
    return result


def copy_evidence(parent, ledger):
    source = parent.parent.parent
    target = ledger.parent.parent
    for archive in ('records', 'records/spending'):
        folder = source / archive
        if folder.is_dir():
            shutil.copytree(folder, target / archive, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns('spending'))
    for name in ('category-hints.json', 'account-labels.json'):
        if (source / name).is_file():
            shutil.copyfile(source / name, target / name)


def accepted(directory, result):
    approval = directory / 'approval.json'
    if not approval.is_file() or result['status'] != 'preview' or result['issues']:
        return False
    marker = read(approval)
    return (marker.get('reviewToken') == result['reviewToken'] and marker.get('keptHolds', []) == result['held']
            and (not result['held'] or result.get('keepHoldsAllowed') is True))


def apply(root, config, active, directory, preview_result):
    result = cli(config, directory, preview_result['reviewToken'])
    require(result['status'] == 'applied' and not result['issues']
            and all(result.get(key) == preview_result.get(key)
                    for key in ('inserted', 'matched', 'totals', 'held', 'evidenceLinked', 'resolvedKeys')), 'approval_result_changed')
    parent = root / 'runs' / active
    before = (parent / 'snapshot.json').read_bytes()
    account = read(Path(config['binding']))['accountId']
    workbook = config.get('kind') in ('workbook', 'banksalad-evidence')
    source_key = config.get('sourceKey')
    if workbook or config.get('kind') in ('us-evidence', 'snaptrade-card'):
        # An overlapping export may omit earlier unresolved observations.
        # Keep those receipts unless a separate evidence review resolves them.
        source_key = f'{source_key}:{directory.name}'
    after = projection(parent / STORAGE, directory / STORAGE, before, account, result['inserted'],
                       config.get('accountLabels'), 'KRW' if workbook else 'USD', source_key,
                       result['held'] if preview_result.get('keepHoldsAllowed') else None,
                       result.get('resolvedKeys', ()))
    atomic(directory / 'snapshot.json', after)
    journal = dict(parentRun=active, parentSnapshotSha256=digest(before), snapshotSha256=digest(after),
                   ledgerSha256=digest((directory / STORAGE).read_bytes()), inserted=result['inserted'],
                   matched=result['matched'])
    if config.get('carryDecisions'):
        evidence_hash = result.get('evidenceSha256')
        applied_evidence(directory, evidence_hash)
        journal['evidenceSha256'] = evidence_hash
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
            item.add_argument('--keep-holds', action='store_true')
    for action in ('enqueue-workbook', 'enqueue-us'):
        item = sub.add_parser(action)
        item.add_argument('config', type=Path)
        item.add_argument('source')
        item.add_argument('banksalad', type=Path)
        item.add_argument('issuer', type=Path)
        item.add_argument('period_start')
        item.add_argument('period_end')
    item = sub.add_parser('reject-workbook')
    item.add_argument('config', type=Path)
    item.add_argument('source')
    item.add_argument('run')
    item = sub.add_parser('receive')
    item.add_argument('snapshot', type=Path)
    item.add_argument('url')
    item.add_argument('previous')
    args = parser.parse_args()
    if args.action == 'receive':
        body = sys.stdin.buffer.read(25_000_001)
        require(len(body) <= 25_000_000, 'publication_too_large')
        result = receive(args.snapshot, args.previous, body, lambda candidate, previous: public_check(args.url, candidate, previous))
    else:
        config = read(args.config)
        root = args.config.resolve().parent
        with locked(root / '.runner.lock'):
            if args.action == 'approve':
                approve(root, args.run, args.token, args.keep_holds)
                result = dict(status='approved', run=args.run)
            elif args.action in ('enqueue-workbook', 'enqueue-us'):
                result = enqueue_workbook(root, config, args.source, args.banksalad, args.issuer,
                                          args.period_start, args.period_end, args.action == 'enqueue-us')
            elif args.action == 'reject-workbook':
                result = reject_workbook(root, config, args.source, args.run)
            else:
                try:
                    result = tick(root, config)
                except Exception as error:
                    atomic(root / 'status.json', encode(dict(status='failed', reason=safe_reason(error))))
                    raise
                atomic(root / 'status.json', encode(result))
    print(encode(result).decode().rstrip())
    if result['status'] == 'attention_required':
        sys.exit(1)


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
