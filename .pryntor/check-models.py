#!/usr/bin/env python3
"""P29/P78: model weights need a declared licence. Local only.
If code loads model weights (tabpfn, transformers/from_pretrained, huggingface_hub, torch.load, joblib/pickle
model files, sentence_transformers, ultralytics, diffusers), docs/models.md must exist with one table row per
model: | model | version | weights licence | commercial use (yes/no) | used in paid product (yes/no) | ADR |
Fails if a row allows paid use of weights whose commercial use is 'no'."""

import os
import re
import subprocess
import sys

RX = re.compile(
    r"\b(tabpfn|from_pretrained|huggingface_hub|hf_hub_download|sentence_transformers|ultralytics|diffusers|torch\.load|TabPFN)\b"
)
files = [
    f
    for f in subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True
    ).stdout.split("\n")
    if f.endswith((".py", ".ipynb", ".ts", ".js"))
    and "node_modules/" not in f
    and not f.startswith(".pryntor/")
]
hits = []
for f in files:
    try:
        for n, line in enumerate(open(f, encoding="utf-8", errors="ignore"), 1):
            if RX.search(line):
                hits.append(f"{f}:{n}")
                break
    except OSError:
        pass
if not hits:
    print("P78/P29: no model-weight loading found.")
    sys.exit(0)
if not os.path.exists("docs/models.md"):
    print("P29/P78: code loads model weights but docs/models.md is missing. Files:")
    print("\n".join(hits[:50]))
    sys.exit(1)
bad = []
rows = [
    line
    for line in open("docs/models.md", encoding="utf-8")
    if line.startswith("|") and not re.match(r"^\|\s*-", line)
][1:]
if not rows:
    bad.append("docs/models.md has no model rows")
for row in rows:
    c = [x.strip().lower() for x in row.strip().strip("|").split("|")]
    if len(c) < 6 or not all(c[:6]):
        bad.append(f"incomplete row: {row.strip()}")
        continue
    if c[3].startswith("no") and c[4].startswith("yes"):
        bad.append(f"non-commercial weights in a paid product: {row.strip()}")
if bad:
    print("P29/P78 model licence failures:")
    print("\n".join(bad))
    sys.exit(1)
print(f"P29/P78 ok: {len(rows)} models declared.")
