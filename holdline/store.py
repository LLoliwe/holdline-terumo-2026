"""Case store, decisions and an append-only, hash-chained audit log (SQLite)."""
import sqlite3, json, hashlib, uuid, re
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
               ev["end"].isoformat(), ev["peak"], ev["reason"], "OPEN" if units_in_fridge else "NO_UNITS", ev["start"].isoformat()))
    for u in units_in_fridge:
        db.execute("INSERT OR IGNORE INTO case_units VALUES(?,?,?,?,?,?)",
                   (cid, u["unit_id"], u["component"], u["blood_group"], u["expiry_date"], "ON_HOLD"))
    if not units_in_fridge:
        # Nothing to hold: the event is still recorded, but it does not enter the decision queue or SMS.
        audit(db, "HOLDLINE", "system", "EVENT_LOGGED_NO_UNITS", cid,
              f"No units recorded in this fridge during the event. Nothing held. {ev['reason']}", ts=ev["start"].strftime("%Y-%m-%dT%H:%M:%S+03:00"))
        db.commit()
        return cid
    audit(db, "HOLDLINE", "system", "HOLD_RAISED", cid,
          f"{len(units_in_fridge)} units held. {ev['reason']}", ts=ev["start"].strftime("%Y-%m-%dT%H:%M:%S+03:00"))
    lang = cfg.get("language", "en")
    kind_short, why_short = sms.kind_and_why(ev["kind"], ev["peak"], lang)
    body = sms.hold_sms(dict(facility_id=ev["facility_id"], kind_short=kind_short,
                             when=f"{ev['start']:%d/%m %H:%M}", why_short=why_short,
                             unit_ids=[u["unit_id"] for u in units_in_fridge]), cfg["sms_max_chars"], lang)
    db.execute("INSERT INTO sms_outbox(case_id,ts,body) VALUES(?,?,?)", (cid, ev["start"].isoformat(), body))
    audit(db, "HOLDLINE", "system", "SMS_QUEUED", cid, body, ts=ev["start"].strftime("%Y-%m-%dT%H:%M:%S+03:00"))
    db.commit()
    return cid

class KeyMismatch(ValueError):
    """Same idempotency key, different payload (IETF idempotency-key draft: 422)."""

def decide(db, case_id, decision, actor, role, reason, unit_ids=None, client_id=None, second_signer=None, cfg=None):
    """decision: ACCEPT (confirm hold: units quarantined for discard), CHANGE (release only listed units),
    REJECT (lift the hold on all units). Releasing any unit needs a reason, a qualified releaser and,
    if configured, a second signature from a different person."""
    if decision not in ("ACCEPT", "CHANGE", "REJECT"):
        raise ValueError("decision must be ACCEPT, CHANGE or REJECT")
    # Types are checked before anything is read or written: a malformed request is refused, never half-applied.
    if not isinstance(case_id, str) or not case_id:
        raise ValueError("case_id is required")
    if reason is not None and not isinstance(reason, str):
        raise ValueError("reason must be text")
    if unit_ids is not None:
        if not isinstance(unit_ids, list) or not all(isinstance(u, str) for u in unit_ids):
            raise ValueError("unit_ids must be a list of unit IDs")
        # A unit listed twice is released once; the audit count must equal the units actually changed.
        unit_ids = list(dict.fromkeys(unit_ids))
    if second_signer is not None and not isinstance(second_signer, str):
        raise ValueError("second_signer must be a user name")
    if client_id is not None:
        if not isinstance(client_id, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,80}", client_id):
            raise ValueError("bad client_id")
        # Replay of a decision that was already applied: answer first, even if the case has moved on since.
        prior = db.execute("SELECT actor, case_id, action, detail FROM audit WHERE client_id=?", (client_id,)).fetchone()
        if prior:
            if prior["case_id"] == case_id and prior["actor"] == actor:
                # Full meaning must match: action, reason, the exact set of units released, and the second signer.
                done = {r["unit_id"]: r["state"] for r in db.execute("SELECT unit_id, state FROM case_units WHERE case_id=?", (case_id,))}
                want = set(done) if decision == "REJECT" else {u for u in (unit_ids or []) if u in done}
                if decision == "ACCEPT": want = set()
                exp = f"{decision}: {(reason or '').strip()}. Released {len(want)}, quarantined {len(done) - len(want)}."
                if second_signer: exp += f" Second signature: {second_signer}."
                same = (prior["action"] == f"DECISION_{decision}" and prior["detail"] == exp
                        and want == {u for u, st in done.items() if st == "RELEASED"})
                if not same:
                    raise KeyMismatch("client_id was already used for a different decision")
                st = db.execute("SELECT status FROM cases WHERE id=?", (case_id,)).fetchone()
                return dict(case_id=case_id, duplicate=True, status=st["status"] if st else None)
            raise ValueError("client_id already used for a different decision")
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
    all_units = [r["unit_id"] for r in db.execute("SELECT unit_id FROM case_units WHERE case_id=?", (case_id,))]
    # ACCEPT is hold-only, even if the browser still has release boxes ticked.
    # Only CHANGE/REJECT pass the qualified-release checks above.
    rel = all_units if decision == "REJECT" else (unit_ids or []) if decision == "CHANGE" else []
    foreign = sorted({u for u in rel if u not in all_units})
    if decision == "CHANGE" and foreign:
        raise ValueError(f"CHANGE lists {len(foreign)} unit(s) not in this case ({', '.join(foreign[:5])}); nothing written")
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

def cross_holds(db, case_id):
    """Units in this case that other cases still block: unit_id -> [{case_id, status, state}].
    A unit stays blocked wherever its state is not RELEASED (ON_HOLD in an open case,
    QUARANTINED in a decided one), regardless of the other case's own status. The warning
    clears only when every other case holding the unit has released it."""
    rows = db.execute("""
        SELECT cu.unit_id, cu.case_id, c.status, cu.state FROM case_units cu
        JOIN cases c ON c.id = cu.case_id
        WHERE cu.case_id != ? AND cu.state != 'RELEASED'
          AND cu.unit_id IN (SELECT unit_id FROM case_units WHERE case_id = ?)
        ORDER BY cu.unit_id, cu.case_id""", (case_id, case_id)).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["unit_id"], []).append(dict(case_id=r["case_id"], status=r["status"], state=r["state"]))
    return out

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
            # Units held = resident on ANY day of the event window (start..end), not only the
            # start day: a unit that arrives mid-event is still in that fridge while the event
            # runs. Expiry filter is per residency day (exclude units already expired on the
            # day they were resident in the window); a unit is held once, on its first valid day.
            ids = []; seen = set(); d = ev["start"].date()
            while d <= ev["end"].date():
                for i in by_fac_day.get((fac, d), []):
                    if i in seen or ulookup[i]["expiry_date"] < d.isoformat():
                        continue
                    seen.add(i); ids.append(i)
                d += timedelta(days=1)
            open_case(db, ev, [ulookup[i] for i in ids], cfg); n += 1
    return n
