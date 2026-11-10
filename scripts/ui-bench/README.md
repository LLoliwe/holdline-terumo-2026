# UI browser checks

Small shell scripts around `agent-browser` used for docs/UI_RETHINK.md. Start a disposable server first:

    HOLDLINE_DB=:memory: python3 -m holdline.server data --port 8802 --since 2025-11-01   # stress demo: 412 open holds. The app default (no flag) is 2026-10-01: 33 holds, 1,260 units.

- `run.sh URL adapt_new.js label`: load, case-open timings, stale-response race (`adapt_base.js` for the `main` UI).
- `wipe.sh URL new|base`: does a half-typed reason survive the 10 s background sync while a decision is queued offline.
- `keys.sh`: keyboard-only flow on port 8802.
- `offline_accept.sh`: ticked unit plus offline Accept must end with every unit QUARANTINED.
- `reflow.sh PORT`: horizontal overflow at several widths.
- `shots.sh PORT W H LAYOUT PREFIX`: the six scenario captures (writes to `$OUT`, default `./ui-bench-out`).
