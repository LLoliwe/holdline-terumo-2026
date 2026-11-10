#!/bin/bash
# keyboard-only flow on 8802: search, walk queue, open, chart cursor, accept as officer, without a mouse
ab(){ agent-browser "$@" >/dev/null 2>&1; }
ev(){ agent-browser eval "$1"; }
ab set viewport 1440 900; ab open http://localhost:8802/; ab eval 'localStorage.clear(); navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); caches.keys().then(k=>k.forEach(x=>caches.delete(x))); 1'; sleep 1; ab open about:blank; ab open http://localhost:8802/; sleep 2.5
ab press /; ab type "#q" "naro"; sleep .4; echo "1 search focus+filter: $(ev 'document.activeElement.id+" "+document.querySelector("#qcount").textContent')"
ab press Escape; ab press Escape; ab press j; sleep .6; echo "2 j opens first (split preview): $(ev 'HOLDLINE.current()')"
ab press j; sleep .6; echo "3 j again: $(ev 'HOLDLINE.current()')"
ab press k; sleep .6; echo "4 k back: $(ev 'HOLDLINE.current()')"
ev 'document.querySelector("#chartsvg").focus(); 1' >/dev/null; ab press ArrowRight; ab press ArrowRight; echo "5 chart cursor: $(ev 'document.querySelector("#curread").textContent')"
ab press "?"; sleep .3; echo "6 help open: $(ev '!!document.querySelector("#help[open]")')"; ab press Escape
# sign in by keyboard
ev 'document.querySelector("#signin-open").focus(); 1' >/dev/null; ab press Enter; sleep .3; echo "7 dialog focus: $(ev 'document.activeElement.id')"
ab type "#lpin" 1111; ab press Enter; sleep 1; echo "8 signed in: $(ev 'document.querySelector("#who").textContent')"
ev "document.querySelector('#reason').focus(); 1" >/dev/null; ab type "#reason" "Keyboard only accept test"; ab press Tab; echo "9 tab from reason lands on: $(ev 'document.activeElement.textContent.trim()')"
agent-browser screenshot ${OUT:-./ui-bench-out}/kfocus.png >/dev/null
ab press Enter; sleep 1.5; echo "10 after Enter: $(ev 'document.querySelector("#decide h2").textContent')"
