// Runs on GitHub Actions. Two isolated mobile browser contexts, not physical phones.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {createServer as httpsServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/server.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'gu-browser-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),'-days','1','-subj','/CN=127.0.0.1'],{stdio:'ignore'});
const tls={key:await readFile(path.join(dir,'key.pem')),cert:await readFile(path.join(dir,'cert.pem'))};
let app,httpBase,apiBase;
const api=httpsServer(tls,(req,res)=>app.server.emit('request',req,res));
const pages=httpsServer(tls,async(req,res)=>{
 try{
  if(req.url.split('?')[0]==='/geuttae-uri/runtime-config.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({apiBase}));return;}
  // Static-only origin: like GitHub Pages, it exposes no multiplayer APIs.
  if(req.url.startsWith('/api/')){res.writeHead(404);res.end();return;}
  const r=await fetch(httpBase+req.url);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
 }catch{res.writeHead(500);res.end();}
});
await new Promise(r=>api.listen(0,'127.0.0.1',r));
await new Promise(r=>pages.listen(0,'127.0.0.1',r));
apiBase=`https://127.0.0.1:${api.address().port}`;
const base=`https://127.0.0.1:${pages.address().port}`;
app=await createApp({dataDir:dir,publicOrigin:apiBase,frontendOrigins:base});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
httpBase=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch();
const errors=[];
try{
 const ca=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});
 const cb=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});
 const a=await ca.newPage(),b=await cb.newPage();
 for(const p of [a,b]){p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());}
 await a.goto(base+'/geuttae-uri/');
 await a.locator('[data-action="new"]').first().click();
 await a.locator('[name="nickname"]').fill('Jack');await a.locator('[name="consent"]').check();
 await a.locator('#entry-form [type="submit"]').click();await a.waitForURL(/room=/);
 const code=new URL(a.url()).searchParams.get('room');assert.match(code,/^[A-HJ-NP-Z2-9]{8}$/);
 await b.goto(base+'/geuttae-uri/?room='+code);
 await b.locator('[name="nickname"]').fill('Kay');await b.locator('[name="consent"]').check();
 await b.locator('#entry-form [type="submit"]').click();
 await b.getByText('입장 요청을 보냈어요',{exact:true}).waitFor();
 assert.equal(await b.locator('.photo-ready').count(),0);
 await a.locator('[data-action="approve"]').click();await b.locator('[data-action="compose"]').waitFor();
 async function compose(p,prompt){
  await p.locator('[data-action="compose"]').click();
  await p.locator('#photo-file').setInputFiles(fileURLToPath(new URL('./fixtures/sample.jpg',import.meta.url)));
  await p.locator('[name="prompt"]').fill(prompt);
  for(let i=0;i<4;i++)await p.locator('[name="option'+i+'"]').fill(['바다','산','집','카페'][i]);
  await p.locator('[name="correct"][value="0"]').check();await p.locator('[name="confirmed"]').check();
  await p.locator('#question-form [type="submit"]').click();
  await p.locator('#modal').waitFor({state:'hidden'});
  await p.waitForFunction(()=>document.querySelector('.photo-ready img')?.src.startsWith('blob:'));
 }
 await compose(a,'Jack의 사진');await compose(b,'Kay의 사진');
 await a.waitForFunction(()=>!document.querySelector('[data-action="start"]').disabled);
 await a.locator('[data-action="start"]').click();
 await b.locator('[data-action="choose"][data-choice="0"]').waitFor();
 assert.equal(await a.locator('[data-action="choose"]:not(:disabled)').count(),0);
 await b.locator('[data-action="choose"][data-choice="0"]').click();await b.locator('[data-action="answer"]').click();
 await a.locator('[data-action="next"]').waitFor();
 // Reload the same tab: retain identity, reveal phase and exactly one award.
 await b.reload();await b.getByText('Jack의 사진',{exact:true}).waitFor();
 assert.equal(await b.locator('[data-action="answer"]').count(),0);
 assert.match(await b.locator('#app').innerText(),/100/);
 // Update detection must not permit replacement during the game.
 await a.route('**/version.json?*',async route=>{const r=await route.fetch();const m=await r.json();m.version='0.3.1';await route.fulfill({response:r,json:m});});
 await a.locator('#check-update').click();await a.locator('#apply-update').waitFor();assert.equal(await a.locator('#apply-update').isDisabled(),true);
 await a.locator('[data-action="next"]').click();await a.locator('[data-action="choose"][data-choice="0"]').waitFor();
 assert.equal(await b.locator('[data-action="choose"]:not(:disabled)').count(),0);
 // Network loss does not erase membership. Visibility/reconnect restores snapshot.
 await ca.setOffline(true);await ca.setOffline(false);await a.waitForFunction(()=>!document.querySelector('.connection'));
 await a.locator('[data-action="choose"][data-choice="0"]').click();await a.locator('[data-action="answer"]').click();
 await b.locator('[data-action="next"]').click();
 for(const p of [a,b]){await p.waitForFunction(()=>document.body.dataset.screen==='finished');assert.match(await p.locator('#app').innerText(),/공동 기억왕/);assert.match(await p.locator('#app').innerText(),/서버의 임시 사진을 삭제/);assert.equal(await p.locator('.ranking .score').count(),2);}
 assert.equal(await a.locator('#apply-update').isDisabled(),false);
 for(const p of [a,b]){
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await p.evaluate(()=>localStorage.length),0);
  assert.equal(await p.evaluate(()=>navigator.serviceWorker.getRegistrations().then(r=>r.length)),0);
 }
 assert.deepEqual(errors,[]);
 console.log('BROWSER PASS: two isolated mobile sessions across separate HTTPS static/API origins, real uploads/SSE, approval, author exclusion, rotation, reconnect, final scores, deletion, update deferral and layout. Physical-device QA remains pending.');
}finally{await browser.close();await app.close();await new Promise(r=>api.close(r));await new Promise(r=>pages.close(r));await rm(dir,{recursive:true,force:true});}
