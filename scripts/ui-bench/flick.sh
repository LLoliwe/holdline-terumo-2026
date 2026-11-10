#!/bin/bash
# fast flick from 0 to 70% in about 0.1 s and let go immediately: projected end passes 85%, so it commits
ab(){ agent-browser "$@" >/dev/null 2>&1; }; ev(){ agent-browser eval "$1"; }
C=HL-HSP-017-2026102409-EXC
J=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"user":"demo.manager","pin":"2222"}' localhost:8802/api/login)
ab open about:blank; ab open http://localhost:8802/; ab eval "localStorage.clear(); localStorage.setItem('hl.me', JSON.stringify($J)); location.hash='#/case/$C'; location.reload(); 1"; sleep 3
ev "{ document.querySelectorAll('.rel')[0].click(); const r=document.querySelector('#reason'); r.value='Manual probe read 4.0 C; logger cable reseated'; r.dispatchEvent(new Event('input'));
 const s=document.querySelector('#second'); s.value='demo.manager2'; s.dispatchEvent(new Event('change')); document.querySelector('#spin').value='3333'; document.querySelector('[data-act=CHANGE]').click(); } 1" >/dev/null; sleep .5
read X Y W <<<$(ev "JSON.stringify(document.querySelector('#slider').getBoundingClientRect())" | python3 -c "import json,sys;b=json.loads(json.loads(sys.stdin.read()));print(int(b['x']+24),int(b['y']+b['height']/2),int(b['width']))")
agent-browser mouse move $X $Y >/dev/null; agent-browser mouse down >/dev/null; for p in 25 50 70; do agent-browser mouse move $((X+W*p/100)) $Y >/dev/null; done; agent-browser mouse up >/dev/null; sleep 2
T=$(echo $J | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -s -H "X-Holdline-Token: $T" localhost:8802/api/case/$C | python3 -c "
import json,sys,collections;d=json.load(sys.stdin);print('flick server:',d['case']['status'],collections.Counter(u['state'] for u in d['units']))"
