#!/bin/bash
# usage: wipe.sh URL label  -> checks whether a half-typed reason survives the 10 s background sync while a decision is queued offline
P0=$(echo "$1" | sed -E "s#.*:([0-9]+)/.*#\1#"); B=HL-HSP-017-2026102409-EXC; A=$(curl -s "localhost:$P0/api/cases?status=OPEN" | python3 -c "import json,sys; print([c['id'] for c in json.load(sys.stdin) if c['id']!='HL-HSP-017-2026102409-EXC'][30])")
ab(){ agent-browser "$@" >/dev/null 2>&1; }
ab set offline off; ab open "$1"; ab eval 'localStorage.clear(); navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); caches.keys().then(k=>k.forEach(x=>caches.delete(x))); 1'; sleep 1; ab open about:blank; ab open "$1"; sleep 2
TOK=$(curl -s -X POST localhost:${1##*:}api/login 2>/dev/null)
P=$(echo "$1" | sed -E 's#.*:([0-9]+)/.*#\1#')
J=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"user":"demo.officer","pin":"1111"}' localhost:$P/api/login)
ab eval "localStorage.setItem('hl.me', JSON.stringify($J)); location.reload(); 1"; sleep 3
# open A through each UI's own entry point, then go offline and Accept
if [ "$2" = base ]; then ab eval "state.sel='$A'; detail(); 1"; else ab eval "HOLDLINE.open('$A');1"; fi; sleep 1.5
ab eval "(window.HOLDLINE?'':0); 1"
if [ "$2" = base ]; then ab eval "state.sel='$B'; detail(); 1"; else ab eval "HOLDLINE.open('$B');1"; fi; sleep 1.5
if [ "$2" = base ]; then ab eval "state.sel='$A'; detail(); 1"; else ab eval "HOLDLINE.open('$A');1"; fi; sleep 1.5
ab set offline on
ab eval "{ const t=document.querySelector('#reason'); t.value='Offline accept for wipe test'; t.dispatchEvent(new Event('input')); document.querySelector('[data-d=ACCEPT],[data-act=ACCEPT]').click(); } 1"; sleep 1
Qn=$(agent-browser eval "JSON.parse(localStorage.getItem('hl.queue')||'[]').length")
if [ "$2" = base ]; then ab eval "state.sel='$B'; detail(); 1"; else ab eval "HOLDLINE.open('$B');1"; fi; sleep 1.5
ab eval "{ const t=document.querySelector('#reason'); t.value='half typed reason'; t.dispatchEvent(new Event('input')); } 1"
sleep 12
V=$(agent-browser eval "(document.querySelector('#reason')||{}).value")
ab set offline off
echo "$2 queued=$Qn reason_after_12s=$V"
