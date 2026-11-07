import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'builders'))
from verified_labels import source_signature,stock_signature

class VerifiedLabelsTests(unittest.TestCase):
    def test_receipt_display_formats_match(self):
        header=['Артикул','Марка/брендК','Дата прихода','Ожидаемая дата поступления','Остаток гр','Дата продажи','Наименование услуги']
        a=[header,['001','Бренд','2026-10-01','',1,'','']]
        b=[header,['001','Бренд','01.10.2026','','1,0','','']]
        self.assertEqual(source_signature(a),source_signature(b))
        b[1][2]='02.10.2026'
        self.assertNotEqual(source_signature(a),source_signature(b))
    def test_stock_size_changes_invalidate_labels(self):
        a={'items':[{'art':'001','marka':'Бренд','units':1,'sizes':[{'s':'17','q':1}]}]}
        b={'items':[{'art':'001','marka':'Бренд','units':1,'sizes':[{'s':'18','q':1}]}]}
        self.assertNotEqual(stock_signature(a),stock_signature(b))
