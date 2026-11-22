"""Read two reviewed domestic card workbooks without writing or contacting a provider."""
import base64
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from hashlib import sha256
from io import BytesIO
import json
import re
import sys
import unicodedata

from openpyxl import load_workbook

SAMSUNG_SUMMARY = ('조회기간', '이용지역', '이용구분', '금액합계(원)', '건수합계(건)')
SAMSUNG_COLUMNS = ('카드번호', '본인가족구분', '승인일자', '승인시각', '가맹점명', '승인금액(원)',
                   '일시불할부구분', '할부개월', '승인번호', '취소여부', '사용포인트', '결제일')
BANKSALAD_COLUMNS = ('날짜', '시간', '타입', '대분류', '소분류', '내용', '금액', '화폐', '결제수단', '메모')


def sheet(book, name, header):
    first, *rows = list(book[name].values)
    if first != header or len(rows) > 100_000:
        raise ValueError('invalid_sheet')
    return [(i, row) for i, row in enumerate(rows, 2) if any(value is not None for value in row)]


def integer(value):
    result = Decimal(str(value))
    if not result.is_finite() or result != result.to_integral_value() or abs(result) > 2**53 - 1:
        raise ValueError('invalid_amount')
    return int(result)


def merchant_name(name):
    return ''.join(c for c in unicodedata.normalize('NFKC', name).lower() if c.isalnum())


def legal_merchant_name(name):
    name = unicodedata.normalize('NFKC', name).strip()
    marker = r'(?:\(\s*주\s*\)|주식회사|유한회사)'
    return merchant_name(re.sub(rf'^{marker}\s*|\s*{marker}$', '', name))


def identifier(*values):
    return sha256(json.dumps(values, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def samsung(book, card, account):
    (_, summary), = sheet(book, '■ 카드이용내역', SAMSUNG_SUMMARY)
    window = re.fullmatch(r'(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})', summary[0])
    if not window or summary[1] != '국내':
        raise ValueError('invalid_issuer_period')
    start, end = [date.fromisoformat(d.replace('.', '-')).isoformat() for d in window.groups()]
    rows = sheet(book, '■ 국내이용내역', SAMSUNG_COLUMNS)
    if start > end or len(rows) != integer(summary[4]):
        raise ValueError('invalid_issuer_period')
    approvals, refunds, candidates = defaultdict(list), defaultdict(list), defaultdict(list)
    economic_candidates = defaultdict(list)
    held = []
    selected = 0
    for row, values in rows:
        number, holder, approval_day, approval_time, merchant, gross, plan, months, code, status, _, _ = values
        day = date.fromisoformat(approval_day.replace('.', '-')).isoformat()
        if not start <= day <= end:
            raise ValueError('invalid_issuer_period')
        amount = -integer(gross)
        if isinstance(merchant, str):
            candidates[(day, amount, merchant_name(merchant))].append(row)
            economic_candidates[(day, amount)].append((row, legal_merchant_name(merchant)))
        if number != card or holder != '본인':
            continue
        selected += 1
        if (not isinstance(merchant, str) or not merchant_name(merchant) or not isinstance(code, str) or not code.strip()
                or not isinstance(approval_time, str) or not re.fullmatch(r'\d{2}:\d{2}:\d{2}', approval_time)
                or plan != '일시불' or integer(months) != 0 or not amount
                or status not in ('-', '부분취소', '전체취소') or (status == '-') != (amount < 0)):
            held.append(dict(workbook='issuer', row=row, reason='unsupported_issuer_row'))
            continue
        datetime.strptime(approval_time, '%H:%M:%S')
        approval = identifier(card, day, code)
        event = dict(accountId=account, transactionDate=day, postedDate=day, description=merchant,
                     amountMinor=amount, currency='KRW')
        if amount < 0:
            approvals[approval].append((row, approval_time, dict(event, kind='purchase', sourceId=approval)))
        else:
            refunds[approval].append((row, approval_time, status,
                dict(event, kind='refund', sourceId=identifier(approval, amount), relatedSourceId=approval)))
    if not selected:
        raise ValueError('issuer_card_not_found')
    accepted = {}
    for group in approvals.values():
        if len(group) == 1:
            row, _, event = group[0]
            accepted[row] = event
        else:
            held.extend(dict(workbook='issuer', row=row, reason='ambiguous_approval') for row, _, _ in group)
    for key, group in refunds.items():
        parents = approvals[key]
        if len(parents) != 1:
            held.extend(dict(workbook='issuer', row=row, reason='unlinked_cancellation') for row, *_ in group)
            continue
        _, approved_time, parent = parents[0]
        by_id = defaultdict(list)
        for row, time, status, event in group:
            complete = event['amountMinor'] == -parent['amountMinor']
            if (approved_time != time or merchant_name(event['description']) != merchant_name(parent['description'])
                    or event['amountMinor'] > -parent['amountMinor'] or (status == '전체취소') != complete):
                held.append(dict(workbook='issuer', row=row, reason='unlinked_cancellation'))
            else:
                by_id[event['sourceId']].append((row, event))
        for group in by_id.values():
            if len(group) == 1:
                row, event = group[0]
                accepted[row] = event
            else:
                held.extend(dict(workbook='issuer', row=row, reason='ambiguous_cancellation') for row, _ in group)
    return start, end, accepted, candidates, economic_candidates, held


def banksalad(book, label, start, end, issuer_start, issuer_end, eligible, economics, accepted, held):
    grouped = defaultdict(list)
    bank_economics = defaultdict(list)
    for row, values in sheet(book, '가계부 내역', BANKSALAD_COLUMNS):
        raw_date, _, kind, _, _, desc, amount, currency, name, _ = values
        day = (raw_date.date() if isinstance(raw_date, datetime) else raw_date).isoformat()
        if not start <= day <= end:
            raise ValueError('invalid_banksalad_period')
        if name != label or not issuer_start <= day <= issuer_end:
            continue
        if kind != '지출' or currency != 'KRW' or not isinstance(desc, str) or not merchant_name(desc) or not integer(amount):
            held.append(dict(workbook='banksalad', row=row, reason='unsupported_banksalad_row'))
        else:
            amount = integer(amount)
            grouped[(day, amount, merchant_name(desc))].append(row)
            bank_economics[(day, amount)].append((row, legal_merchant_name(desc)))
    links = []
    for key, bank_rows in grouped.items():
        issuer_rows = eligible.get(key, [])
        if len(bank_rows) == len(issuer_rows) == 1 and issuer_rows[0] in accepted:
            links.append(dict(row=bank_rows[0], issuerRow=issuer_rows[0]))
            continue
        ambiguous = len(bank_rows) > 1 or len(issuer_rows) > 1
        if not issuer_rows and key[1] < 0:
            same_amount = economics[key[:2]]
            bank_amount = bank_economics[key[:2]]
            if len(bank_amount) == 1:
                row, merchant = bank_amount[0]
                aliases = [issuer for issuer, name in same_amount if len(merchant) >= 2 and merchant == name]
                if len(same_amount) == len(aliases) == 1 and aliases[0] in accepted:
                    links.append(dict(row=row, issuerRow=aliases[0], basis='legal_name_marker'))
                    continue
                ambiguous = ambiguous or bool(aliases and len(same_amount) > 1)
        reason = 'ambiguous_match' if ambiguous else 'unconfirmed_match'
        held.extend(dict(workbook='banksalad', row=row, reason=reason) for row in bank_rows)
    return sorted(links, key=lambda item: item['row'])


def main():
    data = json.load(sys.stdin)
    binding = data['binding']
    start, end = data['periodStart'], data['periodEnd']
    sources = [BytesIO(base64.b64decode(data[name], validate=True)) for name in ('samsung', 'banksalad')]
    issuer, bank = [load_workbook(source, read_only=True, data_only=True, keep_links=False) for source in sources]
    try:
        issuer_start, issuer_end, accepted, eligible, economics, held = samsung(issuer, binding['samsungCardNumber'], binding['accountId'])
        if max(start, issuer_start) > min(end, issuer_end):
            raise ValueError('disjoint_workbook_periods')
        links = banksalad(bank, binding['bankSaladPaymentMethod'], start, end, issuer_start, issuer_end,
                          eligible, economics, accepted, held)
        print(json.dumps(dict(issuerStart=issuer_start, issuerEnd=issuer_end,
                              transactions=[dict(row=row, transaction=event) for row,event in sorted(accepted.items())],
                              links=links, held=held)))
    finally:
        issuer.close()
        bank.close()


if __name__ == '__main__':
    main()
