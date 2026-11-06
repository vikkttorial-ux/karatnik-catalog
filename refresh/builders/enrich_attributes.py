"""Fill absent characteristics from the approved article/brand reference only."""
import json
from collections import defaultdict, Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIELDS = {'tip':'Наименование изделия', 'polnpust':'Полн/Пуст',
          'char2':'Характеристика 2', 'char3':'Характеристика 3', 'thickness':'Толщина',
          'proba':'Проба', 'cvet':'Цвет', 'vstavka':'Вставки полностью', 'lock':'Тип замка',
          'main_stone':'Основной камень (вставки)', 'stone_color':'Цвет камня', 'stone_cut':'Тип огранки'}
DETAILS = {'polnpust','char2','char3','thickness','vstavka','lock','main_stone','stone_color','stone_cut'}
def text(v):
    s = str(v or '').strip()
    return '' if s.startswith('#') else s
def enrich(data, rows, overrides):
    header = {text(v):i for i,v in enumerate(rows[1])}
    assert {'Артикул','Бренд','Характеристика 2','Тип замка'} <= header.keys(), 'Reference schema changed'
    fields = {field:header[name] for field,name in FIELDS.items() if name in header}
    if 'vstavka' not in fields and 'Вставки' in header: fields['vstavka']=header['Вставки']
    lookup = defaultdict(list)
    for row in rows[2:]:
        r = row + [''] * max(0,len(rows[1])-len(row))
        lookup[(text(r[header['Артикул']]),text(r[header['Бренд']]).casefold())].append(r)
    changes = []
    for item in data['items']:
        matches = lookup.get((item['art'],item['marka'].strip().casefold()),[])
        if len(matches) != 1: continue
        row = matches[0]; details = item.setdefault('details',{})
        for field,col in fields.items():
            if field in overrides.get(item['art'],{}): continue
            value = text(row[col])
            if not value or text(item.get(field)) or details.get(field): continue
            if field in DETAILS: details[field] = [value]
            if field in {'tip','polnpust','char2','proba','cvet','vstavka'}: item[field] = value
            changes.append({'art':item['art'],'brand':item['marka'],'field':field,'value':value})
    return changes

def main():
    read=lambda p:json.loads(p.read_text(encoding='utf-8'))
    rows=read(ROOT/'work/supplement-articles.json')['values']
    overrides=read(Path(__file__).with_name('config.json')).get('article_characteristic_overrides',{})
    dashboard=ROOT/'outputs/owner-dashboard'
    stock=read(dashboard/'stock.json'); before={i['art']:(i['units'],i['stocks'],i['sizes'],i['photo']) for i in stock['items']}
    changes=enrich(stock,rows,overrides)
    assert before=={i['art']:(i['units'],i['stocks'],i['sizes'],i['photo']) for i in stock['items']}
    analytics=read(dashboard/'analytics.json'); analytics['stock']=stock
    # Only article-wide absent attributes; no size, weight, transaction or balance inference.
    filled={(x['art'],x['brand'].casefold(),x['field']):x['value'] for x in changes}
    for row in analytics['sales']+analytics.get('stock_units',[]):
        for dest,field in [('weave','char2'),('char3','char3'),('thickness','thickness')]:
            if not row.get(dest):
                value=filled.get((row['art'],row['brand'].casefold(),field))
                if value: row[dest]=value
    for path,data in [(dashboard/'stock.json',stock),(dashboard/'analytics.json',analytics),(ROOT/'outputs/karatnik-catalog/site/data.json',stock)]:
        path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    report={'cards':len({x['art'] for x in changes}),'fields':dict(Counter(x['field'] for x in changes)),'changes':changes}
    (ROOT/'work/attribute-enrichment-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='changes'},ensure_ascii=False))
if __name__=='__main__':main()
