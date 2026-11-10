#!/bin/bash
# usage: reflow.sh PORT  -> horizontal overflow at several widths, queue and case views
ab(){ agent-browser "$@" >/dev/null 2>&1; }
P=$1; ab open "http://localhost:$P/"; ab eval 'localStorage.clear(); navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); caches.keys().then(k=>k.forEach(x=>caches.delete(x))); 1'; sleep 1
for W in 320 390 720 1024 1280 1440 1920; do
  ab set viewport $W 800; ab open about:blank; ab open "http://localhost:$P/#/case/HL-RBTC-ELD-2026100402-EXC"; sleep 2.2
  R=$(agent-browser eval 'JSON.stringify({w:innerWidth, doc:document.documentElement.scrollWidth, over:[...document.querySelectorAll("body *")].filter(e=>{const r=e.getBoundingClientRect(); return r.width && r.right>innerWidth+1 && !e.closest(".twrap") && getComputedStyle(e).position!=="fixed"}).slice(0,3).map(e=>e.tagName+"."+e.className)})')
  echo "$W $R"
done
