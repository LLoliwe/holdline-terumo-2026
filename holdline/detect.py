"""Excursion detection on hourly fridge readings.

baseline_days: the simple rule most sites use today. Any reading above 6 C flags that fridge-day.
  It reads raw values, so sensor glitches (99.9) also trip it, and it can't see logger gaps.
holdline_events: what HOLDLINE does.
  1. Drops known sensor-glitch values (-99.0, 99.9, 0.0) and records them as data-quality events.
  2. EXCURSION: at least `persist_hours` consecutive valid readings above the limit.
  3. GAP: the logger was silent for `gap_hours_alert` hours or more. If a power cut without
     backup overlaps the gap, or the first reading after the gap is above the limit, the gap is
     treated as a presumed excursion (GAP_PRESUMED) and units are held. Otherwise it is
     UNVERIFIED: shown to staff, no hold.
"""
from datetime import timedelta

H = timedelta(hours=1)

def split_glitches(readings, cfg):
    g = set(cfg["glitch_values"])
    valid, glitches = [], []
    for t, v in readings:
        (glitches if v in g else valid).append((t, v))
    return valid, glitches

def baseline_days(readings, cfg):
    return {t.date() for t, v in readings if v > cfg["fridge_max_c"]}

def _overlaps(a0, a1, outs):
    for s, e, backup in outs:
        if not backup and s < a1 and e > a0:
            return (s, e)
    return None

def holdline_events(facility_id, readings, outs, cfg):
    valid, glitches = split_glitches(readings, cfg)
    ev = []
    for t, v in glitches:
        ev.append(dict(facility_id=facility_id, kind="GLITCH", start=t, end=t, peak=v, hold=False,
                       reason=f"Sensor value {v} is a known glitch code; reading ignored"))
    lim, need = cfg["fridge_max_c"], cfg["persist_hours"]
    run = []
    def close_run():
        if len(run) >= need:
            peak = max(v for _, v in run)
            ev.append(dict(facility_id=facility_id, kind="EXCURSION", start=run[0][0], end=run[-1][0], peak=peak,
                           hold=True, reason=f"{len(run)} consecutive hourly readings above {lim:g}°C, peak {peak:.1f}°C"))
    prev = None
    for t, v in valid:
        if prev is not None and t - prev[0] > H:
            close_run(); run = []
            gap_h = int((t - prev[0]) / H) - 1
            if gap_h >= cfg["gap_hours_alert"]:
                g0, g1 = prev[0] + H, t - H
                o = _overlaps(g0, t, outs)
                after_hot = v > lim
                if o or after_hot:
                    why = []
                    if o: why.append(f"power cut without backup {o[0]:%H:%M} to {o[1]:%H:%M}")
                    if after_hot: why.append(f"first reading after the gap is {v:.1f}°C")
                    ev.append(dict(facility_id=facility_id, kind="GAP_PRESUMED", start=g0, end=g1, peak=None, hold=True,
                                   reason=f"Logger silent {gap_h} h; " + "; ".join(why)))
                else:
                    ev.append(dict(facility_id=facility_id, kind="UNVERIFIED", start=g0, end=g1, peak=None, hold=False,
                                   reason=f"Logger silent {gap_h} h; no power cut recorded; readings either side in range"))
        if v > lim:
            run.append((t, v))
        else:
            close_run(); run = []
        prev = (t, v)
    close_run()
    return sorted(ev, key=lambda e: e["start"])

def event_days(events, hold_only=True):
    days = set()
    for e in events:
        if hold_only and not e["hold"]:
            continue
        d = e["start"].date()
        while d <= e["end"].date():
            days.add(d); d += timedelta(days=1)
    return days
