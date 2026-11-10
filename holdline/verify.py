"""Check a HOLDLINE decision store from the command line, without starting the server.

python3 -m holdline.verify PATH_TO_DB

Exit 0: the audit chain is intact. Exit 1: the first broken row is printed. Exit 2: the file is missing or is
not a HOLDLINE store. The store is opened read-only, so checking never changes it."""
import sqlite3, sys, os
from . import store

def check(path):
    if not os.path.isfile(path):
        return 2, f"no such file: {path}"
    try:
        db = sqlite3.connect(f"file:{path}?mode=ro", uri=True); db.row_factory = sqlite3.Row
        n = db.execute("SELECT COUNT(*) FROM audit").fetchone()[0]
        decided = db.execute("SELECT COUNT(*) FROM cases WHERE status IN ('ACCEPTED','CHANGED','REJECTED')").fetchone()[0]
        released = db.execute("SELECT COUNT(*) FROM case_units WHERE state='RELEASED'").fetchone()[0]
        ok, bad = store.verify_chain(db)
    except sqlite3.DatabaseError as e:
        return 2, f"not a HOLDLINE store: {e}"
    if not ok:
        return 1, f"BROKEN at audit row {bad} of {n}. Rows from {bad} on cannot be trusted; restore from backup and compare."
    return 0, f"INTACT: {n} audit rows, {decided} decided cases, {released} unit releases recorded."

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] in ("-h", "--help"):
        sys.exit(__doc__.strip())
    code, msg = check(sys.argv[1]); print(msg); sys.exit(code)
