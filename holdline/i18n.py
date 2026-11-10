"""Language packs for staff-facing text sent by HOLDLINE (SMS today). The language is a setting in the
country config ("language"), not code. A pack marked draft is shown as such by `python3 -m holdline.i18n`."""
import json, os, re, sys
HERE = os.path.join(os.path.dirname(__file__), "lang")

def available():
    return sorted(f[:-5] for f in os.listdir(HERE) if f.endswith(".json"))

def pack(lang="en"):
    if not isinstance(lang, str) or not re.fullmatch(r"[a-z]{2,3}", lang) or lang not in available():
        raise ValueError(f"no language pack '{lang}'; available: {', '.join(available())}")
    with open(os.path.join(HERE, f"{lang}.json"), encoding="utf-8") as f:
        p = json.load(f)
    with open(os.path.join(HERE, "en.json"), encoding="utf-8") as f:
        base = json.load(f)
    missing = sorted(set(base) - set(p))
    if missing:
        raise ValueError(f"language pack '{lang}' is missing {', '.join(missing)}")
    return p

if __name__ == "__main__":
    for l in available():
        print(f"{l}: {pack(l)['_status']}")
