#!/bin/bash
# usage: shots.sh PORT W H LAYOUT PREFIX   (signs in as demo.manager; captures 6 scenarios)
P=$1; W=$2; H=$3; L=$4; X=$5; O=${OUT:-./ui-bench-out}
ab(){ agent-browser "$@" >/dev/null 2>&1; }
U="http://localhost:$P/?layout=$L"
ab set offline off; ab set viewport $W $H; ab open "$U"
ab eval 'localStorage.clear(); navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); caches.keys().then(k=>k.forEach(x=>caches.delete(x))); 1'; sleep 1; ab open about:blank
J=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"user":"demo.manager","pin":"2222"}' localhost:$P/api/login)
ab open "$U"; sleep 1; ab eval "localStorage.setItem('hl.me', JSON.stringify($J)); localStorage.setItem('hl.layout','$L'); 1"; ab open "$U"; sleep 2.5
ab screenshot $O/${X}_0queue.png
for s in "1ordinary HL-HSP-007-2026102223-EXC" "2large HL-RBTC-ELD-2026100402-EXC" "3gap HL-RBTC-MSA-2026082415-GAP"; do set -- $s
  ab eval "HOLDLINE.open('$2');1"; sleep 1.8; ab screenshot $O/${X}_$1.png; done
# overlapping: tick a unit that is also held elsewhere, open release
ab eval "HOLDLINE.open('HL-HSP-007-2026102223-EXC');1"; sleep 1.5
ab eval "{ const r=document.querySelector('#reason'); r.value='Manual probe read 4.1 C at 12:40; fridge door found ajar, closed by staff'; r.dispatchEvent(new Event('input')); const c=document.querySelector('.rel'); c.click(); document.querySelector('#second').value='demo.manager2'; document.querySelector('#second').dispatchEvent(new Event('change')); document.querySelector('#spin').value='3333'; document.querySelector('[data-act=CHANGE]').click(); } 1"; sleep 1
ab eval "document.querySelector('#decide').scrollIntoView({block:'start'}); 1"; sleep .5; ab screenshot $O/${X}_4overlap_confirm.png
# decided: confirm the release
ab eval "document.querySelector('[data-act=send]').click(); 1"; sleep 2.5; ab eval "document.querySelector('#case').scrollTop=0; 1"; ab screenshot $O/${X}_5decided.png
# offline + uncached case
ab set offline on; ab eval "HOLDLINE.open('HL-RBTC-KSM-2026052513-EXC');1"; sleep 1.5; ab screenshot $O/${X}_6offline.png; ab set offline off
echo "$X done"
