"""Local importer: sales M only; product reference does not add transactions."""
import json,re,math
from pathlib import Path
from datetime import datetime,timedelta
from collections import defaultdict,Counter
ROOT=Path(__file__).resolve().parents[2]
src=json.loads((ROOT/'work/owner-store-sales-v2.json').read_text(encoding='utf-8'))
ref=json.loads((ROOT/'work/owner-product-reference.json').read_text(encoding='utf-8'))
def text(v):return '' if v is None else str(v).strip()
def code(v):
    s=text(v)
    if re.fullmatch(r'\d+\.0',s):s=s[:-2]
    return re.sub(r'\D','',s).lstrip('0')
def number(v):
    try:
        n=float(re.sub(r'[\s\u00a0₽]|р\.', '',text(v)).replace(',','.'))
        return n if math.isfinite(n) else None
    except ValueError:return None
def date(v):
    if isinstance(v,(int,float)):return (datetime(1899,12,30)+timedelta(days=v)).date().isoformat()
    return datetime.strptime(text(v),'%d.%m.%Y').date().isoformat()
lookup=defaultdict(set)
for r in ref['rows'][1:]:
    r=r+['']*(4-len(r))
    if code(r[1]):lookup[code(r[1])].add((text(r[0]),text(r[3])))
items=[];purchases=[];issues=[];excluded=[];seen=set()
for source in src['sources']:
    for n,raw in enumerate(source['rows'][1:],2):
        r=raw+['']*(16-len(raw)); kind=text(r[1]).lower()
        identity=(source['id'],n)
        if identity in seen:raise ValueError('Duplicate source row')
        seen.add(identity)
        if not text(r[0]) and not kind:continue
        if not any(text(v) for v in r):continue
        if kind not in ('продажа','ремонт','заказ','заказ (работа)','скупка','скупка(обмен)'):
            excluded.append(dict(stock=source['stock'],row=n,kind=kind or 'Не указана',money=number(r[12])));continue
        def issue(reason):issues.append(dict(stock=source['stock'],row=n,reason=reason))
        try:day=date(r[0])
        except (ValueError,OverflowError):issue('Нет корректной даты продажи');continue
        if day>datetime.now().date().isoformat():issue('Дата операции в будущем: исключена');continue
        money=number(r[12])
        if money is None:issue('Нет корректной цены со скидкой');continue
        weight=number(r[6]);weight=weight if weight and weight>0 else None
        proba=text(r[4]);proba=proba[:-2] if proba.endswith('.0') else proba
        candidates=lookup.get(code(r[5]),set()) if code(r[5]) else set()
        brand,art=next(iter(candidates)) if len(candidates)==1 else ('Не сопоставлен','')
        if kind=='продажа' and len(candidates)!=1:issue('Бренд: неоднозначный код' if candidates else 'Бренд: код не найден')
        if kind=='продажа' and not weight:issue('Нет положительного веса: исключено из цены грамма')
        if money<=0:issue('Нулевая или отрицательная сумма: требуется проверка')
        metal={'585':'Золото','375':'Золото','750':'Золото','500':'Золото','925':'Серебро','875':'Серебро'}.get(proba,'Не определён')
        if kind in ('ремонт','заказ','заказ (работа)'):
            weight=None;metal='Услуги';proba='Не применяется';brand='Не применяется';art=''
        target=purchases if kind in ('скупка','скупка(обмен)') else items
        target.append(dict(seller=re.sub(r'\s+',' ',text(r[15])) or 'Не указан',kind={'продажа':'Продажа лома' if text(r[2]).casefold()=='лом' else 'Продажа изделий','ремонт':'Ремонты','заказ':'Заказы','заказ (работа)':'Заказы','скупка':'Скупка','скупка(обмен)':'Обмен'}[kind],units=1 if kind=='продажа' else 0,date=day,money=round(money,2),weight=weight,metal=metal,proba=proba or 'Не указана',category=(text(r[2]).capitalize() or 'Не указана') if kind in ('продажа','скупка','скупка(обмен)') else {'ремонт':'Ремонт','заказ':'Заказ','заказ (работа)':'Работа по заказу'}[kind],brand=brand or 'Не сопоставлен',stock=source['stock'],art=art,source_row=n))
for item in items:
    if item['seller'].casefold()=='даша':item['seller']='Шевяхова Дарья'
    item['seller_active']=not item['seller'].casefold().startswith('муреева')
out=Path(__file__).parent
data=dict(read_at=src['read_at'],items=items,purchases=purchases,issues=issues,source='Продажи двух магазинов · итоговая сумма M',excluded_operations=dict(Counter(x['kind'] for x in excluded)))
(out/'data.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
(ROOT/'work/owner-excluded-operations.json').write_text(json.dumps(excluded,ensure_ascii=False),encoding='utf-8')
print(json.dumps(dict(items=len(items),dates=[min(x['date'] for x in items),max(x['date'] for x in items)],issues=dict(Counter(x['reason'] for x in issues)),excluded=data['excluded_operations']),ensure_ascii=False))
