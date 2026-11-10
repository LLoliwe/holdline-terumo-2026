# UI rethink (branch `ui/rethink`)

Status: review candidate on a branch. `main` is unchanged until the entrant approves a merge. The decision engine, approval rules and evidence claims are the same as `main`; the only backend change is the queue list size (below).

## What the operator needs, in order

A duty officer opens HOLDLINE to answer three questions: which holds are waiting, is this hold real, and what am I allowed to do about it. The layout follows that order.

1. **First view**: a short statement of what is waiting (open holds, units that cannot be issued), then four starting points: oldest open hold, largest hold, the largest logger-silent hold, and the hottest. The year evaluation figures moved to their own Evaluation view: they are for reviewers, not for the person deciding one fridge.
2. **Queue**: every open case (412 on the full-history demo), searchable by facility, county or case id, filterable by Measured or Presumed, sortable by newest, oldest or most units. Each row carries what changes a triage choice: facility, units, kind, start, duration, peak and county.
3. **Case**: status, facility and the reason in words; then an evidence row (units held, peak, readings above 6°C, hours with no reading, units also held by other open cases); then the chart; then the units. History and the SMS preview are collapsed until needed.
4. **Decision rail**: sticky beside the evidence. Accept is one step with a reason and always keeps every unit quarantined. Release sits behind "Release units…", needs ticked units, a second qualified signer and their PIN, and then a confirmation that states how many units leave quarantine, how many stay, which of them are still held by another open case, the signer and the reason. Duty officers do not see release checkboxes at all, so ticking a unit can never look like it matters for an Accept.

## Layouts compared on the same data

All three are built from the same code (`?layout=split|drawer|page`); phones always use `page`.

| Layout | Keeps queue in view | Keys to review 10 holds | Verdict |
|---|---|---|---|
| **Split workspace** (chosen for desktop) | yes | 10 (`j` previews the next hold) | Fastest triage; queue context never lost; decision rail visible beside the evidence. |
| Drawer | partly (covered) | 10 to 20 (`Enter`, `Esc`) | Full-width queue rows add no information; the drawer hides the queue it came from. |
| Focused page (chosen for phone) | no | 30 (`Enter`, `Esc`, `j`) | Best use of a 390 px screen; too slow on desktop. |

Earlier UI candidates built from `main` (v15 "Linear glass" and v16 Carbon) were run on the same six scenarios. Both keep the old 200-row queue limit, the stale-response race and the lost-draft bug listed below, and v16 adds 225 KB of compiled component CSS. Their visual direction (dark shell) was not carried over; the light evidence sheet reads better for dense tables and charts. A "v17" was not available to compare.

## Libraries considered

| Need | Considered | Decision |
|---|---|---|
| Chart | uPlot 1.6.32 (MIT, 51 KB min, canvas), Chart.js 4.6.1 (MIT, 210 KB min, canvas), Observable Plot 0.6.19 (ISC, 212 KB min plus d3, SVG) | Own SVG (about 4 KB of code). Canvas charts are not readable by a screen reader without a second rendering; 49 points need no plotting engine. |
| Large tables | TanStack Virtual 3.19 (MIT, 62 KB unminified), AG Grid Community 36.3 (MIT, large) | Not needed: the largest case (758 units) renders in about 20 ms; a per-case unit filter covers the search need. |
| Components and styles | Carbon styles 1.119 (Apache-2.0, as in v16) | Not used: 225 KB of CSS for buttons, inputs and a table; native elements with about 15 KB of own CSS do the same job offline. |
| Command menu | ninja-keys 1.2.2 (MIT, last release 2022) | Not built: the app has five actions; search plus `/ j k Enter Esc ?` covers them. |
| Icons | Tabler Icons (MIT, 22k stars, active), Lucide (ISC), Phosphor (MIT), Hugeicons (free set MIT, Pro paid) | **Used: Tabler**, four outline icons in one inline sprite (about 1 KB), each next to a word. Lucide's repo licence reads as mixed in GitHub's metadata, so Tabler's plain MIT was simpler. |
| Motion | Animate UI 2.0 (React, Motion), Motion One, native View Transitions | Not used. Animate UI needs React; the native cross-fade was measured at about 130 ms per case open instead of about 20 ms, which slows `j`/`k` triage. Motion is limited to short hover and focus transitions, off under reduced motion. |
| Visual effects | Shaders (MIT, 200+ WebGPU components), WebGPU particle work | Rejected: decorative GPU load on clinic hardware, and motion in an evidence view distracts from the readings. |
| Component kits seen in the entrant's saved posts | Mebius charts kit (Figma freebie), HorizonX, Bencho, Cue | Rejected: Figma or React blocks, sign-up or Pro tiers, or no clear open licence. |
| Type | IBM Plex (OFL, already shipped), Inter (OFL), Geist (OFL) | Kept Plex: already vendored and its mono suits ids and readings; tabular figures turned on so numbers line up. |

No package dependency is added; the only third-party additions are four Tabler icon paths. Everything ships as plain files served by the Python server, so the offline shell stays small.

## Engineering findings fixed on this branch

| Finding (present in `main`, v15 and v16) | Effect | Fix |
|---|---|---|
| Queue limited to the newest 200 cases | 212 of 412 open holds on the full-history demo could not be reached from the queue | `/api/cases` returns the whole status list (bounded at 5,000) plus the facility county; regression test `QueueList.test_open_queue_returns_more_than_200_cases` fails on the old limit |
| A slow case response could arrive after a newer one | Fast clicking could show case A while case B is selected | Each open aborts the previous request and ignores any superseded response |
| Background sync re-rendered the open case every 10 s while a decision waited | A half-typed reason and ticked units were wiped | Queue changes only repaint the status pill and the sync note; reason, ticks and signer are kept per case in memory |
| Every click re-fetched and rebuilt the whole queue | Extra request and DOM work per click | Selection only toggles classes; the queue is fetched once per status |
| Chart axis followed the readings | A silent logger made the line shorter instead of showing missing time | Fixed 48-hour axis with hatched, labelled "no readings" spans; "hours with no reading" in the evidence row |

## Measured (median of 3 runs, headless Chromium, 1440×900, local server, full-history demo)

| Metric | main | v15 | v16 | ui/rethink |
|---|---|---|---|---|
| First contentful paint (ms) | 68 | 116 | 44 | 48 to 60 |
| Open an ordinary case (ms) | 21 | 35 | 17 | 15 |
| Open the 758-unit case (ms) | 21 | 91 | 101 | 24 |
| Requests per case open | 3 | 5 | 4 | 2 |
| 10 consecutive case opens (ms) | 242 | 395 | 214 | 212 |
| Long tasks during those opens (ms) | 0 | 0 | 54 | 0 |
| Stale response shows the right case | FAIL | FAIL | FAIL | PASS |
| Shell size, JS+CSS+HTML (raw / gzip KB) | 38 / 13 | 60 / 20 | 286 / 42 | 72 / 23 |
| Data in first 2.5 s (KB) | 353 | 355 | 356 | 440 |

The extra data at load is the full queue (412 rows instead of 200); the page holds about 3,450 elements against 1,473 for the same reason. A View Transitions cross-fade between cases was tried and removed: it raised case-open time from about 20 ms to about 130 ms. Heap figures from headless Chromium were too coarse to compare and are not reported.

## Checks

PASS
- 67 tests with the starter data (66 plus 1 skip without it); pre-flight clean.
- Keyboard only: `/` search, `Esc` clears, `j`/`k` preview, chart cursor with `←`/`→` states each hour in a live region (screen reader itself not tested), `?` help, sign-in dialog, reason, `Tab` to Accept with a visible 2 px focus ring, `Enter` records the decision.
- Offline: a manager ticks a unit, goes offline and presses Accept. The queued decision carries no units and no second signer, survives an offline reload, syncs on reconnect, and every unit ends QUARANTINED with one DECISION audit row.
- On phones the unit table becomes stacked rows (unit, state, then component, group and expiry).
- Draft survives the 10 s background sync while a decision is queued (fails on `main`).
- Reflow without document overflow at 320, 390, 720 (200% zoom of 1440), 1024, 1280, 1440 and 1920 px.
- Text contrast at least 4.5:1 for every text colour pair measured, after darkening the secondary grey.
- Chart is SVG with a text summary, a keyboard cursor and a readings table; it does not need a mouse.
- `prefers-reduced-motion` turns transitions off; `forced-colors` keeps the selected row and badges visible.

FAIL or limited
- Below 380 px the help button is hidden to fit the top bar (shortcuts need a keyboard anyway); the context line is clipped with an ellipsis on phones.
- Data at load grows by about 90 KB because the whole queue is sent.

NOT TESTED
- Screen readers (NVDA, VoiceOver), real low-end Android phones, network throttling, browsers other than Chromium, Windows high-contrast mode, real users.

## Reproduce

    HOLDLINE_DB=:memory: python3 -m holdline.server data --port 8080 --since 2025-11-01
    # open http://localhost:8080/  (add ?layout=drawer or ?layout=page to compare layouts)

The browser checks used for the table above are in `scripts/ui-bench/` (they need `agent-browser` and a running server).
