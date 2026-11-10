"""Exports of the decision record: CSV for a spreadsheet and an HL7 FHIR R4 Bundle for another system.

python3 -m holdline.export PATH_TO_DB csv  > audit.csv
python3 -m holdline.export PATH_TO_DB fhir > holdline-fhir.json

FHIR resources: one DetectedIssue per hold case (implicated units, reason, decision as mitigation) and one
AuditEvent per audit row (who, role, when, what, chain hash). Unit references use the dataset's ISBT 128-style
IDs as identifiers. This is an export format only: it has not been validated against a live FHIR server."""
import csv, io, json, sqlite3, sys

AUDIT_COLS = ("seq", "ts", "actor", "role", "action", "case_id", "detail", "client_id", "prev_hash", "hash")

def _cell(v):
    # Spreadsheet formula injection: a value starting with = + - @ is written as text.
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s

def audit_csv(db):
    out = io.StringIO(); w = csv.writer(out, lineterminator="\n")
    w.writerow(AUDIT_COLS)
    for r in db.execute(f"SELECT {', '.join(AUDIT_COLS)} FROM audit ORDER BY seq"):
        w.writerow([_cell(r[c]) for c in AUDIT_COLS])
    return out.getvalue()

MITIGATION = {"ACCEPTED": "Hold confirmed: all units quarantined", "CHANGED": "Selected units released by two qualified signers",
              "REJECTED": "Hold lifted by two qualified signers"}

def fhir_bundle(db):
    entries = []
    for c in db.execute("SELECT * FROM cases WHERE status != 'NO_UNITS' ORDER BY start"):
        units = db.execute("SELECT unit_id, state FROM case_units WHERE case_id=? ORDER BY unit_id", (c["id"],)).fetchall()
        di = {"resourceType": "DetectedIssue", "id": c["id"],
              "status": "preliminary" if c["status"] == "OPEN" else "final",
              "code": {"text": "Cold chain: " + ("measured temperature excursion" if c["kind"] == "EXCURSION"
                                                  else "presumed excursion (logger gap)" if c["kind"] == "GAP_PRESUMED"
                                                  else "cool box excursion")},
              "identifiedDateTime": c["start"],
              "detail": c["reason"],
              "implicated": [{"identifier": {"system": "urn:holdline:unit-id", "value": u["unit_id"]},
                              "display": u["state"]} for u in units],
              "extension": [{"url": "urn:holdline:facility", "valueString": c["facility_id"]}]}
        if c["status"] in MITIGATION:
            last = db.execute("SELECT ts, actor FROM audit WHERE case_id=? AND action LIKE 'DECISION_%' ORDER BY seq DESC LIMIT 1",
                              (c["id"],)).fetchone()
            di["mitigation"] = [{"action": {"text": MITIGATION[c["status"]]},
                                 "date": last["ts"] if last else None,
                                 "author": {"display": last["actor"] if last else None}}]
        entries.append({"fullUrl": f"urn:holdline:DetectedIssue/{c['id']}", "resource": di})
    for r in db.execute("SELECT * FROM audit ORDER BY seq"):
        ae = {"resourceType": "AuditEvent", "id": f"audit-{r['seq']}",
              "type": {"system": "urn:holdline:action", "code": r["action"]},
              "recorded": r["ts"],
              "outcome": "0",
              "agent": [{"who": {"display": r["actor"]}, "role": [{"text": r["role"]}], "requestor": True}],
              "source": {"observer": {"display": "HOLDLINE"}},
              "entity": [{"what": {"reference": f"urn:holdline:DetectedIssue/{r['case_id']}"}, "description": r["detail"]}],
              "extension": [{"url": "urn:holdline:hash", "valueString": r["hash"]},
                            {"url": "urn:holdline:prev-hash", "valueString": r["prev_hash"]}]}
        entries.append({"fullUrl": f"urn:holdline:AuditEvent/{r['seq']}", "resource": ae})
    return {"resourceType": "Bundle", "type": "collection", "entry": entries}

if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[2] not in ("csv", "fhir"):
        sys.exit(__doc__.strip())
    db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True); db.row_factory = sqlite3.Row
    sys.stdout.write(audit_csv(db) if sys.argv[2] == "csv" else json.dumps(fhir_bundle(db), indent=1) + "\n")
