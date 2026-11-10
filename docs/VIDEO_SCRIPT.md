# Demo video script (target 2:45, hard limit 3:00) · DRAFT, not recorded

Recorded on a laptop running `python3 -m holdline.server data` at 127.0.0.1. Screen plus voice. Synthetic data only.

| Time | Screen | Voice (about 360 words) |
|---|---|---|
| 0:00 to 0:20 | Header metrics | "In this synthetic year of Kenyan blood supply, 7,112 units sat in a fridge or cool box that went out of range, and 2,119 of them were transfused. HOLDLINE puts those units on hold and lets only a qualified person release them." |
| 0:20 to 0:45 | Open the Naivasha case, chart | "This fridge measured above 6°C for four hours, peaking at 8.5. HOLDLINE opened a hold case on its own and listed the 26 units that were in that fridge that day. The reason is in plain words, with the 48-hour chart." |
| 0:45 to 1:05 | A logger-gap case, if one is in the window, or the README gap rule | "Loggers go silent in power cuts while the fridge keeps warming. A silence of three hours or more during a cut without backup power is treated as a presumed excursion. Other silences are shown as unverified, without a hold." |
| 1:05 to 1:20 | SMS card | "Sites with no data get a single SMS, under 160 characters. In this prototype it's simulated, not sent." |
| 1:20 to 1:50 | Sign in as demo.officer, try to release (blocked), Accept another case | "A duty officer can confirm a hold but can't release units. Releasing needs a qualified manager, a reason, and a second qualified person whose PIN the server checks. The browser can't claim a role: identity comes from the server session." |
| 1:50 to 2:15 | Sign in as demo.manager, tick one unit, second signer demo.manager2, Change; audit trail | "Here a manager releases one unit that was moved to a backup fridge, and keeps 25 quarantined. Every action goes into an append-only log. Each row is chained by hash, so an edit shows. The header says Intact." |
| 2:15 to 2:30 | Dev tools offline, Accept, queue chip, back online | "Offline, the app still opens. Keeping units on hold can be queued and syncs once. Releases wait for the server." |
| 2:30 to 2:50 | Metrics tiles / README table | "Against the dataset's own exposure label, the simple rule of holding any fridge that reads above 6°C has 24% of its holds correct. HOLDLINE has 66%, with 18,254 fewer wrong holds at about the same recall. It is not better at stopping units before use: it holds 54 fewer exposed units before their transfusion day. Synthetic data, demo log-in, not a medical device." |
| 2:50 to 3:00 | Title | "HOLDLINE. The system holds. Only a person releases. Lebohang Loliwe, individual entry." |

Check before recording: case numbers match the running build; no claim beyond the README.
