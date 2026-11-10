"""Pre-publication check: walk every commit's tree and flag dataset files, secrets and client material.
Usage: python3 scripts/preflight.py <dir-of-a-local-clone>   (uses `git` if available)"""
import subprocess, sys, re
BAD_PATH = re.compile(r"\.(csv|xlsx|db|sqlite|env|pem|key)$|(^|/)\.env|credentials|secret", re.I)
import os
# Extra private words (e.g. employer or client names) come from an untracked file, so they never enter the repo.
_extra = [w.strip() for w in open(os.path.expanduser("~/.holdline_private_words")).read().split(",") if w.strip()] if os.path.exists(os.path.expanduser("~/.holdline_private_words")) else []
BAD_TEXT = re.compile(r"(ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|xox[bp]-|password\s*=" + "".join("|" + r"\b" + re.escape(w) + r"\b" for w in _extra) + ")", re.I)
def git(*a, cwd):
    return subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout
def main(repo):
    problems = []
    for c in git("rev-list", "--all", cwd=repo).split():
        for line in git("ls-tree", "-r", c, cwd=repo).splitlines():
            meta, path = line.split("\t", 1)
            if BAD_PATH.search(path):
                problems.append(f"{c[:7]} path {path}")
            elif not path.endswith((".png", ".woff2", ".pdf")):
                blob = meta.split()[2]
                txt = git("cat-file", "-p", blob, cwd=repo)
                for m in BAD_TEXT.finditer(txt):
                    problems.append(f"{c[:7]} {path}: '{m.group(0)}'")
    for p in sorted(set(problems)):
        print("FLAG", p)
    print("OK: nothing flagged" if not problems else f"{len(set(problems))} flags: review before publishing")
    return 1 if problems else 0
if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
