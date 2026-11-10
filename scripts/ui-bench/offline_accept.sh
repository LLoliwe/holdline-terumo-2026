#!/bin/bash
# manager ticks a unit, goes offline, presses Accept; after reconnect every unit must be QUARANTINED and one DECISION row exists
ab(){ agent-browser "$@" >/dev/null 2>&1; }; ev(){ agent-browser eval "$1"; }
C=$(curl -s "localhost:8802/api/cases?status=OPEN" | python3 -c "import json,sys; print([c['id'] for c in json.load(sys.stdin) if c['n']>=3][3])")
J=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"user":"demo.manager","pin":"2222"}' localhost:8802/api/login)
ab set offline off; ab set viewport 1440 900; ab open http://localhost:8802/; ab eval "localStorage.clear(); localStorage.setItem('hl.me', JSON.stringify($J)); location.hash='#/case/$C'; location.reload(); 1"; sleep 3
ev "{ document.querySelector('.rel').click(); } 1" >/dev/null; ab set offline on
ev "{ const r=document.querySelector('#reason'); r.value='Offline accept with a ticked unit'; r.dispatchEvent(new Event('input')); document.querySelector('[data-act=ACCEPT]').click(); } 1" >/dev/null; sleep 1
echo "queued: $(ev "JSON.stringify(JSON.parse(localStorage.getItem('hl.queue')).map(d=>[d.decision,d.unit_ids.length,d.second_signer]))")"
ab open about:blank; ab open "http://localhost:8802/#/case/$C"; sleep 2; echo "survives offline reload: $(ev "JSON.parse(localStorage.getItem('hl.queue')).length") note: $(ev "(document.querySelector('#qnote')||{}).textContent")"
ab set offline off; sleep 13
echo "after sync queue: $(ev "localStorage.getItem('hl.queue')")"
T=$(echo $J | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -s -H "X-Holdline-Token: $T" localhost:8802/api/case/$C | python3 -c "
import json,sys,collections;d=json.load(sys.stdin);print('status',d['case']['status'],'units',collections.Counter(u['state'] for u in d['units']),'decision rows',sum(1 for a in d['audit'] if a['action'].startswith('DECISION')))"
