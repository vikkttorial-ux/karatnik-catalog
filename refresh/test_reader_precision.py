import unittest
from run import Reader

class ReaderPrecision(unittest.TestCase):
 def reader(self):
  reader=Reader.__new__(Reader);reader.options=[]
  header=['Дата','Наименование услуги','Вид','Марка','Артикул','ЮР','Вес ( в гр)','A','B','C','D','E','Цена со скидкой','F','G','ФИО продавца']
  values=[46344,'Продажа изделий','Кольцо','Тест','00120','ЮР-1',1.234567891,0,0,0,0,0,12345.67891,'','','Тест']
  def get(url,params=None):
   if '/values:batchGet' in url:
    reader.options.append(dict(params)['valueRenderOption'])
    return {'valueRanges':[{'values':[[value]]} for value in values]}
   if '/values/' in url:return {'values':[header]}
   return {'sheets':[{'properties':{'title':'Продажи','gridProperties':{'rowCount':2,'columnCount':16}}}]}
  reader.get=get
  return reader,values
 def test_sales_keep_exact_computed_numbers(self):
  reader,expected=self.reader()
  rows=reader.rows('test','Продажи',value_render_option='UNFORMATTED_VALUE')
  self.assertEqual(reader.options,['UNFORMATTED_VALUE'])
  self.assertEqual(rows[1][6],expected[6]);self.assertEqual(rows[1][12],expected[12])
 def test_default_keeps_displayed_article_strings(self):
  reader,_=self.reader();rows=reader.rows('test','Продажи')
  self.assertEqual(reader.options,['FORMATTED_VALUE']);self.assertEqual(rows[1][4],'00120')

if __name__=='__main__':unittest.main()
