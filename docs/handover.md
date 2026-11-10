# HOLDLINE build log and handover

Entrant: Lebohang Loliwe (individual). Built by him using AI coding agents under his direction (tools listed in the README).
Build window: Tue 2026/11/10 11:00 SAST to Wed 2026/11/11 11:00 SAST. All times SAST.

## Log
| Time | What |
|---|---|
| 11:50 | Repo created, README seeded. |
| 11:53 to 12:00 | Starter dataset checks; visual system drafted. |
| 12:04 to 12:12 | Engine: glitch filter, excursion persistence, logger gap with power cuts, unit residency, evaluation against `temp_excursion_exposed`; SQLite store with append-only, hash-chained audit; stdlib HTTP server; offline UI; first tests. |
| 12:20 | Glitch hours inside a hot run bridged; metrics unchanged. |
| 12:22 | Entry confirmed as individual; repo renamed to holdline-terumo-2026. |
| 12:33 | Security: server binds 127.0.0.1; identity from a server session after demo PIN log-in; release needs a second qualified signer with a server-checked PIN; offline releases refused. |
| 12:35 | Claims corrected: no harm claim; before-transfusion-day figures shown both ways; thresholds stated as chosen configuration. |
| 12:46 | Architecture diagram, demo video script draft. |
| 12:50 | Pre-publication history check script. |
| 12:55 | Failure-mode table; offline queue kept across server restarts without re-attributing decisions. |
| 13:00 | Hold reasons state certainty (Measured / Presumed, not measured / Unknown). README pass removing unproven claims. |
| 13:24 | History cleaned of unrelated private names before publication. |
| 13:27 | Repo made public. |
| 15:28 | IBM Plex font licence (SIL OFL 1.1) added. |
| 15:37 | Integration: units held on every day of a multi-day event (fix, 4 tests); session expiry, PIN lockout, request guards, exact-meaning idempotency (24 tests); interface redesign and 404 page; events with no units logged outside the queue; newest 20 open cases cached for offline use. 60 tests pass with the starter data. |
| 15:53 | Two fixes ported from a tested logic baseline: a Change listing a unit outside the case is refused with nothing written; cross-case hold warning per case and per unit. 2 tests added; 62 pass with the starter data. |
| 17:23–17:28 | Reproduced two missed regressions: Accept with selected unit IDs released those units without signatures; normal server restart erased reviewed cases and audit history. Server now ignores release selections for Accept, browser strips them, and SQLite persists beside the dataset by default. Four added tests, including the HTTP boundary and restart/retry preservation; all 66 pass with the official starter dataset. Independent review subsequently confirmed both fixes. |

## How to verify
See README "How to run it". `python3 -m holdline.evaluate data` reproduces every metric.

## Open items
- Demo video (3 minutes or less) to record.
- Synthetic data only; user is a hypothesis; no clinician review.
