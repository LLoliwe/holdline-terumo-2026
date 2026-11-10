# Handover: Terumo BCT Africa Hackathon 2026 · signals and visual system

State: **draft**. The visual system is rendered as static mock-ups. Nothing has been built or tested in an app. Prepared 2026/11/10, 12:00 SAST. All times SAST.

## Action log
| Time | Who | Action |
|---|---|---|
| 10:47 | Hany (Talo) | Kickoff email to about 40 participants. Build clock 11:00 SAST. |
| 10:54 | Lebo approved, Quest sent | Follow-up to Hany (cc Suban) on the shortlist thread: solo entry, roster name, showcase slot. No reply yet. |
| 11:42 | Lebo approved, Quest sent | Reply to Okoye with Lebo's number, noting the solo request is open. |
| 11:43 | Lebo | Asked to file all signals, build a visual system, and write a handover. |
| 11:44 | Lebo | Asked for the SNR OMEGA loop (PRY-441). |
| 11:45 | Lebo | Approved filing the roster as Team TrustLedger with all four members. |
| 11:46 | Lebo | Asked for a timestamped audit log here and in the report. |
| 11:47 | Quest | Read 56 Gmail results, the brief, the README template, the deck template and the starter dataset (Drive, read-only). |
| 11:50 | Quest | Checked team email for a teammate's roster or repo: none found. WhatsApp can't be seen. |
| 11:50 | Quest | Created private repo LLoliwe/trustledger-terumo-2026, README seeded (inside the build window). |
| 11:51 | Quest | Read the check-in form: 7 fields, no email collected, no GitHub access instruction. |
| 11:52 | Quest, per Lebo's 11:45 approval | Submitted the roster form. Confirmation: "Your response has been recorded." |
| 11:53 to 11:58 | Quest | Data checks on the starter dataset. Designed the visual system, rendered it, and did two review rounds. |
| 11:59 | Quest | Pushed docs/signals.md and design/ to the repo. |
| 12:00 | Quest | Wrote this handover. |

## Roster as filed (11:52)
Team TrustLedger · filed by Lebohang Loliwe · Roster and repository, Tuesday 14:00
- Lebohang Loliwe, Founder of Pryntor, South Africa
- Admire Chitove, role to be confirmed, Zimbabwe
- Okoye Chiagozie Delight, Pharmacy student, problem research and workflow design, Nigeria
- Isaac Briandt, Software engineer, Ghana
GitHub: https://github.com/LLoliwe/trustledger-terumo-2026
Question field: "The repository is private until it goes public before the deadline. Please send the GitHub usernames to add as collaborators. Also, Lebohang's request to compete individually is still open with Hany. This roster is filed in case that isn't granted."
Roles come from each member's own intro email. Admire sent none.

## SNR OMEGA stages
1. **Observe:** All Gmail threads since 2026/10/15, the brief, the kit, the dataset README and data dictionary.
2. **Establish truth:** Lebo confirmed participation at 07:04, before the 08:00 deadline. Solo is still unresolved. The roster was due 13:00 and filed at 11:52. 2,119 exposed-and-transfused units, recounted from units.csv.
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
- The README says 60 sensor glitches, but we counted 55. Check how 0.0 is counted before quoting it.
- The 2,119 exposed units mostly show no excursion in the hospital's hourly log. Exposure may come from logger gaps. That is a data-quality finding worth building on, but it is unproven.
- "Holdline" is a working name. Changing it is cheap.
- The design files count as work in the repo. They were made at 11:53 to 11:59 SAST, inside the build window (from 11:00 SAST).
- Mock-ups score nothing on their own. The prototype carries 25 points.

## Open decisions and next actions, in order
1. Lebo: solo or TrustLedger. Chase Hany if there's no reply by 14:00.
2. Lebo: send teammates' and organisers' GitHub usernames, or decide to make the repo public now.
3. Team: agree the Holdline workflow at the 14:00 expert Q&A (optional) and check the problem with the expert.
4. Build: ingest temperature_logs, power_outages, units and transfers, then the excursion detector, the hold queue, Accept / Change / Reject, the audit log and the SMS text.
5. Baseline: compare "flag only above 6°C" with "hold, including logger gaps", and report units caught.
6. 19:00 check-in 1. 05:00 check-in 2. Video by 09:00 Wed. Submit by 11:00 Wed SAST.
7. Friday showcase clash: needs Hany's written slot.
