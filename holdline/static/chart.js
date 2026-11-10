// HOLDLINE evidence chart. Seam for parallel work: app.js only calls the three functions below.
//   chart(readings, start, end, kind) -> HTML string for the <figure> (SVG + caption + live readout)
//   wireChart()                       -> attach keyboard and pointer behaviour after the HTML is in the page
//   readingsTable(readings, caseObj)  -> HTML string for the table alternative
// readings are [["YYYY-MM-DD HH:00", celsius], ...]; start and end are the event window. Uses esc(), ts(), $() and
// state.cursor from app.js. The chart is mounted inside #chart-mount in the case view.
// ── chart: inline SVG, keyboard cursor, text summary, table alternative (no canvas) ──────────────
let chartGeom = null;
const hm = t => { const d = new Date(t), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:00`; };
function chart(rs, start, end, kind) {
  if (!rs.length) return `<p class="empty">No readings in this window: the logger was silent.</p>`;
  const W = 640, H = 240, L = 34, R = 10, T = 18, B = 38;
  const tt = rs.map(r => new Date(r[0].replace(" ", "T")).getTime());
  // Fixed 48 h axis around the event start, so a silent logger shows as empty, hatched time, not a shorter line.
  const st = new Date(start).getTime(), t0 = Math.min(st - 24 * 36e5, ...tt), t1 = Math.max(st + 24 * 36e5, ...tt), vs = rs.map(r => r[1]).filter(v => v > -50 && v < 60);
  const lo = Math.min(0, ...vs), hi = Math.max(12, ...vs);
  const x = t => L + (t - t0) / Math.max(1, t1 - t0) * (W - L - R), y = v => H - B - (v - lo) / (hi - lo) * (H - T - B);
  let d = "", prev = null, dots = "", area = "", segX0 = null, lastX = null;  // area: flat fill under each unbroken run
  const base = (H - B).toFixed(1), closeSeg = () => { if (segX0 != null) area += `L${lastX} ${base}L${segX0} ${base}Z`; };
  rs.forEach((r, i) => { const t = tt[i]; if (r[1] < -50 || r[1] > 60) return;
    const brk = !d || (prev && t - prev > 36e5 * 1.5), X = x(t).toFixed(1), Y = y(r[1]).toFixed(1);
    if (brk) { closeSeg(); segX0 = X; area += `M${X} ${base}L${X} ${Y}`; } else area += `L${X} ${Y}`;
    lastX = X;
    d += (brk ? "M" : "L") + X + " " + Y;
    if (r[1] > 6) dots += `<path d="M${x(t).toFixed(1)} ${(y(r[1]) - 4).toFixed(1)}l4 7h-8z" fill="var(--excursion)"/>`;
    prev = t; });
  closeSeg();
  let gaps = "";  // hatched columns where an hourly reading is missing
  const edges = [t0 - 36e5, ...tt, t1 + 36e5];  // include silence before the first and after the last reading
  for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > 36e5 * 1.5) {
    const a = x(Math.max(t0, edges[i - 1])), w = Math.max(0, x(Math.min(t1, edges[i])) - a), hrs = Math.round((edges[i] - edges[i - 1]) / 36e5) - 1;
    gaps += `<rect x="${a.toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${H - T - B}" fill="url(#hatch)"/>`;
    if (w > 90) gaps += `<text x="${(a + w / 2).toFixed(1)}" y="${(T + 22).toFixed(1)}" text-anchor="middle" class="ax gapt">no readings · ${hrs} h</text>`;
  }
  const sx = x(new Date(start).getTime()), ex = x(new Date(end).getTime());
  let grid = "";
  for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule-2)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${v}</text>`;
  for (let t = Math.ceil(t0 / (6 * 36e5)) * 6 * 36e5; t <= t1; t += 6 * 36e5) grid += `<line x1="${x(t)}" x2="${x(t)}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--rule)"/><text x="${x(t)}" y="${H - B + 15}" text-anchor="middle" class="ax">${String(new Date(t).getHours()).padStart(2, "0")}:00</text>`;
  chartGeom = {tt, rs, x, y, H, T, B};
  const pk = vs.length ? Math.max(...vs) : null;
  const sum = `${rs.length} of 49 hourly readings present from ${ts(rs[0][0])} to ${ts(rs[rs.length - 1][0])}. ${vs.filter(v => v > 6).length} above 6°C${pk != null ? `, highest ${pk}°C` : ""}. Event window ${ts(start)} to ${ts(end)}.`;
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" tabindex="0" role="img" aria-label="${esc(sum)}" id="chartsvg">
   
   ${grid}<rect x="${L}" y="${y(6)}" width="${W - L - R}" height="${y(2) - y(6)}" fill="var(--band-safe)"/>
   <line x1="${L}" x2="${W - R}" y1="${y(6)}" y2="${y(6)}" stroke="var(--excursion)" stroke-width="1.5" stroke-dasharray="6 4" class="limline" shape-rendering="crispEdges"/>
   <text x="${W - R}" y="${y(6) - 5}" text-anchor="end" class="ax lim">6°C limit</text>
   <rect x="${Math.min(sx, ex)}" y="${T}" width="${Math.max(2, Math.abs(ex - sx))}" height="${H - T - B}" fill="var(--excursion-bg)" opacity=".6"/>
   ${gaps}<path d="${area}" fill="var(--chart-fill, #0A84FF)" fill-opacity=".14" class="area"/><path d="${d}" fill="none" stroke="var(--chart-line, var(--ink))" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}
   <g id="cur" visibility="hidden"><line id="curl" y1="${T}" y2="${H - B}" stroke="var(--verified)" stroke-width="1.5"/><circle id="curc" r="4.5" fill="var(--verified)"/><text id="curt" class="ax curt" y="${T + 10}"></text></g>
   <text x="${L}" y="${H - 4}" class="ax">${esc(hm(t0).slice(0, 10))}</text><text x="${x(st)}" y="${T - 4}" text-anchor="middle" class="ax ev">event start ${esc(hm(st).slice(11))}</text><text x="${W - R}" y="${H - 4}" text-anchor="end" class="ax">${esc(hm(t1).slice(0, 10))}</text><text x="${L - 6}" y="${T - 4}" text-anchor="end" class="ax">°C</text></svg>
   <figcaption class="sr" id="chartsum">${esc(sum)}</figcaption><p class="curread" id="curread" aria-live="polite"></p></figure>`;
}
function wireChart() {
  const svg = $("#chartsvg"); if (!svg || !chartGeom) return;
  const g = chartGeom, show = i => {
    i = Math.max(0, Math.min(g.rs.length - 1, i)); state.cursor = i;
    const r = g.rs[i], X = g.x(g.tt[i]), ok = r[1] > -50 && r[1] < 60;
    $("#cur").setAttribute("visibility", "visible"); $("#curl").setAttribute("x1", X); $("#curl").setAttribute("x2", X);
    $("#curc").setAttribute("cx", X); $("#curc").setAttribute("cy", ok ? g.y(r[1]) : g.H - g.B);
    const t = $("#curt"); t.textContent = `${r[0].slice(11)} · ${ok ? r[1] + "°C" : "invalid"}`; t.setAttribute("x", X + (X > 480 ? -8 : 8)); t.setAttribute("text-anchor", X > 480 ? "end" : "start");
    const gap = i > 0 && g.tt[i] - g.tt[i - 1] > 36e5 * 1.5 ? ` · ${Math.round((g.tt[i] - g.tt[i - 1]) / 36e5) - 1} h with no reading before this` : "";
    $("#curread").textContent = `${r[0]} · ${ok ? r[1] + "°C" : "invalid reading"}${ok && r[1] > 6 ? " · above 6°C" : ""}${gap}`;
  };
  svg.addEventListener("keydown", ev => {
    const k = ev.key; let i = state.cursor < 0 ? 0 : state.cursor;
    if (k === "ArrowRight") i++; else if (k === "ArrowLeft") i--; else if (k === "Home") i = 0; else if (k === "End") i = g.rs.length - 1; else return;
    ev.preventDefault(); show(i);
  });
  svg.addEventListener("pointermove", ev => {
    const b = svg.getBoundingClientRect(), vx = (ev.clientX - b.left) / b.width * 640;
    let best = 0, bd = 1e9; g.tt.forEach((t, i) => { const dd = Math.abs(g.x(t) - vx); if (dd < bd) { bd = dd; best = i; } }); show(best);
  });
  state.cursor = -1;
}
function readingsTable(rs, c) {
  return `<div class="twrap short"><table><thead><tr><th scope="col">Hour (EAT)</th><th scope="col">°C</th><th scope="col">Note</th></tr></thead><tbody>${rs.map((r, i) => {
    const prev = i ? new Date(rs[i - 1][0].replace(" ", "T")) : null, t = new Date(r[0].replace(" ", "T"));
    const gap = prev && t - prev > 36e5 * 1.5 ? `${Math.round((t - prev) / 36e5) - 1} h missing before` : "";
    const inW = r[0] >= ts(c.start) && r[0] <= ts(c.end);
    return `<tr${r[1] > 6 ? ' class="hot"' : ""}><td class="mono">${esc(r[0])}</td><td class="mono">${esc(r[1])}</td><td>${[r[1] > 6 ? "above 6°C" : "", inW ? "event window" : "", gap].filter(Boolean).join(" · ")}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

