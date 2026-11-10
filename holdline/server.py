"""HOLDLINE demo server. Standard library only.

python -m holdline.server DATA_DIR [--port 8080] [--since 2026-10-01]
"""
import sys, os, json, threading, secrets, hmac
from datetime import date, datetime, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from . import load_config, data, store, evaluate

STATIC = os.path.join(os.path.dirname(__file__), "static")
LOCK = threading.Lock()
STATE = {}
SESSIONS = {}  # token -> username. In memory: a restart signs everyone out.

def users():
    with open(os.path.join(os.path.dirname(__file__), "config", "demo_users.json")) as f:
        return json.load(f)["users"]

def check_pin(username, pin):
    u = users().get(username or "")
    return u if u and hmac.compare_digest(str(pin or ""), u["pin"]) else None

def setup(path, since):
    cfg = load_config()
    temps = data.temperature_logs(path); outs = data.outages(path)
    units = data.units(path); trs = data.transfers(path)
    db = store.connect(os.environ.get("HOLDLINE_DB", ":memory:"))
    n = store.build(db, temps, outs, units, trs, cfg, since=since)
    STATE.update(cfg=cfg, db=db, temps=temps, fac=data.facilities(path), cases=n,
                 metrics=evaluate.run(path))
    print(f"HOLDLINE ready: {n} hold cases since {since}", flush=True)

def readings_around(fid, start, hours=24):
    s = datetime.fromisoformat(start)
    lo, hi = s - timedelta(hours=hours), s + timedelta(hours=hours)
    return [(t.strftime("%Y-%m-%d %H:%M"), v) for t, v in STATE["temps"].get(fid, []) if lo <= t <= hi]

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=STATIC, **k)
    def log_message(self, *a):
        pass
    def _json(self, obj, code=200):
        b = json.dumps(obj, default=str).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query); db = STATE["db"]
        if u.path == "/api/summary":
            r = {s: n for s, n in db.execute("SELECT status, COUNT(*) FROM cases GROUP BY status")}
            held = db.execute("SELECT COUNT(*) FROM case_units cu JOIN cases c ON c.id=cu.case_id WHERE c.status='OPEN'").fetchone()[0]
            ok, bad = store.verify_chain(db)
            return self._json(dict(cases=r, units_on_hold=held, audit_ok=ok, audit_broken_at=bad, metrics=STATE["metrics"]))
        if u.path == "/api/cases":
            st = q.get("status", ["OPEN"])[0]
            rows = db.execute("""SELECT c.*, COUNT(cu.unit_id) n FROM cases c LEFT JOIN case_units cu ON cu.case_id=c.id
                                 WHERE c.status=? GROUP BY c.id ORDER BY c.start DESC LIMIT 200""", (st,)).fetchall()
            return self._json([dict(r) | {"facility_name": STATE["fac"].get(r["facility_id"], {}).get("name")} for r in rows])
        if u.path.startswith("/api/case/"):
            cid = u.path.split("/")[-1]
            c = db.execute("SELECT * FROM cases WHERE id=?", (cid,)).fetchone()
            if not c: return self._json({"error": "not found"}, 404)
            f = STATE["fac"].get(c["facility_id"], {})
            return self._json(dict(case=dict(c), facility=f,
                units=[dict(r) for r in db.execute("SELECT * FROM case_units WHERE case_id=?", (cid,))],
                readings=readings_around(c["facility_id"], c["start"]),
                audit=[dict(r) for r in db.execute("SELECT * FROM audit WHERE case_id=? ORDER BY seq", (cid,))],
                sms=[dict(r) for r in db.execute("SELECT * FROM sms_outbox WHERE case_id=?", (cid,))]))
        if u.path == "/api/audit":
            return self._json([dict(r) for r in db.execute("SELECT * FROM audit ORDER BY seq DESC LIMIT 100")])
        if u.path == "/api/me":
            name = SESSIONS.get(self.headers.get("X-Holdline-Token", ""))
            return self._json({"user": name, "role": users()[name]["role"]} if name else {"user": None})
        if u.path == "/api/users":
            return self._json([{"user": k, "name": v["name"], "role": v["role"]} for k, v in users().items()])
        if u.path == "/healthz":
            return self._json({"ok": True})
        return super().do_GET()
    def do_POST(self):
        u = urlparse(self.path)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except ValueError:
            return self._json({"error": "bad JSON"}, 400)
        if u.path == "/api/login":
            usr = check_pin(body.get("user"), body.get("pin"))
            if not usr:
                return self._json({"error": "wrong user or PIN"}, 401)
            tok = secrets.token_urlsafe(24); SESSIONS[tok] = body["user"]
            return self._json({"token": tok, "user": body["user"], "role": usr["role"]})
        if u.path != "/api/decide":
            return self._json({"error": "not found"}, 404)
        # Identity comes from the server session, never from the request body.
        actor = SESSIONS.get(self.headers.get("X-Holdline-Token", ""))
        if not actor:
            return self._json({"error": "sign in first"}, 401)
        role = users()[actor]["role"]
        second = None
        if body.get("second_signer"):
            if not check_pin(body.get("second_signer"), body.get("second_pin")):
                return self._json({"error": "second signer PIN not verified"}, 403)
            if users()[body["second_signer"]]["role"] != "qualified_releaser":
                return self._json({"error": "second signer must also be a qualified releaser"}, 403)
            second = body["second_signer"]
        try:
            with LOCK:
                r = store.decide(STATE["db"], body.get("case_id"), body.get("decision"), actor, role,
                                 body.get("reason"), body.get("unit_ids"), body.get("client_id"), second, STATE["cfg"])
            return self._json(r)
        except PermissionError as e:
            return self._json({"error": str(e)}, 403)
        except (ValueError, KeyError) as e:
            return self._json({"error": str(e)}, 400)

def main():
    a = sys.argv[1:]
    path = a[0] if a and not a[0].startswith("--") else os.environ.get("HOLDLINE_DATA", "data")
    port = int(a[a.index("--port") + 1]) if "--port" in a else int(os.environ.get("PORT", 8080))
    since = date.fromisoformat(a[a.index("--since") + 1]) if "--since" in a else date(2026, 10, 1)
    host = os.environ.get("HOLDLINE_HOST", "127.0.0.1")  # local only by default
    setup(path, since)
    print(f"Serving on http://{host}:{port} (demo log-in only, not real authentication)", flush=True)
    ThreadingHTTPServer((host, port), H).serve_forever()

if __name__ == "__main__":
    main()
