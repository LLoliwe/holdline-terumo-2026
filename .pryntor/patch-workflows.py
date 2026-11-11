#!/usr/bin/env python3
"""Add governance paths-ignore to push and pull_request triggers and restrict push to main.
Text-based (no PyYAML). Usage: patch_workflows.py [--check] FILE...  Prints a unified diff per changed file.
pryntor-principles*.yml keeps pull_request unfiltered (it must check governance PRs) but push goes to main only.
Files whose triggers it cannot parse safely, or that already use `paths:` (GitHub forbids paths with
paths-ignore), are reported and left unchanged."""
import difflib
import re
import sys

IGNORE = [
    "AGENTS.md", "CLAUDE.md", "PRINCIPLES*", ".windsurfrules", "media-manifest.csv",
    "docs/adr/**", "docs/agents/**", "docs/security/**", "docs/brand/**", "docs/comms/**",
    ".pryntor/**", ".cursor/**", ".claude/**",
    ".github/copilot-instructions.md", ".github/pull_request_template.md",
]


def find_on(lines):
    for i, ln in enumerate(lines):
        if re.match(r"^(on|\"on\"|'on'|true):", ln):
            return i
    return None


def block_end(lines, i):
    j = i + 1
    while j < len(lines) and (lines[j].strip() == "" or lines[j].startswith((" ", "\t", "#"))):
        j += 1
    while j > i + 1 and lines[j - 1].strip() == "":
        j -= 1
    return j


def event_body(ev, ind, principles, extra):
    out = [f"{ind}{ev}:"]
    sub = ind + "  "
    if ev == "push":
        out.append(f"{sub}branches: [main]")
    for ln in extra:
        out.append(ln)
    if not (principles and ev == "pull_request"):
        out.append(f"{sub}paths-ignore:")
        out += [f"{sub}  - '{p}'" for p in IGNORE]
    return out


def patch(text, principles):
    lines = text.split("\n")
    i = find_on(lines)
    if i is None:
        return None, "no top-level on:"
    key, _, rest = lines[i].partition(":")
    rest = rest.split("#")[0].strip()
    end = block_end(lines, i)
    events = {}
    order = []
    if rest:
        if rest.startswith("["):
            names = [x.strip() for x in rest.strip("[]").split(",") if x.strip()]
        elif re.fullmatch(r"[\w-]+", rest):
            names = [rest]
        else:
            return None, f"unsupported on: {rest}"
        for n in names:
            events[n] = []
            order.append(n)
        ind = "  "
    else:
        body = lines[i + 1:end]
        ind = None
        cur = None
        for ln in body:
            if not ln.strip() or ln.strip().startswith("#"):
                if cur:
                    events[cur].append(ln)
                continue
            lead = len(ln) - len(ln.lstrip())
            if ind is None:
                ind = " " * lead
            if lead == len(ind):
                m = re.match(r"^\s*([\w-]+):\s*(.*)$", ln)
                if not m:
                    return None, f"cannot parse trigger line: {ln.strip()}"
                cur = m.group(1)
                order.append(cur)
                events[cur] = [] if m.group(2) in ("", "null", "~", "{}") else [("INLINE", m.group(2))]
            else:
                events[cur].append(ln)
    new = [f"{key}:"]
    changed = False
    for ev in order:
        ch = events[ev]
        if ev not in ("push", "pull_request"):
            if ch and isinstance(ch[0], tuple):
                new.append(f"{ind}{ev}: {ch[0][1]}")
                new += ch[1:]
            else:
                new.append(f"{ind}{ev}:" if ch or not rest else f"{ind}{ev}:")
                new += ch
            continue
        if ch and isinstance(ch[0], tuple):
            return None, f"inline config on {ev} not supported"
        sub = ind + "  "
        kept = []
        skip = False
        for ln in ch:
            s = ln.strip()
            lead = len(ln) - len(ln.lstrip())
            if s and lead == len(sub):
                k = s.split(":")[0]
                skip = k in ("paths-ignore", "branches-ignore") or (ev == "push" and k == "branches")
                if k == "paths":
                    return None, f"{ev} uses paths: (cannot combine with paths-ignore)"
                if skip:
                    continue
            elif skip and (not s or lead > len(sub)):
                continue
            else:
                skip = False
            kept.append(ln)
        new += event_body(ev, ind, principles, kept)
        changed = True
    if not changed:
        return None, "no push or pull_request trigger"
    out = lines[:i] + new + lines[end:]
    return "\n".join(out), None


def main():
    args = sys.argv[1:]
    rc = 0
    for f in args:
        src = open(f, encoding="utf-8").read()
        res, why = patch(src, "pryntor-principles" in f)
        if res is None:
            print(f"SKIP {f}: {why}")
            continue
        if res == src:
            print(f"UNCHANGED {f}")
            continue
        sys.stdout.writelines(difflib.unified_diff(
            src.splitlines(True), res.splitlines(True), f"a/{f}", f"b/{f}"))
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(res)
    return rc


if __name__ == "__main__":
    sys.exit(main())
