"""Hardening checks: session expiry, lockout, host/origin/body guards, idempotent replay order, hashed PINs."""
import unittest, json, threading, urllib.request, urllib.error, http.client, os, tempfile
from http.server import ThreadingHTTPServer
from holdline import store, server, auth
try:
    from tests.test_server import mk
except ImportError:  # running from the tests/ directory
    from test_server import mk

class Clock:
    t = 1000.0
    def __call__(self): return self.t

class Hard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.H)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close()
    def setUp(self):
        self.cid = mk(); auth.reset(); self.clock = Clock(); auth._NOW = self.clock
    def tearDown(self):
        import time; auth._NOW = time.monotonic; server.AUTH_READS = False
    def req(self, method, path, body=None, headers=None, raw=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port)
        h = {"Content-Type": "application/json"}; h.update(headers or {})
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        c.request(method, path, data, h); r = c.getresponse(); b = r.read()
        try: j = json.loads(b)
        except ValueError: j = None
        return r.status, j, dict(r.getheaders())
    def login(self, u, pin):
        s, j, _ = self.req("POST", "/api/login", {"user": u, "pin": pin}); return s, (j or {}).get("token")
    def decide(self, tok, **kw):
        b = {"case_id": self.cid, "decision": "ACCEPT", "reason": "confirm hold", "client_id": "cid-0001"}; b.update(kw)
        return self.req("POST", "/api/decide", b, {"X-Holdline-Token": tok} if tok else {})
    # sessions
    def test_idle_expiry(self):
        _, t = self.login("demo.officer", "1111")
        self.assertEqual(self.req("GET", "/api/me", headers={"X-Holdline-Token": t})[1]["user"], "demo.officer")
        self.clock.t += auth.IDLE_S + 1
        self.assertEqual(self.decide(t)[0], 401)
    def test_activity_extends_but_absolute_cap_holds(self):
        _, t = self.login("demo.officer", "1111")
        for _ in range(int(auth.MAX_S / (auth.IDLE_S - 60)) + 2):
            self.clock.t += auth.IDLE_S - 60
            self.req("GET", "/api/me", headers={"X-Holdline-Token": t})
        self.assertIsNone(self.req("GET", "/api/me", headers={"X-Holdline-Token": t})[1]["user"])
    def test_logout_kills_token(self):
        _, t = self.login("demo.officer", "1111")
        self.req("POST", "/api/logout", {}, {"X-Holdline-Token": t})
        self.assertEqual(self.decide(t)[0], 401)
    # lockout
    def test_lockout_then_auto_unlock(self):
        for _ in range(auth.FREE_TRIES): self.assertEqual(self.login("demo.manager", "0000")[0], 401)
        s, j, h = self.req("POST", "/api/login", {"user": "demo.manager", "pin": "2222"})
        self.assertEqual(s, 429); self.assertIn("Retry-After", h)  # right PIN refused while locked
        self.clock.t += auth.BASE_LOCK_S + 2
        self.assertEqual(self.login("demo.manager", "2222")[0], 200)
    def test_lockout_is_per_user(self):
        for _ in range(auth.FREE_TRIES): self.login("demo.manager", "0000")
        self.assertEqual(self.login("demo.officer", "1111")[0], 200)
    def test_second_signer_pin_guessing_locks(self):
        _, t = self.login("demo.manager", "2222")
        for _ in range(auth.FREE_TRIES):
            self.assertEqual(self.decide(t, decision="REJECT", second_signer="demo.manager2", second_pin="0000", client_id="c-%d" % _)[0], 403)
        s, j, _ = self.decide(t, decision="REJECT", second_signer="demo.manager2", second_pin="3333", client_id="c-final")
        self.assertEqual(s, 429)
        self.assertEqual(self.srv_status(), "OPEN")
    def srv_status(self):
        return server.STATE["db"].execute("SELECT status FROM cases WHERE id=?", (self.cid,)).fetchone()[0]
    # request guards
    def test_bad_host_refused(self):
        self.assertEqual(self.req("GET", "/api/summary", headers={"Host": "evil.example"})[0], 403)
    def test_cross_origin_post_refused(self):
        self.assertEqual(self.req("POST", "/api/login", {"user": "demo.officer", "pin": "1111"}, {"Origin": "http://evil.example"})[0], 403)
    def test_same_origin_post_ok(self):
        self.assertEqual(self.req("POST", "/api/login", {"user": "demo.officer", "pin": "1111"}, {"Origin": f"http://127.0.0.1:{self.port}"})[0], 200)
    def test_non_json_post_refused(self):
        self.assertEqual(self.req("POST", "/api/login", raw=b"user=a", headers={"Content-Type": "text/plain"})[0], 415)
    def test_oversize_body_refused(self):
        self.assertEqual(self.req("POST", "/api/login", raw=b"{" + b" " * 70000 + b"}")[0], 413)
    def test_non_object_json_refused(self):
        self.assertEqual(self.req("POST", "/api/login", raw=b"[1]")[0], 400)
    def test_security_headers_and_no_version(self):
        _, _, h = self.req("GET", "/api/summary")
        self.assertIn("default-src 'self'", h["Content-Security-Policy"]); self.assertEqual(h["X-Content-Type-Options"], "nosniff")
        self.assertEqual(h["Cache-Control"], "no-store"); self.assertNotIn("Python", h.get("Server", ""))
        _, _, h = self.req("GET", "/index.html"); self.assertIn("Content-Security-Policy", h)
    def test_csp_compatible_static(self):
        html = open(os.path.join(server.STATIC, "index.html")).read()
        self.assertNotIn("onclick=", html); self.assertNotIn("<script>", html)
        self.assertNotIn("onclick=", open(os.path.join(server.STATIC, "app.js")).read())
    def test_auth_reads_flag(self):
        server.AUTH_READS = True
        self.assertEqual(self.req("GET", "/api/audit")[0], 401)
        self.assertEqual(self.req("GET", "/api/summary")[0], 200)
        _, t = self.login("demo.officer", "1111")
        self.assertEqual(self.req("GET", "/api/audit", headers={"X-Holdline-Token": t})[0], 200)
    # idempotent replay
    def test_replay_after_case_decided_is_duplicate_not_error(self):
        _, t = self.login("demo.officer", "1111")
        self.assertEqual(self.decide(t)[1]["status"], "ACCEPTED")
        s, j, _ = self.decide(t)
        self.assertEqual((s, j.get("duplicate")), (200, True))
        self.assertEqual(server.STATE["db"].execute("SELECT COUNT(*) FROM audit WHERE client_id='cid-0001'").fetchone()[0], 1)
    def test_client_id_reuse_by_other_actor_refused(self):
        _, t = self.login("demo.officer", "1111"); self.decide(t)
        _, t2 = self.login("demo.manager", "2222")
        s, j, _ = self.decide(t2)
        self.assertEqual(s, 400); self.assertIn("different decision", j["error"])
    def test_different_client_id_on_decided_case_still_refused(self):
        _, t = self.login("demo.officer", "1111"); self.decide(t)
        self.assertEqual(self.decide(t, client_id="cid-0002")[0], 400)
    def test_same_key_different_payload_is_422_not_silent_duplicate(self):
        _, t = self.login("demo.officer", "1111"); self.decide(t)
        self.assertEqual(self.decide(t, reason="a different reason")[0], 422)
        self.assertEqual(self.decide(t, decision="REJECT")[0], 422)
        self.assertEqual(self.decide(t, reason="confirm hold, and more")[0], 422)  # longer reason sharing the same start
        self.assertEqual(self.decide(t)[0], 200)  # the true replay is still fine
    def test_replay_compares_units_and_second_signer(self):
        _, t = self.login("demo.manager", "2222")
        kw = dict(decision="CHANGE", reason="probe ok 4.1C", client_id="chg-00001", second_signer="demo.manager2", second_pin="3333", unit_ids=["U0", "U1"])
        self.assertEqual(self.decide(t, **kw)[0], 200)
        self.assertEqual(self.decide(t, **kw)[1].get("duplicate"), True)
        self.assertEqual(self.decide(t, **{**kw, "unit_ids": ["U0", "U1", "U2"]})[0], 422)   # different units
        self.assertEqual(self.decide(t, **{**kw, "unit_ids": ["U0"]})[0], 422)
        self.assertEqual(self.decide(t, **{**kw, "unit_ids": ["U1", "U0"]})[0], 200)         # same set, other order
        self.assertEqual(self.decide(t, **{**kw, "second_signer": None, "second_pin": None})[0], 422)  # signer dropped
    def test_concurrent_same_key_applies_once(self):
        _, t = self.login("demo.officer", "1111"); out = []
        th = [threading.Thread(target=lambda: out.append(self.decide(t)[0])) for _ in range(20)]
        [x.start() for x in th]; [x.join() for x in th]
        self.assertEqual(out.count(200), 20)
        self.assertEqual(server.STATE["db"].execute("SELECT COUNT(*) FROM audit WHERE client_id='cid-0001'").fetchone()[0], 1)
    def test_bad_client_id_refused(self):
        _, t = self.login("demo.officer", "1111")
        self.assertEqual(self.decide(t, client_id="a b;--")[0], 400)
    # hashed PINs
    def test_hashed_pin_file(self):
        f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        json.dump({"users": {"x.user": {"role": "duty_officer", "name": "X", "pin_hash": auth.hash_pin("8642", iters=1000)}}}, f); f.close()
        os.environ["HOLDLINE_USERS"] = f.name
        try:
            self.assertEqual(self.login("x.user", "8642")[0], 200)
            self.assertEqual(self.login("x.user", "8643")[0], 401)
            self.assertEqual(self.login("demo.officer", "1111")[0], 401)  # demo file not in use
        finally:
            del os.environ["HOLDLINE_USERS"]; os.unlink(f.name)
    def test_no_network_bind_with_demo_pins(self):
        os.environ["HOLDLINE_HOST"] = "0.0.0.0"
        try:
            with self.assertRaises(SystemExit):
                import sys; a = sys.argv; sys.argv = ["s"]
                try: server.main()
                finally: sys.argv = a
        finally: del os.environ["HOLDLINE_HOST"]

class PhoneShell(unittest.TestCase):
    """Phone sheet (90e8b1e) is presentation. The release still has to be confirmed, and an accept still sends no units."""
    @classmethod
    def setUpClass(cls):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        def read(name):
            with open(os.path.join(root, "holdline", "static", name), encoding="utf-8") as f:
                return f.read()
        cls.js, cls.css, cls.sw = read("app.js"), read("phone.css"), read("sw.js")
    def test_one_unit_stays_and_the_peak_is_on_the_queue_row(self):
        self.assertIn('=== 1 ? "stays" : "stay"', self.js)
        self.assertIn("Peak ${", self.js)
    def test_phone_sheet_slide_and_cache(self):
        self.assertIn('class="grabber"', self.js)
        self.assertIn('class="ucards"', self.js)
        self.assertIn('id="slider"', self.js)
        self.assertIn("projected >= 85", self.js)
        self.assertIn("prefers-reduced-motion: reduce", self.css)
        self.assertIn("translateY", self.css)
        self.assertIn("[data-view=case] .case", self.css)
        self.assertIn("calc(14px + env(safe-area-inset-bottom))", self.css)
        self.assertIn('const C = "holdline-v', self.sw)
        accept = self.js.split('if (kind === "ACCEPT")', 1)[1][:180]
        self.assertIn("body.unit_ids = []", accept)
        self.assertIn("body.second_signer = null", accept)
if __name__ == "__main__": unittest.main()

