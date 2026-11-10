// HOLDLINE client. Offline-tolerant: last data cached in localStorage, decisions queued while offline
// and replayed with a client_id so the server never applies one twice.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let state = {status: "OPEN", sel: null};
const Q = () => JSON.parse(localStorage.getItem("hl.queue") || "[]");
const setQ = q => { localStorage.setItem("hl.queue", JSON.stringify(q)); paintNet(); };

async function api(path, opts) {
  try {
    const r = await fetch(path, opts);
    const j = await r.json();
    if (r.ok && (!opts || opts.method !== "POST")) localStorage.setItem("hl.c." + path, JSON.stringify(j));
    online(true);
    return {ok: r.ok, data: j};
  } catch (e) {
    online(false);
    const c = localStorage.getItem("hl.c." + path);
    return {ok: !!c, data: c ? JSON.parse(c) : null, cached: true};
  }
}
let isOnline = true;
function online(v) { if (v !== isOnline) { isOnline = v; paintNet(); if (v) flush(); } }
function paintNet() {
  const n = $("#net"); n.textContent = isOnline ? "Online" : "Offline · cached view"; n.className = "chip " + (isOnline ? "ok" : "un");
  const q = Q().length, el = $("#queue"); el.style.display = q ? "" : "none"; el.textContent = q + " decision" + (q > 1 ? "s" : "") + " waiting to sync";
}
async function flush() {
  let q = Q(), left = [];
  for (const d of q) {
    // replay only under the identity that made the decision; never re-attribute it to someone else
    const hdr = me && me.user === d._user ? auth() : (d._auth || {});
    const r = await api("/api/decide", {method: "POST", headers: {"Content-Type": "application/json", ...hdr}, body: JSON.stringify(d)});
    if (r.cached) { left.push(d); }
    else if (!r.ok && r.data && r.data.error === "sign in first") { left.push(d); alertBox(`Sign in again as ${d._user} to sync a queued decision.`); }
    else if (!r.ok) alertBox("A queued decision was refused when it synced: " + (r.data && r.data.error));
  }
  setQ(left); if (q.length !== left.length) { load(); }
}
function alertBox(m) { const e = $("#msg"); if (e) { e.textContent = m; e.className = "err"; } else alert(m); }
let me = JSON.parse(localStorage.getItem("hl.me") || "null");
const user = () => me ? {actor: me.user, role: me.role} : {actor: null, role: null};
const auth = () => me ? {"X-Holdline-Token": me.token} : {};
function paintWho() {
  $("#who").innerHTML = me ? `Signed in: <b>${esc(me.user)}</b> · <a href="#" id="out" style="color:#fff">sign out</a>` : "";
  $("#login").style.display = me ? "none" : "";
  if (me) $("#out").onclick = e => { e.preventDefault(); me = null; localStorage.removeItem("hl.me"); paintWho(); state.sel && detail(); };
}
$("#login").onsubmit = async e => {
  e.preventDefault();
  const r = await api("/api/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({user: $("#luser").value, pin: $("#lpin").value})});
  if (r.cached || !r.ok) return alert(r.cached ? "Offline: sign in needs the server once." : r.data.error);
  me = r.data; localStorage.setItem("hl.me", JSON.stringify(me)); $("#lpin").value = ""; paintWho(); state.sel && detail();
};

async function summary() {
  const r = await api("/api/summary"); if (!r.data) return;
  const m = r.data.metrics, b = m.baseline, h = m.holdline;
  const pct = x => (x * 100).toFixed(1) + "%";
  $("#metrics").innerHTML = `
   <div><b>${r.data.units_on_hold.toLocaleString()}</b><span>units on hold now (open cases)</span></div>
   <div><b>${pct(h.precision)}</b><span>hold precision · baseline ${pct(b.precision)}</span></div>
   <div><b>${pct(h.recall)}</b><span>exposed units caught · baseline ${pct(b.recall)}</span></div>
   <div><b>${h.false_holds.toLocaleString()}</b><span>false holds in the year · baseline ${b.false_holds.toLocaleString()}</span></div>
   <div><b>${h.held_before_transfusion_day.toLocaleString()}</b><span>exposed units held before their transfusion day · baseline ${b.held_before_transfusion_day.toLocaleString()}</span></div>
   <div><b class="${r.data.audit_ok ? "" : "err"}">${r.data.audit_ok ? "Intact" : "BROKEN at " + r.data.audit_broken_at}</b><span>audit hash chain</span></div>`;
}
async function list() {
  const r = await api("/api/cases?status=" + state.status); const el = $("#list");
  if (!r.data) { el.innerHTML = `<p class="empty" style="padding:18px">No cached data yet. Connect once to load.</p>`; return; }
  if (!r.data.length) { el.innerHTML = `<p class="empty" style="padding:18px">Nothing here.</p>`; return; }
  el.innerHTML = r.data.map(c => `<button class="case ${c.id === state.sel ? "sel" : ""}" data-id="${esc(c.id)}">
    <div class="t">${esc(c.facility_name || c.facility_id)}</div>
    <div class="m"><span class="chip ${c.kind === "EXCURSION" ? "ex" : "un"}">${c.kind === "EXCURSION" ? "Measured excursion" : "Presumed: logger gap"}</span> ${esc(c.start.replace("T", " ").slice(0, 16))} · ${c.n} units</div></button>`).join("");
  el.querySelectorAll(".case").forEach(b => b.onclick = () => { state.sel = b.dataset.id; list(); detail(); });
}
function chart(rs, start, end) {
  if (!rs.length) return `<p class="empty">No readings in this window: the logger was silent.</p>`;
  const W = 640, Hh = 180, pad = 30, ts = rs.map(r => new Date(r[0].replace(" ", "T")).getTime());
  const t0 = Math.min(...ts), t1 = Math.max(...ts), vs = rs.map(r => r[1]).filter(v => v > -50 && v < 60);
  const lo = Math.min(0, ...vs), hi = Math.max(12, ...vs);
  const x = t => pad + (t - t0) / Math.max(1, t1 - t0) * (W - 2 * pad), y = v => Hh - pad - (v - lo) / (hi - lo) * (Hh - 2 * pad);
  let d = "", prev = null;
  rs.forEach((r, i) => { const t = ts[i]; if (r[1] < -50 || r[1] > 60) return; d += (prev && t - prev > 3600e3 * 1.5 ? "M" : (d ? "L" : "M")) + x(t).toFixed(1) + " " + y(r[1]).toFixed(1); prev = t; });
  const sx = x(new Date(start).getTime()), ex = x(new Date(end).getTime());
  return `<svg viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Fridge temperature, 24 hours either side">
   <rect x="${pad}" y="${y(6)}" width="${W - 2 * pad}" height="${y(2) - y(6)}" fill="var(--band-safe)"/>
   <line x1="${pad}" x2="${W - pad}" y1="${y(6)}" y2="${y(6)}" stroke="var(--excursion)" stroke-dasharray="4 3"/>
   <text x="${W - pad}" y="${y(6) - 4}" text-anchor="end" font-size="11" fill="var(--excursion)" font-family="IBM Plex Mono">6°C</text>
   <rect x="${Math.min(sx, ex)}" y="${pad / 2}" width="${Math.max(2, Math.abs(ex - sx))}" height="${Hh - pad * 1.5}" fill="var(--excursion-bg)" opacity=".7"/>
   <path d="${d}" fill="none" stroke="var(--ink)" stroke-width="2"/>
   <text x="${pad}" y="${Hh - 8}" font-size="11" fill="var(--ink-3)" font-family="IBM Plex Mono">${esc(rs[0][0])}</text>
   <text x="${W - pad}" y="${Hh - 8}" text-anchor="end" font-size="11" fill="var(--ink-3)" font-family="IBM Plex Mono">${esc(rs[rs.length - 1][0])}</text></svg>`;
}
async function detail() {
  const r = await api("/api/case/" + encodeURIComponent(state.sel)); const el = $("#detail");
  if (!r.data) { el.innerHTML = `<p class="empty">This case isn't cached on this device.</p>`; return; }
  const {case: c, facility: f, units, readings, audit, sms} = r.data, u = user();
  const open = c.status === "OPEN", pending = Q().some(d => d.case_id === c.id);
  el.innerHTML = `
  <div class="card alert ${c.kind === "EXCURSION" ? "" : "gap"}">
    <span class="chip ${open ? "ho" : "ve"}">${open ? "On hold · do not issue" : esc(c.status)}</span>
    <h2>${esc(f.name || c.facility_id)}</h2>
    <p>${esc(c.reason)}.</p>
    <p class="m" style="font:500 13px var(--mono);color:var(--ink-3)">${esc(c.start.replace("T", " "))} to ${esc(c.end.replace("T", " "))} EAT · ${esc(f.county || "")} · ${esc(f.connectivity || "")} · backup power: ${f.has_blood_fridge_backup_power === "True" ? "yes" : "no"}</p>
  </div>
  <div class="card"><b>Fridge temperature, 24 h either side</b>${chart(readings, c.start, c.end)}
   <p style="font-size:13px;color:var(--ink-3)">Green band is 2 to 6°C. Breaks in the line are hours with no reading.</p></div>
  <div class="card"><b>${units.length} units in this fridge that day</b>
   <div style="overflow:auto"><table><thead><tr><th>${open ? "Release?" : ""}</th><th>Unit</th><th>Component</th><th>Group</th><th>Expiry</th><th>State</th></tr></thead><tbody>
   ${units.map(x => `<tr><td>${open ? `<input type="checkbox" class="rel" value="${esc(x.unit_id)}" aria-label="Release ${esc(x.unit_id)}">` : ""}</td><td style="font-family:var(--mono)">${esc(x.unit_id)}</td><td>${esc(x.component)}</td><td>${esc(x.blood_group)}</td><td>${esc(x.expiry)}</td><td><span class="chip ${x.state === "RELEASED" ? "ok" : "ho"}">${esc(x.state.replace("_", " "))}</span></td></tr>`).join("")}
   </tbody></table></div></div>
  ${open ? `<div class="card dec"><b>Decision</b>
   <p style="font-size:14px;color:var(--ink-2);margin:0">HOLDLINE only holds. A person decides. <b>Accept</b> keeps every unit quarantined for discard. <b>Change</b> releases only the ticked units. <b>Reject</b> lifts the hold on all units. Any release needs the qualified manager and a second signature.</p>
   <textarea id="reason" rows="2" placeholder="Reason (required), e.g. units moved to backup fridge at 12:40, probe check 4.1°C"></textarea>
   <div class="row"><select id="second" aria-label="Second signer"><option value="">Second signer (required to release)</option><option value="demo.manager">demo.manager</option><option value="demo.manager2">demo.manager2</option></select><input id="spin" type="password" inputmode="numeric" placeholder="Second signer PIN" aria-label="Second signer PIN"></div>
   <div class="row"><button class="btn chip ex" data-d="ACCEPT">Accept hold</button><button class="btn chip un" data-d="CHANGE" ${u.role !== "qualified_releaser" ? "disabled" : ""}>Change: release ticked</button><button class="btn chip ve" data-d="REJECT" ${u.role !== "qualified_releaser" ? "disabled" : ""}>Reject hold</button></div>
   ${!me ? `<p class="err" style="margin:0">Sign in (demo log-in) to decide.</p>` : u.role !== "qualified_releaser" ? `<p style="font-size:13px;color:var(--ink-3);margin:0">Signed in as duty officer: you can confirm a hold, not release units.</p>` : ""}
   ${pending ? `<p class="chip un">A decision for this case is waiting to sync.</p>` : ""}
   <p id="msg"></p></div>` : ""}
  <div class="card"><b>SMS fallback (simulated, not sent)</b><p style="font-size:13px;color:var(--ink-3)">For sites with no data connection. ${sms.length ? sms[0].body.length + " of 160 characters." : ""}</p>${sms.map(s => `<div class="sms">${esc(s.body)}</div>`).join("")}</div>
  <div class="card log"><b>Audit trail (append-only, hash-chained)</b>${audit.map(a => `<div>${esc(a.ts)} · ${esc(a.actor)} (${esc(a.role)}) · <b>${esc(a.action)}</b><br>${esc(a.detail)}<br><span style="color:var(--ink-3)">hash ${esc(a.hash.slice(0, 16))}… prev ${esc(a.prev_hash.slice(0, 16))}…</span></div>`).join("")}</div>`;
  el.querySelectorAll("[data-d]").forEach(b => b.onclick = () => decide(c.id, b.dataset.d));
}
async function decide(id, d) {
  if (!me) return alertBox("Sign in first.");
  const body = {case_id: id, decision: d, reason: $("#reason").value,
    second_signer: $("#second").value || null, second_pin: $("#spin").value || null, unit_ids: [...document.querySelectorAll(".rel:checked")].map(x => x.value),
    client_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())};
  if (!body.reason || body.reason.trim().length < 5) return alertBox("Write a reason first.");
  const r = await api("/api/decide", {method: "POST", headers: {"Content-Type": "application/json", ...auth()}, body: JSON.stringify(body)});
  if (r.cached && d !== "ACCEPT") return alertBox("Offline. Releasing units needs the server to check both signatures, so it can't be queued. Units stay on hold.");
  if (r.cached) { setQ([...Q(), {...body, second_pin: null, _auth: auth(), _user: me.user}]); alertBox("Offline. Decision saved on this device and will sync when the connection returns. Units stay on hold until then."); return; }
  if (!r.ok) return alertBox(r.data.error);
  await load();
}
async function load() { await summary(); await list(); if (state.sel) await detail(); paintNet(); }
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { document.querySelectorAll(".tabs button").forEach(x => x.classList.remove("on")); b.classList.add("on"); state.status = b.dataset.s; list(); });
paintWho();
window.addEventListener("online", () => online(true)); window.addEventListener("offline", () => online(false));
setInterval(() => { if (Q().length) flush(); }, 10000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
load();
