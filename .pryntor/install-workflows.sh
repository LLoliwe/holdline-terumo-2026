#!/usr/bin/env bash
# Moves staged Pryntor CI workflows into .github/workflows (needs a push with workflow permission).
set -euo pipefail
mkdir -p .github/workflows
git mv -f .pryntor/ci/workflows/*.yml .github/workflows/
echo 'Workflows moved. Commit, run gitleaks, push.'
