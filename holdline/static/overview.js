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
  function toMin(iso) {
    const p = parseStamp(iso);
    if (!p) return null;
    return Math.floor(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) / 60000);
  }
  function units(c) { return Number(c && c.n) || 0; }

  function groupNight(rows) {
    const open = (rows || []).filter(c => c && parseStamp(c.start));
    const empty = {night: null, fridges: [], otherHolds: 0, otherUnits: 0, nightUnits: 0, nightHolds: 0};
    if (!open.length) return empty;
    let newest = open[0];
    for (const c of open) if (ts(c.start) > ts(newest.start)) newest = c;
    const night = nightBounds(newest.start);
    const n0 = toMin(night.start), n1 = toMin(night.end);
    const on = [], off = [];
    for (const c of open) {
      const a = toMin(c.start);
      const b0 = toMin(c.end || c.start);
      const b = b0 != null && b0 > a ? b0 : a + 60;
      if (a < n1 && b > n0) on.push(c); else off.push(c);
    }
    const by = new Map();
    for (const c of on) {
      const id = c.facility_id || c.facility_name || "?";
      if (!by.has(id)) by.set(id, {facility_id: id, name: c.facility_name || id, county: c.facility_county || "", holds: []});
      by.get(id).holds.push(c);
    }
    const fridges = [...by.values()].map(f => {
      f.holds.sort((a, b) => ts(a.start).localeCompare(ts(b.start)));
      f.units = f.holds.reduce((s, c) => s + units(c), 0);
      f.primary = f.holds.reduce((a, c) => units(c) > units(a) || (units(c) === units(a) && ts(c.start) > ts(a.start)) ? c : a);
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

  function kindWord(c) { return c.kind === "EXCURSION" ? "Measured" : "Logger gap"; }

  function stripSVG(fridge, night, idx) {
    const W = 640, H = 52, L = 4, R = 4, TOP = 6, BH = 20;
    const n0 = toMin(night.start), n1 = toMin(night.end), span = Math.max(1, n1 - n0);
    const x = t => L + (t - n0) / span * (W - L - R);
    const id = "hlm" + idx;
    let bands = "";
    fridge.holds.forEach(c => {
      const cs = toMin(c.start), ce0 = toMin(c.end || c.start);
      if (cs == null) return;
      const ce = ce0 != null && ce0 > cs ? ce0 : cs + 60;
      const a = Math.max(n0, cs), b = Math.min(n1, ce);
      if (b <= a) return;
      const ex = c.kind === "EXCURSION";
      const x0 = x(a), w = Math.max(2, x(b) - x(a));
      bands += `<rect x="${x0.toFixed(1)}" y="${TOP}" width="${w.toFixed(1)}" height="${BH}" rx="2" fill="${ex ? "var(--excursion)" : "url(#" + id + "h)"}"><title>${esc(kindWord(c))} ${esc(ts(c.start))} to ${esc(ts(c.end))}</title></rect>`;
      if (ex && w >= 14) {
        bands += `<path d="M${(x0 + 7).toFixed(1)} ${TOP + 4}l3.2 5.5h-6.4z" fill="#fff"><title>Above 6°C</title></path>`;
        if (w >= 22 && Number(c.peak) >= 10) {
          const dx = x0 + w / 2;
          bands += `<path d="M${dx.toFixed(1)} ${TOP + 4}l3.5 4.5-3.5 4.5-3.5-4.5z" fill="#fff"><title>Peak ${esc(c.peak)}°C, at or above 10°C</title></path>`;
        }
      }
    });
    const labels = [[0, "18:00", "start"], [3, "21:00", "middle"], [6, "00:00", "middle"], [9, "03:00", "middle"], [12, "06:00", "middle"], [14, "08:00", "end"]];
    let ticks = "";
    labels.forEach(([h, name, anchor]) => {
      const X = x(n0 + h * 60);
      const ta = anchor === "start" ? "start" : anchor === "end" ? "end" : "middle";
      ticks += `<line x1="${X.toFixed(1)}" x2="${X.toFixed(1)}" y1="${TOP + BH}" y2="${TOP + BH + 4}" stroke="var(--rule)"/><text x="${X.toFixed(1)}" y="${TOP + BH + 15}" text-anchor="${ta}" class="ax">${name}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><defs><pattern id="${id}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--unverified)" stroke-width="1.5"/></pattern></defs><rect x="${L}" y="${TOP}" width="${W - L - R}" height="${BH}" rx="2" fill="var(--band-safe)"/>${bands}${ticks}</svg>`;
  }

  function holdLine(c) {
    const peak = c.kind === "EXCURSION" && c.peak != null && c.peak !== "" ? ` · peak ${esc(c.peak)}°C` : "";
    const n = units(c);
    return `<li><a href="#/case/${encodeURIComponent(c.id)}">${kindWord(c)} · ${esc(ts(c.start))} to ${esc(ts(c.end))}${peak} · ${fmt(n)} unit${n === 1 ? "" : "s"}</a></li>`;
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
    if (!n) return `No fridge has an open hold from ${esc(g.night.start)} to ${esc(g.night.end)}.`;
    const noun = n === 1 ? "fridge is" : "fridges are";
    const u = g.nightUnits;
    return `<span>${fmt(n)}</span> ${noun} not clear from that night. <span>${fmt(u)}</span> unit${u === 1 ? "" : "s"} on those holds cannot be issued.`;
  }

  function wireMorning(mount) {
    const root = mount.querySelector(".morning");
    if (!root) return;
    root.addEventListener("keydown", ev => {
      if (ev.altKey || ev.metaKey || ev.ctrlKey) return;
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key)) return;
      const tag = ev.target && ev.target.closest && ev.target.closest("input, textarea, select");
      if (tag) return;
      const strips = [...root.querySelectorAll("a.mstrip")];
      if (!strips.length) return;
      let i = strips.indexOf(document.activeElement);
      if (i < 0) {
        const art = document.activeElement && document.activeElement.closest && document.activeElement.closest(".mfridge");
        i = art ? strips.findIndex(a => art.contains(a)) : -1;
      }
      let next = i;
      if (ev.key === "Home") next = 0;
      else if (ev.key === "End") next = strips.length - 1;
      else if (ev.key === "ArrowDown") next = i < 0 ? 0 : Math.min(strips.length - 1, i + 1);
      else next = i < 0 ? strips.length - 1 : Math.max(0, i - 1);
      if (strips[next] && strips[next] !== document.activeElement) {
        strips[next].focus();
        ev.preventDefault();
      }
    });
  }

  function render(mount, ctx) {
    const rows = (ctx && ctx.rows) || [];
    if (!mount) return;
    if (!rows.length) { mount.innerHTML = `<div class="empty">Pick a hold from the queue.</div>`; return; }
    const g = groupNight(rows);
    const s = (ctx && ctx.summary) || {};
    if (!g.night) { mount.innerHTML = `<div class="empty">Pick a hold from the queue.</div>`; return; }
    const strips = g.fridges.map((f, i) => {
      const ex = f.holds.some(c => c.kind === "EXCURSION");
      const gap = f.holds.some(c => c.kind !== "EXCURSION");
      const kind = ex && gap ? "Measured excursion and a logger gap" : ex ? "Measured excursion" : "Logger gap";
      return `<article class="mfridge"><a class="mstrip" href="#/case/${encodeURIComponent(f.primary.id)}"><span class="mhead"><b>${esc(f.name)}</b><span class="mmeta">${f.county ? esc(f.county) + " · " : ""}${fmt(f.units)} unit${f.units === 1 ? "" : "s"} on hold</span></span>${stripSVG(f, g.night, i)}<span class="sr-only">${kind}. Opens the largest hold on this fridge.</span></a><ul class="mholds">${f.holds.map(holdLine).join("")}</ul></article>`;
    }).join("");
    const tableRows = g.fridges.flatMap(f => f.holds.map(c => `<tr><td>${esc(f.name)}</td><td>${kindWord(c)}</td><td class="mono">${esc(ts(c.start))}</td><td class="mono">${esc(ts(c.end))}</td><td class="mono">${c.kind === "EXCURSION" && c.peak != null && c.peak !== "" ? esc(c.peak) + "°C" : "unknown"}</td><td class="mono">${fmt(units(c))}</td><td><a href="#/case/${encodeURIComponent(c.id)}">${esc(c.id)}</a></td></tr>`)).join("");
    const outside = g.otherHolds ? `${fmt(g.otherHolds)} open hold${g.otherHolds === 1 ? "" : "s"} sit outside this night and stay in the queue.` : "Every open hold falls on this night.";
    const all = s.units_on_hold != null ? ` ${fmt(s.units_on_hold)} units are on hold in the whole queue.` : "";
    mount.innerHTML = `<div class="overview morning"><p class="eyebrow">Latest night in the data · ${esc(g.night.start)} to ${esc(g.night.end.slice(11))} EAT</p><h1>${headline(g)}</h1><p class="why">Each strip is one fridge from 18:00 to 08:00. Red is a measured excursion. The triangle marks a reading above 6°C. A diamond marks a peak of 10°C or more. Hatch is a logger gap, so the temperature is unknown. A fridge with no open hold that night is not listed. Choose a strip to open its largest hold. ${outside}${all}</p><div class="mlegend"><span><i class="mdot ex"></i>Measured, above 6°C</span><span><i class="mdot hot"></i>Peak 10°C or more</span><span><i class="mdot gap"></i>Logger gap</span><span><i class="mdot safe"></i>No open hold in that hour</span></div><div class="mstrips">${strips || `<p class="why">No open hold overlaps this night.</p>`}</div><details class="rtable mtable"><summary>This night as a table (${fmt(g.nightHolds)} hold${g.nightHolds === 1 ? "" : "s"})</summary><div class="twrap"><table><thead><tr><th scope="col">Fridge</th><th scope="col">Kind</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Peak</th><th scope="col">Units</th><th scope="col">Case</th></tr></thead><tbody>${tableRows}</tbody></table></div></details><p class="eyebrow subeye">Also start here</p>${cardsHtml(rows)}<dl class="ostats"><div><dt>Measured excursions</dt><dd>${fmt(rows.filter(c => c.kind === "EXCURSION").length)}</dd></div><div><dt>Presumed (logger gap)</dt><dd>${fmt(rows.filter(c => c.kind !== "EXCURSION").length)}</dd></div><div><dt>Window</dt><dd>since ${esc(s.dataset_since || "")}</dd></div></dl></div>`;
    wireMorning(mount);
  }

  return {nightBounds, groupNight, render};
});
