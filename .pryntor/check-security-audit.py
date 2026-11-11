#!/usr/bin/env python3
"""P89: a deep security audit counts as done only with findings.json, coverage-ledger.json and a dated REPORT.md.
Checks every folder under docs/security/audits/. Full schema validation is done by the auditing agent with
skills/security-audit/validate-findings.cjs and validate-coverage-ledger.cjs (pryntor-agent-skills); this CI
check confirms the artefacts exist, parse and carry only the three allowed verdicts. Local only."""

import glob
import json
import os
import re
import sys

dirs = sorted(d for d in glob.glob("docs/security/audits/*/") if os.path.isdir(d))
if not dirs:
    print(
        "P89: no audits recorded yet (required before first release of apps with auth, user data or an LLM)."
    )
    sys.exit(0)
bad = []
for d in dirs:
    for f in ("findings.json", "coverage-ledger.json", "REPORT.md"):
        if not os.path.exists(os.path.join(d, f)):
            bad.append(f"{d}{f} missing")
    try:
        data = json.load(open(os.path.join(d, "findings.json"), encoding="utf-8"))
        recs = data if isinstance(data, list) else data.get("findings", [])
        for i, r in enumerate(recs):
            v = (r or {}).get("verdict") or (r or {}).get("status")
            if v not in ("confirmed", "needs_validation", "rejected"):
                bad.append(
                    f"{d}findings.json[{i}]: verdict must be confirmed|needs_validation|rejected"
                )
            if v == "needs_validation" and r.get("severity"):
                bad.append(
                    f"{d}findings.json[{i}]: needs_validation must not carry severity"
                )
    except FileNotFoundError:
        pass
    except (ValueError, AttributeError) as e:
        bad.append(f"{d}findings.json does not parse: {e}")
    try:
        json.load(open(os.path.join(d, "coverage-ledger.json"), encoding="utf-8"))
    except FileNotFoundError:
        pass
    except ValueError as e:
        bad.append(f"{d}coverage-ledger.json does not parse: {e}")
    rp = os.path.join(d, "REPORT.md")
    if os.path.exists(rp) and not re.search(
        r"\b20\d\d[/-]\d\d[/-]\d\d\b", open(rp, encoding="utf-8").read()
    ):
        bad.append(f"{rp} has no date")
if bad:
    print("P89 security audit artefact failures:")
    print("\n".join(bad))
    sys.exit(1)
print(f"P89 ok: {len(dirs)} audit runs recorded.")
