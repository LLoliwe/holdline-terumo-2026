# HOLDLINE architecture

Standard-library Python 3 only (csv, sqlite3, hashlib, http.server). No external packages.

| Module | Job |
|---|---|
| `holdline/config/kenya.json` | Thresholds and rules per country |
| `holdline/data.py` | Reads the starter CSVs |
| `holdline/detect.py` | Baseline rule; HOLDLINE events: GLITCH, EXCURSION, GAP_PRESUMED, UNVERIFIED |
| `holdline/exposure.py` | Rebuilds where each unit was on each day from units + transfers; cool box check |
| `holdline/evaluate.py` | Baseline vs HOLDLINE against `temp_excursion_exposed` |
| `holdline/store.py` | SQLite cases, decisions, append-only hash-chained audit, SMS outbox |
| `holdline/sms.py` | 160-character alert builder |
| `holdline/server.py` | JSON API + static UI |
| `holdline/static/` | UI, service worker, offline decision queue |

Decision rules (enforced in `store.decide`, not only in the UI):
- ACCEPT: any signed-in role; all units become QUARANTINED.
- CHANGE / REJECT: role `qualified_releaser` only, plus a second signer who is a different person; reason required.
- A case can be decided once. A repeated `client_id` (offline retry) with the same decision returns the original result and writes nothing; the same `client_id` with a different decision is refused (422).
- Malformed requests (missing case ID, non-text reason, unit list that is not a list of IDs) are refused with 400 before anything is written. A unit listed twice is released once, so the audit count equals the units changed.

Audit: each row stores `prev_hash` and `hash = sha256(prev_hash + row JSON)`. SQLite triggers abort UPDATE and DELETE. `verify_chain` re-walks the chain; the header shows Intact or the first broken row.

## Data model

| Table | Key fields | Notes |
|---|---|---|
| `cases` | `id`, `facility_id`, `kind` (EXCURSION, GAP_PRESUMED, COOLBOX), `start`, `end`, `peak`, `reason`, `status` (OPEN, NO_UNITS, ACCEPTED, CHANGED, REJECTED) | One row per holding event |
| `case_units` | `case_id`, `unit_id`, `component`, `blood_group`, `expiry`, `state` (ON_HOLD, QUARANTINED, RELEASED) | Every unit in the fridge on any day of the event |
| `audit` | `seq`, `ts`, `actor`, `role`, `action`, `case_id`, `detail`, `client_id`, `prev_hash`, `hash` | Append-only (triggers), SHA-256 chain |
| `sms_outbox` | `case_id`, `ts`, `body` | Simulated; nothing is sent |

## Mapping to standards (documented, not built)

No integration is built. This is how the fields would map if HOLDLINE sat beside a blood bank information system. It has not been checked against a live system.

| HOLDLINE | Standard | Mapping |
|---|---|---|
| `case_units.unit_id` | ISBT 128 | Donation Identification Number plus product code; the starter dataset uses ISBT 128-style IDs, not validated ISBT 128 labels |
| `case_units.state` ON_HOLD / QUARANTINED / RELEASED | HL7 FHIR R4 `BiologicallyDerivedProduct.status` | ON_HOLD and QUARANTINED map to `unavailable`; RELEASED maps to `available`. The hold reason would travel as an extension |
| `cases` (one excursion) | HL7 FHIR R4 `DetectedIssue` | `implicated` = the units; `detail` = the reason in words; `mitigation` = the Accept, Change or Reject decision with author |
| Fridge readings | HL7 FHIR R4 `Observation` | Device-linked temperature, °C, with the logger as `device` |
| `audit` rows | HL7 FHIR R4 `AuditEvent` / `Provenance` | Actor, role, time, action; the second signer as an additional agent |
| Daily counts of units held and released per facility | DHIS2 | Aggregate data elements per facility and day; no unit-level data leaves the site |
