"""Attach reviewed BankSalad observations to existing KRW spending rows."""
import argparse
from collections import defaultdict
from contextlib import closing
from datetime import date, datetime
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import re
import sqlite3

reader_path = Path(__file__).with_name('read-spending-workbooks.py')
spec = importlib.util.spec_from_file_location('workbook_reader', reader_path)
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def digest(data):
    return sha256(data).hexdigest()


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def checked(condition, reason):
    if not condition:
        raise ValueError(reason)


def read(path):
    return json.loads(path.read_bytes())


def observations(workbook, binding, start, end):
    records = {}
    with workbook.open('rb') as stream:
        book = reader.load_workbook(stream, read_only=True, data_only=True, keep_links=False)
        try:
            for number, values in reader.sheet(book, '가계부 내역', reader.BANKSALAD_COLUMNS):
                raw, _, kind, _, _, description, amount, currency, method, _ = values
                day = raw.date() if isinstance(raw, datetime) else raw
                checked(isinstance(day, date) and start <= day.isoformat() <= end, 'invalid_banksalad_period')
                if method == binding['bankSaladPaymentMethod'] and kind in ('지출', '이체') and currency == 'KRW':
                    checked(isinstance(description, str), 'invalid_banksalad_row')
                    amount = reader.integer(amount)
                    if amount and (kind == '지출' or amount < 0):
                        records[number] = dict(day=day.isoformat(), amount=amount, kind=kind, description=description)
        finally:
            book.close()
    return records


def exact_key(row):
    return (row['day'], row['amount'], reader.merchant_name(row['description']))


def held(row, record):
    return dict(workbook='banksalad', row=row, reason='unconfirmed_match',
                fingerprint=dict(postedDate=record['day'], amountMinor=record['amount']))


def plan(records, transactions, binding, review):
    links = {}
    used_targets = set()
    explicit = review.get('links', [])
    checked(isinstance(explicit, list) and len(explicit) <= len(records), 'invalid_banksalad_review')
    for item in explicit:
        target = item['transactionId']
        rows = item['rows']
        checked(target in transactions and target not in used_targets and isinstance(rows, list) and rows and
                len(set(rows)) == len(rows) and all(type(row) is int and row in records and row not in links for row in rows),
                'invalid_banksalad_review')
        txn = transactions[target]
        basis = item['basis']
        checked(sum(records[row]['amount'] for row in rows) == txn['amount'], 'banksalad_amount_mismatch')
        if basis == 'issuer_aggregate':
            checked(binding['product'] == 'card' and len(rows) > 1 and
                    all(records[row]['kind'] == '지출' for row in rows), 'invalid_banksalad_aggregate')
        else:
            checked(basis == 'issuer_row' and len(rows) == 1 and
                    records[rows[0]]['day'] == txn['day'], 'banksalad_date_mismatch')
        for row in rows:
            links[row] = target
        used_targets.add(target)

    if binding['matchExact']:
        by_merchant, by_ledger = defaultdict(list), defaultdict(list)
        for row, item in records.items():
            if item['kind'] == '지출':
                by_merchant[exact_key(item)].append(row)
        for target, item in transactions.items():
            by_ledger[exact_key(item)].append(target)
        for key, rows in by_merchant.items():
            if (len(rows) == len(by_ledger[key]) == 1 and key[2] and rows[0] not in links
                    and by_ledger[key][0] not in used_targets):
                links[rows[0]] = by_ledger[key][0]
    holds = [held(row, item) for row, item in records.items()
             if row not in links and item['kind'] == '지출' and binding['showUnmatched']]
    return links, holds


def plan_fees(db, records, binding, review, links):
    """Require a separately reviewed bank-origin fee reference for any new expense."""
    fees = {}
    account = binding['accountId']
    for item in review.get('issuerFees', []):
        number = item['row']
        checked(type(number) is int and number in records and number not in fees and number not in links,
                'invalid_issuer_fee')
        row = records[number]
        ref = re.fullmatch(r'당발송금수수료\(Ref No: ([A-Za-z0-9]+)\)', row['description'])
        checked(binding['product'] == 'bank' and row['kind'] == '지출' and row['amount'] < 0 and ref and
                item == dict(row=number, date=row['day'], amountMinor=row['amount'], reference=ref[1]),
                'invalid_issuer_fee')
        source_id = digest(encode([account, ref[1]]))
        txn = dict(accountId=account, postedDate=row['day'], transactionDate=row['day'],
                   description='Outbound remittance fee', amountMinor=row['amount'], currency='KRW',
                   kind='purchase', sourceId=source_id, originalCurrency=None, originalAmountMinor=None,
                   relatedSourceId=None, transferRef=None)
        key = digest(encode(['offline-banksalad-issuer-fee', account, source_id]))
        checked(all(key != other[0] for other in fees.values()), 'duplicate_issuer_fee')
        candidates = db.execute("""SELECT id,payload FROM spending_transaction
            WHERE account_id=? AND posted_date=? AND currency='KRW' AND amount_minor=?""",
            (account, row['day'], row['amount'])).fetchall()
        if candidates:
            if len(candidates) == 1 and candidates[0][0] == key and json.loads(candidates[0][1]) == txn:
                links[number] = key
            # Competing transactions leave the workbook row held.
            continue
        if not db.execute('SELECT id FROM spending_transaction WHERE id=?', (key,)).fetchone():
            fees[number] = key, txn
    return fees


def run(ledger, directory, binding_path, apply_token):
    pointer = read(directory / 'pointer.json')
    binding = read(binding_path)
    checked(set(binding) == {'accountId', 'bankSaladPaymentMethod', 'product', 'matchExact', 'showUnmatched'}
            and re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,79}', binding['accountId'])
            and isinstance(binding['bankSaladPaymentMethod'], str) and binding['bankSaladPaymentMethod']
            and binding['product'] in ('card', 'bank') and type(binding['matchExact']) is bool
            and type(binding['showUnmatched']) is bool, 'invalid_banksalad_binding')
    checked(pointer.get('issuerFile') in ('issuer.xlsx', 'issuer.xls', 'issuer.pdf'), 'invalid_issuer_file')
    for name, checksum in ((binding_path, 'bindingSha256'), (directory / 'banksalad.xlsx', 'bankSaladSha256'),
                           (directory / pointer['issuerFile'], 'issuerSha256')):
        checked(digest(name.read_bytes()) == pointer[checksum], 'workbook_input_changed')
    review_path = directory / 'decisions.json'
    review = read(review_path) if review_path.is_file() else {'links': []}
    checked(set(review) <= {'links', 'issuerFees', 'bankSaladSha256', 'issuerSha256'} and
            (not review_path.is_file() or all(review.get(k) == pointer[k] for k in ('bankSaladSha256', 'issuerSha256'))),
            'banksalad_review_input_changed')
    records = observations(directory / 'banksalad.xlsx', binding, pointer['from'], pointer['to'])
    db_uri = ledger.as_uri() + ('?mode=rw' if apply_token else '?mode=ro')
    with closing(sqlite3.connect(db_uri, uri=True)) as db, db:
        db.execute('PRAGMA foreign_keys=ON')
        if apply_token:
            db.execute('BEGIN IMMEDIATE')
        transactions = {key: dict(day=day, amount=amount, description=json.loads(payload)['description'])
                        for key, day, amount, payload in db.execute('''
                            SELECT id,posted_date,amount_minor,payload FROM spending_transaction
                            WHERE account_id=? AND currency='KRW'
                              AND json_extract(payload,'$.kind') IN ('purchase', 'refund')
                              AND posted_date BETWEEN ? AND ?
                        ''', (binding['accountId'], pointer['from'], pointer['to']))}
        links, holds = plan(records, transactions, binding, review)
        fees = plan_fees(db, records, binding, review, links)
        holds = [item for item in holds if item['row'] not in fees and item['row'] not in links]
        batch = digest(encode([pointer, review]))
        token = digest(encode([str(ledger), batch, sorted(transactions.items()), links, holds, fees]))
        totals = [dict(currency='KRW', addedPurchaseMinor=str(sum(-row['amountMinor'] for _, row in fees.values())))]
        result = dict(status='preview', reviewToken=token, inserted=len(fees), matched=len(set(links.values())),
                      evidenceLinked=len(links), issues=[], held=holds, totals=totals)
        exists = db.execute("SELECT 1 FROM sqlite_master WHERE name='spending_banksalad_batch'").fetchone()
        if exists and db.execute('SELECT 1 FROM spending_banksalad_batch WHERE id=?', (batch,)).fetchone():
            return {**result, 'status': 'already_applied', 'inserted': 0, 'matched': 0, 'evidenceLinked': 0,
                    'held': [], 'totals': []}
        if not apply_token:
            return result
        checked(token == apply_token, 'stale_preview')
        db.execute('''CREATE TABLE IF NOT EXISTS spending_banksalad_batch (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL, pointer TEXT NOT NULL, review TEXT NOT NULL)''')
        db.execute('''CREATE TABLE IF NOT EXISTS spending_banksalad_evidence (
            batch_id TEXT NOT NULL REFERENCES spending_banksalad_batch(id), row_number INTEGER NOT NULL,
            transaction_id TEXT REFERENCES spending_transaction(id), reason TEXT,
            CHECK ((transaction_id IS NULL) <> (reason IS NULL)),
            PRIMARY KEY (batch_id,row_number))''')
        db.execute('INSERT INTO spending_banksalad_batch VALUES (?,?,?,?)',
                   (batch, binding['accountId'], encode(pointer).decode(), encode(review).decode()))
        if fees:
            source = 'offline-banksalad-issuer-fee'
            evidence = encode(dict(pointer=pointer, review=review))
            record_hash = digest(evidence)
            archive = ledger.parent.parent / 'records/spending'
            archive.mkdir(parents=True, exist_ok=True)
            record = archive / (record_hash + '.json')
            if record.exists():
                checked(record.read_bytes() == evidence, 'archived_evidence_changed')
            else:
                with record.open('xb') as stream:
                    stream.write(evidence)
            db.execute('INSERT INTO spending_batch VALUES (?,?,?,?,?,?,?,?,?)',
                       (batch, source, pointer['from'], pointer['to'], record_hash, record.name,
                        'banksalad-reviewed-issuer-fees-v1', len(fees), datetime.now().isoformat()))
            for row, (key, item) in fees.items():
                db.execute('INSERT INTO spending_transaction VALUES (?,?,?,?,?,?,?,?)',
                           (key, source, item['accountId'], item['postedDate'], 'KRW', item['amountMinor'],
                            item['sourceId'], encode(item).decode()))
                db.execute('INSERT INTO spending_observation VALUES (?,?,?)', (batch, row, key))
        db.executemany('INSERT INTO spending_banksalad_evidence VALUES (?,?,?,?)',
                       [(batch, row, target, None) for row, target in links.items()] +
                       [(batch, row, key, None) for row, (key, _) in fees.items()] +
                       [(batch, item['row'], None, item['reason']) for item in holds])
        return {**result, 'status': 'applied'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ledger', type=Path)
    parser.add_argument('directory', type=Path)
    parser.add_argument('binding', type=Path)
    parser.add_argument('--apply-token')
    args = parser.parse_args()
    print(json.dumps(run(args.ledger, args.directory, args.binding, args.apply_token), ensure_ascii=False))
