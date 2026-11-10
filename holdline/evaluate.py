"""Baseline vs HOLDLINE on the starter dataset. Ground truth: units.temp_excursion_exposed.

python -m holdline.evaluate DATA_DIR [--since 2026-07-01]
"""
import sys, json, time
from datetime import date
from . import load_config, data, detect, exposure

def run(path, since=None):
    cfg = load_config()
    t0 = time.time()
    temps = data.temperature_logs(path); outs = data.outages(path)
    units = data.units(path); trs = data.transfers(path)
    if since:
        units = [u for u in units if u["collection_date"] >= since]
    spans = exposure.residency(units, trs)
    base_days = {f: detect.baseline_days(r, cfg) for f, r in temps.items()}
    events = {f: detect.holdline_events(f, r, outs.get(f, []), cfg) for f, r in temps.items()}
    hl_days = {f: detect.event_days(e) for f, e in events.items()}
    cool = exposure.coolbox_exposed(trs, cfg)
    base = exposure.held_units(units, spans, base_days, cfg)
    hl = exposure.held_units(units, spans, hl_days, cfg, coolbox=cool)
    truth = {u["unit_id"] for u in units if u["temp_excursion_exposed"] == "True"}
    tdate = {u["unit_id"]: u["status_date"] for u in units if u["temp_excursion_exposed"] == "True" and u["status"] == "transfused"}
    def m(held):
        h = set(held)
        tp = len(h & truth)
        return dict(held=len(h), caught=tp, missed=len(truth - h), false_holds=len(h - truth),
                    recall=round(tp / len(truth), 3) if truth else None,
                    precision=round(tp / len(h), 3) if h else None,
                    # exposed units later transfused, whose first hold day falls strictly before the transfusion day
                    held_before_transfusion_day=sum(1 for x in h if x in tdate and held[x].split(" on ")[-1] < tdate[x][:10] and " on " in held[x]),
                    exposed_transfused_total=len(tdate))
    kinds = {}
    for e in events.values():
        for x in e:
            kinds[x["kind"]] = kinds.get(x["kind"], 0) + 1
    return dict(units=len(units), exposed=len(truth), exposed_and_transfused=len(tdate),
                baseline=m(base), holdline=m(hl), events=kinds, seconds=round(time.time() - t0, 1),
                since=since)

if __name__ == "__main__":
    p = sys.argv[1]; since = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == "--since" else None
    print(json.dumps(run(p, since), indent=2, default=str))
