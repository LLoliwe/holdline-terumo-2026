window.__R=null;(async () => {
  const A = window.__ADAPT; const out = {};
  const wait = (f, ms = 8000) => new Promise((res, rej) => { const t0 = performance.now(); (function p() { let v; try { v = f(); } catch (e) {} if (v) return res(performance.now() - t0); if (performance.now() - t0 > ms) return res(-1); requestAnimationFrame(p); })(); });
  const res = () => performance.getEntriesByType("resource").length;
  // ordinary case open
  const ids = A.ids;
  let r0 = res(); let t0 = performance.now(); A.open(ids.small); out.open_small_ms = Math.round(await wait(() => A.shown(ids.small, ids.smallN)));
  await new Promise(r => setTimeout(r, 400)); out.requests_per_open = res() - r0;
  r0 = res(); A.open(ids.big); out.open_758_ms = Math.round(await wait(() => A.shown(ids.big, 758))); await new Promise(r => setTimeout(r, 400)); out.requests_big = res() - r0;
  out.dom_nodes_after_big = document.getElementsByTagName("*").length;
  out.heap_mb = performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null;
  // stale-response race: slow first response
  const of = window.fetch; let first = true;
  window.fetch = function (u, o) { const p = of.apply(this, arguments); if (String(u).includes(ids.slow) && first) { first = false; return p.then(r => new Promise(z => setTimeout(() => z(r), 600))); } return p; };
  A.open(ids.slow); await new Promise(r => setTimeout(r, 30)); A.open(ids.small2);
  await new Promise(r => setTimeout(r, 1200)); window.fetch = of;
  out.race_shows = A.current(); out.race_expected = ids.small2; out.race_pass = A.current() === ids.small2;
  // 10 rapid opens, long tasks
  let lt = 0; const po = new PerformanceObserver(l => l.getEntries().forEach(e => lt += e.duration)); try { po.observe({type: "longtask", buffered: false}); } catch (e) {}
  t0 = performance.now(); for (const id of ids.ten) { A.open(id); await wait(() => A.current() === id, 3000); } out.ten_opens_ms = Math.round(performance.now() - t0);
  await new Promise(r => setTimeout(r, 200)); po.disconnect(); out.longtask_ms_ten = Math.round(lt);
  window.__R=JSON.stringify(out);
})().catch(e=>window.__R="ERR "+e); 1
