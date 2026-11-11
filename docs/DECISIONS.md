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

## 2026/11/10 22:12 SAST: Merge feature/senior-depth into main
- **Decided by:** Lebohang Loliwe (explicit yes, 22:12).
- **What:** feature/senior-depth (a4bd8ce) merged into main as 0f64f05. Previous main: 8fc1b07.
- **Evidence after merge (fresh clone of 0f64f05):** with the starter dataset, `python3 -m unittest discover -s tests` = 92 OK; without data 91 OK, 1 skipped; `bun test ./tests/test_overview.js` = 6 pass, 0 fail.
- **Reproduce:** `git checkout 0f64f05 && python3 -m unittest discover -s tests && bun test ./tests/test_overview.js`.

## 2026/11/10 23:25 SAST: Merge ui/explain-line into main
- **Decided by:** Lebohang Loliwe approved the change at 23:10 and gave standing approval for reviewed, tested HOLDLINE merges until 05:00.
- **What:** ui/explain-line (f94fe33) merged as 5d93b06. The case screen adds one "Why this hold" line (rule, measured or presumed, main uncertainty) from the server's `explain` data, using the existing `why` paragraph style; no new CSS, layout, colour or font. Service worker cache bumped holdline-v48 to holdline-v49 so installed devices pick up the new app.js; the activate step deletes every other cache.
- **Review:** 2 files, 7 lines added, 1 changed. All server text is passed through `esc()` (checked with an `<img onerror>` payload, which renders as text). Cases cached offline before this change have no `explain` and render no line rather than an error (checked).
- **Evidence after merge (fresh clone of 5d93b06):** with the starter dataset 92 OK; without data 91 OK, 1 skipped; `bun test ./tests/test_overview.js` = 6 pass. app.js and sw.js parse (`bun build`). Not checked: a screenshot in a real browser (no browser in the review sandbox); confirm on screen while filming.
- **Reproduce:** `git checkout 5d93b06 && python3 -m unittest discover -s tests && bun test ./tests/test_overview.js`.

## 2026/11/11 07:30 SAST: Submission deck cut from 10 to 8 slides
- **Decided by:** Lebohang Loliwe approved cutting deck v5 to 8 slides with no change to the look (2026/11/10 22:05). The submission form's slides field says "Slides link, up to 8 slides"; the official brief also says up to 8.
- **What:** from the 10-slide v5 he approved at 21:32, dropped slide 3 "How it works today" and slide 5 "Live demo · 5 minutes". Section labels and page numbers on the remaining slides renumbered so they run 01 to 07 and 02 to 08 with no gaps. On "Built for real conditions", the line "English only for now; Kiswahili next." became "Kiswahili SMS: draft, pending native review.", because the draft Kiswahili SMS pack is on main and the old line understated it. No other wording, layout, colour, font or image changed.
- **Why these two slides:** neither is scored on its own in the official template. The problem slide keeps the false-hold scale (76% of baseline holds are false) and the AI feature slide keeps 18,254 fewer false holds, so the workflow slide's 21,727 figure is not lost in substance. The demo is covered by the 3-minute video, and on stage the full 10-slide v5 (which matches the template's 10-slide stage format) can still be used.
- **Numbers checked against docs/metrics.json:** 2,119 exposed and transfused; baseline precision 24.1% (so 76% false); HOLDLINE precision 66.1%, recall 95.4% vs 96.9%; 18,254 fewer false holds (21,727 − 3,473); 106 more missed (326 − 220); 54 fewer held before transfusion day (2,038 − 1,984). The 412 hold cases and 9,910 units on the solution slide are the full-history stress demo counts documented in README.
- **Files:** the deck PDF is kept out of this repo (it carries the organiser's logos). Source v5 SHA-256 9468bdf9…02d4e7; 8-slide PDF SHA-256 05121216…4a835fd9, shared from Lebohang Loliwe's Drive.
- **Reproduce:** take v5 pages 1, 2, 4, 6, 7, 8, 9 and 10, in that order.

## 2026/11/11 07:55 SAST: Overnight QA fixes (distinct unit count, wording, docs, deck v6)
- **Decided by:** Lebohang Loliwe asked for the overnight QA errors to be fixed with no change to the look (2026/11/11 morning).
- **What (app):** the week view counted a unit once per hold, so a unit held on two nights or two holds was counted twice ("83 units on those holds"). `distinctUnits()` in overview.js now counts distinct unit IDs (the server's `/api/cases` sends `unit_ids`); holds without IDs keep their own count. The grid caption now names the start of the last night (2026-10-29), not the morning it ends. SMS wording "Do not issue" became "Do not release", matching the two-person release language (about 139 characters, still under 160). Service worker cache holdline-v49 to holdline-v50. No CSS, layout, colour or font change.
- **What (docs):** README and docs/VIDEO_SCRIPT.md now name the submitted film (HOLDLINE-demo-Lebohang-Loliwe.mp4, 2:43.19, 6,410,693 bytes) and say it predates the explain line and the distinct count. README no longer implies a FHIR integration: no live FHIR, DHIS2 or ABBIS connection is built; a FHIR R4 file export exists.
- **What (deck v6):** text-only edits on slides 3, 4 and 8, set in the deck's font, size and colour: "412 hold cases on the synthetic data" to "412 open hold cases since 2025-11-01, synthetic data"; "9,910 units held" to "Open queue since 2025-11-01: 9,910 distinct units held"; "No FHIR or DHIS2 integration yet" to "No live FHIR or DHIS2 link yet; FHIR file export built"; phone screenshot "83 units" to "77 units" and "through 2026-10-30" to "through 2026-10-29" (glyphs taken from the same screenshot). Cover "Lets a blood bank duty officer see..." kept: "Lets" is the verb, so the QA note asking for "Let's" was wrong. v6 SHA-256 5914efa0…489fb3b0.
- **Evidence:** server run with `--since 2025-11-01` on the starter data: 412 open holds, 9,910 distinct units, week units 77 (old count 83). Tests below.
- **Reproduce:** `python3 -m unittest discover -s tests && bun test ./tests/test_overview.js`; `python3 -m holdline.server data --since 2025-11-01` and open the week view.
