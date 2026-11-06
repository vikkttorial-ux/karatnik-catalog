import unittest,tempfile
from pathlib import Path
from run import valid_sales_header,preserve_photo_names
class SalesSourceTests(unittest.TestCase):
 def test_known_headers_and_final_amount_position(self):
  row=['ДАТА','Наименование услуги','Наименование изделя','Бриллианты','Проба','ЮР','Вес ( в гр)','Цена без скидки','Размер скидки','Кодовое слово','Источник','Цена со скидкой ','Цена со скидкой ','Цена не соответствует','Актуальная цена','ФИО продавца']
  self.assertTrue(valid_sales_header(row))
  row[0]=' +A115620';self.assertTrue(valid_sales_header(row))
  row[12]='Комментарий';self.assertFalse(valid_sales_header(row))
  row[12]='Цена со скидкой';row[5]='Артикул';self.assertFalse(valid_sales_header(row))
 def test_existing_image_with_different_filename_case_survives(self):
  with tempfile.TemporaryDirectory() as d:
   site=Path(d);(site/'photos').mkdir();(site/'photos/EXAMPLE.webp').write_bytes(b'known-approved-photo')
   preserve_photo_names(site,{'items':[{'photo':'photos/example.webp'}]})
   self.assertEqual((site/'photos/example.webp').read_bytes(),b'known-approved-photo')
if __name__=='__main__':unittest.main()
