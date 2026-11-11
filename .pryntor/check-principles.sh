#!/usr/bin/env bash
# Pryntor principles drift check. Local only, no network, no secrets.
set -euo pipefail
fail(){ echo "PRINCIPLES CHECK FAILED: $*"; exit 1; }
[ -f PRINCIPLES.md ] || fail "PRINCIPLES.md missing"
[ -f .pryntor/principles.lock ] || fail ".pryntor/principles.lock missing"
. .pryntor/principles.lock   # sets VERSION, SHA256, SOURCE
HV=$(grep -m1 -o 'PRINCIPLES_VERSION: [0-9.]*' PRINCIPLES.md | awk '{print $2}')
[ "$HV" = "$VERSION" ] || fail "PRINCIPLES.md version $HV != lock $VERSION"
ACT=$(tail -n +2 PRINCIPLES.md | sha256sum | awk '{print $1}')
[ "$ACT" = "$SHA256" ] || fail "PRINCIPLES.md edited locally (checksum drift). Re-sync from $SOURCE."
for f in AGENTS.md CLAUDE.md .cursor/rules/pryntor-principles.mdc .github/copilot-instructions.md .windsurfrules .github/pull_request_template.md .pryntor/principles-digest.md; do
  [ -f "$f" ] || fail "$f missing"
  grep -q "v$VERSION" "$f" || fail "$f does not reference principles v$VERSION (stale or missing block)"
done
head -3 AGENTS.md | grep -q "PRYNTOR-PRINCIPLES-BLOCK v$VERSION" || fail "AGENTS.md block must be at the very top"
head -3 CLAUDE.md | grep -q "PRYNTOR-PRINCIPLES-BLOCK v$VERSION" || fail "CLAUDE.md block must be at the very top"
grep -q '@PRINCIPLES.md' CLAUDE.md || fail "CLAUDE.md must import @PRINCIPLES.md"
grep -q 'alwaysApply: true' .cursor/rules/pryntor-principles.mdc || fail "Cursor rule must be alwaysApply"
grep -q 'principles-digest.md' .claude/settings.json || fail ".claude/settings.json SessionStart hook missing"
if [ -n "${PR_BODY:-}" ]; then
  printf '%s' "$PR_BODY" | grep -q "PRINCIPLES v$VERSION read" || fail "PR description must contain 'PRINCIPLES v$VERSION read'"
fi
if [ -n "${BASE_SHA:-}" ]; then
  if git log --format=%B "$BASE_SHA..HEAD" | grep -qi '^co-authored-by:'; then fail "Co-authored-by trailer found (P35)"; fi
fi
echo "Principles v$VERSION check passed."
