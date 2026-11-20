"""Read confirmed exact set members; no visual guesses or inventory changes."""
import re
from collections import defaultdict
def build_sets(rows,master,stock):
 from catalog import canonical_article,configure_article_spellings
 configure_article_spellings(master)
 required=['Комплект','Бренд','Артикул','Подтверждено','Комментарий']
 if not rows or rows[0]!=required:raise RuntimeError('Изменились заголовки листа Комплекты')
 h={str(v).strip():i for i,v in enumerate(master[0]) if v is not None}
 def value(row,name):
  i=h.get(name);return str(row[i] or '').strip() if i is not None and i<len(row) else ''
 known={}
 for row in master[1:]:
  art=value(row,'Артикул');brand=value(row,'Марка/бренд') or value(row,'Марка/брендК')
  if art and brand:
   a=canonical_article(art,brand);known[a+'|'+brand.replace(' ','').casefold()]={'art':a,'brand':brand,'tip':value(row,'Наименование изделя')}
 for item in stock['items']:known[item['art']+'|'+item['marka'].replace(' ','').casefold()]={'art':item['art'],'brand':item['marka'],'tip':item['tip']}
 groups=defaultdict(list)
 for number,row in enumerate(rows[1:],2):
  row=list(row)+['']*5
  if str(row[3]).strip().casefold() not in ('true','истина','да','1'):continue
  ident,brand,art=(str(row[i] or '').strip() for i in (0,1,2))
  if not re.fullmatch(r'[-A-Za-z0-9_]{1,80}',ident):raise RuntimeError('Проверьте номер комплекта в строке '+str(number))
  key=canonical_article(art,brand)+'|'+brand.replace(' ','').casefold()
  if key not in known:raise RuntimeError('Участник комплекта не найден по артикулу и бренду: строка '+str(number))
  member=known[key]
  if member in groups[ident]:raise RuntimeError('Повтор участника в комплекте '+ident)
  groups[ident].append(member)
 result=[]
 for ident,members in sorted(groups.items()):
  if not 2<=len(members)<=12:raise RuntimeError('В подтверждённом комплекте '+ident+' должно быть от2 до12 участников')
  result.append({'id':ident,'members':members})
 return {'version':1,'sets':result}
