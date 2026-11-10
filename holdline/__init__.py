"""HOLDLINE: hold blood units exposed to a cold-chain excursion until a qualified person decides.
Written during the Terumo BCT Africa Hackathon 2026 build window (2026-11-10 12:00 EAT to 2026-11-11 12:00 EAT)."""
import json, os
HERE = os.path.dirname(__file__)
REQUIRED = ("fridge_components", "fridge_max_c", "fridge_min_c", "persist_hours", "coolbox_max_c",
            "glitch_values", "gap_hours_alert", "sms_max_chars", "second_signature_for_release", "language")

def load_config(name=None):
    """Country rules are a setting: HOLDLINE_CONFIG=<name> loads holdline/config/<name>.json (default kenya)."""
    import re
    name = name or os.environ.get("HOLDLINE_CONFIG", "kenya")
    if not re.fullmatch(r"[a-z0-9_-]{1,40}", name):
        raise ValueError(f"bad config name {name!r}")
    with open(os.path.join(HERE, "config", f"{name}.json")) as f:
        cfg = json.load(f)
    missing = [k for k in REQUIRED if k not in cfg]
    if missing:
        raise ValueError(f"config {name} is missing {', '.join(missing)}")
    if not (cfg["fridge_min_c"] < cfg["fridge_max_c"]) or cfg["persist_hours"] < 1 or cfg["gap_hours_alert"] < 1 \
            or not (40 <= cfg["sms_max_chars"] <= 160):
        raise ValueError(f"config {name} has values out of range")
    from . import i18n
    i18n.pack(cfg["language"])  # fail at start-up, not on the first SMS
    return cfg
