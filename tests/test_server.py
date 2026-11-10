"""HTTP-level checks: identity comes from the server session, never from the request body."""
import unittest, json, threading, urllib.request, urllib.error
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer
from holdline import load_config, store, server

def mk():
    cfg = load_config(); db = store.connect()
    ev = dict(facility_id="HSP-1", kind="EXCURSION", start=datetime(2026, 10, 1), end=datetime(2026, 10, 1, 3), peak=9.0, reason="t", hold=True)
    cid = store.open_case(db, ev, [dict(unit_id=f"U{i}", component="RBC", blood_group="O+", expiry_date="2026-12-01") for i in range(3)], cfg)
    server.STATE.update(cfg=cfg, db=db, temps={}, fac={}, cases=1, metrics={}); server.SESSIONS.clear()
    return cid

class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.H)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close()
    def setUp(self):
        self.cid = mk()
    def post(self, path, body, token=None):
        h = {"Content-Type": "application/json"}
        if token: h["X-Holdline-Token"] = token
        req = urllib.request.Request(self.base + path, json.dumps(body).encode(), h)
        try:
            with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
    def login(self, u, pin):
        return self.post("/api/login", {"user": u, "pin": pin})[1].get("token")
    def test_decide_without_session_refused(self):
        code, _ = self.post("/api/decide", {"case_id": self.cid, "decision": "REJECT", "actor": "demo.manager",
                                            "role": "qualified_releaser", "reason": "trust me", "second_signer": "x"})
        self.assertEqual(code, 401)
    def test_wrong_pin_refused(self):
        self.assertIsNone(self.login("demo.manager", "0000"))
    def test_body_role_is_ignored(self):
        t = self.login("demo.officer", "1111")
        code, r = self.post("/api/decide", {"case_id": self.cid, "decision": "REJECT", "role": "qualified_releaser",
                                            "actor": "demo.manager", "reason": "spoofed role", "second_signer": "demo.manager2",
                                            "second_pin": "3333"}, t)
        self.assertEqual(code, 403, r)
    def test_second_signer_pin_checked(self):
        t = self.login("demo.manager", "2222")
        code, _ = self.post("/api/decide", {"case_id": self.cid, "decision": "REJECT", "reason": "probe 4.1C ok",
                                            "second_signer": "demo.manager2", "second_pin": "9999"}, t)
        self.assertEqual(code, 403)
    def test_second_signer_must_be_qualified(self):
        t = self.login("demo.manager", "2222")
        code, _ = self.post("/api/decide", {"case_id": self.cid, "decision": "REJECT", "reason": "probe 4.1C ok",
                                            "second_signer": "demo.officer", "second_pin": "1111"}, t)
        self.assertEqual(code, 403)
    def test_cannot_second_sign_yourself(self):
        t = self.login("demo.manager", "2222")
        code, _ = self.post("/api/decide", {"case_id": self.cid, "decision": "REJECT", "reason": "probe 4.1C ok",
                                            "second_signer": "demo.manager", "second_pin": "2222"}, t)
        self.assertEqual(code, 403)
    def test_valid_release_recorded_with_server_identity(self):
        t = self.login("demo.manager", "2222")
        code, r = self.post("/api/decide", {"case_id": self.cid, "decision": "CHANGE", "reason": "U0 in backup fridge",
                                            "unit_ids": ["U0"], "second_signer": "demo.manager2", "second_pin": "3333",
                                            "actor": "someone.else"}, t)
        self.assertEqual(code, 200, r)
        row = server.STATE["db"].execute("SELECT actor, role FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
        self.assertEqual((row["actor"], row["role"]), ("demo.manager", "qualified_releaser"))
    def test_default_bind_is_localhost(self):
        import inspect
        self.assertIn('"127.0.0.1"', inspect.getsource(server.main))
    def test_officer_accept_with_release_selection_keeps_every_unit_quarantined(self):
        t = self.login("demo.officer", "1111")
        code, r = self.post("/api/decide", {"case_id": self.cid, "decision": "ACCEPT",
                           "reason": "Synthetic hold confirmed", "unit_ids": ["U0"],
                           "client_id": "officer-accept-ticked"}, t)
        self.assertEqual(code, 200, r)
        self.assertEqual(r["released"], [])
        self.assertEqual({row[0] for row in server.STATE["db"].execute("SELECT state FROM case_units")}, {"QUARANTINED"})

if __name__ == "__main__":
    unittest.main()
