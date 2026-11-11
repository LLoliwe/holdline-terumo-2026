#!/usr/bin/env python3
"""P75: one component library per product. Flags raw interactive primitives in component
source outside the declared library folder. Local only.
Any library may be declared (Astryx is only the fallback default). Declare in docs/agents/ui-library.md with lines:  Library: <name@version>   Path: <folder>
Exception: 'raw-ui-ok: <reason>' on the line."""

import os
import re
import subprocess
import sys

EXT = (".jsx", ".tsx", ".vue", ".svelte", ".astro")
files = [
    f
    for f in subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True
    ).stdout.split("\n")
    if f.endswith(EXT) and "node_modules/" not in f
]
if not files:
    print("No component source files; P75 check not applicable.")
    sys.exit(0)
decl = "docs/agents/ui-library.md"
# Case-sensitive on purpose: lowercase tags are raw HTML; <Button>, <Input> etc. are library components.
RAW = re.compile(
    r"<(button|input|select|textarea)\b|role=[\"']button[\"']|<a\b[^>]*onClick"
)
FALLBACK = "Astryx (@astryxdesign/core@0.7.14, see PRINCIPLES.md P75)"


def scan(skip_root=None):
    found = []
    for f in files:
        if skip_root and f.startswith(skip_root):
            continue
        for n, line in enumerate(open(f, encoding="utf-8", errors="ignore"), 1):
            if RAW.search(line) and "raw-ui-ok:" not in line:
                found.append(f"{f}:{n}: {line.strip()[:100]}")
    return found


txt = open(decl, encoding="utf-8").read() if os.path.exists(decl) else ""
lib = re.search(r"^Library:\s*(\S.*)$", txt, re.M)
path = re.search(r"^Path:\s*(\S+)", txt, re.M)
declared = bool(
    lib and path and not any(s in (lib.group(1) + path.group(1)) for s in ("<", "TODO"))
)
if not declared:
    # No library declared: flag raw primitives only. Any library may be declared; Astryx is the fallback default.
    bad = scan()
    if bad:
        print(
            f"P75: no UI library declared in {decl}, and raw interactive primitives were found. Declare one library "
            f"('Library: <name@version>', 'Path: <folder>'): the fallback default is {FALLBACK}; an in-house or better-fit library needs an ADR."
        )
        print("\n".join(bad[:300]))
        sys.exit(1)
    print(
        f"P75 ok: no library declared and no raw primitives in {len(files)} component files (declare one before adding controls)."
    )
    sys.exit(0)
root = path.group(1).rstrip("/") + "/"
bad = scan(root)
if bad:
    print(
        f"P75: raw interactive primitives outside {root} (use the {lib.group(1)} components):"
    )
    print("\n".join(bad[:300]))
    sys.exit(1)
print(f"P75 ok: {len(files)} component files compose {lib.group(1)}.")
