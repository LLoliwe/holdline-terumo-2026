"""SMS fallback. One alert per hold, always 160 characters or fewer (GSM-7 safe ASCII)."""

def hold_sms(case, max_chars=160):
    units = case["unit_ids"]
    head = f"HOLD {case['facility_id']} {case['kind_short']} {case['when']}. "
    why = case["why_short"] + ". "
    tail = "Do not issue. Reply 1 moved, 2 call me."
    listed = ""
    for i, u in enumerate(units):
        more = len(units) - i - 1
        cand = listed + (", " if listed else "") + u
        suffix = f" +{more} more" if more else ""
        if len(head + why + f"{len(units)} held: " + cand + suffix + ". " + tail) <= max_chars:
            listed = cand
        else:
            break
    shown = listed.count(",") + 1 if listed else 0
    rest = len(units) - shown
    body = f"{len(units)} held" + (f": {listed}" if listed else "") + (f" +{rest} more" if rest and listed else "") + ". "
    msg = head + why + body + tail
    if len(msg) > max_chars:
        msg = (head + f"{len(units)} held. " + tail)[:max_chars]
    msg = msg.encode("ascii", "replace").decode()
    assert len(msg) <= max_chars
    return msg
