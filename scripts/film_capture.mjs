// Film captures for the v2 walkthrough, against the current UI. Real local Chrome, real API, synthetic data.
// Usage: start `HOLDLINE_DB=:memory: python3 -m holdline.server data --port 4211 --since 2026-10-01`, then
//   CHROME_PATH=/path/to/chrome bun scripts/film_capture.mjs   (or node; uses the DevTools WebSocket)
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.resolve(process.env.HOLDLINE_DEMO_OUT || 'out/demo/v2');
const base = process.env.HOLDLINE_DEMO_URL || 'http://127.0.0.1:4211';
const port = process.env.CHROME_DEBUG_PORT || '9335';
const CASE = 'HL-HSP-007-2026102223-EXC';
fs.mkdirSync(out, {recursive: true});
const chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=' + port, '--no-first-run', '--no-default-browser-check',
  ...(process.env.CHROME_NO_SANDBOX ? ['--no-sandbox'] : []),
  '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--password-store=basic', '--use-mock-keychain',
  '--user-data-dir=' + path.join(out, 'chrome-profile'), 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 600 && !url; i++) {
  try { url = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(100); }
}
const ws = new WebSocket(url);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0, session;
const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data), p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params = {}, sid = session) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, {resolve, reject});
  ws.send(JSON.stringify({id, method, params, ...(sid ? {sessionId: sid} : {})}));
});
async function ev(expression) {
  const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function until(expression, label = expression) {
  for (let i = 0; i < 200; i++) { if (await ev(expression)) return; await sleep(100); }
  await shot('failure');
  throw new Error('Timed out: ' + label);
}
const BOXES = {};
const BOXSEL = {
  '01-overview': {head: 'main h1, #case h1', grid: '#case table, #case [role=grid], #case .grid'},
  '02-measured-case': {title: '.hero h1', peak: '.hpeak', explain: '.chead p.why:nth-of-type(2)', facts: '.facts', units: '.unitsp'},
  '03-sms': {sms: '#case .sms'},
  '04-officer-gate': {accept: '[data-act="ACCEPT"]', reason: '#reason', roles: '.roles'},
  '05-two-signatures': {confirm: '#decide .confirm', slide: '#slide', decide: '#decide', tick: '#ubody tr'},
  '06-audit': {audit: 'ol.audit', last: 'ol.audit li:last-child', decide: '#decide'},
  '07-offline-queued': {net: '#net', sync: '#sync', qnote: '#qnote', accept: '[data-act="ACCEPT"]'},
  '08-offline-reload': {net: '#net', qnote: '#qnote', title: '.hero h1'},
  '09-synced': {decided: '#decide h2', decide: '#decide', net: '#net'},
  '10-metrics': {table: '#evaluation table', r1: '#evaluation tbody tr:nth-child(1)', r2: '#evaluation tbody tr:nth-child(2)', r3: '#evaluation tbody tr:nth-child(3)'},
};
async function shot(name, selector) {
  if (selector) await ev(`(document.querySelector(${JSON.stringify(selector)})||document.body).scrollIntoView({block:'center'})`);
  if (name !== 'failure') await ev(`document.querySelectorAll('#toasts > *').forEach(t=>t.remove())`);
  await sleep(400);
  const s = await send('Page.captureScreenshot', {format: 'png'});
  fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(s.data, 'base64'));
  if (BOXSEL[name]) BOXES[name] = await ev(`(()=>{const o={};for(const [k,q] of Object.entries(${JSON.stringify(BOXSEL[name])})){const e=document.querySelector(q);if(e){const r=e.getBoundingClientRect();o[k]=[r.x,r.y,r.width,r.height];}}return o;})()`);
  fs.writeFileSync(path.join(out, 'boxes.json'), JSON.stringify(BOXES, null, 1));
  console.log('Captured ' + name);
}
async function key(k, code, vk) {
  await send('Input.dispatchKeyEvent', {type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk});
}
async function login(user, pin) {
  await ev(`(async()=>{ if(window.me){ try{await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}catch{} } })()`);
  await ev(`document.querySelector('#signin-open').click()`);
  await ev(`document.querySelector('#luser').value=${JSON.stringify(user)};document.querySelector('#lpin').value=${JSON.stringify(pin)};document.querySelector('#login').requestSubmit()`);
  await until(`document.querySelector('#who').textContent.includes(${JSON.stringify(user)})`, 'login ' + user);
  await ev(`document.querySelector('#signin')?.open && document.querySelector('#signin').close()`);
}
async function openCase(id) {
  await ev(`location.hash='#/case/'+encodeURIComponent(${JSON.stringify(id)})`);
  await until(`document.querySelector('.sheet')?.dataset.case===${JSON.stringify(id)}`, 'open ' + id);
  await sleep(300);
}
const evidence = {base, started: new Date().toISOString(), checks: []};
const timer = setTimeout(() => { chrome.kill(); process.exit(1); }, 240000);
try {
  const t = await send('Target.createTarget', {url: 'about:blank'}, null);
  session = (await send('Target.attachToTarget', {targetId: t.targetId, flatten: true}, null)).sessionId;
  await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 1000, deviceScaleFactor: Number(process.env.DPR || 1), mobile: false});
  await send('Page.navigate', {url: base});
  await until(`document.querySelectorAll('#list .row').length>1 && document.body.innerText.includes('intact')`, 'queue');
  await ev('document.fonts.ready'); await sleep(800);
  evidence.headline = await ev(`document.querySelector('main h1, .overview h1, h1')?.innerText`);
  await shot('01-overview');
  evidence.summary = await ev(`fetch('/api/summary').then(r=>r.json()).then(s=>({cases:s.cases,units_on_hold:s.units_on_hold,since:s.dataset_since}))`);
  // Measured case
  const c = await ev(`fetch('/api/case/'+${JSON.stringify(CASE)}).then(r=>r.json())`);
  assert.equal(c.case.peak, 7.8); assert.equal(c.units.length, 2);
  evidence.kajiado = {id: CASE, peak: c.case.peak, units: c.units.length, explain: c.explain, sms: c.sms.map(s => s.body)};
  await openCase(CASE);
  await shot('02-measured-case');
  // SMS
  await ev(`[...document.querySelectorAll('#case details.more')].find(d=>d.querySelector('summary').textContent.includes('SMS')).open=true`);
  await shot('03-sms', '#case .sms');
  // Officer: accept only
  await login('demo.officer', '1111');
  await openCase(CASE);
  await until(`!!document.querySelector('[data-act="ACCEPT"]') && !document.querySelector('[data-act="CHANGE"]')`, 'officer has no release');
  evidence.checks.push('Duty officer sees Accept only; no release controls');
  await shot('04-officer-gate', '#decide');
  // Manager: tick one unit, reason, second signer
  await login('demo.manager', '2222');
  await openCase(CASE);
  await until(`!!document.querySelector('#case .rel')`, 'manager release ticks');
  await ev(`(()=>{const d=document.querySelector('#case details.release'); if(d) d.open=true;
    const cb=document.querySelector('#ubody .rel'); cb.click();
    const r=document.querySelector('#reason'); r.value='Synthetic demonstration only: simulated probe review for one unit; not a clinical release.'; r.dispatchEvent(new Event('input',{bubbles:true}));
    const s=document.querySelector('#second'); s.value='demo.manager2'; s.dispatchEvent(new Event('change',{bubbles:true})); s.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#spin').value='3333';})()`);
  await sleep(300);
  await ev(`document.querySelector('[data-act="CHANGE"]').click()`);
  await until(`!!document.querySelector('#slider')`, 'confirm slider');
  await shot('05-two-signatures', '#decide');
  await ev(`document.querySelector('#slider').focus()`);
  await key('End', 'End', 35); await sleep(150); await key('Enter', 'Enter', 13);
  await until(`(document.querySelector('#decide h2')?.textContent||'').startsWith('Decided')`, 'decided');
  const after = await ev(`fetch('/api/case/'+${JSON.stringify(CASE)}).then(r=>r.json())`);
  assert.equal(after.units.filter(x => x.state === 'RELEASED').length, 1);
  assert.equal(after.units.filter(x => x.state !== 'RELEASED').length, 1);
  evidence.kajiadoAfter = {status: after.case.status, audit: after.audit.map(a => ({action: a.action, actor: a.actor, detail: a.detail}))};
  evidence.checks.push('Manager Change released exactly one synthetic unit with a second signer');
  await ev(`[...document.querySelectorAll('#case details.more')].find(d=>d.querySelector('summary').textContent.includes('History')).open=true`);
  await shot('06-audit', '#case ol.audit');
  // Offline Accept on the 26-unit Naivasha case
  await login('demo.officer', '1111');
  const open = await ev(`fetch('/api/cases?status=OPEN').then(r=>r.json())`);
  const off = open.find(x => x.n === 26 && /Naivasha/.test(x.facility_name || x.facility_id || '')) || open.find(x => x.n === 26);
  assert(off, 'need the 26-unit case'); evidence.offlineCase = off.id;
  await openCase(off.id);
  await ev(`document.querySelectorAll('#toasts > *').forEach(t=>t.remove())`);
  await ev('navigator.serviceWorker.ready');
  await send('Network.emulateNetworkConditions', {offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0});
  await sleep(500);
  await ev(`(()=>{const r=document.querySelector('#reason'); r.value='Synthetic offline demonstration: keep every unit quarantined.'; r.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-act="ACCEPT"]').click();})()`);
  await until(`JSON.parse(localStorage.getItem('hl.queue')||'[]').length===1`, 'queued');
  evidence.queued = await ev(`JSON.parse(localStorage.getItem('hl.queue')).map(({_auth,...d})=>d)`);
  await sleep(500);
  await shot('07-offline-queued', '#decide');
  await send('Page.reload', {ignoreCache: false});
  await until(`document.querySelector('#net')?.textContent.includes('Offline') && JSON.parse(localStorage.getItem('hl.queue')||'[]').length===1 && !!document.querySelector('.sheet')`, 'offline reload');
  await sleep(800);
  evidence.checks.push('Offline reload kept the cached case and the queued Accept');
  await shot('08-offline-reload', '#decide');
  await send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
  await ev(`typeof flush==='function' ? flush() : null`);
  await until(`JSON.parse(localStorage.getItem('hl.queue')||'[]').length===0`, 'synced');
  const offAfter = await ev(`fetch('/api/case/'+${JSON.stringify(off.id)}).then(r=>r.json())`);
  assert.equal(offAfter.case.status, 'ACCEPTED');
  assert(offAfter.units.every(x => x.state === 'QUARANTINED'));
  assert.equal(offAfter.units.length, 26);
  assert.equal(offAfter.audit.filter(x => x.action === 'DECISION_ACCEPT').length, 1);
  evidence.checks.push('Reconnect applied Accept once; all 26 units stay quarantined');
  await openCase(off.id);
  await sleep(500);
  await shot('09-synced', '#decide');
  await ev(`location.hash='#/evaluation'`);
  await until(`!document.querySelector('#evaluation').hidden && document.querySelector('#evaluation').innerText.includes('66')`, 'evaluation');
  await ev('window.scrollTo(0,0)'); await sleep(500);
  await shot('10-metrics');
  evidence.finished = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'film-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({out, checks: evidence.checks, headline: evidence.headline}));
} finally {
  clearTimeout(timer); await send('Browser.close', {}, null).catch(() => {}); chrome.kill(); ws.close();
}
