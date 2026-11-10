"""Durable human decisions and the hold-only ACCEPT boundary."""
import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from holdline import server, store
from tests.test_holdline import CFG, mkcase, series, _u


class AcceptBoundary(unittest.TestCase):
    def test_accept_never_releases_even_with_ticked_units(self):
        for role in ("duty_officer", "qualified_releaser"):
            with self.subTest(role=role):
                db = store.connect()
                try:
                    cid = mkcase(db)
                    result = store.decide(db, cid, "ACCEPT", "reviewer", role,
                                          "Synthetic hold confirmed", unit_ids=["U0"],
                                          client_id="accept-with-ticks", cfg=CFG)
                    self.assertEqual(result["released"], [])
                    self.assertEqual({r[0] for r in db.execute("SELECT state FROM case_units")},
                                     {"QUARANTINED"})
                    retry = store.decide(db, cid, "ACCEPT", "reviewer", role,
                                         "Synthetic hold confirmed", unit_ids=["U0"],
                                         client_id="accept-with-ticks", cfg=CFG)
                    self.assertTrue(retry["duplicate"])
                    self.assertEqual(store.verify_chain(db), (True, None))
                finally:
                    db.close()


class Restart(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.old_state = server.STATE.copy()
        self.addCleanup(self.restore)
        self.patchers = [
            patch.dict(os.environ, {}, clear=True),
            patch.object(server.data, "temperature_logs", return_value={"H": series([4, 8, 8, 4])}),
            patch.object(server.data, "outages", return_value={}),
            patch.object(server.data, "units", return_value=[_u("U0", "2026-11-30")]),
            patch.object(server.data, "transfers", return_value=[]),
            patch.object(server.data, "facilities", return_value={}),
            patch.object(server.evaluate, "run", return_value={}),
        ]
        for p in self.patchers:
            p.start()
            self.addCleanup(p.stop)

    def restore(self):
        db = server.STATE.get("db")
        if db is not self.old_state.get("db") and db:
            db.close()
        server.STATE.clear()
        server.STATE.update(self.old_state)

    def start(self):
        server.setup(self.root, date(2026, 10, 1))
        return server.STATE["db"]

    def test_default_restart_preserves_decision_audit_and_retry(self):
        db = self.start()
        cid = db.execute("SELECT id FROM cases").fetchone()[0]
        args = (cid, "ACCEPT", "demo.officer", "duty_officer", "Synthetic restart check")
        store.decide(db, *args, client_id="restart-1", cfg=CFG)
        audit_before = [tuple(r) for r in db.execute("SELECT * FROM audit ORDER BY seq")]
        sms_before = [tuple(r) for r in db.execute("SELECT * FROM sms_outbox")]
        db.close()
        db = self.start()
        self.assertEqual(db.execute("SELECT status FROM cases WHERE id=?", (cid,)).fetchone()[0], "ACCEPTED")
        self.assertEqual([tuple(r) for r in db.execute("SELECT * FROM audit ORDER BY seq")], audit_before)
        self.assertEqual([tuple(r) for r in db.execute("SELECT * FROM sms_outbox")], sms_before)
        self.assertTrue(store.decide(db, *args, client_id="restart-1", cfg=CFG)["duplicate"])
        self.assertEqual(store.verify_chain(db), (True, None))

    def test_explicit_memory_demo_still_resets(self):
        os.environ["HOLDLINE_DB"] = ":memory:"
        db = self.start()
        cid = db.execute("SELECT id FROM cases").fetchone()[0]
        store.decide(db, cid, "ACCEPT", "demo.officer", "duty_officer", "Synthetic reset check", cfg=CFG)
        db.close()
        db = self.start()
        self.assertEqual(db.execute("SELECT status FROM cases WHERE id=?", (cid,)).fetchone()[0], "OPEN")


if __name__ == "__main__":
    unittest.main()
