#!/bin/bash
# Confirm shows "Release 1"; a later tick attempt must not change what is sent; server releases exactly the confirmed unit
ab(){ agent-browser "$@" >/dev/null 2>&1; }; ev(){ agent-browser eval "$1"; }
C=HL-HSP-007-2026102223-EXC
J=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"user":"demo.manager","pin":"2222"}' localhost:8802/api/login)
ab set offline off; ab set viewport 1440 900; ab open http://localhost:8802/; ab eval "navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); caches.keys().then(k=>k.forEach(x=>caches.delete(x))); 1"; sleep 1; ab open about:blank; ab open http://localhost:8802/; ab eval "localStorage.clear(); localStorage.setItem('hl.me', JSON.stringify($J)); location.hash='#/case/$C'; location.reload(); 1"; sleep 3
ev "{ window.__sent=[]; const f=window.fetch; window.fetch=(u,o)=>{ if(String(u).includes('/api/decide')) window.__sent.push(JSON.parse(o.body)); return f(u,o); };
 const b=[...document.querySelectorAll('.rel')]; b[0].click();
 const r=document.querySelector('#reason'); r.value='Probe check 4.1 C, freeze test'; r.dispatchEvent(new Event('input'));
 const s=document.querySelector('#second'); s.value='demo.manager2'; s.dispatchEvent(new Event('change')); document.querySelector('#spin').value='3333';
 document.querySelector('[data-act=CHANGE]').click(); } 1" >/dev/null; sleep .5
echo "sentence: $(ev "document.querySelector('.confirm').textContent")"
echo "boxes disabled: $(ev "[...document.querySelectorAll('.rel')].every(x=>x.disabled)")"
ev "{ const b=document.querySelectorAll('.rel')[1]; b.disabled=false; b.checked=true; b.dispatchEvent(new Event('change',{bubbles:true})); } 1" >/dev/null
echo "after forced tick, box 2 checked: $(ev "document.querySelectorAll('.rel')[1].checked") sentence: $(ev "document.querySelector('.confirm').textContent")"
ev "{ document.querySelector('[data-act=send]').click(); } 1" >/dev/null; sleep 2
echo "sent: $(ev "JSON.stringify(window.__sent.map(b=>[b.unit_ids,b.confirmed_unit_ids]))")"
T=$(echo $J | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -s -H "X-Holdline-Token: $T" localhost:8802/api/case/$C | python3 -c "
import json,sys,collections;d=json.load(sys.stdin);print('server:',d['case']['status'],collections.Counter(u['state'] for u in d['units']))"
