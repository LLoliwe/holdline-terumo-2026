"""Which units were in which fridge, on which day, and which units a set of flags would hold.

Residency is rebuilt from units.csv and transfers.csv: a unit sits at its processing centre from
collection until its first dispatch, then at each destination from receipt (dispatch day if the
receipt was never confirmed) until the next dispatch or its final status date.
"""
from datetime import date, timedelta

END = date(2026, 10, 31)

def residency(units, transfers):
    by_unit = {}
    for t in transfers:
        by_unit.setdefault(t["unit_id"], []).append(t)
    out = {}
    for u in units:
        uid = u["unit_id"]
        start = date.fromisoformat(u["collection_date"])
        stop = date.fromisoformat(u["status_date"]) if u["status_date"] else END
        loc = u["processed_at_id"]
        spans = []
        for t in sorted(by_unit.get(uid, []), key=lambda x: x["dispatched_at"]):
            disp = date.fromisoformat(t["dispatched_at"][:10])
            spans.append((loc, start, min(disp, stop)))
            loc = t["to_facility_id"]
            start = date.fromisoformat((t["received_at"] or t["dispatched_at"])[:10])
        spans.append((loc, start, stop))
        out[uid] = spans
    return out

def coolbox_exposed(transfers, cfg):
    return {t["unit_id"]: t for t in transfers
            if t["coolbox_max_temp_c"] and float(t["coolbox_max_temp_c"]) > cfg["coolbox_max_c"]}

def held_units(units, spans, flagged_days, cfg, coolbox=None, window=None):
    """flagged_days: {facility_id: set(date)}. Returns {unit_id: reason}."""
    comps = set(cfg["fridge_components"])
    held = {}
    for u in units:
        uid = u["unit_id"]
        if coolbox and uid in coolbox:
            d = date.fromisoformat(coolbox[uid]["dispatched_at"][:10])
            if window is None or window[0] <= d <= window[1]:
                held[uid] = f"cool box reached {coolbox[uid]['coolbox_max_temp_c']}C on {coolbox[uid]['transfer_id']}"
                continue
        if u["component"] not in comps:
            continue
        for fac, a, b in spans[uid]:
            days = flagged_days.get(fac)
            if not days:
                continue
            d = a
            while d <= b:
                if d in days and (window is None or window[0] <= d <= window[1]):
                    held[uid] = f"in {fac} fridge on {d.isoformat()}"
                    break
                d += timedelta(days=1)
            if uid in held:
                break
    return held
