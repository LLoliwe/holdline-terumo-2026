window.__ADAPT = {ids: {"small": "HL-HSP-007-2026102223-EXC", "smallN": 2, "big": "HL-RBTC-ELD-2026100402-EXC", "slow": "HL-HSP-024-2026102506-EXC", "small2": "HL-HSP-017-2026102409-EXC", "ten": ["HL-HSP-021-2026102018-EXC", "HL-HSP-007-2026101911-EXC", "HL-HSP-020-2026101803-EXC", "HL-HSP-026-2026101720-EXC", "HL-HSP-012-2026101608-EXC", "HL-HSP-023-2026101607-EXC", "HL-HSP-020-2026101408-EXC", "HL-HSP-002-2026101321-EXC", "HL-RBTC-ELD-2026101315-EXC", "HL-HSP-013-2026101214-GAP"]},
 open: id => { state.sel = id; detail(); },
 cur() { const h = document.querySelector('#detail h1'), m = document.querySelector('#detail .meta span'); if (!h || !m || !window.__MAP) return null; const k = h.textContent + '|' + m.textContent.slice(0, 16); return window.__MAP[k] || null; },
 shown(id, n) { return this.cur() === id && document.querySelectorAll('#detail .units tbody tr').length === n; },
 current() { return this.cur(); }};
fetch('/api/cases?status=OPEN').then(r => r.json()).then(d => { window.__MAP = {}; d.forEach(c => window.__MAP[(c.facility_name || c.facility_id) + '|' + c.start.replace('T', ' ').slice(0, 16)] = c.id); });
fetch('/api/case/' + window.__ADAPT.ids.big).then(r => r.json()).then(d => { const c = d.case; window.__MAP = window.__MAP || {}; setTimeout(() => window.__MAP[(d.facility.name || c.facility_id) + '|' + c.start.replace('T', ' ').slice(0, 16)] = c.id, 500); });
