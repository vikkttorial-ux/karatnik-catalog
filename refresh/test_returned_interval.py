import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'builders'))
sys.path.insert(0,str(Path(__file__).parent))
from build_promotions import returned_after_history
class ReturnedIntervals(unittest.TestCase):
 def test_sale_before_late_positive_snapshot(self):
  k='TEST|brand';positive={k:{'units':1}}
  history=[('2026-09-24',positive),('2026-10-22',positive),('2026-10-25',{}),('2026-11-17',positive)]
  self.assertTrue(returned_after_history(history,k,['2026-10-21'],['2026-11-16'],'2026-10-22'))
  self.assertFalse(returned_after_history(history,k,[],['2026-11-16'],'2026-10-22'))
  self.assertFalse(returned_after_history(history,k,['2026-10-21'],[],'2026-10-22'))
  self.assertFalse(returned_after_history([history[0],history[-1]],k,['2026-10-21'],['2026-11-16'],'2026-10-22'))
  self.assertFalse(returned_after_history(history,k,['2026-10-21'],['2026-11-16'],'2026-11-18'))
if __name__=='__main__':unittest.main()
