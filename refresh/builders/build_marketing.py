"""Build receipt evidence; never turn year-only dates into exact arrivals."""
import json
from pathlib import Path
from datetime import date, datetime, timedelta, timezone
from collections import defaultdict

ROOT = Path(__file__).resolve().parent
WORK = ROOT.parents[1] / 'work'
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def key(art, brand): return str(art or '').strip() + '|' + str(brand or '').strip().casefold()

def parse_date(value):
    if value is None or str(value).strip() == '': return None, 'missing'
    if isinstance(value, (int, float)):
        if 1900 <= value <= 2100: return None, 'year_only'
        if not 30000 <= value <= 80000: return None, 'invalid'
        result = (date(1899, 12, 30) + timedelta(days=int(value))).isoformat()
    else:
        result = None
        for pattern in ('%d.%m.%Y', '%Y-%m-%d', '%d/%m/%Y'):
            try: result = datetime.strptime(str(value).strip(), pattern).date().isoformat(); break
            except ValueError: pass
        if not result: return None, 'invalid'
    today = datetime.now(timezone(timedelta(hours=3))).date().isoformat()
    return (None, 'future') if result > today else (result, 'exact')

def build():
    source = read(WORK / 'marketing-stock-source.json')
    stock = read(ROOT / 'stock.json')
    receipts = defaultdict(list)
    quality = defaultdict(int)
    for i, identity in enumerate(source['identity'][1:], 1):
        if len(identity) < 4 or not identity[3]: continue
        row = source['dates'][i] if i < len(source['dates']) else []
        stamp, status = parse_date(row[0] if row else None)
        quality[status] += 1
        if stamp: receipts[key(identity[3], identity[0])].append(stamp)
    snapshots = {stock['generated_at']: stock}
    for name in ('before-stock-refresh-with-photos.json', 'before-refresh.json', 'before-public-refresh.json'):
        path = WORK / name
        if path.exists():
            snapshot = read(path)
            if snapshot.get('generated_at'): snapshots.setdefault(snapshot['generated_at'], snapshot)
    observed = [(stamp, {key(p['art'], p['marka']) for p in snapshot['items'] if p['units'] > 0}) for stamp, snapshot in sorted(snapshots.items())]
    evidence = {}
    for p in stock['items']:
        k = key(p['art'], p['marka'])
        gaps = []
        previously_present = False
        for stamp, present in observed:
            if k in present: previously_present = True
            elif previously_present: gaps.append(stamp[:10])
        evidence[k] = {'receipt_dates': sorted(set(receipts.get(k, []))), 'observed_out_of_stock': gaps}
    out = {'read_at': source['read_at'], 'source': source.get('source', 'Товар_Каратник · Остатки · Дата прихода'), 'quality': dict(quality), 'history_from': observed[0][0], 'items': evidence}
    (ROOT / 'marketing.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'quality': dict(quality), 'products_with_dates': sum(bool(p['receipt_dates']) for p in evidence.values())}, ensure_ascii=False))

if __name__ == '__main__': build()
