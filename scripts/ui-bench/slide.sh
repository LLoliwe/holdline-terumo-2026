#!/bin/bash
# Slide to release: early let-go springs back with nothing sent; keyboard End+Enter sends the frozen set only
ab(){ agent-browser "$@" >/dev/null 2>&1; }; ev(){ agent-browser eval "$1"; }
C=HL-HSP-007-2026102223-EXC
J=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"user":"demo.manager","pin":"2222"}' localhost:8802/api/login)
ab set offline off; ab set viewport 1440 900; ab open http://localhost:8802/; ab eval "navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); caches.keys().then(k=>k.forEach(x=>caches.delete(x))); 1"; sleep 1; ab open about:blank; ab open http://localhost:8802/
ab eval "localStorage.clear(); localStorage.setItem('hl.me', JSON.stringify($J)); location.hash='#/case/$C'; location.reload(); 1"; sleep 3
echo "steps open: $(ev "document.querySelector('.steps').innerText.replace(/\n/g,' | ')")"
ev "{ window.__sent=[]; const f=window.fetch; window.fetch=(u,o)=>{ if(String(u).includes('/api/decide')) window.__sent.push(JSON.parse(o.body)); return f(u,o); };
 document.querySelectorAll('.rel')[0].click();
 const r=document.querySelector('#reason'); r.value='Manual probe read 4.1 C at 12:40; door found ajar'; r.dispatchEvent(new Event('input'));
 const s=document.querySelector('#second'); s.value='demo.manager2'; s.dispatchEvent(new Event('change')); document.querySelector('#spin').value='3333';
 document.querySelector('[data-act=CHANGE]').click(); } 1" >/dev/null; sleep .5
echo "steps confirming: $(ev "document.querySelector('.steps').innerText.replace(/\n/g,' | ')")"
B=$(ev "JSON.stringify(document.querySelector('#slider').getBoundingClientRect())"); read X Y W <<<$(echo $B | python3 -c "import json,sys;b=json.loads(json.loads(sys.stdin.read()));print(int(b['x']+24),int(b['y']+b['height']/2),int(b['width']))")
# slow drag to 60%, pause, let go (speed decays to about 0)
agent-browser mouse move $X $Y >/dev/null; agent-browser mouse down >/dev/null; for p in 10 20 30 40 50 60; do agent-browser mouse move $((X+W*p/100)) $Y >/dev/null; sleep .4; done; sleep .5; agent-browser mouse up >/dev/null; sleep .1
echo "just after let-go at 60%: value=$(ev "document.querySelector('#slider').value")"; sleep 1
echo "after spring: value=$(ev "document.querySelector('#slider').value") sent=$(ev "window.__sent.length")"
agent-browser screenshot /tmp/quest/agent/ui/shots/slide_confirm.png >/dev/null
# keyboard: Enter before the end does nothing; End then Enter sends
ev "document.querySelector('#slider').focus(); 1" >/dev/null; ab press Enter; sleep .3; echo "Enter at 0: sent=$(ev "window.__sent.length")"
ab press End; ab press Enter; sleep 2
echo "End+Enter sent: $(ev "JSON.stringify(window.__sent.map(b=>[b.decision,b.unit_ids,b.confirmed_unit_ids]))")"
echo "steps after: $(ev "document.querySelector('.steps').innerText.replace(/\n/g,' | ')")"
T=$(echo $J | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -s -H "X-Holdline-Token: $T" localhost:8802/api/case/$C | python3 -c "
import json,sys,collections;d=json.load(sys.stdin);print('server:',d['case']['status'],collections.Counter(u['state'] for u in d['units']))"
