# Signals: Terumo BCT Africa Hackathon 2026 (filed 2026/11/10)

All times SAST (UTC+2) with EAT (UTC+3) in brackets. Sources: Lebo's Gmail (lebo@ / partnerships@pryntor.co.za), the official technical phase brief (Google Doc, 2026/11/09), and the Applicant's Kit on Drive.

## Status
- Shortlisted: 1 of 10 teams from 362 applications (25 countries). Challenge area **data quality and cold chain**.
- Entry: individual, confirmed by Hany (Talo) at 12:19 on 2026/11/10; still eligible for the overall prize.
- The 11:52 roster form was filed under a team name; it needs correcting once Lebo approves.

## Deadlines
| SAST | EAT | What |
|---|---|---|
| Tue 11:00 | 12:00 | Kickoff, 24h build clock starts |
| Tue 13:00 | 14:00 | Roster + GitHub link on check-in form (DONE 11:52) |
| Tue 14:00 to 15:00 | 15:00 to 16:00 | Blood-service expert Q&A, optional, same Meet |
| Tue 19:00 | 20:00 | Check-in 1: what works, what blocks |
| Wed 05:00 | 06:00 | Check-in 2 |
| Wed 09:00 | 10:00 | Recommended: demo video recorded |
| Wed 11:00 | 12:00 | Submissions close, form closes on time |
| Wed by 19:00 | by 20:00 | Five finalists told by email |
| Thu 12 Nov | | Finalist rehearsal and tech check |
| Fri 13 Nov | | Showcase, Nairobi and online. CLASH: UNISA COS2611 08:00 to 10:00 SAST. Hany (2026/10/25) offered a late slot or recorded demo "at the point of selection". |

Links: Meet https://meet.google.com/qao-emcb-gkv · check-in form https://docs.google.com/forms/d/e/1FAIpQLSfu1LgJRDJdEFr91opKYw6uBVRoK_pXEhqvx4bQgayp3ol8Wg/viewform · submission form https://docs.google.com/forms/d/e/1FAIpQLSfpGlw4gKrrhRZobffRZreKFFSgGXQ1r4Hw4fxZap8NgdqDCg/viewform · brief https://docs.google.com/document/d/1vVODvnIPy1TnPHBqHeBQ32WBEY1cgH4nQiGdGErH6Fc · kit https://drive.google.com/drive/folders/1e4gcSnUvbao73maOT3-THjgUBtMQJDa- · announcements WhatsApp (read-only) https://chat.whatsapp.com/GnPADWCUVsWDCfMKrHzlEi

## Rules (exact quotes from the brief)
- "All code must be written between Tuesday 12:00 and Wednesday 12:00. ... Code written before the hackathon, by you or anyone else, is not [fine]."
- "Use one GitHub repository per team, shared with us by 14:00 on Tuesday and public by the deadline. Commit as you go. One large commit at the end will be checked closely."
- "You may use ChatGPT, Claude, Copilot, Cursor or similar tools. List which ones and what for in your README. Every team member should be able to explain how your solution works."
- "Only the people named on your roster may build."
- "A clickable mock-up alone is not enough."
- Must have: working prototype of one workflow on synthetic data; one AI/data feature vs a simple baseline with both numbers; Accept / Change / Reject step; fallback when AI is wrong or offline; architecture diagram; README from template; demo video of 3 min or less.
- AI must never: release a unit or decide compatibility without a qualified person; override a lab result or quarantine; contact a donor/patient with an unapproved message; rank patients on anything but clinical need; present a guess as a fact.

## Judging (out of 100)
Working prototype 25 · Technical depth and architecture 20 · AI and data approach 15 · Blood-system problem and user 15 · African conditions and scale 15 · Demo and readiness 10. Ties within 2 points go to the prototype score; the panel "may also consider which teams can present in person".

## Data signals (starter dataset, synthetic, Kenya model)
- 2,119 units transfused after fridge or cool box went out of range; "Nobody flagged it." (README; recount by us: 2,119, matches.)
- 3,937 units discarded for temperature; 4,607 hourly readings above 6°C; sensor glitch values found: 55 (README says 60; check whether 0.0 counted differently).
- Safe range red cells and whole blood 2 to 6°C; cool box excursion above 10°C.
- Example real trace used in the designs: RBTC-MSA, 2025/11/24, power cut 12:29 with no backup (18.0 h), 4.0°C to 14.9°C by 23:00.

## Open questions
1. RESOLVED 12:19: individual entry.
2. Showcase slot vs exam on Fri 13 Nov.
3. Organisers' GitHub usernames (asked on the form) or make the repo public early.
4. Not needed now (individual entry).
5. Terumo BCT's written answers on terms, marketing consent and recordings (promised 2026/10/25, never received).


## Acknowledgement: Grok decisions D1 to D5 (read 2026/11/10 12:33 SAST)
Read in full: Drive "Terumo Hackathon - GROK DECISIONS D1-D5 and verified findings - 2026-11-10 1230 SAST.md" (filed by Instinct from the web Grok coordination chat). Quest follows it:
- D1 HOLDLINE is the sole build, no CP5 merge. Security fix first (done, commit 8b22bfc): the server binds 127.0.0.1 by default; identity and role come from a server-side session after a demo PIN log-in, never from the request body; a release needs a second qualified signer whose PIN the server verifies; offline releases can't be queued; the log-in is labelled demo-only everywhere. 8 HTTP tests cover it. Claim fixes (next commit): no "harm prevented"; 54 fewer exposed units held before their transfusion day than baseline (1,984 vs 2,038); 18,254 fewer false holds; precision 66.1% vs 24.1%; the cool box >10°C trigger fires zero times; thresholds are our chosen config (the dictionary only sets 2 to 6°C); no confidence probabilities.
- D2 local run plus a video of 3 minutes or less; no hosting.
- D3 individual entry, "Lebohang Loliwe (individual)". The roster-form correction waits for Lebo's approval of the exact text.
- D4 no Pryntor wordmark; R3 ink #111116 and IBM Plex only.
- D5 the repo stays private until Lebo approves the exact commit; history pre-flight before publication.
