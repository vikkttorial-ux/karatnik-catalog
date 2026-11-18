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

class WhitespaceModels(unittest.TestCase):
 def setUp(self):
  catalog.configure_article_spellings([])
 def tearDown(self):
  catalog.configure_article_spellings([])
 def test_spaces_and_nonbreaking_spaces_share_model_evidence(self):
  a='ЗК2027/Вбр'
  b='ЗК2027 \u00a0/ Вбр'
  self.assertEqual(catalog.canonical_article(a,'Каратник'),catalog.canonical_article(b,'Каратник'))
  self.assertEqual(key(a,'Каратник'),key(b,'Каратник'))
  result=snapshot_products([{'art':a,'marka':'Каратник','units':1,'sizes':[{'s':'17','q':1}]},
                           {'art':b,'marka':'Каратник','units':2,'sizes':[{'s':'18','q':2}]}])
  self.assertEqual(len(result),1)
  self.assertEqual(result[key(a,'Каратник')]['units'],3)
  self.assertEqual(result[key(a,'Каратник')]['sizes'],[{'s':'17','q':1},{'s':'18','q':2}])
 def test_display_and_existing_asset_identity_survive_alias_lookup(self):
  catalog.configure_article_spellings([[],['Тест','','','FBLK 291']])
  self.assertEqual(catalog.canonical_article('F B L K291','Тест'),'FBLK 291')
  self.assertEqual(catalog.photo_filename(catalog.canonical_article('FBLK291','Тест')),catalog.photo_filename('FBLK 291'))
 def test_punctuation_leading_zeros_and_brands_are_distinct(self):
  for a in ['ЗК2027-Вбр','ЗК02027/Вбр','ЗК2027/Вбр.']:
   self.assertNotEqual(key(a,'Каратник'),key('ЗК2027/Вбр','Каратник'))
  self.assertNotEqual(key('ЗК2027/Вбр','Другой'),key('ЗК2027 /Вбр','Каратник'))

class ConfirmedAliases(unittest.TestCase):
 def setUp(self):
  catalog.configure_article_spellings([])
 def tearDown(self):
  catalog.configure_article_spellings([])
 def test_tennis_bracelet_is_one_model_for_sizes_and_gold_colors(self):
  arts=['БрЛТннс01_17см_бцФ_з585','БрЛТннс01_18см_бцФ_з585','БрЛТннс01_18см_бцФ_бз585']
  for a in arts:self.assertEqual(catalog.canonical_article(a,'ГолденГлоб'),'БрЛТннс01')
  result=snapshot_products([{'art':a,'marka':'ГолденГлоб','units':1,'sizes':[{'s':'17' if i==0 else '18','q':1}]} for i,a in enumerate(arts)])
  self.assertEqual(result['БрЛТннс01|голденглоб']['units'],3)
  self.assertEqual(len(result),1)
 def test_karatov_suffix_is_not_a_new_model(self):
  self.assertEqual(key('ЦНН20517035-РА','Каратов'),key('ЦНН20517035','Каратов'))
  self.assertNotEqual(key('ЦНН20517035-РА','Другой'),key('ЦНН20517035','Другой'))
  self.assertNotEqual(key('ЦНН20517035-РА2','Каратов'),key('ЦНН20517035','Каратов'))

if __name__=='__main__':unittest.main()

