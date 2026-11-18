import importlib.util
from pathlib import Path
from datetime import date, timedelta
import sys, unittest

BASE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('catalog',BASE/'catalog.py')
catalog=importlib.util.module_from_spec(spec);sys.modules['catalog']=catalog;spec.loader.exec_module(catalog)
sys.path.insert(0,str(BASE/'builders'))
from build_promotions import is_new_arrival, latest_confirmed_receipt, snapshot_products, key

class ProductLabels(unittest.TestCase):
 def test_rolling_windows_include_last_month_and_exclude_old_boundary(self):
  today=date(2026,11,18)
  self.assertTrue(is_new_arrival((today-timedelta(days=59)).isoformat(),today,True))
  self.assertFalse(is_new_arrival((today-timedelta(days=60)).isoformat(),today,True))
  self.assertTrue(is_new_arrival('2026-10-20',today,True,days=30))
  self.assertFalse(is_new_arrival('2026-10-19',today,True,days=30))
  self.assertFalse(is_new_arrival('2026-11-19',today,True,days=30))
 def test_latest_receipt_excludes_unconfirmed_future_and_sold_rows(self):
  rows=[['Дата прихода','Остаток гр','Дата продажи','Наименование услуги'],
        ['09.11.2026','1','',''],['16.11.2026','','',''],
        ['20.11.2026','1','',''],['17.11.2026','0','18.11.2026','Продажа']]
  self.assertEqual(latest_confirmed_receipt(rows,date(2026,11,18)),'2026-11-09')
 def test_alias_preserves_existing_model_identity_and_sizes(self):
  a='КольцоКЛ-63/17,0/бцФ/з585'
  self.assertEqual(catalog.canonical_article(a,'ГолденГлоб'),'КЛ-63')
  self.assertEqual(key(a,'ГолденГлоб'),key('КольцоКЛ-63','ГолденГлоб'))
  result=snapshot_products([{'art':'КольцоКЛ-63','marka':'ГолденГлоб','units':2,'sizes':[{'s':'17','q':2}]},
                           {'art':a,'marka':'ГолденГлоб','units':1,'sizes':[{'s':'17','q':1}]}])
  self.assertEqual(result['КЛ-63|голденглоб'],{'units':3,'sizes':[{'s':'17','q':3}]})
  self.assertFalse(is_new_arrival('2026-02-17',date(2026,11,18),True,days=30))
 def test_alias_does_not_merge_other_brands_or_unconfirmed_variants(self):
  self.assertEqual(catalog.canonical_article('КольцоКЛ-63','Другой бренд'),'КольцоКЛ-63')
  a='КольцоКЛ-63/17,0/бцФ/бз585'
  self.assertEqual(catalog.canonical_article(a,'ГолденГлоб'),a)

if __name__=='__main__':unittest.main()
