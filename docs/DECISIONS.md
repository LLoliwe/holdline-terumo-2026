# HOLDLINE decision record

## 2026/11/10 21:32 SAST: Merge ui/rethink into main
- **Decided by:** Lebohang Loliwe (explicit "Yes" in chat).
- **What:** ui/rethink (bae4b46, 18 commits ahead, 0 behind) merged into main as 468d1ba. Previous main: 334ba10.
- **Why:** final flat UI (black, #121212, white, one blue accent; red/orange/green only for safety), 7-night fridge grid, phone case sheet, handover card, CSV export, printable case report, light mode. Film and deck media must be recorded from the final app before the submission cutoff.
- **Evidence:** `python3 -m unittest discover -s tests` = 71 tests OK (1 skipped); `bun test ./tests/test_overview.js` = 6 pass, 0 fail. No GitHub Actions checks configured on the repo.
- **Reproduce:** `git checkout 468d1ba && python3 -m unittest discover -s tests && bun test ./tests/test_overview.js`.

## 2026/11/10 21:32 SAST: Lock deck v5 as the submission deck
- **Decided by:** Lebohang Loliwe (explicit "Yes" in chat).
- **What:** HOLDLINE deck v5 (10 slides) is the submission deck. Cover signed "Lebohang Loliwe, Builder · South Africa", no smaller than the Terumo BCT and TALO logos; Pryntor branding left off.
- **Why:** the entry is registered to Lebohang Loliwe as an individual and he keeps ownership of what he builds, so the deck credits him personally rather than Pryntor (his call, 21:24).
- **Evidence:** v5 passed claims and de-slop checks before approval. No further edits without his approval.

## 2026/11/10 22:10 SAST: Adversarial pre-submission audit and non-visual hardening (branch audit/hardening)
- **Decided by:** Lebohang Loliwe asked for a hard, critical submission check with no change to looks (21:54). Merge to main waits for his yes.
- **What:** server-side input checks in `store.decide` (case ID required, reason must be text, unit list must be a list of IDs, second signer must be a name); duplicate unit IDs released once so the audit count is right; unknown case returns 404; `evaluate` prints usage instead of crashing; README test counts, UI size and font list corrected; Grok disclosure states that Lebohang Loliwe made the final calls; tool names removed from code comments; data model and a documented (not built) FHIR / ISBT 128 / DHIS2 mapping added to ARCHITECTURE.md. No visual, layout, colour, font or deck change.
- **Why:** found by probing the running server: a duplicate unit in a Change wrote "Released 2" for one unit (wrong audit count); a numeric reason crashed the request handler; README said 67/68 tests and "UI about 21 KB" (actual 75/76 and about 147 KB).
- **Evidence:** `HOLDLINE_DATA=<starter dataset> python3 -m unittest discover -s tests` = 76 OK; without data 75 OK, 1 skipped; `bun test ./tests/test_overview.js` = 6 pass. `python3 -m holdline.evaluate <data>` reproduces the README table exactly (full year and `--since 2026-07-01`).
- **Reproduce:** `git checkout audit/hardening && python3 -m unittest discover -s tests && bun test ./tests/test_overview.js`.

## 2026/11/10 22:05 SAST: Merge audit/hardening into main
- **Decided by:** Lebohang Loliwe (yes to all, 22:05).
- **What:** audit/hardening (4aa9c9a) merged into main as f4b855f. Previous main: 901dfbf.
- **Evidence after merge (fresh clone of f4b855f):** with the starter dataset, `python3 -m unittest discover -s tests` = 76 OK; without data 75 OK, 1 skipped; `bun test ./tests/test_overview.js` = 6 pass, 0 fail.
- **Reproduce:** `git checkout f4b855f && python3 -m unittest discover -s tests && bun test ./tests/test_overview.js`.

## 2026/11/10 22:40 SAST: Senior depth upgrades (branch feature/senior-depth)
- **Decided by:** Lebohang Loliwe asked for deeper functionality at a senior level with no change to looks (22:04). Merge to main waits for his yes.
- **What:** (1) SMS wording moved to language packs chosen by the country config; English unchanged, Kiswahili added and marked as a draft until a Kiswahili-speaking blood bank officer reviews it. (2) `HOLDLINE_CONFIG` selects the country config, which is checked at start-up (required keys, sane thresholds, known language). (3) `python3 -m holdline.verify` checks a store's hash chain read-only. (4) Audit CSV (formula-injection safe) and HL7 FHIR R4 Bundle exports, CLI and signed-in API. (5) `explain` data on every case: rule, threshold, readings counted, measured or presumed, main uncertainty. No visual, layout, colour, font or deck change.
- **Why:** the judging rubric's top tier asks for language and rules changed by settings, a data model mapped to standards, plain-language reasons with uncertainty, and an audit trail. These add that as working, tested functions instead of claims.
- **Evidence:** with the starter dataset, `python3 -m unittest discover -s tests` = 92 OK; without data 91 OK, 1 skipped; `bun test ./tests/test_overview.js` = 6 pass. `python3 -m holdline.evaluate data` unchanged (precision 66.1% vs 24.1%, 3,473 false holds). Live run on the starter data: Kajiado case HL-HSP-007-2026102223-EXC explains 3 of 3 readings above 6°C, peak 7.8°C, measured; Kiswahili SMS for it is 151 characters; verify after a real Accept reported INTACT, 82 audit rows; FHIR export had 33 DetectedIssue and 82 AuditEvent resources.
- **Reproduce:** `git checkout feature/senior-depth && python3 -m unittest discover -s tests`; `HOLDLINE_CONFIG=kenya-sw python3 -m holdline.server data` for Kiswahili SMS.
