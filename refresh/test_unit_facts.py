"""Verify unit facts without ever projecting procurement or sales amounts."""
import importlib.util,json,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('unit_catalog',HERE/'catalog.py')
catalog=importlib.util.module_from_spec(spec);spec.loader.exec_module(catalog)
CONFIG=json.loads((HERE/'catalog-config.json').read_text(encoding='utf8'))
def source(*entries):
 header=list(CONFIG['headers'].values());rows=[header]
 for n,entry in enumerate(entries):
  values={'art':'QA-001','code':'ЮР-000'+str(n),'tip':'Кольцо','proba':'585','size':'17','stock':'Ленинградка','naim':'Кольцо','weight':'1,23'}
  values.update(entry);rows.append([values.get(k,'') for k in CONFIG['headers']])
 return rows
class UnitFactsTests(unittest.TestCase):
 def test_unit_identity_and_exact_prc(self):
  data,report=catalog.analyze(source({'code':'ЮР-1','prc':'10 000,50'},{'code':'ЮР-2','stock':'Гостиный двор','size':'18','weight':'2.34','prc':'20000'}),CONFIG)
  entries={u['code']:(stock,u) for stock,units in data['items'][0]['stock_codes'].items() for u in units}
  self.assertEqual(entries['ЮР-1'],('Ленинградская 33',{'code':'ЮР-1','size':'17','grams':1.23,'prc':10000.5}))
  self.assertEqual(entries['ЮР-2'][1]['grams'],2.34)
  catalog.validate_catalog(data,report['inventory_rows'])
 def test_no_substitute_for_missing_prc(self):
  rows=source({});rows[0]+=['РРЦ, ₽','Цена закупки, ₽','Цена со скидкой'];rows[1]+=['23456789','34567890','45678901']
  data,_=catalog.analyze(rows,CONFIG);entry=data['items'][0]['stock_codes']['Ленинградская 33'][0]
  self.assertNotIn('prc',entry)
  encoded=json.dumps(data)
  for amount in ['23456789','34567890','45678901']:self.assertNotIn(amount,encoded)
 def test_missing_and_invalid_values(self):
  data,_=catalog.analyze(source({'weight':'#N/A','prc':'#VALUE!'}),CONFIG)
  entry=data['items'][0]['stock_codes']['Ленинградская 33'][0];self.assertNotIn('grams',entry);self.assertNotIn('prc',entry)
  entry['prc']=-1
  with self.assertRaises(catalog.BuildError):catalog.validate_catalog(data,1)
