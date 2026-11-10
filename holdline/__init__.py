"""HOLDLINE: hold blood units exposed to a cold-chain excursion until a qualified person decides.
Written during the Terumo BCT Africa Hackathon 2026 build window (2026-11-10 12:00 EAT to 2026-11-11 12:00 EAT)."""
import json, os
HERE = os.path.dirname(__file__)
def load_config(name="kenya"):
    with open(os.path.join(HERE, "config", f"{name}.json")) as f:
        return json.load(f)
