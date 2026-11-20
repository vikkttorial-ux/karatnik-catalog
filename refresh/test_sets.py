import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'builders'))
sys.path.insert(0,str(Path(__file__).parent))
from build_sets import build_sets
class SetSource(unittest.TestCase):
 def setUp(self):
  self.master=[['Марка/бренд','Код','unused','Артикул','Наименование изделя'],['B','','','X','Кольцо'],['B','','','Y','Серьги']]
  self.rows=[['Комплект','Бренд','Артикул','Подтверждено','Комментарий'],['S','B','X',True,'private note never published'],['S','B','Y',True,'']]
 def test_exact_confirmed_pair(self):
  result=build_sets(self.rows,self.master,{'items':[]})
  self.assertEqual(len(result['sets']),1)
  self.assertNotIn('private',str(result));self.assertNotIn('Комментарий',str(result))
 def test_pending_not_published(self):
  for row in self.rows[1:]:row[3]=False
  self.assertEqual(build_sets(self.rows,self.master,{'items':[]})['sets'],[])
 def test_invalid_brand_and_incomplete_block(self):
  self.rows[2][1]='OTHER'
  with self.assertRaises(RuntimeError):build_sets(self.rows,self.master,{'items':[]})
  self.rows[2][1]='B';self.rows[2][3]=False
  with self.assertRaises(RuntimeError):build_sets(self.rows,self.master,{'items':[]})
if __name__=='__main__':unittest.main()
