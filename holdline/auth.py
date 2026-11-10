"""Demo-grade hardening for the HOLDLINE server: expiring sessions, log-in lockout, hashed PIN support.

Standard library only. This is not production identity (no MFA, no site identity provider, no TLS here).
"""
import os, time, hmac, hashlib, secrets, threading

IDLE_S = int(os.environ.get("HOLDLINE_SESSION_IDLE_S", 30 * 60))      # sign out after 30 min idle
MAX_S = int(os.environ.get("HOLDLINE_SESSION_MAX_S", 8 * 60 * 60))    # and never longer than 8 h in total
FREE_TRIES, BASE_LOCK_S, MAX_LOCK_S = 5, 30, 15 * 60
_mu = threading.Lock()
SESSIONS = {}   # token -> {"user", "created", "seen"}. In memory: a restart signs everyone out.
_FAILS = {}     # key -> [consecutive failures, locked_until]
_NOW = time.monotonic  # tests replace this

def new_session(user):
    tok = secrets.token_urlsafe(32); t = _NOW()
    with _mu:
        _purge(t); SESSIONS[tok] = {"user": user, "created": t, "seen": t}
    return tok

def _purge(t):
    for k in [k for k, s in SESSIONS.items() if t - s["seen"] > IDLE_S or t - s["created"] > MAX_S]:
        del SESSIONS[k]

def session_user(tok):
    """The signed-in user for a token, or None. Touching a live session extends the idle window."""
    if not tok:
        return None
    with _mu:
        s = SESSIONS.get(tok); t = _NOW()
        if not s:
            return None
        if t - s["seen"] > IDLE_S or t - s["created"] > MAX_S:
            del SESSIONS[tok]; return None
        s["seen"] = t
        return s["user"]

def end_session(tok):
    with _mu:
        return SESSIONS.pop(tok, None) is not None

def locked_for(*keys):
    """Seconds left on the longest lock among keys (0 = free to try)."""
    t = _NOW()
    with _mu:
        return max([0] + [int(_FAILS[k][1] - t) + 1 for k in keys if k in _FAILS and _FAILS[k][1] > t])

def record(key, ok):
    with _mu:
        if ok:
            _FAILS.pop(key, None); return
        if len(_FAILS) > 10000:
            _FAILS.clear()   # bounded memory under a flood of made-up names
        n = _FAILS.get(key, [0, 0])[0] + 1
        lock = min(MAX_LOCK_S, BASE_LOCK_S * 2 ** (n - FREE_TRIES)) if n >= FREE_TRIES else 0
        _FAILS[key] = [n, _NOW() + lock]

def reset():
    with _mu:
        SESSIONS.clear(); _FAILS.clear()

# --- PIN storage: plaintext "pin" (demo file only) or "pin_hash": pbkdf2_sha256$iters$salt$hash ---
def hash_pin(pin, iters=200_000):
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", str(pin).encode(), bytes.fromhex(salt), iters).hex()
    return f"pbkdf2_sha256${iters}${salt}${h}"

def pin_ok(user, pin):
    pin = str(pin or "")
    if "pin_hash" in user:
        try:
            _, iters, salt, h = user["pin_hash"].split("$")
            got = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), int(iters)).hex()
        except (ValueError, TypeError):
            return False
        return hmac.compare_digest(got, h)
    return hmac.compare_digest(pin, str(user.get("pin", "")))

if __name__ == "__main__":
    import sys, getpass
    p = sys.argv[1] if len(sys.argv) > 1 else getpass.getpass("PIN: ")
    print(hash_pin(p))
