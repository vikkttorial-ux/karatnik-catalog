"""Build local analytics from dated snapshots without inventing movement history."""
import json,re,sys
from pathlib import Path
from collections import defaultdict
root=Path(__file__).resolve().parent;workspace=root.parents[1]
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sales=read(root/'data.json');stock=read(root/'stock.json')
source=read(workspace/'work/source-sept21.json')['values']
raw=read(workspace/'work/owner-store-sales-v2.json')
sys.path.insert(0,str(workspace/'outputs/karatnik-catalog'))
from catalog import resolve_headers, normalize_stock, normalize_size, ERROR_VALUES
config=read(workspace/'outputs/karatnik-catalog/config.json')
columns=resolve_headers(source[0],config)
stock_by_art={p['art']:p for p in stock['items']}
def text(v):
    s='' if v is None else str(v).strip()
    return '' if s in ERROR_VALUES else s
def code(v):
    s=text(v)
    if s.endswith('.0'):s=s[:-2]
    return re.sub(r'\D','',s).lstrip('0')
def key(art,brand):return text(art)+'|'+text(brand).casefold()
header={text(v):i for i,v in reversed(list(enumerate(source[0])))}
bycode=defaultdict(list)
for row in source[1:]:
    if len(row)>1 and code(row[1]):bycode[code(row[1])].append(row)
rawrows={s['stock']:s['rows'] for s in raw['sources']}
enriched=[]
for sale in sales['items']:
    if sale['kind']!='Продажа изделий':continue
    r=dict(sale);rawrow=rawrows[r['stock']][r['source_row']-1]
    candidates=[x for x in bycode.get(code(rawrow[5]) if len(rawrow)>5 else '',[]) if len(x)>3 and key(x[3],x[0])==key(r['art'],r['brand'])]
    for field,name in [('size','Размер'),('weave','Характеристика 2'),('char3','Характеристика 3'),('thickness','Толщина')]:
        i=header[name];values={text(x[i]) for x in candidates if len(x)>i and text(x[i])}
        r[field]=next(iter(values)) if len(values)==1 else ''
    r['size']=normalize_size(r['size'])
    r['thickness']=normalize_size(r['thickness'])
    for field,value in config.get('article_characteristic_overrides',{}).get(r['art'],{}).items():
        r[{'char2':'weave'}.get(field,field)]=value
    r['key']=key(r['art'],r['brand']);enriched.append(r)
stock_units=[]
for cells in source[1:]:
    row={field:text(cells[i]) if i<len(cells) else '' for field,i in columns.items()}
    if row['service'] or not any(row.values()):continue
    if row['code']=='ЮР-000' and not any(v for k,v in row.items() if k!='code'):continue
    art=row['art'] or 'Без артикула · '+row['code']
    p=stock_by_art.get(art)
    if not p:raise ValueError('Inventory row missing from catalog')
    row.update(config.get('article_characteristic_overrides',{}).get(art,{}))
    store=normalize_stock(row['stock'],config.get('stock_aliases',{}))[0]
    stock_units.append(dict(key=key(art,p['marka']),art=art,brand=p['marka'],category=p['tip'],proba=row['proba'],size=normalize_size(row['size']),weave=row['char2'],char3=row['char3'],thickness=normalize_size(row['thickness']),stock=store,units=1))
from collections import Counter
actual=Counter((r['art'],r['stock']) for r in stock_units)
expected=Counter({(p['art'],s):q for p in stock['items'] for s,q in p['stocks'].items()})
if actual!=expected:raise ValueError('Unit stock does not reconcile with catalog by article and store')
snapshots={stock['generated_at']:stock}
for name in ['before-stock-refresh-with-photos.json','before-refresh.json','before-public-refresh.json']:
    p=workspace/'work'/name
    if p.exists():
        snap=read(p)
        if snap.get('generated_at') and isinstance(snap.get('items'),list):snapshots.setdefault(snap['generated_at'],snap)
ordered=sorted(snapshots.items());history={}
for p in stock['items']:
    k=key(p['art'],p['marka']);seen=False;previous=False;returned=False;first=None
    for stamp,snap in ordered:
        present=any(key(x['art'],x['marka'])==k and x['units']>0 for x in snap['items'])
        if present:
            if first is None:first=stamp
            if seen and not previous:returned=True
            seen=True
        previous=present
    first_index=next((i for i,(stamp,_) in enumerate(ordered) if stamp==first),0)
    history[k]={'status':'Вернулся в наличие' if returned else 'Впервые замечен' if first_index>0 else 'В начальном снимке','first_observed':first}
out=dict(sales=enriched,stock=stock,stock_units=stock_units,history=history,history_dates=[s for s,_ in ordered],sales_read_at=sales['read_at'],attribute_snapshot=read(workspace/'work/source-sept21.json')['read_at'],movement_history_available=False)
(root/'analytics.json').write_text(json.dumps(out,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'snapshots':len(ordered),'sales':len(enriched),'sizes_known':sum(bool(r['size']) for r in enriched),'history_from':ordered[0][0]},ensure_ascii=False))
