#!/bin/bash
# usage: run.sh URL adapter.js label
cd $(dirname "$0")
agent-browser set viewport 1440 900 >/dev/null 2>&1
agent-browser open "$1" >/dev/null 2>&1
agent-browser eval 'localStorage.clear(); navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); caches && caches.keys().then(k=>k.forEach(x=>caches.delete(x))); 1' >/dev/null 2>&1
agent-browser open "about:blank" >/dev/null 2>&1
agent-browser open "$1" >/dev/null 2>&1; sleep 2.5
L=$(agent-browser eval 'JSON.stringify({load_ms:performance.getEntriesByType("navigation")[0].loadEventEnd|0, fcp_ms:(performance.getEntriesByName("first-contentful-paint")[0]||{}).startTime|0, requests_first_2_5s:performance.getEntriesByType("resource").length, kb_first_2_5s:Math.round(performance.getEntriesByType("resource").reduce((a,e)=>a+e.transferSize,0)/1024), dom:document.getElementsByTagName("*").length, ls_kb:Math.round(JSON.stringify(localStorage).length/1024)})')
agent-browser eval "$(cat $2)" >/dev/null; sleep 1
agent-browser eval "$(cat bench.js)" >/dev/null
for i in $(seq 1 40); do sleep 1; B=$(agent-browser eval "window.__R"); [ "$B" != "null" ] && break; done
echo "$3 LOAD $L"; echo "$3 BENCH $B"
