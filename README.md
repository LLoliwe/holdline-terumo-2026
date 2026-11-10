# HOLDLINE: the system holds, only a person releases

Terumo BCT Africa Hackathon 2026 · Challenge area: data quality and cold chain · Individual entry: Lebohang Loliwe

Status: **working prototype on synthetic data**. Not validated with real users or real fridges. Not a medical device.

## The problem
A blood fridge in a Kenyan county hospital goes above 6°C during a power cut. Today someone has to notice the chart, work out which units were inside, and stop them being issued. In the synthetic starter dataset (one year, 49,426 units):

- **7,112 units** were exposed to a temperature excursion (the dataset's own label, `units.temp_excursion_exposed`).
- **2,119 of them were transfused anyway.**
- Some exposures happen while the logger is silent: during a power cut the logger can stop writing while the fridge keeps warming, so the hourly log alone can under-report.
- The simple rule "any reading above 6°C, hold that fridge" also fires on one-hour spikes such as door openings and on sensor glitch codes (99.9): in this data 3 of every 4 of its holds are false.

User (hypothesis, not interviewed): the duty officer at a hospital blood bank, plus the blood bank manager who is qualified to release units.

## What we built
A working web app plus a tested Python engine:

1. **Excursion detector**: reads hourly fridge logs, drops known glitch codes, raises a hold on 2+ consecutive hours above 6°C.
2. **Logger-gap detector**: a silence of 3+ hours that overlaps a power cut without backup, or that ends above 6°C, becomes a *presumed* excursion. Other gaps are classified by the engine as *unverified* (no hold), but are not yet displayed in the case queue. Manual logger checks remain necessary.
3. **Cool box check**: any transfer whose cool box went above 10°C holds that unit. On this dataset it fires **zero times**: no transfer records a cool box above 10°C.
4. **Auto-hold queue**: each event becomes a case listing every unit that was in that fridge on any day of the event. An event at a fridge with no units recorded is logged in the audit trail under "No units" and kept out of the decision queue.
5. **Person-in-control decision**: Accept (keep all quarantined), Change (release only ticked units) or Reject (lift the hold). Reason always required. A Change that lists a unit not in the case is refused and nothing is written. If a unit in the case is also held by another case, the case shows a cross-case warning: releasing it here does not clear the other hold. Only a qualified manager can release, and every release needs a second qualified person whose PIN the server checks. Identity comes from the server session, never from what the browser sends. Demo sessions expire (30 minutes idle, 8 hours at most), wrong PINs lock the user out for a while, and the server refuses cross-site, non-JSON and oversized requests. HOLDLINE never releases anything itself.
6. **Persistent, append-only, hash-chained audit log** in SQLite: decisions, audit entries and retry IDs survive a normal server restart. Database triggers block UPDATE/DELETE, and a SHA-256 chain exposes an edit made around the triggers. Shown live in the header. This detects row edits, not deletion of the entire database; keep backups.
7. **SMS fallback (simulated, nothing is sent)**: a 160-character-or-less alert per hold for sites with no data.
8. **Why each hold, as data**: every case returns the rule that fired, the threshold in force, readings logged and above the limit, peak, whether the temperature was measured or presumed, and the main uncertainty (`explain` in `/api/case/<id>`). No score or probability is invented.
9. **Exports and an offline integrity check**: signed-in staff can download the full audit trail as CSV (`/api/export/audit.csv`, spreadsheet-formula safe) or as an HL7 FHIR R4 Bundle of DetectedIssue and AuditEvent resources (`/api/export/fhir.json`). `python3 -m holdline.verify <store.db>` re-walks the hash chain read-only and names the first broken row. The FHIR export is a format, not validated against a live FHIR server.
10. **Offline-tolerant UI**: app shell cached by a service worker, last data and the 20 newest open cases cached on the device, a decision to keep units on hold (Accept) made offline is queued and replayed with an idempotency key, so a retry is never applied twice. Releases can't be queued offline, because the server must check both signatures. Units stay on hold until then.

Mocked or not finished: SMS is not sent (no gateway); log-in is a **demo log-in** (three synthetic users with PINs in `holdline/config/demo_users.json`), not real authentication; sessions are in memory; the data is the organiser's synthetic set loaded at start-up, not a live logger feed.

Demo video: a **2:52.86 local review candidate** is rendered from verified application captures; public delivery link pending. See [walkthrough details](docs/VIDEO_SCRIPT.md). No new version has been submitted.
Live demo: not hosted, by decision (the starter kit has no clear public redistribution right). Run locally; the demonstration captures the working application.

## How to run it
Python 3.10+ only. No packages to install.

```
git clone <this repo> && cd holdline-terumo-2026
# put the organiser starter dataset CSVs in ./data (not committed: no redistribution licence)
python3 -m holdline.server data --port 8080 --since 2026-10-01
# open http://127.0.0.1:8080 (binds to 127.0.0.1 only; set HOLDLINE_HOST to change)
# demo log-in: demo.officer / 1111, demo.manager / 2222, demo.manager2 / 3333
python3 -m unittest discover -s tests                     # 91 pass, 1 skipped without data
HOLDLINE_DATA=data python3 -m unittest discover -s tests   # 92 pass with data
bun test ./tests/test_overview.js                          # optional: 6 UI-logic tests (needs Bun)
python3 -m holdline.evaluate data                          # reproduces the numbers below
python3 -m holdline.verify data/.holdline/cases-*.db       # audit chain check (path is printed at server start)
python3 -m holdline.export data/.holdline/cases-*.db fhir  # or csv
```

Try it: sign in as demo.manager, open a case, write a reason, open "Release units", tick one unit, choose demo.manager2 as second signer with PIN 3333, press Release, then confirm. Keys: `/` search, `j`/`k` walk the queue, `Esc` back, `?` list. Then sign in as demo.officer, turn the network off in dev tools and Accept another case: it queues, then syncs.

The default decision store is `DATA_DIR/.holdline/cases-<rules-and-window-hash>.db` (the resolved path is printed at startup). Restart with the same dataset, rules and `--since` date to resume decisions. Sessions still expire on process restart: sign in again as the original decision maker to sync queued Accepts. The starter CSVs are treated as a fixed dataset; use a separate dataset directory for revised inputs. A different rule configuration or date window uses a separate database. Back up the database while the server is stopped. For a read-only data directory, set `HOLDLINE_DB` to a writable file path; its parent must already exist. `HOLDLINE_DB=:memory:` explicitly starts a disposable demo whose decisions are lost on restart. No database or CSV belongs in Git.

Accept is always hold-only, including when release checkboxes remain ticked. This is enforced by the server as well as the browser; only Change or Reject can enter the qualified-release path.

## Architecture
![HOLDLINE architecture](docs/architecture.png)

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). What can fail and what happens then: [docs/FAILURE_MODES.md](docs/FAILURE_MODES.md).

```
temperature_logs, power_outages, transfers, units (CSV)
        │
   holdline/data.py ──► detect.py (glitch filter · persistence · gap + outage) ──► events
        │                                                         │
   exposure.py (where was each unit, each day) ◄──────────────────┘
        │
   store.py (SQLite: cases, case_units, audit[append-only, hash chain], sms_outbox)
        │
   server.py (stdlib HTTP, JSON API) ──► static UI (service worker + localStorage queue)
```

Where it sits: beside an existing blood bank information system, between the fridge logger and the issue desk. Units are referenced by ISBT 128-style unit IDs as given in the dataset; no FHIR or DHIS2 integration is built.

## AI and data
- **What it does**: a rule-based anomaly detector (glitch filtering, persistence, logger-gap inference from power-cut records). No machine-learning model: a transparent rule gives much higher precision than the baseline on this data, and every reason can be read.
- **Baseline**: "any hourly reading above 6°C puts that fridge-day on hold" (raw readings, as a person scanning the chart would).
- **Ground truth**: `units.temp_excursion_exposed` from the starter dataset. The generator sets it from the fridge's true simulated temperature (above 6°C for 4 consecutive hours marks the whole fridge-day), including hours the logger did not record, and from cool box peaks above 10°C. Our tracing is also day-level, which matches how the label is built; a real site would need hour-level stock movements.
- **Result, full year (49,426 units, 7,112 exposed)**, from `docs/metrics.json`:

| | Units held | Exposed caught (recall) | Precision | False holds | Exposed units held before their transfusion day (of 2,119) |
|---|---|---|---|---|---|
| Baseline | 28,619 | 96.9% | 24.1% | 21,727 | 2,038 |
| HOLDLINE | 10,259 | 95.4% | 66.1% | 3,473 | 1,984 |

What this shows: HOLDLINE holds **18,254 fewer units by mistake** at about the same recall. It is **not** better at stopping exposed units before use: on day-level timing it holds **54 fewer** exposed units before their transfusion day than the baseline. We make no claim that it prevents harm.

- **Check on later data only** (units collected from 2026-07-01, 1,611 exposed): baseline precision 16.2%, recall 96.8%; HOLDLINE precision 48.6%, recall 96.8%. Held before transfusion day: baseline 433, HOLDLINE 419 (of 459).
- Thresholds are **our chosen configuration** (`holdline/config/kenya.json`): 2 consecutive hours, a 3-hour gap, a 10°C cool box. The data dictionary only establishes the 2 to 6°C range. They were set before scoring and not tuned on the labels. No confidence probabilities are produced. HOLDLINE misses 106 more exposed units than the baseline (326 against 220) in exchange for 18,254 fewer false holds; that trade is stated, not hidden.
- **How a user sees the reason**: each hold case states "Measured" or "Presumed, not measured" (logger gap during a power cut), then gives the reason in words and a 48-hour chart. The demonstrated Kajiado case (`HL-HSP-007-2026102223-EXC`) has three consecutive hourly readings above 6°C, peak 7.8°C, and two units. Unverified gaps and glitch-only events are engine outputs, not visible queue entries.
- **Who approves**: the duty officer can confirm a hold; only a qualified manager can release, with a second qualified signer verified by the server (demo log-in).
- **If the detector is wrong or offline**: flagged cases default to a hold; false holds can delay availability and need a staff check. If the server is unreachable the device keeps the last view and queues Accept decisions; releases wait for the server. Missed events stay possible (326 in the year), so the manual fridge chart check is not removed.

## Data
The synthetic starter dataset only: `temperature_logs.csv`, `power_outages.csv`, `units.csv`, `transfers.csv`, `facilities.csv`. We used the synthetic starter dataset. No real donor, patient or facility data. The CSVs are not committed to this repo.

Data quality note: the dataset README says 60 sensor glitch readings; the file contains **55** (0.0 × 22, -99.0 × 17, 99.9 × 16). We report the 55 we counted.

## African conditions
- **Power**: power cuts are an input, not an afterthought; a cut without backup turns a logger gap into a hold.
- **Connectivity**: works offline after first load; decisions queue on the device; SMS fallback text fits one 160-character message, plain ASCII.
- **Phones**: responsive layout, 44 px touch targets, no frameworks (UI code about 147 KB uncompressed, about 44 KB gzipped, plus fonts; measured 2026/11/10).
- **New site or country**: thresholds and rules live in `holdline/config/kenya.json`; a new country is a new config file.
- **Languages**: the SMS wording is a language pack chosen in the country config (`"language"`), not code. English and Kiswahili ship; the Kiswahili pack is a **draft not yet reviewed by a Kiswahili-speaking blood bank officer** (`python3 -m holdline.i18n` prints each pack's status). The screens are English only for now.
- **Second site or country by settings**: `HOLDLINE_CONFIG=kenya-sw python3 -m holdline.server data` loads `holdline/config/kenya-sw.json` (same rules, Kiswahili SMS). Configs are checked at start-up: missing keys, out-of-range thresholds or an unknown language stop the server before it serves anything.

## AI tools we used
Built by Lebohang Loliwe, using AI coding agents under his direction.

- **Claude (Anthropic), through the Quest assistant**: wrote most of the code, tests and docs under the entrant's direction, and analysed the dataset.
- **Grok (xAI)**: compared options (which build, demo, branding, publication timing) and reviewed claims; Lebohang Loliwe made the final calls.
- **ChatGPT and Codex (OpenAI)**: research, code, tests and browser checks under the entrant's direction.
Every number in this README was produced by the code in this repo (`python3 -m holdline.evaluate`).

## Bundled third-party material
- IBM Plex Sans and IBM Plex Mono fonts (`holdline/static/fonts/`), SIL Open Font License 1.1, licence text in `holdline/static/fonts/OFL.txt`.
- Inter variable font, Latin subset (`holdline/static/fonts/Inter-latin-wght.woff2`), SIL Open Font License 1.1, licence text in `holdline/static/fonts/OFL-Inter.txt`. Versions and checksums: [THIRD_PARTY.md](THIRD_PARTY.md).
- Four outline icons from Tabler Icons (MIT), vendored as inline SVG paths; licence text in `holdline/static/LICENSE-tabler.txt`.
- No other third-party code; Python standard library only.

## Team
| Name | Role | Country | Presenting Friday (in person / online) |
|------|------|---------|-----------------------------------------|
| Lebohang Loliwe (individual) | Everything: product, build, data analysis | South Africa | TBC (finals demo after 11:10 EAT on 13 Nov; backup recorded demo of 3 min or less) |

## Known limits and next steps
- Synthetic data only; the user is a hypothesis; no clinician has reviewed the release rules.
- Day-level residency: a unit in the fridge any part of a day counts as in it for that day of the event.
- Two different counts: the header's "units on hold" (1,260 in 33 open holds on the default window since 2026-10-01; 9,910 in 412 open holds on the full-history stress demo started with `--since 2025-11-01`) counts distinct units in open cases and leaves out units already expired on the day they sat in the fridge; the evaluation's 10,259 counts every unit on any flagged fridge-day of the whole year. They are different populations and are never compared.
- Glitch hours inside a hot run are bridged (tested); metrics unchanged on this data.
- Demo log-in only (synthetic users and PINs, in-memory sessions, no TLS): not real authentication. No live logger feed, no SMS gateway.
- No hosted demo: hosting needs the dataset on a public server, which the starter kit does not clearly permit.
- Next: native-speaker review of the Kiswahili pack, Kiswahili screens, probe-check step in the decision, live logger ingest.

## Alternatives tested

A CUSUM detector (k = 0.5, h = 1) was tried on a side branch (`ui/rethink-grok2-algo`, 8d1c4c2). On the same synthetic data it scored precision 74.2% against 66.1%, recall 94.8% against 95.4%, 1,130 fewer false holds, 45 more exposed units missed, and 1,953 against 1,984 units held before transfusion day. It was tuned on the same data it was scored on, so the gain is unproven, and it misses more exposed units. Not adopted; the shipped rule and its numbers are unchanged. Mean kinetic temperature scored worse; gap filling, bitsets and Merkle hashing gave no gain.
