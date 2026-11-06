"""Public-safe product selections shared with the catalog; no sales figures exported."""
import json, calendar, sys
from urllib.parse import quote
from pathlib import Path
from datetime import datetime, timedelta, timezone
from collections import defaultdict, Counter
ROOT=Path(__file__).resolve().parent
WORK=ROOT.parents[1]/'work'
CAT=ROOT.parent/'karatnik-catalog/site'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def key(a,b):return str(a).strip()+'|'+str(b).strip().casefold()
def positive_weight(value):
 try:return float(str(value).strip().replace(' ','').replace(',','.'))>0
 except (ValueError,TypeError):return False

def master_promotion_facts(rows):
 """Return master-only plans, current presence, and manual soon labels."""
 headers={str(v).strip():i for i,v in enumerate(rows[0]) if v is not None}
 art_i=headers.get('Артикул');brand_i=headers.get('Марка/бренд',headers.get('Марка/брендК'));date_i=headers.get('Ожидаемая дата поступления',headers.get('Ожидаемая дата'))
 weight_i=headers.get('Остаток гр');sale_i=headers.get('Дата продажи');service_i=headers.get('Наименование услуги')
 expected={};available=set();manual_soon=set()
 required={'Артикул':art_i,'Марка/бренд':brand_i,'Ожидаемая дата поступления':date_i,'Остаток гр':weight_i,'Дата продажи':sale_i,'Наименование услуги':service_i}
 missing=[name for name,index in required.items() if index is None]
 if missing:raise ValueError('Нет обязательных колонок для меток: '+', '.join(missing))
 label_i=headers.get('Метка')
 for row in rows[1:]:
  def value(index):return str(row[index]).strip() if index is not None and index<len(row) and row[index] is not None else ''
  art,brand=value(art_i),value(brand_i)
  if not art or not brand:continue
  k=key(art,brand);planned=date_value(value(date_i))
  if planned:expected[k]=planned
  if 'скоро' in value(label_i).lower().replace('ё','е'):manual_soon.add(k)
  if positive_weight(value(weight_i)) and not value(sale_i) and not value(service_i):available.add(k)
 return expected,available,manual_soon

def supplement_soon_counts(rows):
 """Count supplement labels for diagnostics only; they do not set promotion status."""
 headers={str(v).strip():i for i,v in enumerate(rows[1]) if v is not None}
 art_i=headers.get('Артикул');brand_i=headers.get('Бренд');label_i=headers.get('Метка');date_i=headers.get('Ожидается (дата)')
 labeled=set();unplanned=set()
 if art_i is None or brand_i is None:return 0,0
 for row in rows[2:]:
  def value(index):return str(row[index]).strip() if index is not None and index<len(row) and row[index] is not None else ''
  art,brand=value(art_i),value(brand_i)
  if not art or not brand or 'скоро' not in value(label_i).lower().replace('ё','е'):continue
  k=key(art,brand);labeled.add(k)
  if not date_value(value(date_i)):unplanned.add(k)
 return len(labeled),len(unplanned)

def is_upcoming(expected_date, master_available, today):
 """Only a future master plan without current stock is upcoming."""
 planned=date_value(expected_date)
 return bool(planned and planned>today.isoformat() and not master_available)

def is_new_arrival(first_arrival, today, master_available):
 recent=(today-timedelta(days=89)).isoformat()
 return bool(master_available and first_arrival and recent<=first_arrival<=today.isoformat())

def is_returned_after_sellout(previous_positive, gap_snapshot, replenishment, sales_dates, receipt_dates, window_start):
 """A return needs a recorded zero-stock interval, a sale, and a later master receipt."""
 if not (previous_positive and gap_snapshot and replenishment):return False
 left=previous_positive[:10];gap=gap_snapshot[:10];right=replenishment[:10]
 if not (window_start<=right and left<gap<right):return False
 return any(left<d<=gap for d in sales_dates) and any(gap<d<=right for d in receipt_dates)

def replenished_size_names(old_snapshot, new_snapshot, arrival_sizes, window_start):
 """Report only sizes positive now that returned after zero with a master receipt."""
 if old_snapshot.get('units',0)<=0 or new_snapshot.get('units',0)<=0:return set()
 previous={s['s']:s.get('q',0) for s in old_snapshot.get('sizes',[])}
 return {s['s'] for s in new_snapshot.get('sizes',[])
         if s.get('q',0)>0 and previous.get(s['s'],0)<=0
         and any(window_start<d and z==s['s'] for d,z in arrival_sizes)}
def date_value(v):
 try:
  serial=float(v)
  if 30000<=serial<=80000:return (datetime(1899,12,30)+timedelta(days=int(serial))).date().isoformat()
 except (ValueError,TypeError):pass
 for fmt in ('%d.%m.%Y','%Y-%m-%d','%d/%m/%Y'):
  try:return datetime.strptime(str(v).strip(),fmt).date().isoformat()
  except ValueError:pass
 return None
def build():
 sys.path.insert(0,str(CAT.parent))
 from catalog import normalize_size
 today=datetime.now(timezone(timedelta(hours=3))).date();end=today.isoformat();events=(today-timedelta(days=29)).isoformat()
 stock=read(ROOT/'stock.json');sales=read(ROOT/'data.json');master=read(WORK/'source-sept21.json');supp=read(WORK/'supplement-articles.json')
 live={key(p['art'],p['marka']):p for p in stock['items']};meta={};upcoming={};arrivals=defaultdict(list);refs={}
 expected,master_available,master_manual_soon=master_promotion_facts(master['values']);overdue_waiting=0;unplanned_waiting=0
 supplement_soon,supplement_soon_unplanned=supplement_soon_counts(supp['values'])
 def ingest(rows,headerrow,mapping,collect_arrivals=False):
  h={str(v).strip():i for i,v in enumerate(rows[headerrow])}
  for row in rows[headerrow+1:]:
   def v(name):
    title=mapping.get(name,name)
    aliases={'Марка/брендК':['Марка/брендК','Марка/бренд']}
    i=next((h[t] for t in aliases.get(title,[title]) if t in h),None)
    return str(row[i]).strip() if i is not None and i<len(row) and row[i] is not None else ''
   art,brand=v('art'),v('brand')
   if not art or not brand:continue
   k=key(art,brand)
   dt=date_value(v('arrival'))
   if collect_arrivals and dt and dt<=end:arrivals[k].append((dt,normalize_size(v('size'))))
   refs.setdefault(k,dict(art=art,marka=brand,tip=v('type'),char2=v('char2'),char3=v('char3'),thickness=v('thickness'),proba=v('proba'),cvet=v('color'),polnpust=v('solid'),kamni=v('stones'),vstavka=v('inserts'),naim=v('name'),photo='',units=0,stocks={},sizes=[],details={}))
 ingest(supp['values'],1,dict(art='Артикул',brand='Бренд',type='Наименование изделия',char2='Характеристика 2',char3='Характеристика 3',thickness='Толщина',proba='Проба',color='Цвет',solid='Полн/Пуст',stones='Группа вставки',inserts='Вставки полностью',name='Название на сайте',arrival='Дата прихода',size='Размер'))
 ingest(master['values'],0,dict(art='Артикул',brand='Марка/брендК',type='Наименование изделя',char2='Характеристика 2',char3='Характеристика 3',thickness='Толщина',proba='Проба',color='Цвет',solid='Полн/Пуст',stones='Группа вставки',inserts='Вставки',name='Наименование полное',arrival='Дата прихода',size='Размер'),collect_arrivals=True)
 y,m=today.year,today.month-8
 while m<1:y-=1;m+=12
 start=today.replace(year=y,month=m,day=min(today.day,calendar.monthrange(y,m)[1])).isoformat()
 hitsets=[]
 for begin in (start,end[:7]+'-01'):
  rank=defaultdict(lambda:[0,0])
  for s in sales['items']:
   if s['kind']=='Продажа изделий' and begin<=s['date']<=end and s.get('art') and s.get('brand')!='Не сопоставлен':
    a=rank[key(s['art'],s['brand'])];a[0]+=s.get('units',1);a[1]+=s['money']
  hitsets.append(set(sorted(rank,key=lambda k:(-rank[k][0],-rank[k][1],k))[:20]))
 snapshots={stock['generated_at']:live}
 for path in sorted(WORK.glob('backup-refresh*/stock.json')):
  s=read(path)
  if s.get('generated_at'):snapshots[s['generated_at']]={key(p['art'],p['marka']):p for p in s['items']}
 ordered=sorted(snapshots.items());sale_dates=defaultdict(list)
 for sale in sales['items']:
  if sale['kind']=='Продажа изделий':sale_dates[key(sale.get('art',''),sale.get('brand',''))].append(sale['date'])
 for k in set(refs)|set(live)|set.union(*hitsets):
  tags=[];sizes=set();entry={'tags':tags}
  if k in hitsets[0]:tags.append('Хит')
  if k in hitsets[1]:tags.append('Хит месяца')
  if expected.get(k) and expected[k]<=end and k not in master_available:overdue_waiting+=1
  if k in master_manual_soon and not expected.get(k) and k not in master_available:unplanned_waiting+=1
  if is_upcoming(expected.get(k),k in master_available,today):
   tags.append('Скоро в продаже')
   if expected.get(k):entry['expected_date']=expected[k]
   if k not in master_available and k in refs:upcoming[k]=refs[k]
  dates=sorted(d for d,_ in arrivals[k]);first=dates[0] if dates else None
  older_presence=bool(first and any(stamp[:10]<first and (p:=snapshot.get(k)) and p['units']>0 for stamp,snapshot in ordered))
  if k in live and not older_presence and is_new_arrival(first,today,k in master_available):tags.append('Новинка')
  previous_positive=None;gap_snapshot=None
  for stamp,snapshot in ordered:
   p=snapshot.get(k)
   if p and p['units']>0:
    if (gap_snapshot and k in master_available and 'Новинка' not in tags
        and 'Скоро в продаже' not in tags
        and is_returned_after_sellout(previous_positive,gap_snapshot,stamp,sale_dates[k],[d for d,_ in arrivals[k]],events)):
     if 'Вернулись в наличие' not in tags:tags.append('Вернулись в наличие')
    previous_positive=stamp;gap_snapshot=None
   elif previous_positive and gap_snapshot is None:gap_snapshot=stamp
  for (before,old),(after,new) in zip(ordered,ordered[1:]):
   if after[:10]<events or k not in old or k not in new:continue
   sizes.update(replenished_size_names(old[k],new[k],[(d,z) for d,z in arrivals[k] if before[:10]<d<=after[:10]],before[:10]))
  current_sizes={s['s'] for s in live.get(k,{}).get('sizes',[]) if s.get('q',0)>0}
  sizes.intersection_update(current_sizes if k in master_available else set())
  if k in live:
   if sizes:tags.append('Пополнили размеры')
  if sizes:entry['replenished_sizes']=sorted(sizes)
  if first and first>=end[:7]+'-01' and k in live and k in master_available and 'Новинка' in tags:tags.append('Новинка месяца')
  if k in upcoming:
   sys.path.insert(0,str(CAT.parent))
   from catalog import photo_filename
   name=photo_filename(upcoming[k]['art'])
   if (CAT/'photos'/name).is_file():upcoming[k]['photo']='photos/'+quote(name,safe='-_.')
  if tags:meta[k]=entry
 # Only explicitly expected products enter the showcase; inventory stays untouched.
 out={'generated_at':stock['generated_at'],'items':meta,'upcoming':list(upcoming.values())}
 for target in (ROOT/'promotions.json',CAT/'promotions.json'):target.write_text(json.dumps(out,ensure_ascii=False),encoding='utf-8')
 print(json.dumps({'selections':dict(Counter(t for e in meta.values() for t in e['tags'])),'upcoming':len(upcoming),'master_planned':len(expected),'overdue_waiting':overdue_waiting,'unplanned_waiting':unplanned_waiting,'supplement_manual_soon':supplement_soon,'supplement_soon_without_plan':supplement_soon_unplanned},ensure_ascii=False))
if __name__=='__main__':build()


