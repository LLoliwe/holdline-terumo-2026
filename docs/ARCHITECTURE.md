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
- A case can be decided once. A repeated `client_id` (offline retry) is ignored.

Audit: each row stores `prev_hash` and `hash = sha256(prev_hash + row JSON)`. SQLite triggers abort UPDATE and DELETE. `verify_chain` re-walks the chain; the header shows Intact or the first broken row.
