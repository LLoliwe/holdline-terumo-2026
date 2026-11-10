"""SMS fallback. One alert per hold, always 160 characters or fewer (GSM-7 safe ASCII).
The wording comes from the language pack named in the country config (holdline/lang/<language>.json)."""
from . import i18n

def hold_sms(case, max_chars=160, lang="en"):
    t = i18n.pack(lang)
    units = case["unit_ids"]
    head = t["sms_head"].format(facility=case["facility_id"], kind=case["kind_short"], when=case["when"])
    why = case["why_short"] + ". "
    tail = t["sms_tail"]
    held = lambda n: t["sms_held"].format(n=n)
    more_s = lambda n: t["sms_more"].format(n=n)
    listed = ""
    for i, u in enumerate(units):
        more = len(units) - i - 1
        cand = listed + (", " if listed else "") + u
        suffix = more_s(more) if more else ""
        if len(head + why + held(len(units)) + ": " + cand + suffix + ". " + tail) <= max_chars:
            listed = cand
        else:
            break
    shown = listed.count(",") + 1 if listed else 0
    rest = len(units) - shown
    body = held(len(units)) + (f": {listed}" if listed else "") + (more_s(rest) if rest and listed else "") + ". "
    msg = head + why + body + tail
    if len(msg) > max_chars:
        msg = (head + held(len(units)) + ". " + tail)[:max_chars]
    msg = msg.encode("ascii", "replace").decode()
    assert len(msg) <= max_chars
    return msg

def kind_and_why(kind, peak, lang="en"):
    """Short kind and reason for the SMS, in the configured language."""
    t = i18n.pack(lang)
    if kind == "EXCURSION":
        return t["sms_kind_excursion"], (t["sms_why_peak"].format(peak=f"{peak:.1f}") if peak is not None else "?")
    return t["sms_kind_gap"], t["sms_why_gap"]
