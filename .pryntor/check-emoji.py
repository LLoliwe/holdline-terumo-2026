#!/usr/bin/env python3
"""P52: no emoji glyphs in UI source. Local only. Allow a line with 'emoji-ok: <reason>'."""

import re
import subprocess
import sys

EXT = (
    ".html",
    ".htm",
    ".jsx",
    ".tsx",
    ".vue",
    ".svelte",
    ".astro",
    ".css",
    ".js",
    ".ts",
    ".swift",
)
EMOJI = re.compile(
    "[\U0001f300-\U0001faff\U00002600-\U000027bf\U0001f000-\U0001f2ff\U0001f900-\U0001f9ff\u2b50\u2b06\u2b07\u2b05\u27a1\u2728]"
)
files = [
    f
    for f in subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True
    ).stdout.split("\n")
    if f.endswith(EXT) and "node_modules/" not in f and not f.endswith(".min.js")
]
bad = []
for f in files:
    try:
        for n, line in enumerate(open(f, encoding="utf-8", errors="ignore"), 1):
            if EMOJI.search(line) and "emoji-ok:" not in line:
                bad.append(f"{f}:{n}: {line.strip()[:100]}")
    except OSError:
        pass
if bad:
    print("Emoji glyphs found in UI source (use SVG icons, P52):")
    print("\n".join(bad[:200]))
    sys.exit(1)
print(f"No emoji glyphs in {len(files)} UI files.")
