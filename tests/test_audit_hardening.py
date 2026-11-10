"""Malformed decisions are refused before anything is written, and the audit count always equals the units changed."""
import unittest
from holdline import store, server
try:
    from tests.test_server import mk
except ImportError:
    from test_server import mk

R = "probe reason long enough"

class MalformedDecisions(unittest.TestCase):
    def setUp(self):
        self.cid = mk(); self.db = server.STATE["db"]; self.cfg = server.STATE["cfg"]
    def decide(self, **kw):
        a = dict(case_id=self.cid, decision="CHANGE", actor="demo.manager", role="qualified_releaser", reason=R,
                 unit_ids=["U0"], second_signer="demo.manager2", cfg=self.cfg)
        a.update(kw); return store.decide(self.db, **a)
    def unchanged(self):
        st = self.db.execute("SELECT status FROM cases WHERE id=?", (self.cid,)).fetchone()["status"]
        n = self.db.execute("SELECT COUNT(*) FROM audit WHERE action LIKE 'DECISION_%'").fetchone()[0]
        self.assertEqual((st, n), ("OPEN", 0))
    def test_duplicate_unit_ids_counted_once(self):
        r = self.decide(unit_ids=["U0", "U0"])
        self.assertEqual(r["released"], ["U0"])
        d = self.db.execute("SELECT detail FROM audit WHERE action='DECISION_CHANGE'").fetchone()["detail"]
        self.assertIn("Released 1, quarantined 2.", d)
    def test_non_text_reason_refused(self):
        with self.assertRaises(ValueError): self.decide(decision="ACCEPT", reason=123456789, unit_ids=None, second_signer=None)
        self.unchanged()
    def test_missing_case_id_refused(self):
        with self.assertRaises(ValueError): self.decide(case_id=None)
        self.unchanged()
    def test_unit_ids_must_be_a_list(self):
        for bad in ("U0", [1, 2], {"U0": 1}):
            with self.assertRaises(ValueError): self.decide(unit_ids=bad)
        self.unchanged()
    def test_second_signer_must_be_text(self):
        with self.assertRaises(ValueError): self.decide(second_signer=["demo.manager2"])
        self.unchanged()

if __name__ == "__main__":
    unittest.main()
