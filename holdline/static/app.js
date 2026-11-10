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
  me = r.data; localStorage.setItem("hl.me", JSON.stringify(me)); $("#lpin").value = ""; $("#signin").close(); paintWho();
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
    `audit chain <span class="${s.audit_ok ? "okw" : "badw"}">${s.audit_ok ? "intact" : "BROKEN at " + esc(s.audit_broken_at)}</span> · synthetic data · prototype, not a medical device`;
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
     <span class="m">${ex ? "Measured" : "Presumed"} · ${esc(ts(c.start))} · ${hours(c.start, c.end)} h${ex && c.peak != null ? ` · peak ${esc(c.peak)}°C` : ""}${c.facility_county ? " · " + esc(c.facility_county) : ""}</span></div>`;
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
  if (layout() !== "split") { const r = $("#list .row.sel") || $("#list .row.hi"); (r || $("#list")).focus && $("#list").focus(); }
}
function setView(v) {
  state.view = v; document.body.dataset.view = v;
  $("#evaluation").hidden = v !== "evaluation";
  document.querySelectorAll(".views a").forEach(a => a.toggleAttribute("aria-current", a.dataset.view === (v === "evaluation" ? "evaluation" : "queue")));
  if (v === "evaluation") paintEvaluation();
}
window.addEventListener("hashchange", route);
narrow.addEventListener("change", route);

// First view: what needs attention, before any case is picked.
function paintOverview() {
  const el = $("#case"), rows = state.status === "OPEN" ? state.rows : [], s = state.summary;
  state.sel = null; state.data = null; caseSeq++; markRows();
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
async function openCase(id) {
  const my = ++caseSeq;
  if (caseCtl) caseCtl.abort();
  caseCtl = typeof AbortController === "function" ? new AbortController() : null;
  state.sel = id; markRows();
  const el = $("#case");
  if (!state.data || state.data.case.id !== id) el.setAttribute("aria-busy", "true");
  const r = await api("/api/case/" + encodeURIComponent(id), {headers: auth(), signal: caseCtl && caseCtl.signal});
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

function renderCase(d) {
  const c = d.case, f = d.facility || {}, open = c.status === "OPEN", [cls, glyph, label] = KIND(c), e = evidence(d);
  const also = d.also_held || {}, alsoUnits = Object.keys(also);
  const alsoCases = [...new Set(alsoUnits.flatMap(u => also[u].map(x => x.case_id)))];
  const canRelease = open && role() === "qualified_releaser";
  const status = open ? `<span class="kick hold">On hold · do not issue</span>` : c.status === "NO_UNITS" ? `<span class="kick info">Logged · no units in this fridge</span>` : `<span class="kick done">${esc(c.status)} · decided</span>`;
  const backBtn = layout() === "split" ? "" : `<button type="button" class="btn sm ghost backbtn" id="back">${icon("back")} Queue</button>`;
  $("#case").innerHTML = `
  <div class="sheet" data-case="${esc(c.id)}">
   <header class="chead">${backBtn}${status}
    <h1>${esc(f.name || c.facility_id)}</h1>
    <p class="why"><span class="g ${cls}">${glyph}</span> <b>${label}.</b> ${esc(c.reason)}.</p>
    <p class="meta"><span>${esc(ts(c.start))} → ${esc(ts(c.end))} EAT</span><span>${esc(f.county || "")}</span><span>${esc(f.connectivity || "")}</span><span>backup power: ${f.has_blood_fridge_backup_power === "True" ? "yes" : "no"}</span><span class="mono">${esc(c.id)}</span></p>
   </header>
   <dl class="facts" aria-label="Evidence summary">
    <div><dt>Units held here</dt><dd>${fmt(d.units.length)}</dd></div>
    <div><dt>Peak</dt><dd>${c.kind === "EXCURSION" && c.peak != null ? esc(c.peak) + "°C" : "unknown"}</dd></div>
    <div><dt>Readings above 6°C</dt><dd>${e.above} <small>of ${e.n}</small></dd></div>
    <div><dt>Hours with no reading</dt><dd class="${e.missing ? "unw" : ""}">${e.missing}</dd></div>
    <div><dt>Also held elsewhere</dt><dd class="${alsoUnits.length ? "exw" : ""}">${alsoUnits.length ? `${alsoUnits.length} unit${alsoUnits.length > 1 ? "s" : ""}` : "none"}</dd></div>
   </dl>
   <aside class="decide" aria-label="Decision" id="decide">${decisionPanel(d, canRelease, alsoUnits, alsoCases)}</aside>
   <section class="panel chartp" aria-labelledby="ch-t"><h2 id="ch-t">Fridge temperature · 24 h either side</h2>
    ${chart(d.readings, c.start, c.end, c.kind)}
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
     <p>${fmt(n - held)} released · ${fmt(held)} stay quarantined.</p><p class="note">Read-only. A decided case cannot be changed here.</p>`;
  }
  if (!me) return `<h2>Decide this hold</h2><p>Units stay on hold until a person decides.</p><button class="btn primary wide" type="button" data-act="signin">Sign in to decide</button>${rolesCard()}${queueNote(c.id)}`;
  const t = dr.ticks.size;
  if (dr.confirm) {  // friction: a release is summarised and confirmed before it is sent
    const rel = dr.frozen || [];
    return `<h2>Confirm release</h2>
     <p class="confirm"><b>${dr.confirm === "REJECT" ? "Release all" : "Release"} ${fmt(rel.length)} unit${rel.length === 1 ? "" : "s"}</b>; ${fmt(n - rel.length)} stay quarantined.</p>
     <p class="mono small">${rel.slice(0, 6).map(esc).join(", ")}${rel.length > 6 ? `, +${rel.length - 6} more` : ""}</p>
     <p>Second signer: <b>${esc(dr.second)}</b><br>Reason: ${esc(dr.reason)}</p>
     ${alsoUnits.some(u => rel.includes(u)) ? `<p class="xwarn">${alsoUnits.filter(u => rel.includes(u)).length} of these units are still ON_HOLD in another open case. Releasing here does not lift that hold.</p>` : ""}
     <div class="row"><button class="btn danger" type="button" data-act="send">Confirm: release ${fmt(rel.length)}</button><button class="btn ghost" type="button" data-act="unconfirm">Back</button></div>
     <p id="dmsg" class="err" role="alert"></p>${queueNote(c.id)}`;
  }
  return `<h2>Decide this hold</h2>
   <label class="lbl" for="reason">Reason <span>required</span></label>
   <textarea id="reason" rows="3" placeholder="e.g. probe check 4.1°C at 12:40, units moved to backup fridge">${esc(dr.reason)}</textarea>
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

function unitsPanel(d, canRelease) {
  const n = d.units.length, also = d.also_held || {}, dr = draft(d.case.id);
  return `<h2 id="u-t">Units in this fridge that day <span>${fmt(n)}</span></h2>
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
    if (act === "unconfirm") { dr.confirm = null; dr.frozen = null; lockTicks(false); return repaintDecision(d); }
    if (act === "send") return decide(d, dr.confirm);
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
  const f = $("#decide button"); if (f) f.focus();
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
  toast(kind === "ACCEPT" ? `Accepted. All ${fmt(d.units.length)} units stay quarantined.` : `${kind === "CHANGE" ? "Changed" : "Rejected"}. Decision recorded.`);
  await refresh();
}
async function refresh() { await summary(); await loadList(); if (state.sel && state.view === "case") await openCase(state.sel); }

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
  let d = "", prev = null, dots = "";
  rs.forEach((r, i) => { const t = tt[i]; if (r[1] < -50 || r[1] > 60) return;
    d += (prev && t - prev > 36e5 * 1.5 ? "M" : (d ? "L" : "M")) + x(t).toFixed(1) + " " + y(r[1]).toFixed(1);
    if (r[1] > 6) dots += `<path d="M${x(t).toFixed(1)} ${(y(r[1]) - 4).toFixed(1)}l4 7h-8z" fill="var(--excursion)"/>`;
    prev = t; });
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
   <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--unverified)" stroke-width="1.2" opacity=".45"/></pattern></defs>
   ${grid}<rect x="${L}" y="${y(6)}" width="${W - L - R}" height="${y(2) - y(6)}" fill="var(--band-safe)"/>
   <line x1="${L}" x2="${W - R}" y1="${y(6)}" y2="${y(6)}" stroke="var(--excursion)" stroke-width="1.5" stroke-dasharray="6 4"/>
   <text x="${W - R}" y="${y(6) - 5}" text-anchor="end" class="ax lim">6°C limit</text>
   <rect x="${Math.min(sx, ex)}" y="${T}" width="${Math.max(2, Math.abs(ex - sx))}" height="${H - T - B}" fill="var(--excursion-bg)" opacity=".6"/>
   ${gaps}<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="2"/>${dots}
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

let toastT;
function toast(m, bad) { const e = $("#toast"); e.textContent = m; e.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastT); toastT = setTimeout(() => e.className = "toast", 5000); }

// ── start ────────────────────────────────────────────────────────────────────────────────────────
(async () => {
  const lq = new URLSearchParams(location.search).get("layout"); if (LAYOUTS.includes(lq)) localStorage.setItem("hl.layout", lq);
  document.body.dataset.layout = layout();
  loadFilters(); paintWho(); paintNet(); paintTabs();
  await summary();
  const m = location.hash.match(/^#\/case\/(.+)$/) || location.hash.match(/^#(HL-[\w-]+)$/);
  if (m) {  // deep link: show the case's own status list
    const r = await api("/api/case/" + encodeURIComponent(decodeURIComponent(m[1])), {headers: auth()});
    if (r.data && r.data.case) { state.status = r.data.case.status; paintTabs(); }
  }
  await loadList(); route();
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
