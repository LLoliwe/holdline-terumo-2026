"""Language packs, country config as a setting, store verification, exports and the per-case explanation."""
import unittest, json, os, sqlite3, tempfile, threading, urllib.request, urllib.error, csv, io
from http.server import ThreadingHTTPServer
from holdline import load_config, store, server, sms, i18n, verify, export
try:
    from tests.test_server import mk
except ImportError:
    from test_server import mk

UNITS = [f"U2610-NKR-0{i:05d}-RBC" for i in range(30)]

class Language(unittest.TestCase):
    def test_every_pack_has_every_key(self):
        for l in i18n.available():
            i18n.pack(l)
    def test_sms_fits_in_every_language(self):
        for l in i18n.available():
            for n in (1, 2, 5, 30):
                for kind, peak in (("EXCURSION", 9.4), ("GAP_PRESUMED", None)):
                    k, w = sms.kind_and_why(kind, peak, l)
                    m = sms.hold_sms(dict(facility_id="HSP-007", kind_short=k, when="22/10 23:00", why_short=w, unit_ids=UNITS[:n]), 160, l)
                    self.assertLessEqual(len(m), 160); m.encode("ascii")
    def test_kiswahili_text_used_when_configured(self):
        k, w = sms.kind_and_why("EXCURSION", 7.8, "sw")
        m = sms.hold_sms(dict(facility_id="HSP-007", kind_short=k, when="22/10 23:00", why_short=w, unit_ids=UNITS[:2]), 160, "sw")
        self.assertTrue(m.startswith("ZUIA HSP-007")); self.assertIn("Usitoe", m)
    def test_english_text_unchanged(self):
        k, w = sms.kind_and_why("EXCURSION", 7.8, "en")
        m = sms.hold_sms(dict(facility_id="HSP-007", kind_short=k, when="22/10 23:00", why_short=w, unit_ids=UNITS[:2]), 160, "en")
        self.assertTrue(m.startswith("HOLD HSP-007 EXCURSION 22/10 23:00. peak 7.8C. 2 held: "))
    def test_unknown_or_unsafe_language_refused(self):
        for bad in ("xx", "../en", "EN", 3):
            with self.assertRaises(ValueError): i18n.pack(bad)

class CountryConfig(unittest.TestCase):
    def tearDown(self): os.environ.pop("HOLDLINE_CONFIG", None)
    def test_config_chosen_by_setting(self):
        os.environ["HOLDLINE_CONFIG"] = "kenya-sw"
        self.assertEqual(load_config()["language"], "sw")
        os.environ.pop("HOLDLINE_CONFIG")
        self.assertEqual(load_config()["language"], "en")
    def test_bad_config_name_refused(self):
        for bad in ("../x", "Kenya", "a/b"):
            with self.assertRaises(ValueError): load_config(bad)

class Verify(unittest.TestCase):
    def make(self):
        d = tempfile.mkdtemp(); p = os.path.join(d, "s.db"); db = store.connect(p); cfg = load_config()
        from datetime import datetime
        ev = dict(facility_id="HSP-1", kind="EXCURSION", start=datetime(2026, 10, 1), end=datetime(2026, 10, 1, 3), peak=9.0, reason="t", hold=True)
        cid = store.open_case(db, ev, [dict(unit_id=f"U{i}", component="RBC", blood_group="O+", expiry_date="2026-12-01") for i in range(3)], cfg)
        store.decide(db, cid, "ACCEPT", "demo.officer", "duty_officer", "fridge probe confirmed warm")
        db.close(); return p, cid
    def test_intact(self):
        p, _ = self.make(); code, msg = verify.check(p)
        self.assertEqual(code, 0); self.assertIn("INTACT", msg)
    def test_edit_around_triggers_is_found(self):
        p, _ = self.make(); db = sqlite3.connect(p)
        db.execute("DROP TRIGGER audit_no_update"); db.execute("UPDATE audit SET detail='edited' WHERE seq=2"); db.commit(); db.close()
        code, msg = verify.check(p); self.assertEqual(code, 1); self.assertIn("row 2", msg)
    def test_check_is_read_only(self):
        p, _ = self.make(); before = open(p, "rb").read(); verify.check(p); self.assertEqual(before, open(p, "rb").read())
    def test_missing_or_foreign_file(self):
        self.assertEqual(verify.check("/nonexistent/x.db")[0], 2)
        f = tempfile.NamedTemporaryFile(delete=False, suffix=".db"); f.write(b"not sqlite"); f.close()
        self.assertEqual(verify.check(f.name)[0], 2)

class Export(unittest.TestCase):
    def setUp(self):
        self.cid = mk(); self.db = server.STATE["db"]
        store.decide(self.db, self.cid, "CHANGE", "demo.manager", "qualified_releaser", "probe read 4.1C, units fine",
                     ["U0"], second_signer="demo.manager2", cfg=server.STATE["cfg"])
    def test_csv_round_trip_and_formula_guard(self):
        store.audit(self.db, "=HYPERLINK(1)", "system", "NOTE", self.cid, "-2+3"); self.db.commit()
        rows = list(csv.DictReader(io.StringIO(export.audit_csv(self.db))))
        n = self.db.execute("SELECT COUNT(*) FROM audit").fetchone()[0]
        self.assertEqual(len(rows), n)
        self.assertTrue(rows[-1]["actor"].startswith("'=")); self.assertTrue(rows[-1]["detail"].startswith("'-"))
    def test_fhir_bundle_shape(self):
        b = export.fhir_bundle(self.db)
        self.assertEqual((b["resourceType"], b["type"]), ("Bundle", "collection"))
        di = [e["resource"] for e in b["entry"] if e["resource"]["resourceType"] == "DetectedIssue"]
        ae = [e["resource"] for e in b["entry"] if e["resource"]["resourceType"] == "AuditEvent"]
        self.assertEqual(len(di), 1); self.assertEqual(di[0]["status"], "final")
        self.assertEqual({i["identifier"]["value"]: i["display"] for i in di[0]["implicated"]},
                         {"U0": "RELEASED", "U1": "QUARANTINED", "U2": "QUARANTINED"})
        self.assertEqual(di[0]["mitigation"][0]["author"]["display"], "demo.manager")
        self.assertEqual(len(ae), self.db.execute("SELECT COUNT(*) FROM audit").fetchone()[0])
        json.dumps(b)

class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.H); cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown(); cls.srv.server_close()
    def setUp(self): self.cid = mk()
    def get(self, path, token=None):
        r = urllib.request.Request(self.base + path, headers={"X-Holdline-Token": token} if token else {})
        try:
            with urllib.request.urlopen(r) as resp: return resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e: return e.code, e.headers, e.read()
    def login(self):
        r = urllib.request.Request(self.base + "/api/login", json.dumps({"user": "demo.officer", "pin": "1111"}).encode(), {"Content-Type": "application/json"})
        return json.load(urllib.request.urlopen(r))["token"]
    def test_exports_need_sign_in(self):
        for p in ("/api/export/audit.csv", "/api/export/fhir.json"):
            self.assertEqual(self.get(p)[0], 401)
    def test_exports_when_signed_in(self):
        t = self.login()
        code, h, body = self.get("/api/export/audit.csv", t)
        self.assertEqual(code, 200); self.assertIn("text/csv", h["Content-Type"]); self.assertTrue(body.startswith(b"seq,ts,actor"))
        code, _, body = self.get("/api/export/fhir.json", t)
        self.assertEqual(code, 200); self.assertEqual(json.loads(body)["resourceType"], "Bundle")
    def test_case_carries_explanation(self):
        code, _, body = self.get(f"/api/case/{self.cid}")
        ex = json.loads(body)["explain"]
        self.assertEqual(ex["evidence"], "measured"); self.assertEqual(ex["limit_c"], 6.0)
        self.assertIn("consecutive hourly readings", ex["rule"]); self.assertIn("qualified", ex["decision_needed"])

if __name__ == "__main__":
    unittest.main()
