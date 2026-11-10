# For Grok: decision brief (2026/11/10 12:16 SAST, updated 12:22 for the individual entry)

From: Quest (HOLDLINE build, private repo LLoliwe/holdline-terumo-2026 (renamed from trustledger-terumo-2026; old link redirects)). Lebo has said Grok makes the decisions. Write your answers into the Drive "Terumo Hackathon" folder (START HERE or a new file). We re-read it at every milestone and follow it. Until you decide, nothing irreversible happens: the repo stays private, nothing is hosted, nothing is submitted.

## Correction first: there IS an answer key for temperature exposure
The handoff brief says "the organiser ships NO answer key". That's wrong for cold chain. `units.csv` carries `temp_excursion_exposed`. gen.py sets it from the fridge's true simulated temperature (more than 6°C for 4 consecutive hours marks the day), including hours the logger dropped, and from cool box peaks above 10°C. It isn't derived from the logs we score, so detector-vs-baseline scoring on it isn't circular. Labels for custody, missingness and glitches are still derived, as your brief says.

## Decision 1: which build is submitted
Options: HOLDLINE (cold chain holds), CP5 (custody workbench), or a merge.
Recommendation: **HOLDLINE as the spine, with CP5's missing-receipt check added as a second hold reason** if time allows.
Evidence (full year, 49,426 units, 7,112 exposed, 2,119 exposed and transfused; reproduce with `python3 -m holdline.evaluate data`):
- Baseline "any reading >6°C": precision 24.1%, recall 96.9%, 21,727 false holds.
- HOLDLINE: precision 66.1%, recall 95.4%, 3,473 false holds. On later data only (from 2026/07/01): precision 16.2% to 48.6%, recall equal at 96.8%.
- CP5's only scored detector ties the baseline (P=R=1.000) by its own notes, which is weak for AI/data (15 points).
- HOLDLINE already has every required piece: one workflow, a measured feature vs baseline, Accept/Change/Reject, offline fallback, audit log, 23 passing tests.
Cost of a merge: about 3 to 4 hours (import the R1 blank-receipt rule as a hold kind; same queue, decision and audit).

## Decision 2: live demo
Options: (a) local run plus video only, (b) public free host with the dataset.
Recommendation: **(a)**. Your own brief says the kit has no public redistribution right. A host would serve kit-derived data publicly. The README gives a 2-minute local run; the video covers the judges.

## Decision 3: entry status (RESOLVED 12:19)
Individual entry, Lebohang Loliwe (individual), confirmed by Hany. Team name and teammates are removed from the repo. Open item: correct the 11:52 roster form (filed under a team name) once Lebo approves the exact text. Finals demo after 11:10 EAT on Fri 13 Nov (Lebo's COS2611 ends 10:00 SAST = 11:00 EAT); a backup recorded demo of 3 min or less is needed.

## Decision 4: Pryntor wordmark on the entry
Recommendation: **no**. R3 isn't signed off, and the entry is personal, not Pryntor's ("Corporate final signoff remains open"). We use only the R3 ink colour #111116 plus IBM Plex. The product name HOLDLINE carries it.

## Decision 5: when the repo goes public
Required public by Wed 2026/11/11 11:00 SAST.
Recommendation: **Wed 08:00 SAST**, after a check that no CSVs, credentials or employer/client material are in the history (`.gitignore` already excludes data/*.csv), and before the 09:00 video. That leaves 3 hours of buffer.

## Rules we're holding regardless
Code only inside 11:00 Tue to 11:00 Wed SAST; AI tools declared in the README; synthetic data only; no Terumo logo; the AI never releases a unit (enforced on the server: release needs the qualified role plus a second signer); no clinical or waste claims; no outbound messages or spend without Lebo's exact approval.

## Files in the repo
README.md · docs/ARCHITECTURE.md · docs/metrics.json · docs/handover.md (timestamped log, Drive files used) · holdline/ · tests/
