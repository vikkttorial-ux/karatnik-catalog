import unittest
from run import valid_sales_header
class SalesSourceTests(unittest.TestCase):
 def test_known_headers_and_final_amount_position(self):
  row=['ДАТА','Наименование услуги','Наименование изделя','Бриллианты','Проба','ЮР','Вес ( в гр)','Цена без скидки','Размер скидки','Кодовое слово','Источник','Цена со скидкой ','Цена со скидкой ','Цена не соответствует','Актуальная цена','ФИО продавца']
  self.assertTrue(valid_sales_header(row))
  row[0]=' +A115620';self.assertTrue(valid_sales_header(row))
  row[12]='Комментарий';self.assertFalse(valid_sales_header(row))
  row[12]='Цена со скидкой';row[5]='Артикул';self.assertFalse(valid_sales_header(row))
if __name__=='__main__':unittest.main()
