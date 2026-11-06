"""Read-only refresh; source rows remain outside the Pages artifact."""
import argparse,json,os,shutil,subprocess,sys
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import quote,urlencode
REPO=Path(__file__).resolve().parents[1];RUNTIME=REPO/'runtime';WORK=RUNTIME/'work';OWNER=RUNTIME/'outputs/owner-dashboard';CAT=RUNTIME/'outputs/karatnik-catalog'
BACKEND='https://karatnik-product-photos.workspace-903713.chatgpt.site'
MASTER='18RDx2lWEJk6wfsw01lzz6WzTq-rdElfaQj_VzHblJ14';SUPPLEMENT='1-jMJB9MRi3Tbb9oeARM0SwZ4vIhTF-xMPRmVaA6P_kU'
FILES=['data.json','stock.json','analytics.json','marketing.json','promotions.json']
def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def write(p,v):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False),encoding='utf-8')
def col(i):
 out='';i+=1
 while i:i,n=divmod(i-1,26);out=chr(65+n)+out
 return out
class Reader:
 def __init__(self):
  from google.oauth2 import service_account
  from google.auth.transport.requests import AuthorizedSession
  key=json.loads(os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON','{}'))
  if key.get('token_uri')!='https://oauth2.googleapis.com/token':raise RuntimeError('Не настроен ключ чтения Google в GitHub Secrets.')
  self.email=key.get('client_email','сервисному аккаунту каталога');self.session=AuthorizedSession(service_account.Credentials.from_service_account_info(key,scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']))
 def get(self,url,params=None):
  r=self.session.get(url,params=params,timeout=90)
  if r.status_code in (403,404):raise RuntimeError('Нет доступа к источнику '+url.split('/spreadsheets/')[-1].split('/')[0]+'. Выдайте право «Читатель» аккаунту '+self.email)
  if not r.ok:raise RuntimeError('Ошибка чтения Google: HTTP '+str(r.status_code))
  return r.json()
 def rows(self,file,tab,header_row=1,allowed=None,required=()):
  base='https://sheets.googleapis.com/v4/spreadsheets/'+file
  meta=self.get(base,{'fields':'sheets(properties(sheetId,title,gridProperties))'});prop=next((s['properties'] for s in meta['sheets'] if s['properties']['title']==tab),None)
  if not prop:raise RuntimeError('Не найден лист '+tab)
  height=prop['gridProperties']['rowCount'];width=prop['gridProperties']['columnCount']
  if height>100000 or width>500:raise RuntimeError('Размер источника требует проверки: '+tab)
  sheet="'"+tab.replace("'","''")+"'";header_url=base+'/values/'+quote(f'{sheet}!A{header_row}:{col(width-1)}{header_row}',safe='')
  header=self.get(header_url,{'valueRenderOption':'FORMATTED_VALUE'}).get('values',[[]])[0]
  missing=set(required)-{str(v).strip() for v in header}
  if missing:raise RuntimeError('Изменились заголовки '+tab+': '+', '.join(sorted(missing)))
  indexes=[i for i,v in enumerate(header) if allowed is None or str(v).strip() in allowed];rows=[[] for _ in range(header_row-1)]+[header]
  for offset in range(0,len(indexes),30):
   part=indexes[offset:offset+30];params=[('valueRenderOption','FORMATTED_VALUE')]+[('ranges',f'{sheet}!{col(i)}{header_row+1}:{col(i)}{height}') for i in part]
   ranges=self.get(base+'/values:batchGet',params).get('valueRanges',[])
   if len(ranges)!=len(part):raise RuntimeError('Неполный ответ Google: '+tab)
   for index,column in zip(part,ranges):
    for r,values in enumerate(column.get('values',[]),header_row):
     while len(rows)<=r:rows.append([])
     rows[r]+=['']*max(0,len(header)-len(rows[r]));rows[r][index]=values[0] if values else ''
  if self.get(header_url,{'valueRenderOption':'FORMATTED_VALUE'}).get('values',[[]])[0]!=header:raise RuntimeError('Заголовки изменились во время чтения: '+tab)
  return rows
def build(fixtures=None):
 for p in [WORK,OWNER,CAT]:p.mkdir(parents=True,exist_ok=True)
 shutil.copy2(REPO/'catalog.py',CAT/'catalog.py');shutil.copy2(REPO/'refresh/catalog-config.json',CAT/'config.json');shutil.copytree(REPO/'site',CAT/'site',dirs_exist_ok=True)
 for p in (REPO/'refresh/builders').glob('*.py'):shutil.copy2(p,(CAT if p.name=='enrich_attributes.py' else OWNER)/p.name)
 cache=REPO/'refresh-cache';cache.mkdir(exist_ok=True);previous=read(cache/'stock.json') if (cache/'stock.json').exists() else read(CAT/'site/data.json')
 write(WORK/'before-refresh.json',previous);write(WORK/'backup-refresh-previous/stock.json',previous)
 if (cache/'history').exists():
  for p in (cache/'history').glob('*.json'):write(WORK/('backup-refresh-'+p.stem)/'stock.json',read(p))
 if fixtures:
  f=Path(fixtures);master=read(f/'master.json');supp=read(f/'supplement.json');sales=read(f/'sales.json');stamp=master['read_at']
 else:
  reader=Reader();config=read(CAT/'config.json');allowed=set(config['headers'].values())|{'Группа вставки','Дата прихода','Дата продажи','Остаток гр','Ожидаемая дата поступления','Ожидаемая дата','Метка'}
  mr=reader.rows(MASTER,'Исходники',allowed=allowed,required=config['headers'].values())
  allowed={'Артикул','Бренд','Наименование изделия','Полн/Пуст','Характеристика 2','Характеристика 3','Толщина','Проба','Цвет','Вставки полностью','Вставки','Тип замка','Основной камень (вставки)','Цвет камня','Тип огранки','Дата прихода','Размер','Группа вставки','Название на сайте','Метка','Ожидается (дата)'}
  sr=reader.rows(SUPPLEMENT,'Артикулы',2,allowed,{'Артикул','Бренд','Характеристика 2','Тип замка'});sources=[]
  for file,stock in [('1pyv0zCDJFdHC36pxK99neo6uNUw8rl8Hu5d6d0DY4II','Ленинградская 33'),('1sGLiSfctiOHUN_ncirhwVTWl8LyMSE1R1djZWsMkYtg','Гостинка (В.Е.Левин)')]:
   rows=reader.rows(file,'Продажи')
   if len(rows[0])<16 or str(rows[0][0]).strip()!='Дата':raise RuntimeError('Изменились колонки продаж.')
   sources.append({'id':file,'stock':stock,'rows':[r[:16] for r in rows]})
  stamp=datetime.now(timezone.utc).isoformat();master={'values':mr,'read_at':stamp};supp={'values':sr,'read_at':stamp};sales={'sources':sources,'read_at':stamp}
 write(WORK/'source-sept21.json',master);write(WORK/'supplement-articles.json',supp);write(WORK/'owner-store-sales-v2.json',sales)
 def run(path,*args):subprocess.run([sys.executable,'-X','utf8',str(path),*args],cwd=RUNTIME,check=True)
 run(CAT/'catalog.py','--snapshot',str(WORK/'source-sept21.json'),'--previous',str(WORK/'before-refresh.json'),'--photos',str(CAT/'site/photos'),'--output',str(CAT/'site/data.json'),'--report-dir',str(WORK/'catalog-report'))
 stock=read(CAT/'site/data.json');write(OWNER/'stock.json',stock);rows=master['values'];headers={str(v).strip():i for i,v in enumerate(rows[0])}
 def value(row,name):return row[headers[name]] if headers[name]<len(row) else ''
 live=[r for r in rows[1:] if not value(r,'Наименование услуги') and value(r,'Артикул')]
 if len(live)!=sum(p['units'] for p in stock['items']):raise RuntimeError('Остатки не сходятся с исходными экземплярами.')
 write(WORK/'owner-product-reference.json',{'rows':[r[:4] for r in rows],'read_at':stamp})
 write(WORK/'marketing-stock-source.json',{'identity':[rows[0][:4]]+[r[:4] for r in live],'dates':[['Дата прихода']]+[[value(r,'Дата прихода')] for r in live],'read_at':stamp,'source':'Товар_Каратник · Исходники · Дата прихода'})
 for script in ['build_store_sales.py','build_analytics.py']:run(OWNER/script)
 run(CAT/'enrich_attributes.py')
 for script in ['build_marketing.py','build_promotions.py']:run(OWNER/script)
 stock=read(OWNER/'stock.json');prior={(p['art'],p['marka']):p for p in previous['items']}
 if any(prior.get((p['art'],p['marka']),{}).get('photo') and not p.get('photo') for p in stock['items']):raise RuntimeError('Утрачена известная фотография.')
 if read(OWNER/'analytics.json')['stock']!=stock:raise RuntimeError('Аналитика и остатки расходятся.')
 sys.path.insert(0,str(CAT));from catalog import validate_catalog,scan_site
 validate_catalog(stock,len(live));scan_site(CAT/'site')
 if any(not read(OWNER/name) for name in FILES):raise RuntimeError('Пустой результат.')
 shutil.copytree(CAT/'site',REPO/'site',dirs_exist_ok=True);shutil.copy2(REPO/'refresh/catalog-refresh.js',REPO/'site/catalog-refresh.js')
 html=(REPO/'site/index.html').read_text(encoding='utf-8')
 if 'catalog-refresh.js' not in html:html=html.replace('</body>','<script src="catalog-refresh.js" defer></script></body>')
 (REPO/'site/index.html').write_text(html,encoding='utf-8');write(REPO/'refresh-result.json',{'readAt':stamp,'files':FILES})
 write(cache/'stock.json',stock);write(cache/'history'/(stock['generated_at'].replace(':','-')+'.json'),stock)
 for p in sorted((cache/'history').glob('*.json'))[:-40]:p.unlink()
 print('Проверены продажи, остатки, размеры и фотографии. Сырые строки не публикуются.')
def upload(commit=False):
 import requests
 result=read(REPO/'refresh-result.json');r=requests.get(os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']+'&'+urlencode({'audience':BACKEND}),headers={'Authorization':'Bearer '+os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']},timeout=60);r.raise_for_status();token=r.json()['value'];headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
 if commit:
  r=requests.post(BACKEND+'/api/refresh-ingest',headers=headers,json={'readAt':result['readAt']},timeout=90);r.raise_for_status()
 else:
  for name in FILES:
   with (OWNER/name).open('rb') as stream:r=requests.post(BACKEND+'/api/refresh-ingest?'+urlencode({'file':name}),headers=headers,data=stream,timeout=90)
   if not r.ok:raise RuntimeError('Сервер отчёта отклонил '+name+': HTTP '+str(r.status_code))
 print('Версия отчёта активирована.' if commit else 'Версия отчёта подготовлена.')
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--fixtures');parser.add_argument('--stage',action='store_true');parser.add_argument('--commit',action='store_true');args=parser.parse_args()
 try:
  if args.stage:upload()
  elif args.commit:upload(True)
  else:build(args.fixtures)
 except Exception as exc:
  print('ОБНОВЛЕНИЕ ОСТАНОВЛЕНО: '+(str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__));sys.exit(1)
