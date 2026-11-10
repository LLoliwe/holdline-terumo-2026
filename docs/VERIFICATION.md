# Verification — 10 November 2026

Baseline: public `b47bc420190208f8e20b13e0df1ff8f1bb990a84`. Its existing 62 tests passed on the official synthetic dataset before these changes.

## Reproduced failures and corrections

1. Accept with a nonempty release selection returned `released: ['U0']` for a duty officer, bypassing the qualified-release path. A failing regression demonstrated this for both roles. The server now forces an empty release list for Accept; the browser strips selections too. An HTTP test confirms every unit stays quarantined.
2. Normal startup used `:memory:`. Reopening the store rebuilt an accepted case as OPEN and lost its audit history. Startup now persists SQLite alongside the fixed dataset. The regression verifies decision status, complete audit/SMS rows, hash chain and repeat-request IDs survive reopening. Explicit `HOLDLINE_DB=:memory:` remains disposable.

## Results

`HOLDLINE_DATA=<private starter folder> python3 -m unittest -v tests.test_holdline tests.test_server tests.test_hardening tests.test_recovery`

**66 tests passed in 47.496 seconds.** Four added tests cover both regressions. An independent reviewer separately reran the new checks and confirmed the fixes. Existing dataset metrics remain unchanged.

Actual Chrome checks verified:

- Duty-officer release controls disabled.
- Manager Change with a second qualified PIN changed exactly one selected synthetic unit within the case. The other unit stayed quarantined; cross-case restrictions remained visible.
- Offline Accept survived a complete page reload and applied exactly once after reconnect; all 26 units remained quarantined.
- A 390px mobile viewport had no horizontal page overflow.

After an actual server-process restart, both reviewed cases and every associated audit/SMS row matched their pre-restart values. Fresh sign-in replayed the earlier Accept as a duplicate without appending another audit row. The chain remained intact.

## Limits

These checks exercise a local prototype and synthetic records. They do not establish medical efficacy, real-world stock accuracy, production authentication, SMS delivery or physical power-loss durability. The store assumes an unchanged starter dataset; revised inputs need a separate dataset directory. The hash chain does not protect against deletion of the entire database.

Raw screenshots, local database state and private dataset stay outside Git. No publication or submission receipt is implied.
