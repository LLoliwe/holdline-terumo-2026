"""Load the synthetic starter dataset (CSV) into plain Python structures. Standard library only."""
import csv, os
from datetime import datetime, date

def _dt(s):
    return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S") if s else None

def _d(s):
    return date.fromisoformat(s[:10]) if s else None

def read(path, name):
    with open(os.path.join(path, name), newline="") as f:
        return list(csv.DictReader(f))

def temperature_logs(path):
    out = {}
    for r in read(path, "temperature_logs.csv"):
        out.setdefault(r["facility_id"], []).append((_dt(r["recorded_at"]), float(r["temp_c"])))
    for v in out.values():
        v.sort()
    return out

def outages(path):
    out = {}
    for r in read(path, "power_outages.csv"):
        out.setdefault(r["facility_id"], []).append(
            (_dt(r["start_time"]), _dt(r["end_time"]), r["backup_power_engaged"] == "True"))
    return out

def facilities(path):
    return {r["facility_id"]: r for r in read(path, "facilities.csv")}

def units(path):
    return read(path, "units.csv")

def transfers(path):
    return read(path, "transfers.csv")
