"""Verify saved US provider evidence against existing spending transactions."""
import argparse
from contextlib import closing
from datetime import date, datetime, timezone
from decimal import Decimal
from hashlib import sha256
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit


def encode(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


def sha(data):
    return sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_bytes())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def cents(value):
    amount = Decimal(str(value)) * 100
    require(amount.is_finite() and amount == amount.to_integral_value() and
            abs(amount) <= 2**53 - 1 and amount != 0, 'invalid_provider_amount')
    return int(amount)


def signed_rows(packet, binding):
    if binding['provider'] == 'simplefin-card':
        response = packet.get('response', packet.get('data'))
        require(response['errlist'] == [] and len(response['accounts']) == len(response['connections']) == 1,
                'invalid_scoped_card_capture')
        account, = response['accounts']
        connection, = response['connections']
        suffix, domain = binding['suffix'], binding['domain']
        host = urlsplit(connection['org_url']).hostname
        require((host == domain or (host or '').endswith('.' + domain)) and account['currency'] == 'USD'
                and account['conn_id'] == connection['conn_id'] == binding['connectionId']
                and account['id'] == binding['providerAccountId'] and account['name'].endswith('(' + suffix + ')'),
                'provider_account_mismatch')
        return [(index, tx['id'], datetime.fromtimestamp(tx['posted'], timezone.utc).date().isoformat(),
                 cents(tx['amount']), tx['description'])
                for index, tx in enumerate(account['transactions'], 1) if not tx.get('pending', False)]

    require(packet['status'] == 'verified_with_limits' and packet['mode'] == 'shadow'
            and packet['economicPromotion'] is False and packet['identity'] == binding['connectionIdentity'],
            'invalid_bank_snapshot')
    ref, kind = binding['accountRef'], binding['product']
    require(kind in ('CHECKING', 'SAVINGS') and
            sum(page['accountRef'] == ref for page in packet['apiPages']) == 1, 'provider_account_mismatch')
    rows = []
    for index, tx in enumerate(packet['bankTransactions'], 1):
        if tx['accountRef'] != ref:
            continue
        require(tx['institutionType'] == kind and tx['currency'] == 'USD' and tx['state'] == 'posted',
                'invalid_bank_transaction')
        rows.append((index, tx['providerActivityId'], tx['transactionDate'],
                     cents(tx['cashFlowAmount']), tx['description']))
    return rows


def review_rows(db, rows, account, review, pointer, provider, scope):
    entries = review['rows']
    require(isinstance(entries, list), 'invalid_us_evidence_review')
    decisions = {item['sourceId']: item for item in entries}
    require(len(decisions) == len(entries), 'duplicate_us_review_decision')
    accepted = []
    held = []
    seen = set()
    targets = set()
    existing = {}
    if db.execute("SELECT 1 FROM sqlite_schema WHERE name='spending_us_provider_evidence'").fetchone():
        existing = dict((key, (fingerprint, target, reason)) for key, fingerprint, target, reason in db.execute(
            "SELECT observation_key,fingerprint,transaction_id,reason FROM spending_us_provider_evidence "
            "WHERE account_id=? AND reason IS NOT 'unconfirmed_match'", (account,)))
    for index, source_id, day, amount, description in rows:
        require(isinstance(source_id, str) and source_id and source_id not in seen and
                isinstance(description, str) and date.fromisoformat(day).isoformat() == day
                and pointer['from'] <= day <= pointer['to'], 'invalid_saved_us_row')
        seen.add(source_id)
        fingerprint = dict(sourceId=source_id, postedDate=day, amountMinor=amount,
                           descriptionSha256=sha(description.encode()))
        choice = decisions.get(source_id)
        key = sha(encode([account, scope, source_id]))
        fingerprint_hash = sha(encode(fingerprint))
        prior = existing.get(key)
        if prior:
            require(prior[0] == fingerprint_hash and (not choice or
                      (choice.get('transactionId'), choice.get('reason')) == prior[1:]),
                    'us_evidence_conflicts_with_prior_review')
            continue
        if not choice:
            held.append(dict(row=index, reason='unconfirmed_match', fingerprint=fingerprint, observationKey=key,
                             source='snaptrade' if provider == 'snaptrade-bank' else 'simplefin'))
            continue
        require(all(choice.get(k) == v for k, v in fingerprint.items()), 'us_evidence_fingerprint_changed')
        target = choice.get('transactionId')
        if target is not None:
            require(choice.get('reason') is None, 'invalid_us_evidence_link')
            issuer_day = choice.get('issuerPostedDate', day)
            if issuer_day != day:
                issuer_date = date.fromisoformat(issuer_day)
                require(provider == 'snaptrade-bank' and issuer_date.isoformat() == issuer_day and
                        abs((issuer_date - date.fromisoformat(day)).days) == 1, 'invalid_issuer_date_offset')
            result = db.execute('''SELECT posted_date,amount_minor FROM spending_transaction
                WHERE id=? AND account_id=? AND currency='USD' ''', (target, account)).fetchone()
            require(result == (issuer_day, amount) and target not in targets, 'us_evidence_link_mismatch')
            targets.add(target)
            accepted.append((index, source_id, key, fingerprint_hash, target, None))
        else:
            reason = choice.get('reason')
            valid = (reason == 'interest_or_income' and amount > 0 or reason == 'card_payment' and amount < 0 or
                     reason == 'bank_verification' and abs(amount) < 100 or reason == 'own_transfer')
            require(valid and provider == 'snaptrade-bank', 'invalid_us_evidence_exclusion')
            accepted.append((index, source_id, key, fingerprint_hash, None, reason))
    require(set(decisions) <= seen, 'unknown_us_review_row')
    return accepted, held


def run(ledger, directory, binding_path, accounts, token):
    ptr = read(directory / 'pointer.json')
    binding = read(binding_path)
    account = binding['accountId']
    provider = binding['provider']
    require(isinstance(account, str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,79}', account)
            and provider in ('simplefin-card', 'snaptrade-bank'), 'invalid_us_evidence_binding')
    inventory = read(accounts)
    primary = []
    for key in ('accounts', 'bankAccounts'):
        registrations = inventory.get(key, [])
        for item in registrations.values() if isinstance(registrations, dict) else registrations:
            reg = item.get('inventory') or {}
            if reg.get('accountId') == account and reg.get('role') == 'primary':
                primary.append(reg)
    require(len(primary) == 1 and primary[0]['owner']['state'] == 'confirmed', 'unknown_account')
    scope = [provider, binding['connectionId'], binding['providerAccountId']] if provider == 'simplefin-card' else [
        provider, binding['connectionIdentity'], binding['accountRef']]
    snapshot = directory / 'provider.json'
    issuer = directory / 'issuer.csv'
    for p, key in ((snapshot, 'providerSha256'), (issuer, 'issuerSha256'), (binding_path, 'bindingSha256')):
        require(sha(p.read_bytes()) == ptr[key], 'us_evidence_input_changed')
    decisions_path = directory / 'decisions.json'
    data = read(decisions_path) if decisions_path.exists() else {'rows': []}
    if decisions_path.exists():
        require(data['providerSha256'] == ptr['providerSha256'] and data['issuerSha256'] == ptr['issuerSha256'],
                'us_evidence_review_input_changed')
    rows = signed_rows(read(snapshot), binding)
    require(bool(rows), 'empty_us_evidence')
    uri = ledger.as_uri() + ('?mode=rw' if token else '?mode=ro')
    with closing(sqlite3.connect(uri, uri=True)) as db, db:
        db.execute('PRAGMA foreign_keys=ON')
        if token:
            db.execute('BEGIN IMMEDIATE')
        if provider == 'simplefin-card':
            require(db.execute("SELECT 1 FROM spending_transaction WHERE account_id=? AND currency='USD' LIMIT 1",
                               (account,)).fetchone(), 'unknown_account')
        accepted, held = review_rows(db, rows, account, data, ptr, provider, scope)
        generation = db.execute('SELECT count(*) FROM spending_batch').fetchone()[0]
        batch = sha(encode([ptr, data]))
        review_token = sha(encode([str(ledger), generation, sha(accounts.read_bytes()), batch, accepted, held]))
        result = dict(status='preview', reviewToken=review_token, inserted=0,
                      matched=sum(target is not None for _, _, _, _, target, _ in accepted), evidenceLinked=len(accepted),
                      held=held, issues=[], totals=[], resolvedKeys=[item[2] for item in accepted])
        if not (accepted or held) or db.execute('SELECT 1 FROM spending_batch WHERE id=?', (batch,)).fetchone():
            return {**result, 'status':'already_applied', 'held': [], 'matched': 0, 'evidenceLinked': 0}
        if not token:
            return result
        require(token == review_token, 'stale_preview')
        payload = encode(dict(pointer=ptr, review=data))
        raw_hash = sha(payload)
        archive = ledger.parent.parent / 'records/spending'
        archive.mkdir(parents=True, exist_ok=True)
        record = archive / (raw_hash + '.json')
        if record.exists():
            require(record.read_bytes() == payload, 'archived_evidence_changed')
        else:
            with record.open('xb') as output:
                output.write(payload)
        db.execute('INSERT INTO spending_batch VALUES (?,?,?,?,?,?,?,?,?)',
                   (batch, provider, ptr['from'], ptr['to'], raw_hash, record.name,
                    'reviewed-us-provider-evidence-v1', len(accepted), datetime.now().isoformat()))
        db.execute('''CREATE TABLE IF NOT EXISTS spending_us_provider_evidence (
            batch_id TEXT NOT NULL REFERENCES spending_batch(id), row_number INTEGER NOT NULL,
            account_id TEXT NOT NULL, source_id TEXT NOT NULL, observation_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
            transaction_id TEXT REFERENCES spending_transaction(id),
            reason TEXT, CHECK ((transaction_id IS NULL) <> (reason IS NULL)),
            PRIMARY KEY (batch_id, row_number))''')
        db.executemany('INSERT INTO spending_us_provider_evidence VALUES (?,?,?,?,?,?,?,?)',
                       [(batch, row, account, source, key, fingerprint, target, reason)
                        for row, source, key, fingerprint, target, reason in accepted] +
                       [(batch, item['row'], account, item['fingerprint']['sourceId'], item['observationKey'],
                         sha(encode(item['fingerprint'])), None, item['reason'])
                        for item in held])
        db.executemany('INSERT INTO spending_observation VALUES (?,?,?)',
                       [(batch, row, target) for row, _, _, _, target, _ in accepted if target is not None])
        return {**result, 'status':'applied'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ledger', type=Path)
    parser.add_argument('directory', type=Path)
    parser.add_argument('binding', type=Path)
    parser.add_argument('accounts', type=Path)
    parser.add_argument('--apply-token')
    args = parser.parse_args()
    print(json.dumps(run(args.ledger, args.directory, args.binding, args.accounts, args.apply_token)))
