#!/usr/bin/env python3
"""P74: banned buzzwords in public-facing copy. Local only. Exception: 'buzzword-ok: <reason>' on the line."""

import re
import subprocess
import sys

WORDS = [
    "scalable",
    "cohesive",
    "seamless",
    "seamlessly",
    "leverage",
    "leveraging",
    "innovative",
    "cutting-edge",
    "end-to-end",
    "game-changing",
    "game-changer",
    "world-class",
    "revolutionary",
    "robust",
    "synergy",
    "next-generation",
    "next-gen",
    "unlock",
    "elevate",
    "empower",
    "disruptive",
    "best-in-class",
]
RX = re.compile(
    r"(?<![\w-])(" + "|".join(re.escape(w) for w in WORDS) + r")(?![\w-])", re.I
)
UI = (".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro", ".mdx")
CONTENT_DIRS = ("content/", "src/content/", "pages/", "app/", "public/", "site/")
files = [
    f
    for f in subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True
    ).stdout.split("\n")
    if "node_modules/" not in f
    and (
        f.endswith(UI)
        or (
            f.endswith((".md", ".json", ".yml", ".yaml")) and f.startswith(CONTENT_DIRS)
        )
    )
]
bad = []
for f in files:
    try:
        for n, line in enumerate(open(f, encoding="utf-8", errors="ignore"), 1):
            if "buzzword-ok:" in line:
                continue
            for m in RX.finditer(line):
                bad.append(f"{f}:{n}: '{m.group(1)}' in: {line.strip()[:100]}")
    except OSError:
        pass
if bad:
    print("Banned buzzwords in public copy (P74). Say the specific thing instead:")
    print("\n".join(bad[:300]))
    sys.exit(1)
print(f"No banned buzzwords in {len(files)} copy files.")
