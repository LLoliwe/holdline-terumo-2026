// HOLDLINE client (ui/rethink). Offline-tolerant: last data cached in localStorage, decisions queued while
// offline and replayed with a client_id so the server never applies one twice. The decision rules live on the
// server; this file only presents them. An ACCEPT never carries units or a second signature.
"use strict";
// Icons: Tabler Icons (MIT, Copyright (c) 2020-2026 Pawel Kuna), outline paths vendored; see static/LICENSE-tabler.txt
const icon = (k, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${k}"/></svg>`;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const fmt = n => Number(n || 0).toLocaleString("en-ZA").replace(/\u00a0/g, ",");
const ts = s => String(s || "").replace("T", " ").slice(0, 16);
const STATUSES = [["OPEN", "Open"], ["ACCEPTED", "Accepted"], ["CHANGED", "Changed"], ["REJECTED", "Rejected"], ["NO_UNITS", "No units"]];
const LAYOUTS = ["split", "drawer", "page"];

let state = {status: "OPEN", sel: null, rows: [], view: "queue", hi: -1, kinds: new Set(), q: "", sort: "new",
             summary: null, drafts: {}, data: null, cursor: -1};
const narrow = matchMedia("(max-width: 760px)");
const layout = () => narrow.matches ? "page" : (new URLSearchParams(location.search).get("layout") || localStorage.getItem("hl.layout") || "split");

// ── storage, network and the offline queue (behaviour unchanged from main) ─────────────────────────
const Q = () => JSON.parse(localStorage.getItem("hl.queue") || "[]");
// Changing the queue only repaints status pills and the current case's sync note. It never re-renders the
// case, so a half-typed reason or ticked units survive the 10 s background sync.
const setQ = q => { localStorage.setItem("hl.queue", JSON.stringify(q)); paintNet(); paintQueueNote(); };

async function api(path, opts) {
  try {
    const r = await fetch(path, opts);
    const j = await r.json();
    if (r.status === 401 && j && j.error === "sign in first" && me && opts && opts.headers && opts.headers["X-Holdline-Token"] === me.token) {
      me = null; localStorage.removeItem("hl.me"); paintWho();  // our own session expired: show sign-in, keep the queue
    }
    if (r.ok && (!opts || opts.method !== "POST")) { try { localStorage.setItem("hl.c." + path, JSON.stringify(j)); } catch (e) {} }
    online(true);
    return {ok: r.ok, data: j};
  } catch (e) {
    if (e && e.name === "AbortError") return {aborted: true};  // superseded by a newer request: not a network failure
    online(false);
    const c = localStorage.getItem("hl.c." + path);
    return {ok: !!c, data: c ? JSON.parse(c) : null, cached: true};
  }
}
let isOnline = true;
function online(v) { if (v !== isOnline) { isOnline = v; paintNet(); if (v) flush(); } }
function paintNet() {
  const n = $("#net"); n.textContent = isOnline ? "Online" : "Offline · cached"; n.className = "pill " + (isOnline ? "ok" : "un");
  const q = Q(), pending = q.filter(d => !d._error).length, failed = q.filter(d => d._error).length, el = $("#sync");
  el.hidden = !q.length;
  el.textContent = (pending ? pending + " waiting to sync" : "") + (pending && failed ? " · " : "") + (failed ? failed + " refused" : "");
}
let flushing = false;
async function flush() {
  if (flushing) return;  // single-flight: overlapping reconnects/intervals must not double-post a queued decision
  flushing = true;
  try { await _flush(); } finally { flushing = false; }
}
// Replay queued decisions under the identity that made them; never re-attribute. A refused decision is kept,
// marked with the server's reason, and stays visible until the operator resolves it.
async function _flush() {
  let q = Q(), left = [];
  for (const d of q) {
    if (d._error) { left.push(d); continue; }
    const hdr = me && me.user === d._user ? auth() : (d._auth || {});
    const r = await api("/api/decide", {method: "POST", headers: {"Content-Type": "application/json", ...hdr}, body: JSON.stringify(d)});
    if (r.cached) left.push(d);
    else if (!r.ok && r.data && r.data.error === "sign in first") { left.push(d); toast(`Sign in again as ${d._user} to sync a queued decision.`, true); }
    else if (!r.ok) left.push({...d, _error: (r.data && r.data.error) || "refused"});
  }
  const changed = q.length !== left.length || q.some((d, i) => d._error !== left[i]._error);
  setQ(left); if (changed) refresh();
}

// ── identity ─────────────────────────────────────────────────────────────────────────────────────
let me = JSON.parse(localStorage.getItem("hl.me") || "null");
const auth = () => me ? {"X-Holdline-Token": me.token} : {};
const role = () => me ? me.role : null;
function paintWho() {
  $("#who").innerHTML = me ? `<b>${esc(me.user)}</b> <span>${role() === "qualified_releaser" ? "qualified releaser" : "duty officer"}</span> <button type="button" class="link" id="out">Sign out</button>` : "";
  $("#signin-open").hidden = !!me;
}
function openSignin() { $("#lmsg").textContent = ""; $("#signin").showModal(); $("#lpin").focus(); }
$("#signin-open").onclick = openSignin;
$("#signin-cancel").onclick = () => $("#signin").close();
$("#login").onsubmit = async ev => {
  ev.preventDefault();
  const r = await api("/api/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({user: $("#luser").value, pin: $("#lpin").value})});
  if (r.cached || !r.ok) { $("#lmsg").textContent = r.cached ? "Offline: sign-in needs the server once." : r.data.error; return; }
  me = r.data; localStorage.setItem("hl.me", JSON.stringify(me)); $("#lpin").value = ""; $("#signin").close(); paintWho(); handover();
  if (state.data) renderCase(state.data);
};
document.addEventListener("click", ev => {
  if (ev.target.id !== "out") return;
  if (me) fetch("/api/logout", {method: "POST", headers: {"Content-Type": "application/json", ...auth()}, body: "{}"}).catch(() => {});
  me = null; localStorage.removeItem("hl.me"); paintWho(); if (state.data) renderCase(state.data);
});

// ── summary, context line, status tabs ───────────────────────────────────────────────────────────
async function summary() {
  const r = await api("/api/summary"); if (!r.data) return;
  state.summary = r.data; const s = r.data;
  $("#context").innerHTML = `<b>${fmt(s.cases.OPEN || 0)}</b> open holds · <b>${fmt(s.units_on_hold)}</b> units held · window since ${esc(s.dataset_since || "start")} · ` +
    `audit chain <span class="${s.audit_ok ? "okw" : "badw"}">${s.audit_ok ? "intact" : "BROKEN at " + esc(s.audit_broken_at)}</span> · synthetic data · prototype, not a medical device · <button type="button" class="link" id="about-open">About and privacy</button>`;
  const ab = $("#about-open"); if (ab) ab.onclick = () => $("#about").showModal();
  paintTabs();
  if (state.view === "evaluation") paintEvaluation();
}
function paintTabs() {
  const c = (state.summary && state.summary.cases) || {};
  $("#tabs").innerHTML = STATUSES.map(([k, l]) => `<button role="tab" data-s="${k}" aria-selected="${k === state.status}">${l} <span>${c[k] != null ? fmt(c[k]) : "0"}</span></button>`).join("");
}
$("#tabs").onclick = ev => {
  const b = ev.target.closest("button"); if (!b) return;
  state.status = b.dataset.s; state.hi = -1; paintTabs(); loadList();
};

// ── queue: one fetch per status, then search/filter/sort in memory ───────────────────────────────
let listSeq = 0;
async function loadList() {
  const my = ++listSeq;
  const r = await api("/api/cases?status=" + state.status, me ? {headers: auth()} : undefined);
  if (my !== listSeq || r.aborted) return;  // a newer status was picked while this one loaded
  state.rows = (r.data && Array.isArray(r.data)) ? r.data : [];
  state.listCached = !!r.cached; state.listMissing = !r.data;
  paintList(); if (state.view === "queue") paintOverview();
  if (!r.cached && state.status === "OPEN") idle(() => prefetch(state.rows.slice(0, 20).map(c => c.id)));
}
function visible() {
  const q = state.q.trim().toLowerCase(), k = state.kinds;
  let v = state.rows.filter(c => (!k.size || k.has(c.kind === "EXCURSION" ? "EXCURSION" : "GAP")) &&
    (!q || (c.facility_name || "").toLowerCase().includes(q) || (c.facility_county || "").toLowerCase().includes(q) || c.id.toLowerCase().includes(q)));
  if (state.sort === "old") v = v.slice().reverse();
  if (state.sort === "units") v = v.slice().sort((a, b) => b.n - a.n);
  return v;
}
const hours = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 36e5));
function paintList() {
  const el = $("#list"), v = visible(); state.vis = v;
  const total = state.rows.length;
  $("#qcount").textContent = state.listMissing ? "" : (v.length === total ? `${fmt(total)} ${total === 1 ? "hold" : "holds"}` : `${fmt(v.length)} of ${fmt(total)} shown`) + (state.listCached ? " · cached" : "");
  if (state.listMissing) { el.innerHTML = `<p class="empty">No cached data yet. Connect once to load the queue.</p>`; return; }
  if (!v.length) { el.innerHTML = `<p class="empty">${total ? "No holds match. Clear the search or filters." : "Nothing here."}</p>`; return; }
  el.innerHTML = v.map((c, i) => {
    const ex = c.kind === "EXCURSION";
    return `<div class="row${c.id === state.sel ? " sel" : ""}${i === state.hi ? " hi" : ""}" role="option" id="r${i}" data-i="${i}" data-id="${esc(c.id)}" aria-selected="${c.id === state.sel}">
     <span class="g ${ex ? "ex" : "un"}">${icon(ex ? "ex" : "gap")}</span>
     <span class="f">${esc(c.facility_name || c.facility_id)}</span>
     <span class="u"><b>${fmt(c.n)}</b> units</span>
     <span class="m">${esc(ts(c.start))} · ${hours(c.start, c.end)} h${c.facility_county ? " · " + esc(c.facility_county) : ""}</span>
     ${sevRow(c)}</div>`;
  }).join("");
  if (state.hi >= 0) el.setAttribute("aria-activedescendant", "r" + state.hi); else el.removeAttribute("aria-activedescendant");
}
function markRows() {  // selection/highlight change without rebuilding the list
  $("#list").querySelectorAll(".row").forEach(r => {
    const s = r.dataset.id === state.sel; r.classList.toggle("sel", s); r.setAttribute("aria-selected", s); r.classList.toggle("hi", +r.dataset.i === state.hi);
  });
  if (state.hi >= 0) { $("#list").setAttribute("aria-activedescendant", "r" + state.hi); const h = $("#r" + state.hi); if (h) h.scrollIntoView({block: "nearest"}); }
}
$("#list").onclick = ev => { const r = ev.target.closest(".row"); if (!r) return; state.hi = +r.dataset.i; go(r.dataset.id); };
let qT; $("#q").oninput = ev => { clearTimeout(qT); qT = setTimeout(() => { state.q = ev.target.value; state.hi = -1; paintList(); }, 80); };
$("#sort").onchange = ev => { state.sort = ev.target.value; state.hi = -1; paintList(); };
document.querySelectorAll(".fchip").forEach(b => b.onclick = () => {
  const f = b.dataset.f, on = !state.kinds.has(f); on ? state.kinds.add(f) : state.kinds.delete(f);
  b.setAttribute("aria-pressed", on); state.hi = -1; paintList(); saveFilters();
});
function setKinds(ks) { state.kinds.clear(); ks.forEach(k => state.kinds.add(k)); document.querySelectorAll(".fchip").forEach(b => b.setAttribute("aria-pressed", state.kinds.has(b.dataset.f))); saveFilters(); paintList(); }
function saveFilters() { localStorage.setItem("hl.filters", JSON.stringify({kinds: [...state.kinds], sort: state.sort})); }
function loadFilters() {
  try { const f = JSON.parse(localStorage.getItem("hl.filters") || "{}"); (f.kinds || []).forEach(k => state.kinds.add(k)); if (f.sort) state.sort = f.sort; } catch (e) {}
  document.querySelectorAll(".fchip").forEach(b => b.setAttribute("aria-pressed", state.kinds.has(b.dataset.f))); $("#sort").value = state.sort;
}
$("#sort").addEventListener("change", saveFilters);

// Cache the newest open cases so a duty officer who loses signal can still open them.
const prefetched = new Set();
const idle = f => (window.requestIdleCallback || (g => setTimeout(g, 300)))(f);
async function prefetch(ids) {
  for (const id of ids) {
    if (prefetched.has(id) || !isOnline) continue;
    prefetched.add(id);
    const r = await api("/api/case/" + encodeURIComponent(id), me ? {headers: auth()} : undefined);
    if (r.cached) return;
  }
}

// ── routing: #/  #/case/<id>  #/evaluation ───────────────────────────────────────────────────────
function go(id) { const h = "#/case/" + encodeURIComponent(id); if (location.hash !== h) location.hash = h; else route(); }
function back() { location.hash = "#/"; }
function route() {
  const h = location.hash;
  const m = h.match(/^#\/case\/(.+)$/) || (h.match(/^#(HL-[\w-]+)$/));  // old links were #<case id>
  document.body.dataset.layout = layout();
  if (h === "#/evaluation") { setView("evaluation"); return; }
  if (m) { setView("case"); openCase(decodeURIComponent(m[1])); return; }
  setView("queue"); paintOverview();
  if (layout() !== "split") { const r = $("#list .row.sel") || $("#list .row.hi"); (r || $("#list")).focus && $("#list").focus({preventScroll: !state.sel}); }
}
function setView(v) {
  if (v !== "queue") state.ovTop = false;
  state.view = v; document.body.dataset.view = v;
  $("#evaluation").hidden = v !== "evaluation";
  document.querySelectorAll(".views a").forEach(a => a.toggleAttribute("aria-current", a.dataset.view === (v === "evaluation" ? "evaluation" : "queue")));
  const phone = layout() === "page", scrim = $("#sheet-scrim"), caseEl = $("#case");
  if (scrim) scrim.hidden = !(phone && v === "case");
  if (caseEl) { if (phone && v !== "case" && !caseEl.querySelector(".overview")) caseEl.setAttribute("aria-hidden", "true"); else caseEl.removeAttribute("aria-hidden"); }
  if (v === "evaluation") paintEvaluation();
}
const sheetScrim = $("#sheet-scrim"); if (sheetScrim) sheetScrim.onclick = () => { if (state.view === "case") back(); };
window.addEventListener("hashchange", route);
narrow.addEventListener("change", route);

// First view: what needs attention, before any case is picked.
// Queue row severity: a word, a shape and a colour, plus a duration bar (0 to 12 h). Not a sparkline: the queue
// does not carry readings, and fetching 412 series to draw them would cost more than it tells.
function sevRow(c) {
  const ex = c.kind === "EXCURSION", pk = Number(c.peak), h = Math.max(1, hours(c.start, c.end));
  const k = !ex ? ["gap", "Logger silent"] : pk >= 10 ? ["hot", `Peak ${esc(c.peak)}°C`] : ["ex", `Peak ${esc(c.peak)}°C`];
  return `<span class="sev"><span class="schip ${k[0]}">${k[0] === "gap" ? "◌" : k[0] === "hot" ? "◆" : "▲"} ${k[1]}</span><span class="dbar ${k[0]}" aria-hidden="true"><i style="width:${Math.min(100, h / 12 * 100).toFixed(0)}%"></i></span><span class="dlab">${h} h</span></span>`;
}
function paintOverview() {
  // Phone: the overview is the first view, so start the shared scroll at the top (once per arrival on the queue).
  if (layout() !== "split" && state.view === "queue" && !state.ovTop) { state.ovTop = true; requestAnimationFrame(() => { const m = $("main"); if (m) m.scrollTop = 0; }); }
  const el = $("#case"), rows = state.status === "OPEN" ? state.rows : [], s = state.summary;
  state.sel = null; state.data = null; caseSeq++; markRows();
  // Seam: an overview module (overview.js) may define window.HoldlineOverview.render(mount, ctx) to own the landing view.
  // ctx = {rows, summary, open(id)}; rows are the open cases as listed in the queue. It must not decide anything.
  if (window.HoldlineOverview && typeof window.HoldlineOverview.render === "function") {
    el.innerHTML = `${state.handover || ""}<div id="overview-mount" class="overview-mount"></div>`;
    try { window.HoldlineOverview.render($("#overview-mount"), {rows, summary: s, open: go}); return; } catch (e) { console.error(e); }
  }
  if (!rows.length) { el.innerHTML = `<div class="empty">Pick a hold from the queue.</div>`; return; }
  const oldest = rows.reduce((a, c) => c.start < a.start ? c : a), biggest = rows.reduce((a, c) => c.n > a.n ? c : a);
  const gaps = rows.filter(c => c.kind !== "EXCURSION"), hot = rows.filter(c => c.kind === "EXCURSION" && c.peak >= 10);
  const card = (k, c, v, note) => `<a class="ocard" href="#/case/${encodeURIComponent(c.id)}"><span class="ok">${k}</span><b>${esc(c.facility_name || c.facility_id)}</b><span class="ov">${v}</span><span class="on">${note}</span></a>`;
  el.innerHTML = `<div class="overview"><p class="eyebrow">Open holds</p>
   <h1><span>${fmt(rows.length)}</span> holds wait for a person. <span>${fmt(s ? s.units_on_hold : 0)}</span> units cannot be issued until then.</h1>
   <p class="why">Every hold stays on until a duty officer accepts it or two qualified releasers release units. Start with the cases below, or press <kbd>j</kbd> to walk the queue.</p>
   <div class="ocards">
    ${card("Oldest open", oldest, esc(ts(oldest.start)), `${fmt(oldest.n)} unit${oldest.n === 1 ? "" : "s"} held since then`)}
    ${card("Largest", biggest, `${fmt(biggest.n)} units`, `${biggest.kind === "EXCURSION" ? "Measured" : "Presumed"} · ${esc(ts(biggest.start))}`)}
    ${gaps.length ? card("Logger silent", gaps.reduce((a, c) => c.n > a.n ? c : a), `${fmt(gaps.length)} presumed`, "Temperature unknown in the gap; largest shown") : ""}
    ${hot.length ? card("Hottest", hot.reduce((a, c) => c.peak > a.peak ? c : a), `${esc(hot.reduce((a, c) => c.peak > a.peak ? c : a).peak)}°C peak`, `${fmt(hot.length)} holds peaked at 10°C or more`) : ""}
   </div>
   <dl class="ostats"><div><dt>Measured excursions</dt><dd>${fmt(rows.length - gaps.length)}</dd></div><div><dt>Presumed (logger gap)</dt><dd>${fmt(gaps.length)}</dd></div><div><dt>Window</dt><dd>since ${esc(s ? s.dataset_since : "")}</dd></div></dl>
  </div>`;
}

// ── case: latest request wins; superseded requests are aborted and ignored ───────────────────────
let caseSeq = 0, caseCtl = null;
const SKELETON = `<div class="skel" aria-hidden="true"><i class="s1"></i><i class="s2"></i><i class="s3"></i><div class="sg"><i></i><i></i><i></i><i></i><i></i></div><div class="sb"><i class="sc"></i><i class="sd"></i></div></div><p class="sr-only">Loading the hold…</p>`;
async function openCase(id) {
  const my = ++caseSeq;
  if (caseCtl) caseCtl.abort();
  caseCtl = typeof AbortController === "function" ? new AbortController() : null;
  state.sel = id; markRows();
  const el = $("#case");
  let skel = null;
  if (!state.data || state.data.case.id !== id) {
    el.setAttribute("aria-busy", "true");
    skel = setTimeout(() => { if (my === caseSeq) el.innerHTML = SKELETON; }, 300);  // only on a slow network, so normal opens never flash
  }
  const r = await api("/api/case/" + encodeURIComponent(id), {headers: auth(), signal: caseCtl && caseCtl.signal});
  clearTimeout(skel);
  if (my !== caseSeq || r.aborted) return;
  el.removeAttribute("aria-busy");
  if (!r.data || r.data.error) { state.data = null; el.innerHTML = r.cached ? `<div class="empty offline"><h2>Offline, and this case is not saved on this device</h2><p>Its units stay on hold. Open it again when the connection returns, or pick a case opened earlier on this device.</p></div>` : `<div class="empty">${esc((r.data && r.data.error) || "Not found")}</div>`; return; }
  state.data = r.data;
  renderCase(r.data);
  if (layout() !== "split" || state.focusCase) { el.focus({preventScroll: true}); state.focusCase = false; }
}

const KIND = c => c.kind === "EXCURSION" ? ["ex", icon("ex"), "Measured excursion"] : ["un", icon("gap"), "Presumed: logger gap"];
function evidence(d) {
  const rs = d.readings, c = d.case;
  const vals = rs.filter(r => r[1] > -50 && r[1] < 60);
  const above = vals.filter(r => r[1] > 6).length;
  const missing = Math.max(0, 49 - rs.length);  // the server returns hourly readings for 24 h either side of the start
  const max = vals.length ? Math.max(...vals.map(r => r[1])) : null;
  return {above, missing, max, n: rs.length, peak: c.peak};
}
function draft(id) { return state.drafts[id] || (state.drafts[id] = {reason: "", ticks: new Set(), second: "", confirm: null, frozen: null, ufilter: ""}); }

// Review progress (endowed progress, truthfully): the hold is already in place when a case appears, so step 1 is done.
function steps(d) {
  const c = d.case, dr = draft(c.id), st = c.status;
  if (st === "NO_UNITS") return "";
  const decided = st !== "OPEN", released = st === "CHANGED" || st === "REJECTED";
  const items = [
    ["Detected and held", "done"],
    ["Decide", decided || dr.confirm ? "done" : "now"],
    [released || dr.confirm ? "Sign and confirm" : "Sign and confirm (release only)", released ? "done" : dr.confirm ? "now" : decided ? "skip" : "todo"],
    [decided ? (st === "ACCEPTED" ? "Recorded: kept on hold" : "Recorded: released") : "Recorded", decided ? "done" : "todo"],
  ];
  return `<ol class="steps" aria-label="Review progress">${items.map(([k, s], i) => `<li class="${s}"${s === "now" ? ' aria-current="step"' : ""}><span class="dot" aria-hidden="true">${s === "done" ? "✓" : i + 1}</span>${esc(k)}<span class="sr-only">${s === "done" ? " (done)" : s === "now" ? " (current)" : s === "skip" ? " (not needed)" : ""}</span></li>`).join("")}</ol>`;
}
function renderCase(d) {
  const c = d.case, f = d.facility || {}, open = c.status === "OPEN", [cls, glyph, label] = KIND(c), e = evidence(d);
  const also = d.also_held || {}, alsoUnits = Object.keys(also);
  const alsoCases = [...new Set(alsoUnits.flatMap(u => also[u].map(x => x.case_id)))];
  const canRelease = open && role() === "qualified_releaser";
  const status = open ? `<span class="kick hold">On hold · do not issue</span>` : c.status === "NO_UNITS" ? `<span class="kick info">Logged · no units in this fridge</span>` : `<span class="kick done">${esc(c.status)} · decided</span>`;
  const backBtn = layout() === "split" ? "" : `<button type="button" class="btn sm ghost backbtn" id="back">${icon("back")} Queue</button>`;
  const grab = layout() === "split" ? "" : `<button type="button" class="grabber" id="grabber" aria-label="Close case"><span></span></button>`;
  $("#case").innerHTML = `${grab}
  <div class="sheet" data-case="${esc(c.id)}">
   <header class="chead">${backBtn}${status}
    <div id="steps-mount">${steps(d)}</div>
    <div class="hero"><h1>${esc(f.name || c.facility_id)}</h1><div class="hpeak ${c.kind === "EXCURSION" ? "ex" : "un"}"><span class="hpl">${c.kind === "EXCURSION" ? "Peak" : "Peak in the gap"}</span><span class="hpv">${c.kind === "EXCURSION" && c.peak != null ? esc(c.peak) + "<small>°C</small>" : "unknown"}</span></div></div>
    <p class="why"><span class="g ${cls}">${glyph}</span> <b>${label}.</b> ${esc(c.reason)}.</p>
    <p class="meta"><span>${esc(ts(c.start))} → ${esc(ts(c.end))} EAT</span><span>${esc(f.county || "")}</span><span>${esc(f.connectivity || "")}</span><span>backup power: ${f.has_blood_fridge_backup_power === "True" ? "yes" : "no"}</span><span class="mono">${esc(c.id)}</span></p>
   </header>
   <dl class="facts" aria-label="Evidence summary">
    <div><dt>${open ? "Units held here" : "Units in this case"}</dt><dd>${fmt(d.units.length)}</dd></div>
    <div><dt>Readings above 6°C</dt><dd>${e.above} <small>of ${e.n}</small></dd></div>
    <div><dt>Hours with no reading</dt><dd class="${e.missing ? "unw" : ""}">${e.missing}</dd></div>
    <div><dt>Also held elsewhere</dt><dd class="${alsoUnits.length ? "exw" : ""}">${alsoUnits.length ? `${alsoUnits.length} unit${alsoUnits.length > 1 ? "s" : ""}` : "none"}</dd></div>
   </dl>
   <aside class="decide" aria-label="Decision" id="decide">${decisionPanel(d, canRelease, alsoUnits, alsoCases)}</aside>
   ${open ? `<button type="button" class="decidebar" id="decidebar">Decide this hold <span>${fmt(d.units.length)} units on hold</span></button>` : ""}
   <section class="panel chartp" aria-labelledby="ch-t"><h2 id="ch-t">Fridge temperature · 24 h either side</h2>
    <div id="chart-mount">${chart(d.readings, c.start, c.end, c.kind)}</div>
    <p class="note">Green band 2 to 6°C. Shaded area is the event window. Gaps in the line are hours with no reading. Focus the chart and use ← / → to read each hour.</p>
    <details class="rtable"><summary>Readings as a table (${d.readings.length})</summary>${readingsTable(d.readings, c)}</details>
   </section>
   <section class="panel unitsp" aria-labelledby="u-t">${unitsPanel(d, canRelease)}</section>
   <details class="panel more"><summary>History · ${d.audit.length} audit entr${d.audit.length === 1 ? "y" : "ies"}, append-only, hash-chained</summary>
    <ol class="audit">${d.audit.map(a => `<li><span class="mono">${esc(ts(a.ts))}</span> <b>${esc(a.action)}</b> · ${esc(a.actor)} (${esc(a.role)})<br>${esc(a.detail)}<br><span class="h">hash ${esc(a.hash.slice(0, 16))}… ← ${esc((a.prev_hash || "").slice(0, 16))}…</span></li>`).join("")}</ol></details>
   <details class="panel more"><summary>SMS fallback · simulated, nothing is sent</summary>
    ${d.sms.map(s => `<div class="sms">${esc(s.body)}</div><p class="note">${s.body.length} of 160 characters · for sites with no data connection</p>`).join("") || `<p class="note">No alert for this case.</p>`}</details>
  </div>`;
  wireCase(d);
}

// Who can do what: shown beside every decision so the rule is visible, not discovered by a refusal.
const ROLES = {
  duty_officer: {name: "Duty officer", can: ["Accept a hold: every unit stays quarantined"], cannot: ["Release units back to stock"]},
  qualified_releaser: {name: "Qualified releaser (supervisor)", can: ["Accept a hold", "Release ticked units, with a second qualified releaser's PIN"], cannot: ["Sign as your own second signer"]},
};
function rolesCard() {
  const r = me ? ROLES[role()] : null;
  const li = (a, cls) => a.map(x => `<li class="${cls}">${esc(x)}</li>`).join("");
  return `<details class="roles" open><summary>${r ? `Your role: <b>${esc(r.name)}</b>` : "Who can do what"}</summary>
   ${r ? `<ul>${li(r.can, "can")}${li(r.cannot, "cannot")}</ul>` : `<ul><li class="can"><b>Duty officer</b>: accept a hold; units stay quarantined</li><li class="can"><b>Qualified releaser</b>: also release units, with a second qualified releaser</li></ul>`}
   <p class="why2">Why two people for a release: it puts blood back into stock after a temperature problem. Keeping a hold is always safe, so one person can do it.</p></details>`;
}
function decisionPanel(d, canRelease, alsoUnits, alsoCases) {
  const c = d.case, n = d.units.length, dr = draft(c.id);
  if (c.status === "NO_UNITS") return `<h2>Nothing to decide</h2><p>The excursion is in the audit log. No units were in this fridge, so nothing was held.</p>`;
  if (c.status !== "OPEN") {
    const last = d.audit.filter(a => String(a.action).startsWith("DECISION")).slice(-1)[0];
    const held = d.units.filter(u => u.state !== "RELEASED").length;
    return `<h2>Decided: ${esc(c.status)}</h2>${last ? `<p><b>${esc(last.actor)}</b> (${esc(last.role)}) · ${esc(ts(last.ts))}</p><p class="quote">${esc(last.detail)}</p>` : ""}
     <p>${fmt(n - held)} released · ${fmt(held)} ${held === 1 ? "stays" : "stay"} quarantined.</p><p class="note">Read-only. A decided case cannot be changed here.</p>`;
  }
  if (!me) return `<h2>Decide this hold</h2><p>Units stay on hold until a person decides.</p><button class="btn primary wide" type="button" data-act="signin">Sign in to decide</button>${rolesCard()}${queueNote(c.id)}`;
  const t = dr.ticks.size;
  if (dr.confirm) {  // friction: a release is summarised and confirmed before it is sent
    const rel = dr.frozen || [];
    return `<h2>Confirm release</h2>
     <p class="confirm"><b>${dr.confirm === "REJECT" ? "Release all" : "Release"} ${fmt(rel.length)} unit${rel.length === 1 ? "" : "s"}</b>; ${fmt(n - rel.length)} ${n - rel.length === 1 ? "stays" : "stay"} quarantined.</p>
     <p class="mono small">${rel.slice(0, 6).map(esc).join(", ")}${rel.length > 6 ? `, +${rel.length - 6} more` : ""}</p>
     <p>Second signer: <b>${esc(dr.second)}</b><br>Reason: ${esc(dr.reason)}</p>
     ${alsoUnits.some(u => rel.includes(u)) ? `<p class="xwarn">${alsoUnits.filter(u => rel.includes(u)).length} of these units are still ON_HOLD in another open case. Releasing here does not lift that hold.</p>` : ""}
     <div class="slide" id="slide">
      <label for="slider" class="slab">Slide to release ${fmt(rel.length)} unit${rel.length === 1 ? "" : "s"}</label>
      <input id="slider" type="range" min="0" max="100" step="1" value="0" aria-describedby="slidehint" aria-valuetext="Not released">
      <span class="sfill" aria-hidden="true"></span>
     </div>
     <p id="slidehint" class="hint">Slide right to release. Let go early and it springs back with nothing sent. Keyboard: End, then Enter.</p>
     <div class="row"><button class="btn ghost" type="button" data-act="unconfirm">Back</button></div>
     <p id="dmsg" class="err" role="alert"></p>${queueNote(c.id)}`;
  }
  return `<h2>Decide this hold</h2>
   <label class="lbl" for="reason">Reason <span>required</span></label>
   <textarea id="reason" rows="3" placeholder="What you checked, e.g. manual probe 4.1°C at 12:40; door found ajar">${esc(dr.reason)}</textarea>
   <button class="btn primary wide" type="button" data-act="ACCEPT">Accept hold · keep all ${fmt(n)} quarantined</button>
   ${canRelease ? `<details class="release"${t || dr.second ? " open" : ""}><summary>Release units…</summary>
     <p class="note">Tick units in the table. Releasing needs your PIN session and a second qualified signer.</p>
     ${alsoUnits.length ? `<p class="xwarn"><b>${alsoUnits.length} of ${fmt(n)}</b> units here are also ON_HOLD in ${alsoCases.length} other open case${alsoCases.length > 1 ? "s" : ""}. Releasing them here does not lift those holds.</p>` : ""}
     <p class="selcount" id="relcount" aria-live="polite">${t} of ${fmt(n)} ticked</p>
     <div class="row"><select id="second" aria-label="Second signer"><option value="">Second signer</option>${["demo.manager", "demo.manager2"].filter(u => u !== me.user).map(u => `<option ${dr.second === u ? "selected" : ""}>${u}</option>`).join("")}</select>
     <input id="spin" type="password" inputmode="numeric" placeholder="Their PIN" aria-label="Second signer PIN" autocomplete="off"></div>
     <div class="row"><button class="btn" type="button" data-act="CHANGE" ${t ? "" : "disabled"}>Release ${t} ticked…</button><button class="btn" type="button" data-act="REJECT">Release all ${fmt(n)}…</button></div>
    </details>` : ""}${rolesCard()}
   <p id="dmsg" class="err" role="alert"></p>${queueNote(c.id)}`;
}
function queueNote(id) {
  const q = Q().filter(d => d.case_id === id), pending = q.filter(d => !d._error).length, failed = q.filter(d => d._error);
  return `<div id="qnote">${pending ? `<p class="warnchip">A decision for this case is waiting to sync. Units stay on hold until it does.</p>` : ""}${failed.map(d => `<p class="failchip">A queued ${esc(d.decision)} was refused on sync: ${esc(d._error)}.</p>`).join("")}</div>`;
}
function paintQueueNote() { const n = $("#qnote"); if (n && state.data) n.outerHTML = queueNote(state.data.case.id); }

// Phone unit cards (90e8b1e): one unit at a time, swipe or Previous/Next; the table stays below.
function shownUnits(d) {
  const q = (draft(d.case.id).ufilter || "").trim().toLowerCase();
  if (!q) return d.units;
  return d.units.filter(u => (u.unit_id + " " + (u.blood_group || "") + " " + (u.component || "")).toLowerCase().includes(q));
}
function unitCards(d, canRelease) {
  if (layout() !== "page") return "";
  const units = shownUnits(d), n = units.length, dr = draft(d.case.id), also = d.also_held || {};
  if (!n) return `<div class="ucards"><p class="note">No units match.</p></div>`;
  const i = Math.max(0, Math.min(n - 1, dr.uidx || 0));
  dr.uidx = i;
  const u = units[i];
  return `<div class="ucards"><p class="cap">Unit ${i + 1} of ${fmt(n)} · swipe</p>
    <article class="ucard" id="ucard" tabindex="0" aria-label="Unit ${esc(u.unit_id)}">
     <p class="uid">${esc(u.unit_id)}</p>
     <p class="umeta">${esc(u.component)} · ${esc(u.blood_group)} · exp ${esc(u.expiry || u.expiry_date || "unknown")}</p>
     <p><span class="st ${esc(u.state)}">${esc(u.state)}</span></p>
     ${also[u.unit_id] ? `<p class="xwarn">Also on hold in another open case. Releasing here does not lift that hold.</p>` : ""}
     ${canRelease ? `<label class="tickbig"><input type="checkbox" class="rel" value="${esc(u.unit_id)}" aria-label="Release ${esc(u.unit_id)}" ${dr.ticks.has(u.unit_id) ? "checked" : ""} ${dr.confirm ? "disabled" : ""}> Release this unit</label>` : `<p class="note">Stays on hold until a person decides.</p>`}
    </article>
    <div class="ucar-nav"><button type="button" class="btn" data-act="uprev" ${i === 0 ? "disabled" : ""}>Previous</button><span class="mono">${i + 1} / ${fmt(n)}</span><button type="button" class="btn" data-act="unext" ${i === n - 1 ? "disabled" : ""}>Next</button></div></div>`;
}
function unitsPanel(d, canRelease) {
  const n = d.units.length, also = d.also_held || {}, dr = draft(d.case.id);
  return `<h2 id="u-t">Units in this fridge that day <span>${fmt(n)}</span></h2>
   ${unitCards(d, canRelease)}
   ${n > 12 ? `<div class="utools"><input id="ufilter" type="search" placeholder="Filter units: id, group, component" aria-label="Filter units" value="${esc(dr.ufilter)}">${canRelease ? `<button type="button" class="btn sm ghost" data-act="tickvis">Tick shown</button><button type="button" class="btn sm ghost" data-act="untick">Clear ticks</button>` : ""}</div>` : ""}
   <div class="twrap"><table><thead><tr>${canRelease ? `<th scope="col"><span class="sr">Release</span></th>` : ""}<th scope="col">Unit</th><th scope="col">Comp.</th><th scope="col">Group</th><th scope="col">Expiry</th><th scope="col">State</th></tr></thead>
   <tbody id="ubody">${d.units.map(u => `<tr data-u="${esc(u.unit_id)}" data-s="${esc((u.unit_id + " " + u.blood_group + " " + u.component).toLowerCase())}">${canRelease ? `<td class="c-sel"><input type="checkbox" class="rel" value="${esc(u.unit_id)}" aria-label="Release ${esc(u.unit_id)}" ${dr.ticks.has(u.unit_id) ? "checked" : ""}></td>` : ""}<td class="mono c-unit">${esc(u.unit_id)}${also[u.unit_id] ? `<br>${also[u.unit_id].map(x => `<a class="also" href="#/case/${encodeURIComponent(x.case_id)}">also held · ${esc(x.case_id.split("-").slice(-2).join("-"))}</a>`).join(" ")}` : ""}</td><td class="c-comp">${esc(u.component)}</td><td class="c-grp">${esc(u.blood_group)}</td><td class="mono nw c-exp">${esc(u.expiry || u.expiry_date || "")}</td><td class="c-st"><span class="st ${esc(u.state)}">${esc(u.state)}</span></td></tr>`).join("")}</tbody></table></div>`;
}

function wireCase(d) {
  const root = $("#case"), id = d.case.id, dr = draft(id);
  const b = $("#back"); if (b) b.onclick = back;
  const reason = $("#reason"); if (reason) reason.oninput = () => { dr.reason = reason.value; };
  const second = $("#second"); if (second) second.onchange = () => { dr.second = second.value; };
  const uf = $("#ufilter");
  const applyUF = () => { const q = dr.ufilter.trim().toLowerCase(); root.querySelectorAll("#ubody tr").forEach(r => r.hidden = !!q && !r.dataset.s.includes(q)); };
  if (uf) { uf.oninput = () => { dr.ufilter = uf.value; applyUF(); }; if (dr.ufilter) applyUF(); }
  root.onchange = ev => {
    if (!ev.target.classList.contains("rel")) return;
    if (dr.confirm) { ev.target.checked = dr.ticks.has(ev.target.value); return; }  // belt and braces: no change while confirming
    ev.target.checked ? dr.ticks.add(ev.target.value) : dr.ticks.delete(ev.target.value); paintTicks(d);
  };
  root.onclick = ev => {
    const a = ev.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "signin") return openSignin();
    if ((act === "tickvis" || act === "untick") && dr.confirm) return;
    if (act === "tickvis") { root.querySelectorAll("#ubody tr:not([hidden]) .rel").forEach(x => { x.checked = true; dr.ticks.add(x.value); }); return paintTicks(d); }
    if (act === "untick") { root.querySelectorAll(".rel").forEach(x => x.checked = false); dr.ticks.clear(); return paintTicks(d); }
    if (act === "uprev" || act === "unext") {
      const units = shownUnits(d);
      dr.uidx = Math.max(0, Math.min(Math.max(0, units.length - 1), (dr.uidx || 0) + (act === "unext" ? 1 : -1)));
      const box = root.querySelector(".ucards");
      if (box) box.outerHTML = unitCards(d, d.case.status === "OPEN" && role() === "qualified_releaser");
      bindCard(d); return;
    }
    if (act === "unconfirm") { dr.confirm = null; dr.frozen = null; lockTicks(false); return repaintDecision(d); }
    if (act === "ACCEPT") return decide(d, "ACCEPT");
    if (act === "CHANGE" || act === "REJECT") {
      if (!dr.reason || dr.reason.trim().length < 5) return msg("Write a reason first.");
      if (!dr.second) return msg("Pick the second signer.");
      if (!($("#spin") || {}).value) return msg("The second signer enters their PIN.");
      dr.pin = $("#spin").value; dr.confirm = act;
      dr.frozen = act === "REJECT" ? d.units.map(u => u.unit_id) : [...dr.ticks];  // exactly what the sentence will show
      lockTicks(true); return repaintDecision(d);
    }
  };
  wireChart(d);
  if (dr.confirm) lockTicks(true);
  // Phones (behaviour after Vaul-style bottom sheets, kept simple): a thumb-reach bar that brings the decision into view.
  const bar = $("#decidebar");
  if (bar && layout() === "page" && bar.parentElement !== $("#case")) $("#case").appendChild(bar);  // phone: pinned at the sheet foot
  if (bar) bar.onclick = () => { const p = $("#decide"); p.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"}); const f = p.querySelector("textarea, button"); if (f) f.focus({preventScroll: true}); };
  $("#case").dataset.confirming = dr.confirm ? "1" : "";
  bindGrabber(); bindCard(d);
}
// Phone sheet grabber: drag down past 110 px, or tap, to close. Closing never decides anything.
function bindGrabber() {
  const g = $("#grabber"), root = $("#case");
  if (!g || g.dataset.bound) return;
  g.dataset.bound = "1";
  let y0 = null, pulled = 0, dragged = false;
  g.addEventListener("pointerdown", e => { y0 = e.clientY; pulled = 0; dragged = false; try { g.setPointerCapture(e.pointerId); } catch (err) {} });
  g.addEventListener("pointermove", e => { if (y0 == null) return; pulled = Math.max(0, e.clientY - y0); if (pulled > 8) dragged = true; root.style.setProperty("--sheet-pull", pulled + "px"); });
  g.addEventListener("pointerup", () => { const close = pulled > 110 || !dragged; y0 = null; pulled = 0; dragged = false; root.style.removeProperty("--sheet-pull"); if (close) back(); });
}
function bindCard(d) {
  const card = $("#ucard"), root = $("#case");
  if (!card || card.dataset.bound) return;
  card.dataset.bound = "1";
  let x0 = null;
  const go = dir => { const b = root.querySelector(`[data-act="${dir}"]`); if (b && !b.disabled) b.click(); };
  card.addEventListener("pointerdown", e => { x0 = e.clientX; });
  card.addEventListener("pointerup", e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) < 48) return; go(dx < 0 ? "unext" : "uprev"); });
  card.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") { e.preventDefault(); go("unext"); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go("uprev"); }
  });
}
// While a release confirmation is on screen the tick boxes are locked, so the list cannot drift from the sentence.
function lockTicks(on) { document.querySelectorAll("#case .rel, #case [data-act=tickvis], #case [data-act=untick]").forEach(x => { x.disabled = on; }); }
function paintTicks(d) {
  const dr = draft(d.case.id), n = d.units.length, rc = $("#relcount"); if (rc) rc.textContent = `${dr.ticks.size} of ${fmt(n)} ticked`;
  const b = $('[data-act="CHANGE"]'); if (b) { b.disabled = !dr.ticks.size; b.textContent = `Release ${dr.ticks.size} ticked…`; }
  const det = $("details.release"); if (det && dr.ticks.size) det.open = true;
}
function repaintDecision(d) {
  const also = d.also_held || {}, alsoUnits = Object.keys(also), alsoCases = [...new Set(alsoUnits.flatMap(u => also[u].map(x => x.case_id)))];
  $("#decide").innerHTML = decisionPanel(d, d.case.status === "OPEN" && role() === "qualified_releaser", alsoUnits, alsoCases);
  const reason = $("#reason"), dr = draft(d.case.id); if (reason) reason.oninput = () => { dr.reason = reason.value; };
  const second = $("#second"); if (second) second.onchange = () => { dr.second = second.value; };
  const root = $("#case"); if (root) root.dataset.confirming = draft(d.case.id).confirm ? "1" : "";
  wireSlide(d);
  const sm = $("#steps-mount"); if (sm) sm.innerHTML = steps(d);
  const f = $("#slider") || $("#decide button"); if (f) f.focus();
}
// Release friction (behaviour after an iPhone "slide to power off" recreation): the release is sent only when the
// slider is let go past 85 % (or flicked towards it). Otherwise it springs back; nothing is sent. Keyboard: End, then Enter.
// The slider only triggers decide(); the unit list sent is still the one frozen when this confirmation was drawn.
function wireSlide(d) {
  const r = $("#slider"), box = $("#slide"); if (!r) return;
  const dr = draft(d.case.id), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let sent = false, anim = 0, lastV = 0, lastT = 0, speed = 0;  // speed in percent per second
  const paint = () => { box.style.setProperty("--p", r.value + "%"); r.setAttribute("aria-valuetext", +r.value >= 100 ? "At the end. Press Enter to release" : r.value + " percent, not released"); };
  const springBack = () => {
    cancelAnimationFrame(anim);
    if (still) { r.value = 0; return paint(); }
    let v = +r.value, vel = 0;  // critically damped-ish spring towards 0
    const step = () => { vel = vel * 0.72 - v * 0.09; v = Math.max(0, v + vel); r.value = v; paint(); if (v > 0.5) anim = requestAnimationFrame(step); else { r.value = 0; paint(); } };
    anim = requestAnimationFrame(step);
  };
  const fire = () => { if (sent || !dr.frozen) return; sent = true; r.disabled = true; box.classList.add("done"); decide(d, dr.confirm); };
  r.addEventListener("input", () => {
    cancelAnimationFrame(anim); const now = performance.now(), v = +r.value;
    if (lastT && now > lastT) speed = 0.6 * speed + 0.4 * ((v - lastV) / ((now - lastT) / 1000));
    lastV = v; lastT = now; paint();
  });
  r.addEventListener("pointerdown", () => { r.dataset.drag = "1"; speed = 0; lastT = 0; });
  // Let go: commit if the projected end point (distance + 0.3 s of current speed, after "Designing Fluid Interfaces",
  // WWDC 2018) reaches 85 %; a slow drag must reach 85 % itself. Otherwise spring back and send nothing.
  const letGo = () => {
    if (!r.dataset.drag) return; delete r.dataset.drag;
    if (performance.now() - lastT > 100) speed = 0;  // finger stopped before letting go: no flick
    const projected = +r.value + 0.3 * Math.max(0, speed);
    if (projected >= 85) { r.value = 100; paint(); fire(); } else springBack();
  };
  r.addEventListener("pointerup", letGo); r.addEventListener("pointercancel", letGo); r.addEventListener("touchend", letGo);
  r.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); if (+r.value >= 100) fire(); else $("#slidehint").textContent = "Move to the end first (End key), then press Enter."; }
    if (ev.key === "Escape") { ev.stopPropagation(); r.value = 0; paint(); }
  });
  r.addEventListener("blur", () => { if (!sent && +r.value < 100) springBack(); });
  paint();
}
function msg(m) { const e = $("#dmsg"); if (e) e.textContent = m; else toast(m, true); }

async function decide(d, kind) {
  if (!me) return openSignin();
  const c = d.case, dr = draft(c.id);
  const body = {case_id: c.id, decision: kind, reason: dr.reason, second_signer: dr.second || null, second_pin: dr.pin || null,
    unit_ids: kind === "ACCEPT" ? [] : [...(dr.frozen || [])],
    client_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())};
  // Only releases use a second signature. An ACCEPT never sends one or any units, so a queued offline ACCEPT
  // can never be refused later for a missing PIN, and it can never release anything.
  if (kind === "ACCEPT") { body.second_signer = null; body.second_pin = null; body.unit_ids = []; }
  else {  // a release sends only the unit list frozen when the confirmation was shown, and says so to the server
    if (!dr.confirm || dr.confirm !== kind || !dr.frozen || !dr.frozen.length) return msg("Confirm the release first.");
    body.confirmed_unit_ids = [...dr.frozen];
  }
  if (!body.reason || body.reason.trim().length < 5) return msg("Write a reason first.");
  const r = await api("/api/decide", {method: "POST", headers: {"Content-Type": "application/json", ...auth()}, body: JSON.stringify(body)});
  dr.pin = null;
  if (r.cached && kind !== "ACCEPT") { dr.confirm = null; dr.frozen = null; lockTicks(false); repaintDecision(d); return msg("Offline. Releasing units needs the server to check both signatures, so it can't be queued. Units stay on hold."); }
  if (r.cached) { setQ([...Q(), {...body, second_pin: null, _auth: auth(), _user: me.user}]); delete state.drafts[c.id]; renderCase(d); toast("Offline. Decision saved on this device; it syncs when the connection returns. Units stay on hold until then."); return; }
  if (!r.ok) { dr.confirm = null; dr.frozen = null; lockTicks(false); repaintDecision(d); return msg(r.data.error); }
  delete state.drafts[c.id];
  // Optimistic for the queue only: the server already recorded the decision; the row leaves Open now, the full refresh follows.
  if (state.status === "OPEN") { state.rows = state.rows.filter(x => x.id !== c.id); paintList(); }
  toast(kind === "ACCEPT" ? `Accepted. All ${fmt(d.units.length)} units stay quarantined.` : `Released ${fmt(body.unit_ids.length)} unit${body.unit_ids.length === 1 ? "" : "s"}. Recorded with both signatures.`);
  await refresh();
}
async function refresh() { await summary(); await loadList(); if (state.sel && state.view === "case") await openCase(state.sel); }

// ── evaluation view: dataset-year metrics, labelled as such ──────────────────────────────────────
const pct = x => (x * 100).toFixed(1) + "%";
function paintEvaluation() {
  const s = state.summary, el = $("#evaluation"); if (!s) { el.innerHTML = `<p class="empty">Loading…</p>`; return; }
  const m = s.metrics, b = m.baseline, h = m.holdline;
  const row = (k, bv, hv, note) => `<tr><th scope="row">${k}</th><td class="mono">${bv}</td><td class="mono"><b>${hv}</b></td><td>${note}</td></tr>`;
  el.innerHTML = `<div class="evalwrap"><h1>Evaluation on the synthetic dataset year</h1>
   <p class="why">Baseline holds every unit after any raw reading above 6°C. HOLDLINE applies its rules (2 hot hours, 3-hour logger gap, cool box above 10°C). Thresholds are chosen configuration, not clinically validated. These are dataset-year figures for ${fmt(m.units)} synthetic units; they are a different population from the ${fmt(s.units_on_hold)} units in today's open holds.</p>
   <table class="evaltable"><thead><tr><th></th><th scope="col">Baseline</th><th scope="col">HOLDLINE</th><th scope="col">Read as</th></tr></thead><tbody>
    ${row("Hold precision", pct(b.precision), pct(h.precision), "Share of held units that were truly exposed")}
    ${row("Exposed units caught", pct(b.recall), pct(h.recall), `HOLDLINE misses ${fmt(h.missed - b.missed)} more exposed units (${fmt(h.missed)} vs ${fmt(b.missed)})`)}
    ${row("False holds", fmt(b.false_holds), fmt(h.false_holds), `${fmt(b.false_holds - h.false_holds)} fewer good units held`)}
    ${row("Units held", fmt(b.held), fmt(h.held), "")}
    ${row("Held before transfusion day", fmt(b.held_before_transfusion_day), fmt(h.held_before_transfusion_day), `of ${fmt(h.exposed_transfused_total)} exposed units that were transfused; ${fmt(b.held_before_transfusion_day - h.held_before_transfusion_day)} fewer than baseline`)}
   </tbody></table>
   <p class="note">No claim of prevented harm. Synthetic data only. Audit chain ${s.audit_ok ? "intact" : "broken"}.</p></div>`;
}

// ── keyboard ─────────────────────────────────────────────────────────────────────────────────────
document.addEventListener("keydown", ev => {
  const t = ev.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") { ev.preventDefault(); cmdOpen(); return; }
  if (document.querySelector("dialog[open]")) return;
  if (ev.key === "Escape") {
    if (t.id === "q" && t.value) { t.value = ""; state.q = ""; paintList(); return; }
    if (state.view === "case" && layout() !== "split") { ev.preventDefault(); back(); return; }
    if (typing) t.blur(); return;
  }
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (t.id === "chartsvg" && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) return;
  if (ev.key === "/") { ev.preventDefault(); if (state.view === "case" && layout() !== "split") back(); $("#q").focus(); return; }
  if (ev.key === "?") { $("#help").showModal(); return; }
  const v = state.vis || []; if (!v.length || state.view === "evaluation") return;
  const caseOverlay = state.view === "case" && layout() !== "split";
  if (["j", "ArrowDown", "k", "ArrowUp"].includes(ev.key) && !caseOverlay) {
    if (t.closest && t.closest("#case") && (ev.key === "ArrowDown" || ev.key === "ArrowUp")) return;  // let the page scroll
    ev.preventDefault();
    const cur = state.hi >= 0 ? state.hi : Math.max(-1, v.findIndex(c => c.id === state.sel));
    state.hi = Math.max(0, Math.min(v.length - 1, cur + (ev.key === "j" || ev.key === "ArrowDown" ? 1 : -1)));
    markRows();
    if (layout() === "split") { clearTimeout(state.kT); state.kT = setTimeout(() => go(v[state.hi].id), 140); }
    return;
  }
  if (ev.key === "Enter" && state.hi >= 0 && !caseOverlay && (t === document.body || t.id === "list")) { ev.preventDefault(); state.focusCase = true; go(v[state.hi].id); }
});
$("#help-open").onclick = () => $("#help").showModal();

// Toasts (behaviour after Sonner): stacked at the bottom, newest on top, pause while hovered or focused,
// close button, at most three. Errors are announced assertively, confirmations politely.
function toast(m, bad) {
  const box = $("#toasts"), t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : ""); t.setAttribute("role", bad ? "alert" : "status");
  t.innerHTML = `<span class="tm"></span><button type="button" class="tx" aria-label="Dismiss">×</button>`;
  t.querySelector(".tm").textContent = m;
  let left = bad ? 8000 : 5000, t0 = Date.now(), timer;
  const go = () => { t0 = Date.now(); timer = setTimeout(close, left); }, hold = () => { clearTimeout(timer); left -= Date.now() - t0; };
  function close() { clearTimeout(timer); t.classList.add("out"); setTimeout(() => t.remove(), 160); }
  t.querySelector(".tx").onclick = close;
  t.addEventListener("mouseenter", hold); t.addEventListener("mouseleave", go); t.addEventListener("focusin", hold); t.addEventListener("focusout", go);
  box.prepend(t); while (box.children.length > 3) box.lastChild.remove();
  requestAnimationFrame(() => t.classList.add("in")); go();
}

// Command menu (behaviour after cmdk / Linear / Raycast): Ctrl+K or Cmd+K, type to jump to any hold or run an action.
function fuzzy(q, text) {  // subsequence match; contiguous and word-start hits score higher
  if (!q) return 1; let i = 0, sc = 0, run = 0; text = text.toLowerCase();
  for (let j = 0; j < text.length && i < q.length; j++) if (text[j] === q[i]) { i++; run++; sc += run * 2 + (j === 0 || " -·".includes(text[j - 1]) ? 3 : 0); } else run = 0;
  return i === q.length ? sc : 0;
}
const cmd = {items: [], hi: 0};
// Extras. None of these can decide anything or change a release rule.
// CSV of the open queue as the browser has it (no server call): one row per hold, quoted, UTF-8 with BOM for spreadsheets.
function exportCSV() {
  const rows = (state.rows || []).filter(c => c.status === "OPEN" || state.status === "OPEN");
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["case_id", "facility", "county", "kind", "start_eat", "end_eat", "peak_c", "units_on_hold"];
  const body = rows.map(c => [c.id, c.facility_name || c.facility_id, c.facility_county || "", c.kind === "EXCURSION" ? "measured excursion" : "presumed (logger gap)", ts(c.start), ts(c.end), c.kind === "EXCURSION" ? c.peak : "", c.n].map(q).join(","));
  const blob = new Blob(["\ufeff" + [head.join(","), ...body].join("\r\n")], {type: "text/csv;charset=utf-8"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `holdline-open-queue-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${fmt(rows.length)} open holds as CSV. Synthetic data.`);
}
// Light theme = the base styles with pure white surfaces; dark = theme.css. Choice kept in this browser only.
function toggleTheme() {
  const light = !document.documentElement.classList.contains("light");
  document.documentElement.classList.toggle("light", light); $("#theme-css").disabled = light;
  localStorage.setItem("hl.theme", light ? "light" : "dark");
}
if (localStorage.getItem("hl.theme") === "light") { document.documentElement.classList.add("light"); const t = document.getElementById("theme-css"); if (t) t.disabled = true; }
// Shift handover: decisions recorded since the start of this shift (07:00 or 19:00 local), from the audit log.
// Shown once per sign-in on the landing view. Read-only.
async function handover() {
  if (!me) return;
  const r = await api("/api/audit"); if (!r.ok || r.cached || !Array.isArray(r.data)) return;
  const now = new Date(), start = new Date(now); start.setHours(now.getHours() >= 19 ? 19 : now.getHours() >= 7 ? 7 : -5, 0, 0, 0);
  const dec = r.data.filter(a => /^DECISION_/.test(a.action) && new Date(a.ts) >= start);
  const kinds = {DECISION_ACCEPT: "kept on hold", DECISION_CHANGE: "partly released", DECISION_REJECT: "released"};
  const hh = String(start.getHours()).padStart(2, "0") + ":00";
  const open = state.rows ? state.rows.length : null;
  const lines = dec.slice(0, 4).map(a => `<li><b>${esc(a.actor)}</b> ${kinds[a.action] || esc(a.action)} · <a href="#/case/${encodeURIComponent(a.case_id)}">${esc(a.case_id)}</a> · ${new Date(a.ts).toTimeString().slice(0, 5)}</li>`).join("");
  state.handover = `<section class="handover" aria-label="Shift handover"><h2>Since ${hh}: ${dec.length ? `${fmt(dec.length)} decision${dec.length === 1 ? "" : "s"} recorded` : "no decisions recorded yet"}${open != null && state.status === "OPEN" ? ` · ${fmt(open)} holds still open` : ""}</h2>${lines ? `<ul>${lines}</ul>` : ""}<p class="hint">From the audit log. New holds are not counted here because the synthetic holds carry dataset dates, not today's.</p></section>`;
  if (state.view === "queue") paintOverview();
}
function cmdActions() {
  const a = [
    {k: "Go to holds", run: () => { location.hash = "#/"; }},
    {k: "Go to evaluation", run: () => { location.hash = "#/evaluation"; }},
    {k: "Show measured excursions only", run: () => setKinds(["EXCURSION"])},
    {k: "Show presumed (logger gap) only", run: () => setKinds(["GAP"])},
    {k: "Show every hold in this tab", run: () => { state.q = ""; $("#q").value = ""; setKinds([]); }},
    me ? {k: "Sign out", run: () => $("#out") && $("#out").click()} : {k: "Sign in", run: openSignin},
    {k: "Keyboard shortcuts", run: () => $("#help").showModal()},
    {k: "Export the open queue as CSV", run: exportCSV},
    ...(state.view === "case" && state.data ? [{k: "Print this case for the audit file", run: () => window.print()}] : []),
    {k: document.documentElement.classList.contains("light") ? "Switch to dark theme" : "Switch to light theme", run: toggleTheme},
  ];
  return a.map(x => ({...x, group: "Actions"}));
}
function cmdPaint() {
  const q = $("#cmdq").value.trim().toLowerCase();
  const cases = (state.rows || []).map(c => ({c, s: fuzzy(q, `${c.facility_name || ""} ${c.facility_county || ""} ${c.id}`)})).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, 8)
    .map(({c}) => ({group: "Holds", k: c.facility_name || c.facility_id, sub: `${fmt(c.n)} units · ${c.kind === "EXCURSION" ? "Measured" : "Presumed"} · ${ts(c.start)}`, run: () => go(c.id)}));
  const acts = cmdActions().filter(a => fuzzy(q, a.k));
  cmd.items = q ? [...cases, ...acts] : [...acts, ...cases]; cmd.hi = Math.min(cmd.hi, Math.max(0, cmd.items.length - 1));
  let g = "";
  $("#cmdlist").innerHTML = cmd.items.length ? cmd.items.map((it, i) => (it.group !== g ? `<li class="cg" role="presentation">${(g = it.group)}</li>` : "") +
    `<li role="option" id="cmd-${i}" data-i="${i}" aria-selected="${i === cmd.hi}">${esc(it.k)}${it.sub ? `<span>${esc(it.sub)}</span>` : ""}</li>`).join("") : `<li class="cg">No match</li>`;
  $("#cmdq").setAttribute("aria-activedescendant", cmd.items.length ? "cmd-" + cmd.hi : "");
  const el = $("#cmd-" + cmd.hi); if (el) el.scrollIntoView({block: "nearest"});
}
function cmdOpen() { const d = $("#cmd"); if (d.open) return; $("#cmdq").value = ""; cmd.hi = 0; cmdPaint(); d.showModal(); $("#cmdq").focus(); }
function cmdRun(i) { const it = cmd.items[i]; if (!it) return; $("#cmd").close(); it.run(); }
function wireCmd() {
  const q = $("#cmdq"), l = $("#cmdlist"), d = $("#cmd");
  q.oninput = () => { cmd.hi = 0; cmdPaint(); };
  q.onkeydown = ev => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); cmd.hi = Math.min(cmd.items.length - 1, cmd.hi + 1); cmdPaint(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); cmd.hi = Math.max(0, cmd.hi - 1); cmdPaint(); }
    else if (ev.key === "Enter") { ev.preventDefault(); cmdRun(cmd.hi); }
  };
  l.onclick = ev => { const o = ev.target.closest("[data-i]"); if (o) cmdRun(+o.dataset.i); };
  d.addEventListener("click", ev => { if (ev.target === d) d.close(); });
  const b = $("#cmd-open"); if (b) b.onclick = cmdOpen;
}

// ── start ────────────────────────────────────────────────────────────────────────────────────────
(async () => {
  const lq = new URLSearchParams(location.search).get("layout"); if (LAYOUTS.includes(lq)) localStorage.setItem("hl.layout", lq);
  document.body.dataset.layout = layout();
  loadFilters(); paintWho(); paintNet(); paintTabs(); wireCmd();
  await summary();
  const m = location.hash.match(/^#\/case\/(.+)$/) || location.hash.match(/^#(HL-[\w-]+)$/);
  if (m) {  // deep link: show the case's own status list
    const r = await api("/api/case/" + encodeURIComponent(decodeURIComponent(m[1])), {headers: auth()});
    if (r.data && r.data.case) { state.status = r.data.case.status; paintTabs(); }
  }
  await loadList(); route(); handover();
})();
setInterval(() => { if (Q().some(d => !d._error)) flush(); }, 10000);
window.HOLDLINE = {open: id => go(id), current: () => state.data && state.data.case.id, state};  // used by the benchmark harness

if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || document.getElementById("upd")) return;
    // A new worker took over. Offer a reload, never force one: queued decisions are in localStorage.
    const b = document.createElement("div");
    b.id = "upd"; b.className = "upd-banner";
    b.innerHTML = '<span>Update ready. Reload to use the new version.</span><button id="upd-go" type="button">Reload</button><button id="upd-x" type="button">Later</button>';
    document.body.appendChild(b);
    document.getElementById("upd-go").onclick = () => location.reload();
    document.getElementById("upd-x").onclick = () => b.remove();
  });
}
