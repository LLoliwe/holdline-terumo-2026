"""Case store, decisions and an append-only, hash-chained audit log (SQLite)."""
import sqlite3, json, hashlib, uuid
from datetime import datetime, timedelta, date
from . import detect, exposure, sms

SCHEMA = """
CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, facility_id TEXT, kind TEXT, start TEXT, end TEXT,
  peak REAL, reason TEXT, status TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS case_units(case_id TEXT, unit_id TEXT, component TEXT, blood_group TEXT, expiry TEXT,
  state TEXT, PRIMARY KEY(case_id, unit_id));
CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, role TEXT, action TEXT,
  case_id TEXT, detail TEXT, client_id TEXT UNIQUE, prev_hash TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS sms_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, ts TEXT, body TEXT);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit log is append-only'); END;
"""
ROLES = {"duty_officer": "Duty officer", "qualified_releaser": "Blood bank manager (qualified)"}

def connect(path=":memory:"):
    db = sqlite3.connect(path, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db

def _hash(prev, row):
    return hashlib.sha256((prev + json.dumps(row, sort_keys=True)).encode()).hexdigest()

def audit(db, actor, role, action, case_id, detail, client_id=None, ts=None):
    if client_id:
        r = db.execute("SELECT seq FROM audit WHERE client_id=?", (client_id,)).fetchone()
        if r:
            return None  # duplicate from an offline retry: ignore, never double-apply
    prev = db.execute("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
    prev = prev["hash"] if prev else "GENESIS"
    ts = ts or datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    row = dict(ts=ts, actor=actor, role=role, action=action, case_id=case_id, detail=detail, client_id=client_id)
    h = _hash(prev, row)
    db.execute("INSERT INTO audit(ts,actor,role,action,case_id,detail,client_id,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?,?)",
               (ts, actor, role, action, case_id, detail, client_id, prev, h))
    return h

def verify_chain(db):
    prev = "GENESIS"
    for r in db.execute("SELECT * FROM audit ORDER BY seq"):
        row = dict(ts=r["ts"], actor=r["actor"], role=r["role"], action=r["action"], case_id=r["case_id"],
                   detail=r["detail"], client_id=r["client_id"])
        if r["prev_hash"] != prev or _hash(prev, row) != r["hash"]:
            return False, r["seq"]
        prev = r["hash"]
    return True, None

SHORT = {"EXCURSION": "fridge excursion", "GAP_PRESUMED": "logger gap+power cut", "COOLBOX": "cool box excursion"}

def open_case(db, ev, units_in_fridge, cfg):
    cid = f"HL-{ev['facility_id']}-{ev['start']:%Y%m%d%H}-{ev['kind'][:3]}"
    if db.execute("SELECT 1 FROM cases WHERE id=?", (cid,)).fetchone():
        return cid
    db.execute("INSERT INTO cases VALUES(?,?,?,?,?,?,?,?,?)", (cid, ev["facility_id"], ev["kind"], ev["start"].isoformat(),
               ev["end"].isoformat(), ev["peak"], ev["reason"], "OPEN", ev["start"].isoformat()))
    for u in units_in_fridge:
        db.execute("INSERT OR IGNORE INTO case_units VALUES(?,?,?,?,?,?)",
                   (cid, u["unit_id"], u["component"], u["blood_group"], u["expiry_date"], "ON_HOLD"))
    audit(db, "HOLDLINE", "system", "HOLD_RAISED", cid,
          f"{len(units_in_fridge)} units held. {ev['reason']}", ts=ev["start"].strftime("%Y-%m-%dT%H:%M:%S+03:00"))
    peak = f"peak {ev['peak']:.1f}C" if ev["peak"] is not None else "temp unknown"
    body = sms.hold_sms(dict(facility_id=ev["facility_id"], kind_short="EXCURSION" if ev["kind"] == "EXCURSION" else "LOGGER GAP",
                             when=f"{ev['start']:%d/%m %H:%M}", why_short=peak if ev["kind"] == "EXCURSION" else "power cut, no backup",
                             unit_ids=[u["unit_id"] for u in units_in_fridge]), cfg["sms_max_chars"])
    db.execute("INSERT INTO sms_outbox(case_id,ts,body) VALUES(?,?,?)", (cid, ev["start"].isoformat(), body))
    audit(db, "HOLDLINE", "system", "SMS_QUEUED", cid, body, ts=ev["start"].strftime("%Y-%m-%dT%H:%M:%S+03:00"))
    db.commit()
    return cid

def decide(db, case_id, decision, actor, role, reason, unit_ids=None, client_id=None, second_signer=None, cfg=None):
    """decision: ACCEPT (confirm hold: units quarantined for discard), CHANGE (release only listed units),
    REJECT (lift the hold on all units). Releasing any unit needs a reason, a qualified releaser and,
    if configured, a second signature from a different person."""
    if decision not in ("ACCEPT", "CHANGE", "REJECT"):
        raise ValueError("decision must be ACCEPT, CHANGE or REJECT")
    if not reason or len(reason.strip()) < 5:
        raise ValueError("a reason is required")
    c = db.execute("SELECT * FROM cases WHERE id=?", (case_id,)).fetchone()
    if not c:
        raise KeyError(case_id)
    if c["status"] != "OPEN":
        raise ValueError(f"case already {c['status']}")
    releases = decision in ("CHANGE", "REJECT")
    if releases:
        if role != "qualified_releaser":
            raise PermissionError("only a qualified releaser can release units")
        if (cfg or {}).get("second_signature_for_release", True) and (not second_signer or second_signer == actor):
            raise PermissionError("release needs a second signature from a different person")
        if decision == "CHANGE" and not unit_ids:
            raise ValueError("CHANGE needs the list of units to release")
    if client_id and db.execute("SELECT 1 FROM audit WHERE client_id=?", (client_id,)).fetchone():
        return dict(case_id=case_id, duplicate=True)
    all_units = [r["unit_id"] for r in db.execute("SELECT unit_id FROM case_units WHERE case_id=?", (case_id,))]
    rel = all_units if decision == "REJECT" else (unit_ids or [])
    rel = [u for u in rel if u in all_units]
    for u in all_units:
        db.execute("UPDATE case_units SET state=? WHERE case_id=? AND unit_id=?",
                   ("RELEASED" if u in rel else "QUARANTINED", case_id, u))
    status = {"ACCEPT": "ACCEPTED", "CHANGE": "CHANGED", "REJECT": "REJECTED"}[decision]
    db.execute("UPDATE cases SET status=? WHERE id=?", (status, case_id))
    detail = f"{decision}: {reason.strip()}. Released {len(rel)}, quarantined {len(all_units) - len(rel)}."
    if second_signer:
        detail += f" Second signature: {second_signer}."
    audit(db, actor, role, f"DECISION_{decision}", case_id, detail, client_id=client_id)
    db.commit()
    return dict(case_id=case_id, status=status, released=rel)

def build(db, temps, outs, units, trs, cfg, since=None):
    """Open a case for every holding event (optionally only events on/after `since`)."""
    spans = exposure.residency(units, trs)
    by_fac_day = {}
    comps = set(cfg["fridge_components"])
    ulookup = {u["unit_id"]: u for u in units}
    for u in units:
        if u["component"] not in comps:
            continue
        for fac, a, b in spans[u["unit_id"]]:
            if since and b < since:
                continue
            d = max(a, since) if since else a
            while d <= b:
                by_fac_day.setdefault((fac, d), []).append(u["unit_id"]); d += timedelta(days=1)
    n = 0
    for fac, rs in temps.items():
        for ev in detect.holdline_events(fac, rs, outs.get(fac, []), cfg):
            if not ev["hold"] or (since and ev["start"].date() < since):
                continue
            ids = [i for i in by_fac_day.get((fac, ev["start"].date()), [])
                   if ulookup[i]["expiry_date"] >= ev["start"].date().isoformat()]
            open_case(db, ev, [ulookup[i] for i in ids], cfg); n += 1
    return n
