# HOLDLINE demonstration walkthrough

The current film was rendered from actual browser interactions on the synthetic starter dataset. It is a narrated sequence of application captures, not an uninterrupted screen recording. File: `HOLDLINE-demo-Lebohang-Loliwe.mp4`. Duration: **163.188 seconds (2:43.19)**. SHA-256 `63837c8ed2f78e04bcbc7fdb9529e1a2ea67e699df7c5c941cde94fd79c2a0e8`, 6,410,693 bytes. It predates the case-screen explain line, the distinct week unit count (77, not the summed 83) and the SMS wording "Do not release". The scene table below was written for an earlier 2:52.86 cut and has not been re-timed against this file.

Local artifact: `out/demo/HOLDLINE-demo-Lebohang-Loliwe.mp4` (ignored by Git). Public delivery link is not yet configured. Proof: `out/demo/browser-evidence.json`, `restart-evidence.json`, `video-manifest.json`. Full narration is in `scripts/render_demo.py`; the exported transcript accompanies the video.

| Start | Actual application state | Demonstration |
|---|---|---|
| 0:00 | Hold queue and year metrics | Synthetic-data context; no prevented-harm claim. The 7,112 exposed and 2,119 transfused counts come from evaluation, not header tiles. |
| 0:21 | Kajiado case HL-HSP-007-2026102223-EXC | Three consecutive hourly readings above 6°C, peak 7.8°C, two units. |
| 0:38 | SMS preview | 137 characters; simulated, nothing sent. |
| 0:50 | Duty-officer session | Release controls disabled; Accept is always hold-only. |
| 1:03 | Manager, one selected unit, second signer | Hypothetical reason. Other-case holds remain; this is not permission to issue a unit. |
| 1:19 | Changed case and audit | One unit released within this case, one quarantined; actors recorded; decisions survive restart. |
| 1:35 | Offline Naivasha Accept | Pending decision visible; 26 units stay held. |
| 1:46 | Page reloaded offline | Cached case and pending decision retained. |
| 1:54 | Reconnected, accepted case | Exactly one decision applied; all 26 units quarantined. |
| 2:05 | Paired full-year metrics | Precision 24.1% → 66.1%; 18,254 fewer false holds, 106 additional exposed misses, 54 fewer held before transfusion day. |
| 2:29 | Closing overview | Synthetic prototype, demo authentication, no live feed. Built by Lebohang Loliwe using AI coding agents under his direction. Named tools appear only in README disclosure. Synthetic voice disclosed. |

Unverified gaps are engine outputs but are not shown in the staff queue. No real backup-fridge move, clinical validation, live SMS, or hardware power-loss testing is claimed.

Reproduction requires local Chrome, macOS speech synthesis and ffmpeg in addition to the app's Python standard library. `node scripts/browser_demo.mjs` makes real decisions on synthetic cases; use a fresh disposable demo database for a new capture. The renderer checks that case facts match narration and refuses a mismatched recording. Preserve existing captures and database before rerunning.
