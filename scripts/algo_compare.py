"""Offline comparison. Does not modify the detector.

python3 scripts/algo_compare.py DATA_DIR
"""
import math
import sys
import time
from datetime import timedelta

from holdline import load_config, data, detect, exposure, evaluate

H = timedelta(hours=1)
EA_OVER_R = 83144 / 8.314  # J/mol over J/mol/K, declared before looking at labels


def mkt_c(values_c):
    acc = 0.0
    for c in values_c:
        acc += math.exp(-EA_OVER_R / (c + 273.15))
    return -EA_OVER_R / math.log(acc / len(values_c)) - 273.15


def with_detector(fn):
    orig = detect.holdline_events
    detect.holdline_events = fn
    try:
        t = time.perf_counter()
        out = evaluate.run(sys.argv[1], None)
        out["seconds"] = round(time.perf_counter() - t, 2)
        return out
    finally:
        detect.holdline_events = orig


def cusum_events(facility_id, readings, outs, cfg):
    """Upward CUSUM, k=0.5°C, h=1.0. Gap rule unchanged. Parameters were not fit on the labels."""
    valid, glitches = detect.split_glitches(readings, cfg)
    ev = []
    for t, v in glitches:
        ev.append(dict(facility_id=facility_id, kind="GLITCH", start=t, end=t, peak=v, hold=False,
                       reason="Ignored: sensor glitch"))
    lim, k, h = cfg["fridge_max_c"], 0.5, 1.0
    s, run, alarm, prev = 0.0, [], False, None
    glitch_t = {t for t, _ in glitches}

    def close():
        nonlocal s, run, alarm
        if alarm and run:
            peak = max(v for _, v in run)
            ev.append(dict(facility_id=facility_id, kind="EXCURSION", start=run[0][0], end=run[-1][0], peak=peak,
                           hold=True, reason=f"CUSUM above {lim:g}°C"))
        s, run, alarm = 0.0, [], False

    for t, v in valid:
        if prev is not None and t - prev[0] > H and all(prev[0] + H * i in glitch_t for i in range(1, int((t - prev[0]) / H))):
            prev = (t - H, prev[1])
        if prev is not None and t - prev[0] > H:
            close()
            gap_h = int((t - prev[0]) / H) - 1
            if gap_h >= cfg["gap_hours_alert"]:
                g0, g1 = prev[0] + H, t - H
                o = detect._overlaps(g0, t, outs)
                after_hot = v > lim
                if o or after_hot:
                    ev.append(dict(facility_id=facility_id, kind="GAP_PRESUMED", start=g0, end=g1, peak=None, hold=True,
                                   reason="Presumed gap"))
                else:
                    ev.append(dict(facility_id=facility_id, kind="UNVERIFIED", start=g0, end=g1, peak=None, hold=False,
                                   reason="Unverified gap"))
        s = max(0.0, s + (v - (lim + k)))
        if s > 0:
            run.append((t, v))
            if s > h:
                alarm = True
        else:
            close()
        prev = (t, v)
    close()
    return sorted(ev, key=lambda e: e["start"])


def mkt_events(facility_id, readings, outs, cfg):
    """Two-hour mean kinetic temperature above 6°C, gap rule unchanged."""
    valid, glitches = detect.split_glitches(readings, cfg)
    # Present MKT as a temperature the shipped 2-hour rule can read.
    rewritten = []
    window = []
    prev = None
    glitch_t = {t for t, _ in glitches}
    for t, v in valid:
        bridged = False
        if prev is not None and t - prev[0] > H and all(prev[0] + H * i in glitch_t for i in range(1, int((t - prev[0]) / H))):
            bridged = True
        if prev is not None and t - prev[0] > H and not bridged:
            window = []
        window.append(v)
        window = window[-cfg["persist_hours"]:]
        shown = mkt_c(window) if len(window) >= cfg["persist_hours"] else min(v, cfg["fridge_max_c"])
        rewritten.append((t, shown))
        prev = (t, v)
    rewritten.extend(glitches)
    rewritten.sort()
    return detect_orig(facility_id, rewritten, outs, cfg)


def impute_events(facility_id, readings, outs, cfg):
    """Fill silent hours up to 5 with a straight line, then use the shipped rule."""
    valid, glitches = detect.split_glitches(readings, cfg)
    if not valid:
        return detect_orig(facility_id, readings, outs, cfg)
    filled = list(valid)
    for i in range(1, len(valid)):
        t0, v0 = valid[i - 1]
        t1, v1 = valid[i]
        missing = int((t1 - t0) / H) - 1
        if 1 <= missing <= 5:
            for k in range(1, missing + 1):
                filled.append((t0 + H * k, v0 + (v1 - v0) * k / (missing + 1)))
    filled.extend(glitches)
    filled.sort()
    return detect_orig(facility_id, filled, outs, cfg)


detect_orig = detect.holdline_events


def row(name, out):
    h = out["holdline"]
    return (name, h["precision"], h["recall"], h["false_holds"], h["missed"], h["held_before_transfusion_day"], out["seconds"])


def bench_structures():
    # String unit ids are not a dense integer domain. A bitset needs a remap.
    ids = [f"U{i}" for i in range(20000)]
    t0 = time.perf_counter()
    s = set(ids)
    _ = sum(1 for i in ids if i in s)
    set_s = time.perf_counter() - t0
    index = {u: i for i, u in enumerate(ids)}
    bits = 0
    t0 = time.perf_counter()
    for u in ids:
        bits |= 1 << index[u]
    hits = 0
    for u in ids:
        hits += (bits >> index[u]) & 1
    bit_s = time.perf_counter() - t0
    # Interval overlap: 5k intervals, 5k queries.
    spans = [(i * 10, i * 10 + 2) for i in range(2000)]
    queries = [(i * 7, i * 7 + 1) for i in range(2000)]
    t0 = time.perf_counter()
    n = 0
    for a, b in queries:
        for c, d in spans:
            if c < b and d > a:
                n += 1
                break
    scan_s = time.perf_counter() - t0
    return dict(set_membership_s=round(set_s, 4), bitset_with_remap_s=round(bit_s, 4),
                interval_scan_s=round(scan_s, 4), interval_hits=n)


def main():
    control = with_detector(detect_orig)
    rows = [
        row("shipped 2-hour rule", control),
        row("CUSUM k=0.5 h=1, same gaps", with_detector(cusum_events)),
        row("2-hour mean kinetic temperature", with_detector(mkt_events)),
        row("impute gaps of 1 to 5 hours", with_detector(impute_events)),
    ]
    print("units", control["units"], "exposed", control["exposed"])
    print(f"{'rule':<36} {'prec':>6} {'rec':>6} {'false':>7} {'miss':>6} {'before':>7} {'sec':>6}")
    for name, p, r, f, miss, before, sec in rows:
        print(f"{name:<36} {p:6.3f} {r:6.3f} {f:7d} {miss:6d} {before:7d} {sec:6.2f}")
    print("structures", bench_structures())


if __name__ == "__main__":
    main()
