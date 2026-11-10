// Real local Chrome + application interactions. No browser profile or service login reused.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.resolve(process.env.HOLDLINE_DEMO_OUT || 'out/demo');
const base = process.env.HOLDLINE_DEMO_URL || 'http://127.0.0.1:4211';
fs.mkdirSync(out, {recursive:true});
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new','--remote-debugging-pipe','--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--disable-component-update','--disable-sync',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-extensions',
  '--password-store=basic','--use-mock-keychain', '--disable-features=OptimizationHints,MediaRouter',
  '--user-data-dir='+path.join(out,'chrome-profile'),'about:blank'
], {stdio:['ignore','ignore','ignore','pipe','pipe']});
let seq=0, buffer='', session;
const pending = new Map();
chrome.stdio[4].on('data', chunk=>{
  buffer+=chunk.toString(); let end;
  while ((end=buffer.indexOf('\0'))>=0) {
    const msg=JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1);
    const p=pending.get(msg.id);
    if(p){pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}
  }
});
function send(method,params={},sid=session){
  return new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});
    chrome.stdio[3].write(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})})+'\0');
  });
}
async function ev(expression){
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function until(expression){
  for(let i=0;i<160;i++){
    if(await ev(expression))return;
    await new Promise(r=>setTimeout(r,100));
  }
  fs.writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify(await ev(`({url:location.href,text:document.body?.innerText})`),null,2));
  await shot('failure');
  throw new Error('Timed out: '+expression);
}
async function shot(name,selector){
  if(selector)await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  await new Promise(r=>setTimeout(r,180));
  const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'));
  console.log('Captured '+name);
}
async function login(name,pin){
  await ev(`if(document.querySelector('#out'))document.querySelector('#out').click()`);
  await ev(`document.querySelector('#luser').value=${JSON.stringify(name)};document.querySelector('#lpin').value=${JSON.stringify(pin)};document.querySelector('#login').requestSubmit()`);
  await until(`document.querySelector('#who').textContent.includes(${JSON.stringify(name)})`);
}
const timer=setTimeout(()=>{chrome.kill();process.exit(1)},120000);
const evidence={base,started:new Date().toISOString(),checks:[]};
try {
  const t=await send('Target.createTarget',{url:'about:blank'},null);
  session=(await send('Target.attachToTarget',{targetId:t.targetId,flatten:true},null)).sessionId;
  await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base});
  console.log('Navigated '+base);
  await until(`document.querySelectorAll('button.case').length>1 && document.querySelector('#metrics').textContent.includes('Intact')`);
  await ev('document.fonts.ready');
  await shot('01-overview');
  evidence.summary=await ev(`fetch('/api/summary').then(r=>r.json())`);
  evidence.openCases=await ev(`fetch('/api/cases?status=OPEN').then(r=>r.json())`);
  // Choose a measured case with a concise units table for the actual demonstration.
  const candidates=evidence.openCases.filter(c=>c.kind==='EXCURSION' && c.n>1).sort((a,b)=>a.n-b.n);
  const chosen=candidates[0]; assert(chosen,'Need an undecided measured case');
  evidence.caseBefore=await ev(`fetch('/api/case/'+${JSON.stringify(chosen.id)}).then(r=>r.json())`);
  await ev(`document.querySelector('[data-id="${chosen.id}"]').click()`);
  await until(`!!document.querySelector('#reason')`);
  await shot('02-measured-case','.masthead');
  await shot('03-temperature','.panel.chart');
  await shot('04-sms','.smspanel');
  await login('demo.officer','1111');
  await until(`document.querySelector('[data-d="CHANGE"]')?.disabled`);
  evidence.checks.push('Duty officer release controls disabled');
  await shot('05-officer-gate','.decrail');
  await login('demo.manager','2222');
  await until(`document.querySelector('[data-d="CHANGE"]') && !document.querySelector('[data-d="CHANGE"]').disabled`);
  await ev(`document.querySelector('.rel').click(); document.querySelector('#reason').value='Synthetic demonstration only: simulated probe review for one unit; not a clinical release.'; document.querySelector('#second').value='demo.manager2'; document.querySelector('#spin').value='3333'`);
  await shot('06-two-signatures','.decrail');
  await ev(`document.querySelector('[data-d="CHANGE"]').click()`);
  await until(`document.querySelector('.dec h3')?.textContent==='CHANGED'`);
  evidence.caseAfter=await ev(`fetch('/api/case/'+${JSON.stringify(chosen.id)}).then(r=>r.json())`);
  assert.equal(evidence.caseAfter.units.filter(x=>x.state==='RELEASED').length,1);
  assert.equal(evidence.caseAfter.units.filter(x=>x.state==='QUARANTINED').length,chosen.n-1);
  assert.equal(evidence.caseAfter.audit.at(-1).actor,'demo.manager');
  evidence.checks.push('Manager Change released exactly one synthetic unit with recorded second signature');
  await shot('07-decision','.decrail');
  await shot('08-audit','.panel.log');
  await login('demo.officer','1111');
  await ev(`document.querySelector('[data-s="OPEN"]').click()`);
  await until(`document.querySelectorAll('button.case').length>0`);
  const offlineId=await ev(`document.querySelector('button.case').dataset.id`);
  evidence.offlineCase=offlineId;
  await ev(`document.querySelector('button.case').click()`);
  await until(`!!document.querySelector('#reason')`);
  await ev('navigator.serviceWorker.ready');
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  // Exercise the original bug path: tick a unit, then choose ACCEPT while offline.
  await ev(`document.querySelector('.rel').click();document.querySelector('#reason').value='Synthetic offline demonstration: keep every unit quarantined.';document.querySelector('[data-d="ACCEPT"]').click()`);
  await until(`JSON.parse(localStorage.getItem('hl.queue')||'[]').length===1`);
  evidence.queued=await ev(`JSON.parse(localStorage.getItem('hl.queue')).map(({_auth,...d})=>d)`);
  assert.deepEqual(evidence.queued[0].unit_ids,[]);
  await shot('09-offline-queued','.decrail');
  await send('Page.reload',{ignoreCache:false});
  await until(`document.querySelector('#queue')?.textContent.includes('waiting to sync') && document.querySelector('#net')?.textContent.includes('Offline')`);
  evidence.checks.push('Offline page reload retained cached case and queued Accept; selected release units stripped');
  await shot('10-offline-reload');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await ev('flush()');
  await until(`JSON.parse(localStorage.getItem('hl.queue')||'[]').length===0`);
  const after=await ev(`fetch('/api/case/'+${JSON.stringify(offlineId)}).then(r=>r.json())`);
  assert.equal(after.case.status,'ACCEPTED');
  assert(after.units.every(x=>x.state==='QUARANTINED'));
  assert.equal(after.audit.filter(x=>x.action==='DECISION_ACCEPT').length,1);
  await ev('flush()');
  evidence.offlineAfter=after;
  evidence.checks.push('Reconnect applied Accept exactly once; every unit remains quarantined');
  await shot('11-synced','.decrail');
  await ev('window.scrollTo(0,0)');
  await shot('12-metrics');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await ev('window.scrollTo(0,0)');
  evidence.mobile=await ev(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})`);
  assert(evidence.mobile.scrollWidth<=evidence.mobile.width,'Mobile horizontal overflow');
  await shot('13-mobile');
  evidence.checks.push('390px mobile layout has no horizontal page overflow');
  evidence.finished=new Date().toISOString();
  fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({out,checks:evidence.checks,case:chosen.id,units:chosen.n}));
} finally {
  clearTimeout(timer);await send('Browser.close',{},null).catch(()=>{});chrome.kill();
}
