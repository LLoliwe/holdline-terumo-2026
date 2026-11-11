#!/usr/bin/env python3
"""Pryntor comms gate (P79, P82, P85, P88). R0, stdlib only.

Checks docs/comms/*.md (or files given): a front-matter comms header between
'---' lines, then the body. Fails on: missing header fields; empty legal; more than
one ring with no 'variants:' or 'not adapted:' reason; channel TikTok, or LinkedIn or
YouTube without 'focus-approved:'; ask not in the first 50 body words (unless
'ask: none'); em or en dashes; Flesch-Kincaid grade above target (default 8,
or 'grade:' in header) unless 'grade-ok:' is set.
Usage: check-comms.py [files...]
"""

import glob
import re
import sys

FIELDS = [
    "ring",
    "audience",
    "locale",
    "legal",
    "localisation",
    "bluf",
    "ask",
    "claims",
    "channel",
    "state",
]


def syllables(w):
    w = w.lower().strip(".,;:!?\"'()")
    if not w:
        return 0
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
        n -= 1
    return max(n, 1)


def fk_grade(text):
    sents = [s for s in re.split(r"[.!?]+\s", text) if s.strip()]
    words = re.findall(r"[A-Za-z][A-Za-z'-]*", text)
    if not sents or not words:
        return 0.0, 0.0
    asl = len(words) / len(sents)
    asw = sum(syllables(w) for w in words) / len(words)
    return 0.39 * asl + 11.8 * asw - 15.59, asl


def check(path):
    errs = []
    raw = open(path, encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.S)
    if not m:
        return [f"{path}: no comms header (--- ... ---) (P88)"]
    head, body = m.groups()
    h = {}
    for line in head.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            h[k.strip().lower()] = v.strip()
    for f in FIELDS:
        if not h.get(f):
            errs.append(f"missing or empty '{f}:' (P88)")
    rings = [
        r
        for r in re.split(r"[|,/ ]+", h.get("ring", ""))
        if r.lower() in ("sa", "africa", "emea")
    ]
    if len(rings) > 1 and not (
        h.get("variants") or "not adapted" in h.get("localisation", "").lower()
    ):
        errs.append(
            "several rings but no 'variants:' and no 'not adapted: <reason>' (P88)"
        )
    ch = h.get("channel", "").lower()
    if "tiktok" in ch:
        errs.append("TikTok is not set up; no TikTok work (P85)")
    if re.search(r"linkedin|youtube", ch) and not h.get("focus-approved"):
        errs.append(
            "LinkedIn/YouTube focus not set; add 'focus-approved: <Lebo approval ref>' (P85)"
        )
    first = " ".join(re.findall(r"\S+", body)[:50]).lower()
    ask = h.get("ask", "").lower()
    if ask and ask != "none":
        key = [w for w in re.findall(r"[a-z]{4,}", ask)][:3]
        if key and not any(k in first for k in key):
            errs.append("ask not found in the first 50 words of the body (P79)")
    if re.search("[\u2013\u2014]", body):
        errs.append("em or en dash in body (house style)")
    target = float(h.get("grade", 8))
    g, asl = fk_grade(re.sub(r"```.*?```", "", body, flags=re.S))
    if g > target and not h.get("grade-ok"):
        errs.append(
            f"Flesch-Kincaid grade {g:.1f} above target {target:g} (avg sentence {asl:.1f} words) (P82)"
        )
    return [f"{path}: {e}" for e in errs]


def main(argv):
    files = argv or sorted(glob.glob("docs/comms/**/*.md", recursive=True))
    files = [f for f in files if not f.endswith(("README.md", "TEMPLATE.md"))]
    errs = [e for f in files for e in check(f)]
    for e in errs:
        print(e)
    print(f"check-comms: {len(files)} file(s), {len(errs)} problem(s)")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
