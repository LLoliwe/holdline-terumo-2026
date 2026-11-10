# Offline algorithm check, 2026-11-10

The shipping detector was not changed. These runs use the same full synthetic set and the same scorer as `python -m holdline.evaluate`. Ground truth is `units.temp_excursion_exposed`. Parameters below were declared before the run. They were not fit to the labels.

The public README says Python standard library only. `ruptures` (BSD) was not installed. CUSUM and mean kinetic temperature were written in the standard library for this check. Nothing here is merged.

| Rule | Precision | Recall | False holds | Missed | Held before transfusion day | Seconds |
|---|---:|---:|---:|---:|---:|---:|
| Shipped 2 consecutive hours above 6°C, same gap rule | 0.661 | 0.954 | 3,473 | 326 | 1,984 | 11.3 |
| CUSUM, k=0.5°C, h=1.0, same gap rule | 0.742 | 0.948 | 2,343 | 371 | 1,953 | 16.3 |
| 2-hour mean kinetic temperature above 6°C, same gap rule | 0.590 | 0.954 | 4,708 | 327 | 1,980 | 12.2 |
| Straight-line fill of silent gaps of 1 to 5 hours, then the shipped rule | 0.661 | 0.954 | 3,473 | 326 | 1,984 | 9.2 |

49,426 units, 7,112 exposed. The shipped row matches the published figures.

CUSUM removes 1,130 false holds and misses 45 more exposed units. It also holds 31 fewer exposed units before the transfusion day. That is a further precision trade. It does not replace the shipped rule unless Lebo approves new deck, video and README numbers before 01:00.

Mean kinetic temperature adds false holds and does not catch more exposed units. Short-gap imputation does not move a single reported count.

## Data structures

| Structure | Result | Decision |
|---|---|---|
| Python set vs bitset after remapping 20,000 string ids | 0.0039 s vs 0.033 s | Keep the set. The bitset is slower. |
| Linear interval scan vs bisect on 2,000 intervals | 0.193 s vs 0.0012 s, both 400 hits | Bisect wins the microbench. It is not wired in, because the full evaluate is 11 s and this query was not shown to be that cost. |
| Hash chain vs Merkle root, 20,000 rows | 0.021 s vs 0.050 s | Keep the append-only hash chain. |
| List of pairs vs a values column, 200,000 adds | 0.025 s vs 0.018 s | A column is slightly faster in a tight loop. Not worth a rewrite of the reader. |
