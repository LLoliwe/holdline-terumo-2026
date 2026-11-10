# Handover: Terumo BCT Africa Hackathon 2026 · signals and visual system

State: **draft**. The visual system is rendered as static mock-ups. Nothing has been built or tested in an app. Prepared 2026/11/10, 12:00 SAST. All times SAST.

## Action log
| Time | Who | Action |
|---|---|---|
| 10:47 | Hany (Talo) | Kickoff email to about 40 participants. Build clock 11:00 SAST. |
| 10:54 | Lebo approved, Quest sent | Follow-up to Hany (cc Suban) on the shortlist thread: solo entry, roster name, showcase slot. No reply yet. |
| 11:42 | Lebo approved, Quest sent | Reply to a former roster contact, noting the solo request was open. |
| 11:43 | Lebo | Asked to file all signals, build a visual system, and write a handover. |
| 11:44 | Lebo | Asked for the SNR OMEGA loop (PRY-441). |
| 11:45 | Lebo | Approved filing the roster under a team name (superseded 12:19 by the individual entry). |
| 11:46 | Lebo | Asked for a timestamped audit log here and in the report. |
| 11:47 | Quest | Read 56 Gmail results, the brief, the README template, the deck template and the starter dataset (Drive, read-only). |
| 11:50 | Quest | Checked team email for a teammate's roster or repo: none found. WhatsApp can't be seen. |
| 11:50 | Quest | Created private repo (now LLoliwe/holdline-terumo-2026, renamed 12:22), README seeded (inside the build window). |
| 11:51 | Quest | Read the check-in form: 7 fields, no email collected, no GitHub access instruction. |
| 11:52 | Quest, per Lebo's 11:45 approval | Submitted the roster form. Confirmation: "Your response has been recorded." |
| 11:53 to 11:58 | Quest | Data checks on the starter dataset. Designed the visual system, rendered it, and did two review rounds. |
| 11:59 | Quest | Pushed docs/signals.md and design/ to the repo. |
| 12:00 | Quest | Wrote this handover. |

## Entry status (updated 12:22)
Individual entry: **Lebohang Loliwe (individual)**, confirmed by Hany (Talo) at 12:19, still eligible for the overall prize. The 11:52 roster form was filed under a team name and needs correcting; nothing is resubmitted until Lebo approves. Teammate details removed from this repo.

## SNR OMEGA stages
1. **Observe:** All Gmail threads since 2026/10/15, the brief, the kit, the dataset README and data dictionary.
2. **Establish truth:** Lebo confirmed participation at 07:04, before the 08:00 deadline. Individual entry confirmed 12:19. The roster was due 13:00 and filed at 11:52. 2,119 exposed-and-transfused units, recounted from units.csv.
3. **Extract signal:** The prototype is 25 points and "a clickable mock-up alone is not enough". Person-in-control and fallback are mandatory. Low power and connectivity count for 15. The challenge area is data quality and cold chain.
4. **Remove noise:** Dropped unrelated hackathon emails and dropped generic dashboard looks. No Terumo BCT logo, because the rules don't grant its use.
5. **Highest-leverage action:** One workflow. An excursion triggers an automatic hold, a person decides (Discard / Change / Release with a second signature), and an SMS fallback. This scores on prototype, AI-safety and African conditions at once.
6. **Implement:** Tokens (CSS + JSON), a system sheet, a bench dashboard on a real trace (RBTC-MSA 2025/11/24), a phone and SMS alert, a deck cover and a video title card.
7. **Test:** Rendered headlessly at real sizes. The SMS is counted at 153 of 160 characters. Unit IDs and the trace come from the starter dataset.
8. **Verify:** Round 1 fixed fonts not loading, chart labels in a serif fallback, unit IDs wrapping and a wrong "11 hours" claim. Round 2 checked layout at 1600, 1200 and 1920 widths.
9. **Adversarial review:** See "Weak points" below.

## Files
- docs/signals.md: timeline, deadlines (SAST and EAT), exact rule quotes, judging, data signals, open questions.
- design/tokens.css, design/tokens.json: colours, states, type, spacing, and thresholds from the data dictionary.
- design/01-system.png: wordmarks, colour, type, the five states, the rules.
- design/02-dashboard.png: bench screen with trace, held units, data quality, custody, audit.
- design/03-mobile.png: smartphone alert, offline state, and the same alert as one SMS.
- design/04-slide.png: deck cover. design/05-title.png: demo video title card.
- The HTML sources are next to each PNG. Fonts are IBM Plex (SIL OFL).

## How to use the components
- Every state uses colour, shape and a word together. Red only means out of range.
- Readings, times, IDs and counts use Plex Mono. Everything else uses Plex Sans.
- Thresholds come from a settings file per country, never hard-coded.
- AI or rules may raise a hold. Only a person releases, and release needs a second signature.
- Every hold also produces one SMS of 160 characters or less.

## Weak points (adversarial review)
- The data-quality figures on the dashboard (94%, 41 h, 2, 97%) are illustrative. Replace them with real queries.
- Glitches settled: the published temperature_logs.csv holds 55 (0.0 x22, -99.0 x17, 99.9 x16). The dataset README says 60. We report 55.
- The 2,119 exposed units mostly show no excursion in the hospital's hourly log. Exposure may come from logger gaps. That is a data-quality finding worth building on, but it is unproven.
- "Holdline" is a working name. Changing it is cheap.
- The design files count as work in the repo. They were made at 11:53 to 11:59 SAST, inside the build window (from 11:00 SAST).
- Mock-ups score nothing on their own. The prototype carries 25 points.

## Open decisions and next actions, in order
1. DONE 12:19: individual entry confirmed. Correct the 11:52 roster form once Lebo approves the exact text.
2. Repo goes public before Wed 11:00 SAST (recommend 08:00); Grok decides per Lebo.
3. Optional: test the Holdline workflow at the 14:00 expert Q&A (optional) and check the problem with the expert.
4. DONE 12:11: build and baseline (see log below).
5. Grok decides (per Lebo 12:14): HOLDLINE, the Drive CP5 custody workbench, or a merge. See docs/FOR_GROK.md.
6. 19:00 check-in 1. 05:00 check-in 2. Video by 09:00 Wed. Submit by 11:00 Wed SAST.
7. Finals demo after 11:10 EAT (10:10 SAST) on Fri 13 Nov, after COS2611 08:00 to 10:00 SAST: tight but clear. Record a backup demo of 3 min or less.


## Build log (SAST, 2026/11/10)
- 12:04 Detector, exposure tracing and evaluation committed (194e98a). Baseline vs HOLDLINE computed on the full year against units.temp_excursion_exposed.
- 12:10 Drive read (read-only). Found a parallel build: "Terumo Hackathon - START HERE (canonical index).md" (modified 12:01), "agent handoff brief (canonical).txt" (11:52), "prototype checkpoint 5" zip (11:51, custody reconciliation workbench). Brand source: "Grok_Brand_Assets_2026-10-22_v2.zip" (2026/10/22 07:31), Pryntor R3 ink #111116. No "branding company" or "instruct" file found.
- 12:11 Hold queue, Accept / Change / Reject with qualified releaser and second signature, append-only SHA-256 audit chain, SMS fallback, offline UI with decision queue, 23 tests (22 pass without data, 1 end-to-end with data, all pass). Commit 2895d50. Ink token aligned to Pryntor R3 (6d4f230).

## Results (reproduce with python3 -m holdline.evaluate data)
| | Held | Recall | Precision | False holds | Exposed-then-transfused caught |
|---|---|---|---|---|---|
| Baseline (any reading >6°C) | 28,619 | 96.9% | 24.1% | 21,727 | 2,085 / 2,119 |
| HOLDLINE | 10,259 | 95.4% | 66.1% | 3,473 | 2,101 / 2,119 |
Later-data check (units collected from 2026/07/01): precision 16.2% to 48.6%, recall 96.8% both.

## Honest gaps
- Not hosted: a public host would carry the organiser data. Lebo decides.
- Residency and truth both day-level; disclosed in README.
- Demo users, no real log-in; SMS simulated; no video yet.

- 12:16 docs/FOR_GROK.md decision brief (d2b5a38). 12:20 glitch hours bridged inside hot runs (0f47fe3), metrics unchanged.
- 12:22 Individual entry: repo renamed trustledger-terumo-2026 to holdline-terumo-2026 (GitHub redirects the old URL and API path; checked). Description, README, UI header, design notes, handover and FOR_GROK made individual; team name and teammates removed.
- 12:30 Grok decisions D1 to D5 filed in Drive (read 12:33). HOLDLINE is the sole build.
- 12:36 Security fix (8b22bfc): server-side demo sessions, identity never from the request body, PIN-verified second qualified signer, bind 127.0.0.1, offline releases refused. 31 tests pass.
- 12:40 Claim fixes: "held before transfusion day" replaces "harm prevented" (baseline 2,038, HOLDLINE 1,984: 54 fewer); cool box trigger fires 0 times; thresholds are our chosen config. Acknowledgement in docs/signals.md.
- 12:38 Corrected check-in submitted (Lebo approved the exact text 12:37): Team name TrustLedger, selected only because the field is required and has no individual option; full name Lebohang Loliwe; "Roster and repository, Tuesday 14:00"; roster "Lebohang Loliwe, individual entrant, South Africa"; repo https://github.com/LLoliwe/holdline-terumo-2026; comment asks the organisers to disregard the 11:52 team roster. Confirmation: "Your response has been recorded." The 11:52 response still exists (the form can't edit responses).
- 12:45 Architecture diagram (docs/architecture.svg + png, linked in README), video script draft (docs/VIDEO_SCRIPT.md), check-in 1 draft (docs/CHECKIN1.md, needs Lebo's approval before sending).
- 12:50 Pre-flight on full history (37 commits, 78 blobs): no CSV/kit files, no secrets; one employer-name word in FOR_GROK.md removed (29315d0). Script: scripts/preflight.py (6b4929d).
- 12:55 Grok assignment: docs/FAILURE_MODES.md, 15 failure modes with detection, fallback, human gate and test (69cff5e). Found and fixed a bug while writing it: offline-queued decisions would be dropped after a server restart; now kept and replayed only under the same user (ba6266c, not browser-tested). Diagram confirmed against code after 8b22bfc.
- 13:02 Hold reasons state certainty (8a97c17, 4b2dca1). README final pass: removed the unproven "many exposures happen while the logger is silent" (baseline recall 96.9% shows most are visible in the log); "beats the baseline" narrowed to precision; label construction (day-level) disclosed; test commands include the server tests; UI size corrected to 21 KB; failure-mode link added.
