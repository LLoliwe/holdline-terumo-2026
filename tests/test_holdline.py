import unittest, sqlite3, os
from datetime import datetime, timedelta, date
from holdline import load_config, detect, store, sms, exposure

CFG = load_config()
T0 = datetime(2026, 10, 1, 0, 0)
def series(vals, start=T0):
    return [(start + timedelta(hours=i), v) for i, v in enumerate(vals) if v is not None]

class Detector(unittest.TestCase):
    def test_single_spike_is_not_a_hold(self):
        ev = detect.holdline_events("F", series([4, 4, 7.5, 4, 4]), [], CFG)
        self.assertFalse([e for e in ev if e["hold"]])
    def test_baseline_flags_single_spike(self):
        self.assertEqual(detect.baseline_days(series([4, 7.5, 4]), CFG), {date(2026, 10, 1)})
    def test_two_consecutive_hours_hold(self):
        ev = [e for e in detect.holdline_events("F", series([4, 6.5, 7, 4]), [], CFG) if e["hold"]]
        self.assertEqual(len(ev), 1); self.assertEqual(ev[0]["kind"], "EXCURSION"); self.assertEqual(ev[0]["peak"], 7)
    def test_exactly_six_is_in_range(self):
        self.assertFalse([e for e in detect.holdline_events("F", series([6.0, 6.0, 6.0]), [], CFG) if e["hold"]])
    def test_glitch_values_ignored_not_alarmed(self):
        ev = detect.holdline_events("F", series([4, 99.9, 99.9, 4, -99.0, 0.0, 4]), [], CFG)
        self.assertEqual([e["kind"] for e in ev].count("GLITCH"), 4)
        self.assertFalse([e for e in ev if e["hold"]])
    def test_glitch_inside_hot_run_is_bridged(self):
        ev = detect.holdline_events("F", series([4, 7, 99.9, 7, 4]), [], CFG)
        self.assertTrue(any(e["kind"] == "GLITCH" for e in ev))
        self.assertEqual([e["kind"] for e in ev if e["hold"]], ["EXCURSION"])
    def test_gap_with_unbacked_power_cut_is_presumed_hot(self):
        rs = series([4, 4] + [None] * 5 + [5, 4])
        outs = [(T0 + timedelta(hours=2), T0 + timedelta(hours=6), False)]
        ev = [e for e in detect.holdline_events("F", rs, outs, CFG) if e["hold"]]
        self.assertEqual(ev[0]["kind"], "GAP_PRESUMED")
    def test_gap_with_backup_power_is_unverified_only(self):
        rs = series([4, 4] + [None] * 5 + [5, 4])
        outs = [(T0 + timedelta(hours=2), T0 + timedelta(hours=6), True)]
        ev = detect.holdline_events("F", rs, outs, CFG)
        self.assertEqual([e["kind"] for e in ev], ["UNVERIFIED"]); self.assertFalse(ev[0]["hold"])
    def test_gap_ending_hot_is_presumed(self):
        rs = series([4] + [None] * 4 + [8.0, 4])
        self.assertEqual([e["kind"] for e in detect.holdline_events("F", rs, [], CFG) if e["hold"]], ["GAP_PRESUMED"])
    def test_short_gap_ignored(self):
        self.assertEqual(detect.holdline_events("F", series([4, None, None, 4]), [], CFG), [])

class Sms(unittest.TestCase):
    def test_always_160_or_less(self):
        for n in (0, 1, 3, 40, 500):
            m = sms.hold_sms(dict(facility_id="HSP-023", kind_short="LOGGER GAP", when="24/11 12:29",
                                  why_short="power cut, no backup", unit_ids=[f"U2510-MSA-{i:06d}-RBC" for i in range(n)]))
            self.assertLessEqual(len(m), 160, m); self.assertIn("HOLD", m); self.assertIn(f"{n} held", m)
            m.encode("ascii")

def mkcase(db, n=3):
    ev = dict(facility_id="HSP-1", kind="EXCURSION", start=T0, end=T0 + timedelta(hours=3), peak=9.1, reason="test", hold=True)
    units = [dict(unit_id=f"U{i}", component="RBC", blood_group="O+", expiry_date="2026-11-30") for i in range(n)]
    return store.open_case(db, ev, units, CFG)

class Decisions(unittest.TestCase):
    def setUp(self):
        self.db = store.connect(); self.cid = mkcase(self.db)
    def test_duty_officer_cannot_release(self):
        with self.assertRaises(PermissionError):
            store.decide(self.db, self.cid, "REJECT", "a", "duty_officer", "probe fine", second_signer="b", cfg=CFG)
    def test_release_needs_second_different_signer(self):
        with self.assertRaises(PermissionError):
            store.decide(self.db, self.cid, "REJECT", "m", "qualified_releaser", "probe fine", cfg=CFG)
        with self.assertRaises(PermissionError):
            store.decide(self.db, self.cid, "REJECT", "m", "qualified_releaser", "probe fine", second_signer="m", cfg=CFG)
    def test_reason_required(self):
        with self.assertRaises(ValueError):
            store.decide(self.db, self.cid, "ACCEPT", "a", "duty_officer", "  ", cfg=CFG)
    def test_accept_quarantines_all(self):
        store.decide(self.db, self.cid, "ACCEPT", "a", "duty_officer", "fridge failed, discard", cfg=CFG)
        states = {r[0] for r in self.db.execute("SELECT state FROM case_units")}
        self.assertEqual(states, {"QUARANTINED"})
    def test_change_releases_only_listed(self):
        r = store.decide(self.db, self.cid, "CHANGE", "m", "qualified_releaser", "U0 was in backup fridge",
                         unit_ids=["U0"], second_signer="s", cfg=CFG)
        self.assertEqual(r["released"], ["U0"])
        st = dict(self.db.execute("SELECT unit_id, state FROM case_units").fetchall())
        self.assertEqual(st, {"U0": "RELEASED", "U1": "QUARANTINED", "U2": "QUARANTINED"})
    def test_case_cannot_be_decided_twice(self):
        store.decide(self.db, self.cid, "ACCEPT", "a", "duty_officer", "discard all", cfg=CFG)
        with self.assertRaises(ValueError):
            store.decide(self.db, self.cid, "REJECT", "m", "qualified_releaser", "changed mind", second_signer="s", cfg=CFG)
    def test_offline_retry_is_idempotent(self):
        store.decide(self.db, self.cid, "ACCEPT", "a", "duty_officer", "discard all", client_id="x1", cfg=CFG)
        n = self.db.execute("SELECT COUNT(*) FROM audit").fetchone()[0]
        self.assertEqual(store.audit(self.db, "a", "duty_officer", "DECISION_ACCEPT", self.cid, "dup", client_id="x1"), None)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM audit").fetchone()[0], n)

class Audit(unittest.TestCase):
    def test_chain_valid_and_append_only(self):
        db = store.connect(); cid = mkcase(db)
        store.decide(db, cid, "ACCEPT", "a", "duty_officer", "discard all", cfg=CFG)
        self.assertEqual(store.verify_chain(db), (True, None))
        with self.assertRaises(sqlite3.DatabaseError):
            db.execute("UPDATE audit SET detail='x' WHERE seq=1")
        with self.assertRaises(sqlite3.DatabaseError):
            db.execute("DELETE FROM audit")
    def test_tamper_detected(self):
        db = store.connect(); cid = mkcase(db)
        db.execute("DROP TRIGGER audit_no_update")  # simulate someone with raw file access
        db.execute("UPDATE audit SET detail='nothing happened' WHERE seq=1")
        ok, at = store.verify_chain(db)
        self.assertFalse(ok); self.assertEqual(at, 1)

class Residency(unittest.TestCase):
    def test_unit_moves_with_transfer(self):
        u = [dict(unit_id="U", collection_date="2026-10-01", status_date="2026-10-10", processed_at_id="C", component="RBC")]
        t = [dict(unit_id="U", dispatched_at="2026-10-03 08:00:00", received_at="2026-10-04 09:00:00", to_facility_id="H")]
        self.assertEqual(exposure.residency(u, t)["U"], [("C", date(2026, 10, 1), date(2026, 10, 3)), ("H", date(2026, 10, 4), date(2026, 10, 10))])
    def test_unconfirmed_receipt_uses_dispatch_day(self):
        u = [dict(unit_id="U", collection_date="2026-10-01", status_date="", processed_at_id="C", component="RBC")]
        t = [dict(unit_id="U", dispatched_at="2026-10-03 08:00:00", received_at="", to_facility_id="H")]
        self.assertEqual(exposure.residency(u, t)["U"][1][:2], ("H", date(2026, 10, 3)))

DATA = os.environ.get("HOLDLINE_DATA")

def _u(uid, expiry, fac="H", status_date="2026-10-31"):
    return dict(unit_id=uid, collection_date="2026-09-20", status_date=status_date,
                processed_at_id=fac, component="RBC", blood_group="O+", expiry_date=expiry)

class MultiDayEventCoverage(unittest.TestCase):
    """store.build must hold units resident on ANY day of a multi-day event, not only the
    start day, while keeping the per-day expiry filter and holding each unit once."""
    def _build(self, units, transfers, ev_hours=(22, 30)):
        db = store.connect()
        # hot run from T0+22h for 30h -> EXCURSION spanning 2026-10-01 22:00 .. 2026-10-03 04:00
        temps = {"H": series([4] * 22 + [8.5] * 30 + [4] * 6)}
        n = store.build(db, temps, {}, units, transfers, CFG)
        rows = db.execute("SELECT unit_id FROM case_units ORDER BY unit_id").fetchall()
        return n, [r[0] for r in rows]
    def test_later_day_arrival_is_held(self):
        # U-LATE sits at C until dispatched 10-02, received at H 10-02: resident at H only on
        # days 2-3 of the 3-day event. The old start-day-only lookup missed it.
        units = [_u("U-LATE", "2026-11-30", fac="C")]
        trs = [dict(unit_id="U-LATE", dispatched_at="2026-10-02 08:00:00",
                    received_at="2026-10-02 12:00:00", to_facility_id="H")]
        n, held = self._build(units, trs)
        self.assertEqual(n, 1); self.assertEqual(held, ["U-LATE"])
    def test_expired_before_window_still_excluded(self):
        units = [_u("U-OLD", "2026-09-30")]  # expired before every event day
        n, held = self._build(units, [])
        self.assertEqual(n, 1); self.assertEqual(held, [])
    def test_expiring_mid_window_held_once(self):
        # Resident the whole window, expiry 2026-10-02: valid on days 1-2, expired by day 3.
        # Held once (first valid day), never duplicated.
        units = [_u("U-MID", "2026-10-02")]
        n, held = self._build(units, [])
        self.assertEqual(held, ["U-MID"])
        dup = store.connect()
        n2 = store.build(dup, {"H": series([4] * 22 + [8.5] * 30 + [4] * 6)}, {}, units + [_u("U-MID2", "2026-11-30")], [], CFG)
        self.assertEqual([r[0] for r in dup.execute("SELECT unit_id FROM case_units ORDER BY unit_id")], ["U-MID", "U-MID2"])
    def test_start_day_resident_still_held(self):
        # Regression guard: a plain start-day resident must still be held exactly once.
        units = [_u("U-A", "2026-11-30")]
        n, held = self._build(units, [])
        self.assertEqual(n, 1); self.assertEqual(held, ["U-A"])

@unittest.skipUnless(DATA, "set HOLDLINE_DATA to the starter dataset folder to run the end-to-end check")
class EndToEnd(unittest.TestCase):
    def test_metrics_reproduce(self):
        from holdline import evaluate
        m = evaluate.run(DATA)
        self.assertEqual(m["exposed"], 7112); self.assertEqual(m["exposed_and_transfused"], 2119)
        self.assertGreater(m["holdline"]["precision"], m["baseline"]["precision"])
        self.assertEqual(m["events"]["GLITCH"], 55)

if __name__ == "__main__":
    unittest.main()

class NoUnitEvents(unittest.TestCase):
    def test_event_with_no_units_is_logged_not_queued(self):
        db = store.connect()
        temps = {"H": series([4] * 10 + [8.5] * 4 + [4] * 10)}
        store.build(db, temps, {}, [], [], CFG)
        rows = db.execute("SELECT status FROM cases").fetchall()
        self.assertEqual([r[0] for r in rows], ["NO_UNITS"])
        acts = [r[0] for r in db.execute("SELECT action FROM audit")]
        self.assertEqual(acts, ["EVENT_LOGGED_NO_UNITS"])
        self.assertEqual(db.execute("SELECT COUNT(*) FROM sms_outbox").fetchone()[0], 0)
        with self.assertRaises(Exception):
            store.decide(db, db.execute("SELECT id FROM cases").fetchone()[0], "ACCEPT", "m", "qualified_releaser", "x", cfg=CFG)
        self.assertTrue(store.verify_chain(db)[0])
