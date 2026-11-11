"""HOLDLINE demo server. Standard library only.

python -m holdline.server DATA_DIR [--port 8080] [--since 2026-10-01]
"""
import sys, time, os, json, threading, ipaddress, hashlib
from pathlib import Path
from datetime import date, datetime, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from . import load_config, data, store, evaluate, auth, export

STATIC = os.path.join(os.path.dirname(__file__), "static")
LOCK = threading.Lock()
STATE = {}
SESSIONS = auth.SESSIONS  # token -> {user, created, seen}. In memory, expiring: see auth.py
DEMO_USERS = os.path.join(os.path.dirname(__file__), "config", "demo_users.json")
MAX_BODY = 64 * 1024
AUTH_READS = os.environ.get("HOLDLINE_AUTH_READS", "0") == "1"  # opt in: case, audit and unit reads need a session
CASE_LIST_MAX = 5000  # upper bound on one queue response
SENSITIVE_READS = ("/api/cases", "/api/case/", "/api/audit")

def users_file():
    return os.environ.get("HOLDLINE_USERS", DEMO_USERS)  # point at a file outside the repo to keep PINs out of it

def users():
    with open(users_file()) as f:
        return json.load(f)["users"]

def check_pin(username, pin):
    """The user record if the PIN is right. Wrong tries lock that name for a growing time (it unlocks by itself),
    and a locked name is refused even with the right PIN. Raises Locked. Used for log-in and second signatures."""
    name = str(username or "")[:64]
    key = "u:" + name
    wait = auth.locked_for(key)
    if wait:
        raise Locked(wait)
    u = users().get(name)
    ok = bool(u) and auth.pin_ok(u, pin)
    if not u:
        auth.pin_ok({"pin": "x"}, pin)  # similar work for unknown names
    auth.record(key, ok)
    return u if ok else None

class Locked(Exception):
    def __init__(self, wait): self.wait = wait

def loopback(host):
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host == "localhost"

def allowed_hosts():
    extra = [h.strip().lower() for h in os.environ.get("HOLDLINE_ALLOWED_HOSTS", "").split(",") if h.strip()]
    return {"localhost", "127.0.0.1", "[::1]"} | set(extra)

def setup(path, since):
    cfg = load_config()
    temps = data.temperature_logs(path); outs = data.outages(path)
    units = data.units(path); trs = data.transfers(path)
    db_path = os.environ.get("HOLDLINE_DB")
    if not db_path:
        # Keep reviewed cases beside their fixed input dataset. Different rules
        # or date windows get separate stores rather than silently mixing cases.
        identity = json.dumps({"config": cfg, "since": str(since)}, sort_keys=True)
        key = hashlib.sha256(identity.encode()).hexdigest()[:16]
        state_dir = Path(path).resolve() / ".holdline"
        state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        db_path = str(state_dir / f"cases-{key}.db")
    db = store.connect(db_path)
    n = store.build(db, temps, outs, units, trs, cfg, since=since)
    STATE.update(cfg=cfg, db=db, temps=temps, fac=data.facilities(path), cases=n, since=since,
                 metrics=evaluate.run(path))
    print(f"HOLDLINE ready: {n} hold cases since {since}", flush=True)
    print("Decision store: " + ("temporary (explicit :memory: override)" if db_path == ":memory:" else db_path), flush=True)

def readings_around(fid, start, hours=24):
    s = datetime.fromisoformat(start)
    lo, hi = s - timedelta(hours=hours), s + timedelta(hours=hours)
    return [(t.strftime("%Y-%m-%d %H:%M"), v) for t, v in STATE["temps"].get(fid, []) if lo <= t <= hi]

def explain(c):
    """Why this case holds units, as data: the rule that fired, the thresholds in force, the evidence counted from
    the logged readings, and whether the temperature was measured or presumed. No score or probability is invented."""
    cfg = STATE["cfg"]; lim = cfg["fridge_max_c"]
    s, e = datetime.fromisoformat(c["start"]), datetime.fromisoformat(c["end"])
    inside = [(t, v) for t, v in STATE["temps"].get(c["facility_id"], []) if s <= t <= e and v not in set(cfg["glitch_values"])]
    above = [v for _, v in inside if v > lim]
    hours = int((e - s).total_seconds() // 3600) + 1
    rule = {"EXCURSION": f"{cfg['persist_hours']}+ consecutive hourly readings above {lim:g}°C",
            "GAP_PRESUMED": f"logger silent {cfg['gap_hours_alert']}+ h with a power cut without backup, or a hot first reading after",
            "COOLBOX": f"cool box above {cfg['coolbox_max_c']:g}°C during a transfer"}.get(c["kind"], c["kind"])
    return dict(rule=rule, evidence="measured" if c["kind"] in ("EXCURSION", "COOLBOX") else "presumed, not measured",
                window_hours=hours, readings_logged=len(inside), readings_above_limit=len(above),
                peak_c=c["peak"], limit_c=lim, config=os.environ.get("HOLDLINE_CONFIG", "kenya"),
                uncertainty=("Temperature in the gap was not recorded; the hold is a precaution." if c["kind"] == "GAP_PRESUMED"
                             else "Unit residency is day-level: a unit in the fridge any part of a day counts for that day."),
                decision_needed="A qualified person decides: Accept keeps all units on hold; Change or Reject needs two qualified signers.")

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; "
       "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")

class H(SimpleHTTPRequestHandler):
    server_version = "HOLDLINE"; sys_version = ""
    def __init__(self, *a, **k):
        super().__init__(*a, directory=STATIC, **k)
    def send_error(self, code, message=None, explain=None):
        # Unknown pages get the branded 404 (honest state, no fake confirmation).
        # API errors never reach here: they return JSON via _json.
        if code == 404:
            try:
                b = open(os.path.join(STATIC, "404.html"), "rb").read()
            except OSError:
                return super().send_error(code, message, explain)
            self.send_response(code); self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
            return
        return super().send_error(code, message, explain)
    def log_message(self, *a):
        pass
    def end_headers(self):
        for k, v in (("Content-Security-Policy", CSP), ("X-Content-Type-Options", "nosniff"), ("X-Frame-Options", "DENY"),
                     ("Referrer-Policy", "no-referrer"), ("Cross-Origin-Resource-Policy", "same-origin")):
            self.send_header(k, v)
        super().end_headers()
    def _json(self, obj, code=200, extra=None):
        b = json.dumps(obj, default=str).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items(): self.send_header(k, str(v))
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def _host_ok(self):
        """Refuse requests whose Host is not this machine (DNS rebinding), and cross-site POSTs."""
        raw = (self.headers.get("Host") or "").lower()
        host = raw if raw.endswith("]") else raw.rsplit(":", 1)[0]  # strip the port, keep an [::1] literal
        if host not in allowed_hosts():
            self._json({"error": "host not allowed"}, 403); return False
        org = self.headers.get("Origin")
        if org and self.command == "POST" and urlparse(org).netloc.lower() != (self.headers.get("Host") or "").lower():
            self._json({"error": "cross-site request refused"}, 403); return False
        return True
    def _session(self):
        return auth.session_user(self.headers.get("X-Holdline-Token", ""))
    def do_GET(self):
        if not self._host_ok(): return
        u = urlparse(self.path); q = parse_qs(u.query); db = STATE["db"]
        if AUTH_READS and u.path.startswith(SENSITIVE_READS) and not self._session():
            return self._json({"error": "sign in first"}, 401)
        if u.path == "/api/summary":
            r = {s: n for s, n in db.execute("SELECT status, COUNT(*) FROM cases GROUP BY status")}
            held = db.execute("SELECT COUNT(DISTINCT cu.unit_id) FROM case_units cu JOIN cases c ON c.id=cu.case_id WHERE c.status='OPEN'").fetchone()[0]
            ok, bad = store.verify_chain(db)
            return self._json(dict(cases=r, units_on_hold=held, dataset_since=str(STATE.get("since", "")), dataset="official synthetic",
                                   audit_ok=ok, audit_broken_at=bad, metrics=STATE["metrics"]))
        if u.path == "/api/cases":
            st = q.get("status", ["OPEN"])[0]
            rows = db.execute("""SELECT c.*, COUNT(cu.unit_id) n FROM cases c LEFT JOIN case_units cu ON cu.case_id=c.id
                                 WHERE c.status=? GROUP BY c.id ORDER BY c.start DESC LIMIT ?""", (st, CASE_LIST_MAX)).fetchall()
            # The queue used to stop at 200 rows, so a fresh full-history demo hid 212 of 412 open holds from the
            # operator. Return the whole status list (bounded) so the client can search, filter and sort all of it.
            fac = STATE["fac"]
            # Unit ids per case let the overview count a unit that sits on two holds once, not twice.
            ids = {}
            for cu in db.execute("""SELECT cu.case_id, cu.unit_id FROM case_units cu JOIN cases c ON c.id=cu.case_id
                                    WHERE c.status=?""", (st,)):
                ids.setdefault(cu["case_id"], []).append(cu["unit_id"])
            return self._json([dict(r) | {"facility_name": fac.get(r["facility_id"], {}).get("name"),
                                          "facility_county": fac.get(r["facility_id"], {}).get("county"),
                                          "unit_ids": ids.get(r["id"], [])} for r in rows])
        if u.path.startswith("/api/case/"):
            cid = u.path.split("/")[-1]
            c = db.execute("SELECT * FROM cases WHERE id=?", (cid,)).fetchone()
            if not c: return self._json({"error": "not found"}, 404)
            f = STATE["fac"].get(c["facility_id"], {})
            return self._json(dict(case=dict(c), facility=f, explain=explain(c),
                units=[dict(r) for r in db.execute("SELECT * FROM case_units WHERE case_id=?", (cid,))],
                also_held=store.cross_holds(db, cid),
                readings=readings_around(c["facility_id"], c["start"]),
                audit=[dict(r) for r in db.execute("SELECT * FROM audit WHERE case_id=? ORDER BY seq", (cid,))],
                sms=[dict(r) for r in db.execute("SELECT * FROM sms_outbox WHERE case_id=?", (cid,))]))
        if u.path in ("/api/export/audit.csv", "/api/export/fhir.json"):
            # Exports always need a signed-in person, whatever HOLDLINE_AUTH_READS says.
            if not self._session():
                return self._json({"error": "sign in first"}, 401)
            if u.path.endswith(".csv"):
                b = export.audit_csv(db).encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="holdline-audit.csv"')
                self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "no-store")
                self.end_headers(); self.wfile.write(b); return
            return self._json(export.fhir_bundle(db))
        if u.path == "/api/audit":
            return self._json([dict(r) for r in db.execute("SELECT * FROM audit ORDER BY seq DESC LIMIT 100")])
        if u.path == "/api/me":
            name = self._session()
            return self._json({"user": name, "role": users()[name]["role"]} if name else {"user": None})
        if u.path == "/api/users":
            return self._json([{"user": k, "name": v["name"], "role": v["role"]} for k, v in users().items()])
        if u.path == "/healthz":
            return self._json({"ok": True})
        if u.path.startswith("/api/"):
            return self._json({"error": "not found"}, 404)
        return super().do_GET()
    def do_POST(self):
        if not self._host_ok(): return
        u = urlparse(self.path)
        if not (self.headers.get("Content-Type") or "").lower().startswith("application/json"):
            return self._json({"error": "JSON only"}, 415)
        try:
            n = int(self.headers.get("Content-Length", 0))
        except ValueError:
            return self._json({"error": "bad length"}, 400)
        if n < 0 or n > MAX_BODY:
            self.close_connection = True
            return self._json({"error": "request too large"}, 413)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(body, dict): raise ValueError
        except ValueError:
            return self._json({"error": "bad JSON"}, 400)
        if u.path == "/api/login":
            try:
                usr = check_pin(body.get("user"), body.get("pin"))
            except Locked as e:
                return self._json({"error": f"Too many wrong tries. Try again in {e.wait} s."}, 429, {"Retry-After": e.wait})
            if not usr:
                return self._json({"error": "wrong user or PIN"}, 401)
            return self._json({"token": auth.new_session(body["user"]), "user": body["user"], "role": usr["role"]})
        if u.path == "/api/logout":
            auth.end_session(self.headers.get("X-Holdline-Token", ""))
            return self._json({"ok": True})
        if u.path != "/api/decide":
            return self._json({"error": "not found"}, 404)
        # Identity comes from the server session, never from the request body.
        actor = self._session()
        if not actor:
            return self._json({"error": "sign in first"}, 401)
        role = users()[actor]["role"]
        # A release confirmed on screen carries the exact unit list the person saw. If the list sent differs
        # (for example a tick changed after the confirmation sentence was shown), nothing is written.
        if "confirmed_unit_ids" in body:
            shown, sent = body.get("confirmed_unit_ids"), body.get("unit_ids")
            if not isinstance(shown, list) or not isinstance(sent, list) or len(shown) != len(sent) or set(shown) != set(sent):
                return self._json({"error": "the units sent differ from the units confirmed on screen; nothing was recorded"}, 409)
        second = None
        if body.get("second_signer"):
            try:
                ok2 = check_pin(body.get("second_signer"), body.get("second_pin"))
            except Locked as e:
                return self._json({"error": f"Second signer locked for {e.wait} s after wrong PINs."}, 429, {"Retry-After": e.wait})
            if not ok2:
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
        except store.KeyMismatch as e:
            return self._json({"error": str(e)}, 422)
        except KeyError as e:
            return self._json({"error": f"case not found: {e.args[0] if e.args else ''}"}, 404)
        except (ValueError, TypeError) as e:
            return self._json({"error": str(e)}, 400)

def main():
    a = sys.argv[1:]
    path = a[0] if a and not a[0].startswith("--") else os.environ.get("HOLDLINE_DATA", "data")
    port = int(a[a.index("--port") + 1]) if "--port" in a else int(os.environ.get("PORT", 8080))
    since = date.fromisoformat(a[a.index("--since") + 1]) if "--since" in a else date(2026, 10, 1)
    host = os.environ.get("HOLDLINE_HOST", "127.0.0.1")  # local only by default
    if not loopback(host) and users_file() == DEMO_USERS:
        sys.exit("Refusing to listen on a network address with the public demo PINs. Set HOLDLINE_USERS to a file outside the repo.")
    setup(path, since)
    print(f"Serving on http://{host}:{port} (demo log-in only, not real authentication)", flush=True)
    ThreadingHTTPServer((host, port), H).serve_forever()

if __name__ == "__main__":
    main()
