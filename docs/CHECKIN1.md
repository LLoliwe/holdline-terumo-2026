# Check-in 1 draft (due Tue 19:00 SAST; form says 20:00 EAT) · DRAFT, needs Lebo's approval before sending

Team name: TrustLedger (required field, no individual option; individual entry confirmed 12:19 SAST)
Full name: Lebohang Loliwe
Which check-in: Check-in 1, Tuesday 20:00
Roster: Lebohang Loliwe, individual entrant, South Africa
GitHub: https://github.com/LLoliwe/holdline-terumo-2026 (private until publication; public before the deadline)

What works right now:
HOLDLINE, a cold-chain hold workflow on the synthetic starter dataset. It detects fridge excursions (2+ hours above 6°C, glitch codes ignored) and logger gaps during power cuts without backup. It holds every unit that was in that fridge that day. Then a person decides: Accept / Change / Reject, with releases needing a qualified role and a server-verified second signer. It also has an append-only hash-chained audit log, a simulated SMS under 160 characters, and an offline-tolerant UI. 31 automated tests pass. Against units.temp_excursion_exposed: precision 66.1% vs 24.1% for "any reading above 6°C", recall 95.4% vs 96.9%.

What is blocking you, or your question:
Nothing blocking. Question: can finalists show the demo with a demo log-in and synthetic users, or do judges expect real authentication?

(Update the numbers and "what works" to the build at 19:00 before sending.)
