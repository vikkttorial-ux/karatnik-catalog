"""Apply the reviewed PUBLIC labels only to the exact daily source state.
No inventory history, financial rows or employee data are stored here.
"""
import hashlib,json
from datetime import datetime,timezone,timedelta
from pathlib import Path

def source_signature(rows):
    from build_promotions import date_value,positive_weight
    h={str(v).strip():i for i,v in enumerate(rows[0])}
    def value(row,*names):
        i=next((h[n] for n in names if n in h),None)
        return str(row[i]).strip() if i is not None and i<len(row) and row[i] is not None else ''
    facts=[]
    for row in rows[1:]:
        art=value(row,'Артикул');brand=value(row,'Марка/брендК','Марка/бренд')
        if not art or not brand:continue
        facts.append([art,brand.casefold(),date_value(value(row,'Дата прихода')),
            date_value(value(row,'Ожидаемая дата поступления','Ожидаемая дата')),
            positive_weight(value(row,'Остаток гр')),bool(value(row,'Дата продажи')),
            bool(value(row,'Наименование услуги'))])
    raw=json.dumps(sorted(facts,key=lambda r:json.dumps(r,ensure_ascii=False)),ensure_ascii=False,separators=(',',':')).encode()
    return hashlib.sha256(raw).hexdigest()

def stock_signature(stock):
    items=[{k:p[k] for k in ('art','marka','units','sizes')} for p in stock['items']]
    raw=json.dumps(sorted(items,key=lambda p:(p['art'],p['marka'])),ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
    return hashlib.sha256(raw).hexdigest()

def apply_verified_labels(path,master,stock,sales,owner,catalog):
    verified=json.loads(Path(path).read_text(encoding='utf8'))
    today=datetime.now(timezone(timedelta(hours=3))).date().isoformat()
    if verified['date']!=today or verified['source_signature']!=source_signature(master['values']) or verified['stock_signature']!=stock_signature(stock):
        raise RuntimeError('Проверенные метки требуют свежего пересчёта с сохранённой историей. Предыдущая публикация сохранена.')
    allowed={'Новинка','Новинка месяца','Скоро в продаже','Вернулись в наличие','Пополнили размеры'}
    for item in verified['items'].values():
        if set(item)-{'tags','replenished_sizes','expected_date'} or set(item['tags'])-allowed:
            raise RuntimeError('Недопустимые поля проверенных публичных меток.')
    # Hit labels are calculated from the freshly read sales by the ordinary builder.
    generated=json.loads((Path(owner)/'promotions.json').read_text(encoding='utf8'))
    final={}
    for key in generated['items'].keys()|verified['items'].keys():
        tags=[t for t in generated['items'].get(key,{}).get('tags',[]) if t in ('Хит','Хит месяца')]
        entry=verified['items'].get(key,{})
        tags+=entry.get('tags',[])
        if tags:final[key]={**entry,'tags':tags}
    generated['items']=final
    for target in (Path(owner)/'promotions.json',Path(catalog)/'site/promotions.json'):
        target.write_text(json.dumps(generated,ensure_ascii=False),encoding='utf8')
    print('Проверенные публичные метки применены к точным текущим источникам.')
