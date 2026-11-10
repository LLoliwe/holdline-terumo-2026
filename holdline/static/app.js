// HOLDLINE client. Offline-tolerant: last data cached in localStorage, decisions queued while offline
// and replayed with a client_id so the server never applies one twice.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let state = {status: "OPEN", sel: null};
const Q = () => JSON.parse(localStorage.getItem("hl.queue") || "[]");
const setQ = q => { localStorage.setItem("hl.queue", JSON.stringify(q)); paintNet(); if (state.sel) detail(); };

async function api(path, opts) {
  try {
    const r = await fetch(path, opts);
    const j = await r.json();
    if (r.status === 401 && j && j.error === "sign in first" && me && opts && opts.headers && opts.headers["X-Holdline-Token"] === me.token) {
      me = null; localStorage.removeItem("hl.me"); paintWho();  // our own session expired: show the log-in, keep the queue
    }
    if (r.ok && (!opts || opts.method !== "POST")) localStorage.setItem("hl.c." + path, JSON.stringify(j));
    online(true);
    return {ok: r.ok, data: j};
  } catch (e) {
    online(false);
    const c = localStorage.getItem("hl.c." + path);
    return {ok: !!c, data: c ? JSON.parse(c) : null, cached: true};
  }
}
// Cache the newest open cases so a duty officer who loses signal can still open them.
let prefetched = new Set();
async function prefetch(ids) {
  for (const id of ids) {
    if (prefetched.has(id) || !isOnline) continue;
    prefetched.add(id);
    const r = await api("/api/case/" + encodeURIComponent(id), me ? {headers: auth()} : undefined);
    if (r.cached) return;
  }
}
let isOnline = true;
function online(v) { if (v !== isOnline) { isOnline = v; paintNet(); if (v) flush(); } }
function paintNet() {
  const n = $("#net"); n.textContent = isOnline ? "Online" : "Offline · cached view"; n.className = "chip " + (isOnline ? "ok" : "un");
  const q = Q(), pending = q.filter(d => !d._error).length, failed = q.filter(d => d._error).length, el = $("#queue");
  el.style.display = q.length ? "" : "none";
  el.textContent = (pending ? pending + " decision" + (pending > 1 ? "s" : "") + " waiting to sync" : "") +
    (pending && failed ? " · " : "") + (failed ? failed + " refused" : "");
}
// Replay queued decisions under the identity that made them; never re-attribute.
// A decision the server refuses is KEPT, marked with the server's reason, and stays visible
// until the operator signs in as the decider and retries it or clears it. Nothing is silently dropped.
let flushing = false;
async function flush() {
  if (flushing) return;  // single-flight: overlapping reconnects/intervals must not double-post a queued decision
  flushing = true;
  try { await _flush(); } finally { flushing = false; }
}
async function _flush() {
  let q = Q(), left = [];
  for (const d of q) {
    if (d._error) { left.push(d); continue; }  // already refused once: wait for the operator, don't loop
    const hdr = me && me.user === d._user ? auth() : (d._auth || {});
    const r = await api("/api/decide", {method: "POST", headers: {"Content-Type": "application/json", ...hdr}, body: JSON.stringify(d)});
    if (r.cached) { left.push(d); }
    else if (!r.ok && r.data && r.data.error === "sign in first") { left.push(d); alertBox(`Sign in again as ${d._user} to sync a queued decision.`); }
    else if (!r.ok) { left.push({...d, _error: (r.data && r.data.error) || "refused"}); }
  }
  const changed = q.length !== left.length || q.some((d, i) => d._error !== left[i]._error);
  setQ(left); if (changed) load();
}
function alertBox(m) { const e = $("#msg"); if (e) { e.textContent = m; e.className = "err"; } else alert(m); }
let me = JSON.parse(localStorage.getItem("hl.me") || "null");
const user = () => me ? {actor: me.user, role: me.role} : {actor: null, role: null};
const auth = () => me ? {"X-Holdline-Token": me.token} : {};
function paintWho() {
  $("#who").innerHTML = me ? `Signed in: <b>${esc(me.user)}</b> · <a href="#" id="out">sign out</a>` : "";
  $("#login").style.display = me ? "none" : "";
}
$("#login").onsubmit = async ev => {
  ev.preventDefault();
  const r = await api("/api/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({user: $("#luser").value, pin: $("#lpin").value})});
  if (r.cached || !r.ok) return alert(r.cached ? "Offline: sign in needs the server once." : r.data.error);
  me = r.data; localStorage.setItem("hl.me", JSON.stringify(me)); $("#lpin").value = ""; paintWho(); if (state.sel) detail();
};
document.addEventListener("click", ev => {
  if (ev.target.id === "out") { ev.preventDefault(); if (me) fetch("/api/logout", {method: "POST", headers: {"Content-Type": "application/json", ...auth()}, body: "{}"}).catch(() => {}); me = null; localStorage.removeItem("hl.me"); paintWho(); if (state.sel) detail(); }
});

const pct = x => (x * 100).toFixed(1) + "%";
async function summary() {
  const r = await api("/api/summary"); if (!r.data) return;
  state.summary = r.data;
  const m = r.data.metrics, b = m.baseline, h = m.holdline;
  $("#metrics").innerHTML = `
   <div><span class="k">Units in open holds</span><b>${r.data.units_on_hold.toLocaleString()}</b><span class="vs">distinct units · ${(r.data.cases.OPEN||0).toLocaleString()} open cases · synthetic</span></div>
   <div><span class="k">Hold precision</span><b>${pct(h.precision)}</b><span class="vs">dataset year · baseline <s>${pct(b.precision)}</s></span></div>
   <div><span class="k">Exposed units caught</span><b>${pct(h.recall)}</b><span class="vs">dataset year · baseline ${pct(b.recall)}</span></div>
   <div><span class="k">False holds</span><b class="red">${h.false_holds.toLocaleString()}</b><span class="vs">dataset year · baseline <s>${b.false_holds.toLocaleString()}</s></span></div>
   <div><span class="k">Held before transfusion day</span><b>${h.held_before_transfusion_day.toLocaleString()}</b><span class="vs">dataset year · baseline ${b.held_before_transfusion_day.toLocaleString()}</span></div>
   <div><span class="k">Audit hash chain</span><b class="${r.data.audit_ok ? "ok-word" : "bad-word"}">${r.data.audit_ok ? "Intact" : "BROKEN"}</b><span class="vs">${r.data.audit_ok ? "append-only, verifiable" : "at entry " + esc(r.data.audit_broken_at)} · dataset since ${esc(r.data.dataset_since||"")}</span></div>`;
}
const KIND = c => c.kind === "EXCURSION" ? ["ex", "▲", "Measured excursion"] : ["un", "◌", "Presumed: logger gap"];
async function list() {
  const r = await api("/api/cases?status=" + state.status); const el = $("#list");
  if (!r.data) { el.innerHTML = `<p class="empty">No cached data yet. Connect once to load.</p>`; return; }
  const total = (state.summary && state.summary.cases && state.summary.cases[state.status]) || r.data.length;
  $("#qcount").textContent = total > r.data.length ? "first " + r.data.length + " of " + total.toLocaleString() + " cases" : (total ? total.toLocaleString() + " case" + (total > 1 ? "s" : "") : "");
  if (!r.data.length) { el.innerHTML = `<p class="empty">Nothing here.</p>`; return; }
  el.innerHTML = r.data.map((c, i) => { const [cls, glyph, label] = KIND(c); return `<button class="case ${c.id === state.sel ? "sel" : ""}" data-id="${esc(c.id)}">
    <span class="ix">${String(i + 1).padStart(2, "0")}</span>
    <span class="t">${esc(c.facility_name || c.facility_id)}</span>
    <span class="n">${c.n}<small>units</small></span>
    <span class="m"><span class="chip ${cls}">${glyph} ${label}</span> ${esc(c.start.replace("T", " ").slice(0, 16))}</span></button>`; }).join("");
  if (!r.cached && state.status === "OPEN") prefetch(r.data.slice(0, 20).map(c => c.id));
  el.querySelectorAll(".case").forEach(b => b.onclick = () => { state.sel = b.dataset.id; location.hash = b.dataset.id; list(); detail(); });
}
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  state.status = b.dataset.s; state.sel = null; location.hash = "";
  document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
  $("#detail").innerHTML = `<p class="empty">Pick a hold from the queue.</p>`; list();
});
function chart(rs, start, end) {
  if (!rs.length) return `<p class="empty">No readings in this window: the logger was silent.</p>`;
  const W = 900, Hh = 300, padL = 44, padR = 16, padT = 22, padB = 34;
  const ts = rs.map(r => new Date(r[0].replace(" ", "T")).getTime());
  const t0 = Math.min(...ts), t1 = Math.max(...ts), vs = rs.map(r => r[1]).filter(v => v > -50 && v < 60);
  const lo = Math.min(0, ...vs), hi = Math.max(12, ...vs);
  const x = t => padL + (t - t0) / Math.max(1, t1 - t0) * (W - padL - padR), y = v => Hh - padB - (v - lo) / (hi - lo) * (Hh - padT - padB);
  let d = "", prev = null, dots = "";
  rs.forEach(r => { const t = new Date(r[0].replace(" ", "T")).getTime(); if (r[1] < -50 || r[1] > 60) return;
    d += (prev && t - prev > 3600e3 * 1.5 ? "M" : (d ? "L" : "M")) + x(t).toFixed(1) + " " + y(r[1]).toFixed(1);
    if (r[1] > 6) dots += `<circle cx="${x(t).toFixed(1)}" cy="${y(r[1]).toFixed(1)}" r="3" fill="var(--excursion)"/>`;
    prev = t; });
  const sx = x(new Date(start).getTime()), ex = x(new Date(end).getTime());
  let grid = "";
  for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2)
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule-2)"/><text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)" font-family="IBM Plex Mono">${v}°</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Fridge temperature, 24 hours either side">
   ${grid}
   <rect x="${padL}" y="${y(6)}" width="${W - padL - padR}" height="${y(2) - y(6)}" fill="var(--band-safe)"/>
   <line x1="${padL}" x2="${W - padR}" y1="${y(6)}" y2="${y(6)}" stroke="var(--excursion)" stroke-width="1.5" stroke-dasharray="6 4"/>
   <text x="${W - padR}" y="${y(6) - 6}" text-anchor="end" font-size="11" font-weight="600" fill="var(--excursion)" font-family="IBM Plex Mono">6°C LIMIT</text>
   <rect x="${Math.min(sx, ex)}" y="${padT}" width="${Math.max(2, Math.abs(ex - sx))}" height="${Hh - padT - padB}" fill="var(--excursion-bg)" opacity=".65"/>
   <path d="${d}" fill="none" stroke="var(--ink)" stroke-width="2"/>${dots}
   <text x="${padL}" y="${Hh - 10}" font-size="11" fill="var(--ink-3)" font-family="IBM Plex Mono">${esc(rs[0][0])}</text>
   <text x="${W - padR}" y="${Hh - 10}" text-anchor="end" font-size="11" fill="var(--ink-3)" font-family="IBM Plex Mono">${esc(rs[rs.length - 1][0])}</text></svg>`;
}
async function detail() {
  const r = await api("/api/case/" + encodeURIComponent(state.sel)); const el = $("#detail");
  if (!r.data) { el.innerHTML = `<p class="empty">This case isn't cached on this device.</p>`; return; }
  const {case: c, facility: f} = r.data, open = c.status === "OPEN";
  const q = Q().filter(d => d.case_id === c.id), pending = q.filter(d => !d._error).length, failed = q.filter(d => d._error);
  const [cls, glyph, label] = KIND(c);
  const lastDecision = r.data.audit.filter(a => String(a.action).startsWith("DECISION")).slice(-1)[0];
  el.innerHTML = `<div class="sheet">
  <div class="masthead">
   <div class="kicker ${open ? "" : "resolved"}">${open ? "On hold · do not issue" : c.status === "NO_UNITS" ? "Logged · no units in this fridge, nothing held" : esc(c.status) + " · decided"}</div>
   <h1>${esc(f.name || c.facility_id)}</h1>
   <p class="why"><span class="chip ${cls}">${glyph} ${label}</span> ${esc(c.reason)}.</p>
   <div class="meta"><span>${esc(c.start.replace("T", " "))} &rarr; ${esc(c.end.replace("T", " "))} EAT</span><span>${esc(f.county || "")}</span><span>${esc(f.connectivity || "")}</span><span>backup power: ${f.has_blood_fridge_backup_power === "True" ? "yes" : "no"}</span></div>
  </div>
  <div class="decrail"><div class="dec">
   ${open ? `<span class="cap">Decision</span><h3>HOLDLINE only holds. A person decides.</h3>
   <p><b style="color:#fff">Accept</b> keeps every unit quarantined for discard. <b style="color:#fff">Change</b> releases only the ticked units. <b style="color:#fff">Reject</b> lifts the hold on all units. Any release needs the qualified manager and a second signature. HOLDLINE never releases anything itself.</p>
   <p class="selcount" id="relcount">0 of ${r.data.units.length} ticked for release</p>
   <textarea id="reason" rows="2" placeholder="Reason (required), e.g. units moved to backup fridge at 12:40, probe check 4.1&deg;C"></textarea>
   <div class="row"><select id="second" aria-label="Second signer"><option value="">Second signer (required to release)</option><option value="demo.manager">demo.manager</option><option value="demo.manager2">demo.manager2</option></select><input id="spin" type="password" inputmode="numeric" placeholder="Second signer PIN" aria-label="Second signer PIN"></div>
   <div class="row"><button class="btn go" data-d="ACCEPT">Accept hold</button><button class="btn" data-d="CHANGE" ${user().role !== "qualified_releaser" ? "disabled" : ""}>Change: release ticked</button><button class="btn" data-d="REJECT" ${user().role !== "qualified_releaser" ? "disabled" : ""}>Reject hold</button></div>
   ${!me ? `<p class="err">Sign in (demo log-in) to decide.</p>` : user().role !== "qualified_releaser" ? `<p class="hint">Signed in as duty officer: you can confirm a hold, not release units.</p>` : ""}
   ${pending ? `<p><span class="warnchip">A decision for this case is waiting to sync</span></p>` : ""}
   ${failed.map(d => `<p><span class="failchip">A queued ${esc(d.decision)} was refused on sync: ${esc(d._error)}. It is kept below until resolved.</span></p>`).join("")}
   <p id="msg"></p>`
   : c.status === "NO_UNITS" ? `<span class="cap">Nothing to decide</span><p>The excursion is recorded in the audit log. No units were in this fridge, so nothing was held.</p>` : `<span class="cap">Decided</span><h3>${esc(c.status)}</h3>${lastDecision ? `<p>${esc(lastDecision.actor)} (${esc(lastDecision.role)}) &middot; ${esc(lastDecision.ts)}<br>${esc(lastDecision.detail)}</p>` : ""}<p class="hint">The record is append-only. A decided case is read-only.</p>`}
  </div></div>
  <div class="panel chart"><h3>Fridge temperature &middot; 24 h either side</h3>${chart(r.data.readings, c.start, c.end)}
   <p class="note">Green band is 2 to 6&deg;C. Breaks in the line are hours with no reading. Red points are above 6&deg;C.</p></div>
  <div class="panel units"><h3><span>Units in this fridge that day</span><span>${r.data.units.length}</span></h3>
   <div class="twrap"><table><thead><tr><th>${open ? "Release?" : ""}</th><th>Unit</th><th>Component</th><th>Group</th><th>Expiry</th><th>State</th></tr></thead><tbody>
   ${r.data.units.map(x => `<tr><td>${open ? `<input type="checkbox" class="rel" value="${esc(x.unit_id)}" aria-label="Release ${esc(x.unit_id)}">` : ""}</td><td class="mono">${esc(x.unit_id)}</td><td>${esc(x.component)}</td><td class="mono">${esc(x.blood_group)}</td><td class="mono">${esc(x.expiry)}</td><td><span class="chip ${x.state === "RELEASED" ? "ok" : "ho"}">${esc(x.state.replace("_", " "))}</span></td></tr>`).join("")}
   </tbody></table></div></div>
  <div class="panel smspanel"><h3><span>SMS fallback</span><span>simulated &middot; nothing is sent</span></h3>
   ${r.data.sms.map(s => `<div class="sms">${esc(s.body)}</div><div class="smsmeta">${s.body.length} of 160 characters &middot; for sites with no data connection</div>`).join("") || `<p class="note">No alert for this case.</p>`}</div>
  <div class="panel log"><h3><span>Audit trail</span><span>append-only &middot; hash-chained</span></h3>
   ${r.data.audit.map(a => `<div>${esc(a.ts)} &middot; ${esc(a.actor)} (${esc(a.role)}) &middot; <b>${esc(a.action)}</b><br>${esc(a.detail)}<br><span class="h">hash ${esc(a.hash.slice(0, 16))}&hellip; &larr; prev ${esc(a.prev_hash.slice(0, 16))}&hellip;</span></div>`).join("")}
  </div>
 </div>`;
  el.querySelectorAll("[data-d]").forEach(b => b.onclick = () => decide(c.id, b.dataset.d));
  el.querySelectorAll(".rel").forEach(cb => cb.onchange = () => {
    const n = el.querySelectorAll(".rel:checked").length, rc = $("#relcount");
    if (rc) rc.textContent = n + " of " + r.data.units.length + " ticked for release";
  });
}
async function decide(id, d) {
  if (!me) return alertBox("Sign in first.");
  const body = {case_id: id, decision: d, reason: $("#reason").value,
    second_signer: $("#second").value || null, second_pin: $("#spin").value || null,
    unit_ids: [...document.querySelectorAll(".rel:checked")].map(x => x.value),
    client_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())};
  // Only releases use a second signature. An ACCEPT never sends one, so a queued
  // offline ACCEPT can never be refused later for a missing second-signer PIN.
  if (d === "ACCEPT") { body.second_signer = null; body.second_pin = null; }
  if (!body.reason || body.reason.trim().length < 5) return alertBox("Write a reason first.");
  const r = await api("/api/decide", {method: "POST", headers: {"Content-Type": "application/json", ...auth()}, body: JSON.stringify(body)});
  if (r.cached && d !== "ACCEPT") return alertBox("Offline. Releasing units needs the server to check both signatures, so it can't be queued. Units stay on hold.");
  if (r.cached) { setQ([...Q(), {...body, second_pin: null, _auth: auth(), _user: me.user}]); alertBox("Offline. Decision saved on this device and will sync when the connection returns. Units stay on hold until then."); return; }
  if (!r.ok) return alertBox(r.data.error);
  await load();
}
async function load() { await summary(); await list(); if (state.sel) await detail(); }
(async () => {
  paintWho(); paintNet();
  await summary(); await list();
  const h = location.hash.slice(1);
  if (h) { const r = await api("/api/case/" + encodeURIComponent(h)); if (r.data && !r.data.error) { state.sel = h; if (r.data.case) { state.status = r.data.case.status; document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x.dataset.s === state.status)); await list(); } await detail(); } }
})();
setInterval(() => { if (Q().some(d => !d._error)) flush(); }, 10000);
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;  // first install: nothing to upgrade, no notice
    if (document.getElementById("upd")) return;
    // A new worker took over. Offer a reload, never force one: the running tab keeps working,
    // and queued decisions are in localStorage, so nothing is lost either way.
    const b = document.createElement("div");
    b.id = "upd"; b.className = "upd-banner";
    b.innerHTML = '<span>Update ready. Reload to use the new version.</span><button id="upd-go" type="button">Reload</button><button id="upd-x" type="button">Later</button>';
    document.body.appendChild(b);
    document.getElementById("upd-go").onclick = () => location.reload();
    document.getElementById("upd-x").onclick = () => b.remove();
  });
}


