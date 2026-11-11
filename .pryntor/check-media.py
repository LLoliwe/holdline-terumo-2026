#!/usr/bin/env python3
"""P77: provenance for media. Every image, video or audio file added or changed in a PR must be
listed in media-manifest.csv (repo root). Local only, no network.
Columns: path,origin,tool_model,reference_inputs,rights,c2pa,disclosure
origin: real | generated | ai-extended | third-party
Generated/ai-extended rows need tool_model, reference_inputs, rights, c2pa (yes|unsupported) and disclosure.
Brand rules: btww repos allow no generated or ai-extended media at all; holdline repos allow no
generated or ai-extended video (demo clips must be real screen recordings)."""

import csv
import os
import subprocess
import sys

MEDIA = (
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".avif",
    ".heic",
    ".tif",
    ".tiff",
    ".mp4",
    ".mov",
    ".webm",
    ".m4v",
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".ogg",
    ".flac",
)
VIDEO = (".mp4", ".mov", ".webm", ".m4v", ".gif")
repo = os.environ.get("GITHUB_REPOSITORY", os.path.basename(os.getcwd())).lower()
base = os.environ.get("BASE_SHA")
if base:
    changed = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=AM", f"{base}...HEAD"],
        capture_output=True,
        text=True,
    ).stdout.split("\n")
else:
    changed = subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True
    ).stdout.split("\n")
media = [f for f in changed if f.lower().endswith(MEDIA) and "node_modules/" not in f]
if not media:
    print("P77: no added or changed media files.")
    sys.exit(0)
rows = {}
if os.path.exists("media-manifest.csv"):
    for r in csv.DictReader(open("media-manifest.csv", encoding="utf-8")):
        rows[r.get("path", "").strip()] = {k: (v or "").strip() for k, v in r.items()}
bad = []
for f in media:
    r = rows.get(f)
    if not r:
        bad.append(f"{f}: not in media-manifest.csv")
        continue
    o = r.get("origin", "").lower()
    if o not in ("real", "generated", "ai-extended", "third-party"):
        bad.append(f"{f}: origin must be real|generated|ai-extended|third-party")
        continue
    if not r.get("rights"):
        bad.append(f"{f}: rights missing")
    if o in ("generated", "ai-extended"):
        for k in ("tool_model", "reference_inputs", "disclosure"):
            if not r.get(k):
                bad.append(f"{f}: {k} missing for {o} media")
        if r.get("c2pa", "").lower() not in ("yes", "unsupported"):
            bad.append(f"{f}: c2pa must be yes or unsupported")
        if "btww" in repo:
            bad.append(f"{f}: BTWW bans AI footage and AI-generated media entirely")
        if "holdline" in repo and f.lower().endswith(VIDEO):
            bad.append(f"{f}: HOLDLINE demo clips must be real screen recordings")
if bad:
    print("P77 media provenance failures:")
    print("\n".join(bad[:300]))
    sys.exit(1)
print(f"P77 ok: {len(media)} media files have provenance.")
