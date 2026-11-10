// Morning-after overview. Seam: app.js calls HoldlineOverview.render(mount, {rows, summary, open}).
// Rows are the open cases already listed by /api/cases. This file does not decide anything.
// Times are wall-clock stamps (EAT as stored), not the browser timezone.
(function (factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.HoldlineOverview = api;
})(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const fmt = n => String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const ts = s => String(s || "").replace("T", " ").slice(0, 16);
  const pad = n => String(n).padStart(2, "0");
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function parseStamp(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s || ""));
    if (!m) return null;
    return {y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5]};
  }
  function addDays(y, mo, d, n) {
    const dt = new Date(Date.UTC(y, mo - 1, d + n));
    return {y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate()};
  }
  function ymd(p) { return p.y + "-" + pad(p.mo) + "-" + pad(p.d); }
  // Night is 18:00 inclusive through 08:00 next morning, 14 hours.
  // A stamp before 18:00 belongs to the night that started the previous day.
  function nightBounds(iso) {
    const p = parseStamp(iso);
    if (!p) return null;
    const startDate = p.h < 18 ? addDays(p.y, p.mo, p.d, -1) : {y: p.y, mo: p.mo, d: p.d};
    const endDate = addDays(startDate.y, startDate.mo, startDate.d, 1);
    const start = ymd(startDate) + " 18:00";
    return {start, end: ymd(endDate) + " 08:00", key: start};
  }
  function shiftNight(night, days) {
    const p = parseStamp(night && night.start);
    if (!p) return null;
    const startDate = addDays(p.y, p.mo, p.d, days);
    const endDate = addDays(startDate.y, startDate.mo, startDate.d, 1);
    const start = ymd(startDate) + " 18:00";
    return {start, end: ymd(endDate) + " 08:00", key: start};
  }
  function toMin(iso) {
    const p = parseStamp(iso);
    if (!p) return null;
    return Math.floor(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) / 60000);
  }
  function units(c) { return Number(c && c.n) || 0; }
  function holdEnd(c) {
    const a = toMin(c.start);
    if (a == null) return null;
    const b0 = toMin(c.end || c.start);
    return b0 != null && b0 > a ? b0 : a + 60;
  }
  // A touch at exactly 18:00 from before does not overlap. A hold starting at 18:00 does.
  function overlaps(c, night) {
    const a = toMin(c.start);
    const b = holdEnd(c);
    const n0 = toMin(night.start), n1 = toMin(night.end);
    if (a == null || b == null || n0 == null || n1 == null) return false;
    return a < n1 && b > n0;
  }
  function largest(holds) {
    return holds.reduce((a, c) => units(c) > units(a) || (units(c) === units(a) && ts(c.start) > ts(a.start)) ? c : a);
  }

  function groupNight(rows) {
    const open = (rows || []).filter(c => c && parseStamp(c.start));
    const empty = {night: null, fridges: [], otherHolds: 0, otherUnits: 0, nightUnits: 0, nightHolds: 0};
    if (!open.length) return empty;
    let newest = open[0];
    for (const c of open) if (ts(c.start) > ts(newest.start)) newest = c;
    const night = nightBounds(newest.start);
    const on = [], off = [];
    for (const c of open) (overlaps(c, night) ? on : off).push(c);
    const by = new Map();
    for (const c of on) {
      const id = c.facility_id || c.facility_name || "?";
      if (!by.has(id)) by.set(id, {facility_id: id, name: c.facility_name || id, county: c.facility_county || "", holds: []});
      by.get(id).holds.push(c);
    }
    const fridges = [...by.values()].map(f => {
      f.holds.sort((a, b) => ts(a.start).localeCompare(ts(b.start)));
      f.units = f.holds.reduce((s, c) => s + units(c), 0);
      f.primary = largest(f.holds);
      return f;
    }).sort((a, b) => b.units - a.units || String(a.name).localeCompare(String(b.name)));
    return {
      night, fridges,
      nightUnits: fridges.reduce((s, f) => s + f.units, 0),
      nightHolds: on.length,
      otherHolds: off.length,
      otherUnits: off.reduce((s, c) => s + units(c), 0),
    };
  }

  // Seven nights ending on the newest open hold. Oldest on the left, latest on the right.
  function groupWeek(rows) {
    const open = (rows || []).filter(c => c && parseStamp(c.start));
    const empty = {night: null, nights: [], fridges: [], weekUnits: 0, weekHolds: 0, otherHolds: 0, otherUnits: 0};
    if (!open.length) return empty;
    let newest = open[0];
    for (const c of open) if (ts(c.start) > ts(newest.start)) newest = c;
    const night = nightBounds(newest.start);
    const nights = [];
    for (let i = 6; i >= 0; i--) nights.push(shiftNight(night, -i));
    const by = new Map();
    const on = [], off = [];
    for (const c of open) {
      let hit = false;
      nights.forEach((n, i) => {
        if (!overlaps(c, n)) return;
        hit = true;
        const id = c.facility_id || c.facility_name || "?";
        if (!by.has(id)) by.set(id, {facility_id: id, name: c.facility_name || id, county: c.facility_county || "", cells: nights.map(() => [])});
        by.get(id).cells[i].push(c);
      });
      (hit ? on : off).push(c);
    }
    const fridges = [...by.values()].map(f => {
      f.cells = f.cells.map(holds => {
        holds.sort((a, b) => ts(a.start).localeCompare(ts(b.start)));
        if (!holds.length) return {holds, primary: null, units: 0, ex: false, gap: false};
        return {
          holds,
          primary: largest(holds),
          units: holds.reduce((s, c) => s + units(c), 0),
          ex: holds.some(c => c.kind === "EXCURSION"),
          gap: holds.some(c => c.kind !== "EXCURSION"),
        };
      });
      const once = new Map();
      f.cells.forEach(cell => cell.holds.forEach(c => once.set(c.id, c)));
      f.holds = [...once.values()].sort((a, b) => ts(a.start).localeCompare(ts(b.start)));
      f.units = f.holds.reduce((s, c) => s + units(c), 0);
      f.primary = largest(f.holds);
      return f;
    }).sort((a, b) => b.units - a.units || String(a.name).localeCompare(String(b.name)));
    return {
      night, nights, fridges,
      weekUnits: on.reduce((s, c) => s + units(c), 0),
      weekHolds: on.length,
      otherHolds: off.length,
      otherUnits: off.reduce((s, c) => s + units(c), 0),
    };
  }

  function kindWord(c) { return c.kind === "EXCURSION" ? "Measured" : "Logger gap"; }
  function nightLabel(night) {
    const p = parseStamp(night.start);
    const wd = WD[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()];
    return {wd, day: String(p.d), mon: MO[p.mo - 1]};
  }
  function cellWords(cell) {
    if (cell.ex && cell.gap) return "Measured excursion and a logger gap";
    if (cell.ex) return "Measured excursion";
    if (cell.gap) return "Logger gap";
    return "Clear";
  }

  function cardsHtml(rows) {
    const oldest = rows.reduce((a, c) => ts(c.start) < ts(a.start) ? c : a);
    const biggest = rows.reduce((a, c) => units(c) > units(a) ? c : a);
    const gaps = rows.filter(c => c.kind !== "EXCURSION");
    const hot = rows.filter(c => c.kind === "EXCURSION" && Number(c.peak) >= 10);
    const card = (k, c, v, note) => `<a class="ocard" href="#/case/${encodeURIComponent(c.id)}"><span class="ok">${k}</span><b>${esc(c.facility_name || c.facility_id)}</b><span class="ov">${v}</span><span class="on">${note}</span></a>`;
    const gapCard = gaps.length ? card("Logger silent", gaps.reduce((a, c) => units(c) > units(a) ? c : a), `${fmt(gaps.length)} presumed`, "Temperature unknown in the gap; largest shown") : "";
    const hotCard = hot.length ? card("Hottest", hot.reduce((a, c) => Number(c.peak) > Number(a.peak) ? c : a), `${esc(hot.reduce((a, c) => Number(c.peak) > Number(a.peak) ? c : a).peak)}°C peak`, `${fmt(hot.length)} holds peaked at 10°C or more`) : "";
    return `<div class="ocards">${card("Oldest open", oldest, esc(ts(oldest.start)), `${fmt(units(oldest))} unit${units(oldest) === 1 ? "" : "s"} held since then`)}${card("Largest", biggest, `${fmt(units(biggest))} units`, `${biggest.kind === "EXCURSION" ? "Measured" : "Presumed"} · ${esc(ts(biggest.start))}`)}${gapCard}${hotCard}</div>`;
  }

  function headline(g) {
    const n = g.fridges.length;
    if (!n) return `No fridge has an open hold in the last 7 nights.`;
    const noun = n === 1 ? "fridge is" : "fridges are";
    const u = g.weekUnits;
    return `<b class="num">${fmt(n)}</b> ${noun} not clear across the last 7 nights. <b class="num">${fmt(u)}</b> unit${u === 1 ? "" : "s"} on those holds cannot be issued.`;
  }

  function cellHtml(cell) {
    if (!cell.primary) return `<td><span class="mcell quiet" tabindex="-1">Clear</span></td>`;
    const cls = [cell.ex ? "ex" : "", cell.gap ? "gap" : ""].filter(Boolean).join(" ");
    const n = cell.units;
    const label = cell.ex && cell.gap ? "Measured · gap" : cell.ex ? "Measured" : "Gap";
    return `<td><a class="mcell ${cls}" href="#/case/${encodeURIComponent(cell.primary.id)}"><b>${fmt(n)}</b><span class="mlab">${label}</span><span class="sr-only">${cellWords(cell)}. Opens the largest hold.</span></a></td>`;
  }

  function wireMorning(mount) {
    const root = mount.querySelector(".morning");
    if (!root) return;
    root.addEventListener("keydown", ev => {
      if (ev.altKey || ev.metaKey || ev.ctrlKey) return;
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(ev.key)) return;
      const tag = ev.target && ev.target.closest && ev.target.closest("input, textarea, select");
      if (tag) return;
      const rows = [...root.querySelectorAll("tbody tr")].map(tr => [...tr.querySelectorAll(".mcell")]);
      if (!rows.length || !rows[0].length) return;
      let r = -1, c = -1;
      rows.forEach((row, ri) => row.forEach((el, ci) => { if (el === document.activeElement) { r = ri; c = ci; } }));
      if (r < 0) { r = 0; c = ev.key === "ArrowUp" || ev.key === "End" ? rows[0].length - 1 : 0; }
      else if (ev.key === "Home") { r = 0; c = 0; }
      else if (ev.key === "End") { r = rows.length - 1; c = rows[r].length - 1; }
      else if (ev.key === "ArrowRight") c = Math.min(rows[r].length - 1, c + 1);
      else if (ev.key === "ArrowLeft") c = Math.max(0, c - 1);
      else if (ev.key === "ArrowDown") r = Math.min(rows.length - 1, r + 1);
      else r = Math.max(0, r - 1);
      const next = rows[r] && rows[r][c];
      if (next && next !== document.activeElement) {
        next.focus();
        ev.preventDefault();
      }
    });
  }

  function render(mount, ctx) {
    const rows = (ctx && ctx.rows) || [];
    if (!mount) return;
    if (!rows.length) { mount.innerHTML = `<div class="empty">Pick a hold from the queue.</div>`; return; }
    const g = groupWeek(rows);
    const s = (ctx && ctx.summary) || {};
    if (!g.night) { mount.innerHTML = `<div class="empty">Pick a hold from the queue.</div>`; return; }
    const heads = g.nights.map((n, i) => {
      const lab = nightLabel(n);
      const latest = i === g.nights.length - 1;
      return `<th scope="col"${latest ? ` class="latest"` : ""}><span class="wd">${lab.wd}</span><span class="dn">${lab.day}</span><span class="mo">${latest ? "Latest" : lab.mon}</span></th>`;
    }).join("");
    const body = g.fridges.map(f => `<tr><th scope="row" class="mrowhead"><b>${esc(f.name)}</b>${f.county ? `<span class="mmeta">${esc(f.county)}</span>` : ""}</th>${f.cells.map(cellHtml).join("")}</tr>`).join("");
    const tableRows = g.fridges.flatMap(f => f.holds.map(c => {
      const nights = g.nights.filter(n => overlaps(c, n)).map(n => nightLabel(n).day + " " + nightLabel(n).mon);
      return `<tr><td>${esc(f.name)}</td><td>${nights.map(esc).join(", ")}</td><td>${kindWord(c)}</td><td class="mono">${esc(ts(c.start))}</td><td class="mono">${esc(ts(c.end))}</td><td class="mono">${c.kind === "EXCURSION" && c.peak != null && c.peak !== "" ? esc(c.peak) + "°C" : "unknown"}</td><td class="mono">${fmt(units(c))}</td><td><a href="#/case/${encodeURIComponent(c.id)}">${esc(c.id)}</a></td></tr>`;
    })).join("");
    const outside = g.otherHolds ? `${fmt(g.otherHolds)} open hold${g.otherHolds === 1 ? "" : "s"} sit outside these 7 nights and stay in the queue.` : "Every open hold falls in these 7 nights.";
    const all = s.units_on_hold != null ? ` ${fmt(s.units_on_hold)} units are on hold in the whole queue.` : "";
    const first = g.nights[0], last = g.nights[g.nights.length - 1];
    mount.innerHTML = `<div class="overview morning"><p class="eyebrow">Latest night in the data · ${esc(g.night.start)} to ${esc(g.night.end.slice(11))} EAT</p><h1>${headline(g)}</h1><p class="why">Last 7 nights, 18:00 to 08:00, latest on the right. The number is units on hold; choose a cell to open its largest hold.</p><div class="mlegend"><span><i class="mdot ex"></i>Measured, above 6°C</span><span><i class="mdot gap"></i>Logger gap</span><span><i class="mdot safe"></i>Clear that night</span></div><details class="howto"><summary>How to read this</summary><p>The grid runs ${esc(first.start.slice(0, 10))} through ${esc(last.end.slice(0, 10))}. Red is a measured excursion. Orange is a logger gap, so the temperature is unknown. A red cell with an orange bar has both. Clear means no open hold. A hold that runs through two nights shows in both cells. A fridge with no open hold in the week is not listed. ${outside}${all}</p></details><div class="mgrid"><table class="week"><caption class="sr-only">Last 7 nights by fridge. A cell opens the largest hold on that fridge that night.</caption><thead><tr><th scope="col">Fridge</th>${heads}</tr></thead><tbody>${body || `<tr><td colspan="8">No open hold overlaps these 7 nights.</td></tr>`}</tbody></table></div><details class="rtable mtable"><summary>These 7 nights as a table (${fmt(g.weekHolds)} hold${g.weekHolds === 1 ? "" : "s"})</summary><div class="twrap"><table><thead><tr><th scope="col">Fridge</th><th scope="col">Nights</th><th scope="col">Kind</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Peak</th><th scope="col">Units</th><th scope="col">Case</th></tr></thead><tbody>${tableRows}</tbody></table></div></details><p class="eyebrow subeye">Also start here</p>${cardsHtml(rows)}<dl class="ostats"><div><dt>Measured excursions</dt><dd>${fmt(rows.filter(c => c.kind === "EXCURSION").length)}</dd></div><div><dt>Presumed (logger gap)</dt><dd>${fmt(rows.filter(c => c.kind !== "EXCURSION").length)}</dd></div><div><dt>Window</dt><dd>since ${esc(s.dataset_since || "")}</dd></div></dl></div>`;
    wireMorning(mount);
  }

  return {nightBounds, groupNight, groupWeek, shiftNight, render};
});
