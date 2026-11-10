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
