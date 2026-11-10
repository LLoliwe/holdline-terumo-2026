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
