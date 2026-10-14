// Runs on GitHub Actions. Two isolated mobile browser contexts, not physical phones.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {createServer as httpsServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/server.mjs';
const out=fileURLToPath(new URL('./qa-output/',import.meta.url));await mkdir(out,{recursive:true});
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
app=await createApp({gameClock:()=>100000,dataDir:dir,publicOrigin:apiBase,frontendOrigins:base});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
httpBase=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({args:['--no-sandbox']});
const errors=[];
try{
 const ca=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});
 const cb=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});
 const a=await ca.newPage(),b=await cb.newPage();
 for(const p of [a,b]){p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());}
 await a.goto(base+'/geuttae-uri/');
 await a.locator('[data-action="new"]').first().click();
 await a.locator('#room-mode').selectOption('party');assert.equal(await a.locator('[name="partyMissions"]').isChecked(),false);await a.locator('[name="partyMissions"]').check();
 await a.locator('[name="nickname"]').fill('Jack');await a.locator('[name="consent"]').check();
 await a.locator('#entry-form [type="submit"]').click();await a.waitForURL(/room=/);
 const code=new URL(a.url()).searchParams.get('room');assert.match(code,/^[A-HJ-NP-Z2-9]{8}$/);
 await b.goto(base+'/geuttae-uri/?room='+code);
 await b.locator('[name="nickname"]').fill('Kay');await b.locator('[name="consent"]').check();
 await b.locator('#entry-form [type="submit"]').click();
 await b.getByText('입장 요청을 보냈어요',{exact:true}).waitFor();
 assert.equal(await b.locator('.photo-ready').count(),0);
 await a.locator('[data-action="approve"]').click();await b.locator('[data-action="compose"]').waitFor();
 async function compose(p,prompt,allow){
  await p.locator('[data-action="compose"]').click();
  await p.locator('#photo-file').setInputFiles(fileURLToPath(new URL('./fixtures/sample.jpg',import.meta.url)));
  await p.locator('[name="prompt"]').fill(prompt);
  assert.equal(await p.locator('[name="allowKeepsake"]').isChecked(),false);
  await p.locator('[name="story"]').fill(allow?'Jack의 진짜 이야기':'DENIED-STORY');
  if(allow)await p.locator('[name="allowKeepsake"]').check();
  for(let i=0;i<4;i++)await p.locator('[name="option'+i+'"]').fill(['바다','산','집','카페'][i]);
  await p.locator('[name="correct"][value="0"]').check();await p.locator('[name="confirmed"]').check();
  await p.locator('#question-form [type="submit"]').click();
  await p.locator('#modal').waitFor({state:'hidden'});
  await p.waitForFunction(()=>document.querySelector('.photo-ready img')?.src.startsWith('blob:'));
 }
 await compose(a,'Jack의 사진',true);await compose(b,'Kay의 사진',false);
 // Editing an existing photo retains its authoritative permission, replacing it clears it.
 await a.locator('[data-action="compose"]').click();assert.equal(await a.locator('[name="allowKeepsake"]').isChecked(),true);
 await a.locator('#modal .modal-close').click();
 await a.waitForFunction(()=>!document.querySelector('[data-action="start"]').disabled);
 await a.locator('[data-action="start"]').click();
 await b.locator('[data-action="choose"][data-choice="0"]').waitFor();
 assert.equal(await a.locator('[data-action="choose"]:not(:disabled)').count(),0);
 await b.locator('[data-action="choose"][data-choice="0"]').click();await b.locator('[data-action="answer"]').click();
 await a.locator('[data-action="next"]').waitFor();
 await b.locator('[data-action="missionDone"]').waitFor();assert.equal(await a.locator('[data-action="missionDone"]').count(),0);assert.match(await a.locator('.party-mission').innerText(),/Kay/);await b.screenshot({path:'/tmp/party-mobile.png'});assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await b.locator('[data-action="missionDone"]').click();await a.getByText('함께 이야기했어요!',{exact:true}).waitFor();
 // Reload the same tab: retain identity, reveal phase and exactly one award.
 await b.reload();await b.getByText('Jack의 사진',{exact:true}).waitFor();await b.getByText('함께 이야기했어요!',{exact:true}).waitFor();
 assert.equal(await b.locator('[data-action="answer"]').count(),0);
 assert.match(await b.locator('#app').innerText(),/100/);
 // Update detection must not permit replacement during the game.
 await a.route('**/version.json?*',async route=>{const r=await route.fetch();const m=await r.json();m.version='0.4.3';await route.fulfill({response:r,json:m});});
 await a.locator('#check-update').click();await a.locator('#apply-update').waitFor();assert.equal(await a.locator('#apply-update').isDisabled(),true);
 await a.locator('[data-action="next"]').click();await a.locator('[data-action="choose"][data-choice="0"]').waitFor();
 assert.equal(await b.locator('[data-action="choose"]:not(:disabled)').count(),0);
 // Network loss does not erase membership. Visibility/reconnect restores snapshot.
 await ca.setOffline(true);await ca.setOffline(false);await a.waitForFunction(()=>!document.querySelector('.connection'));
 await a.locator('[data-action="choose"][data-choice="0"]').click();await a.locator('[data-action="answer"]').click();await a.locator('[data-action="missionSkip"]').waitFor();await a.locator('[data-action="missionSkip"]').click();await b.getByText('이번 미션은 쉬어 가요.',{exact:true}).waitFor();
 await a.locator('[data-action="next"]').click();
 for(const p of [a,b]){await p.waitForFunction(()=>document.body.dataset.screen==='finished');assert.match(await p.locator('#app').innerText(),/공동 기억왕/);assert.match(await p.locator('#app').innerText(),/서버의 임시 사진을 삭제/);assert.equal(await p.locator('.ranking .score').count(),2);}
 // The finishing caller and the other SSE client both receive the same authorized book.
 for(const p of [a,b]){
  await p.locator('[data-action="memory-preview"]').click();await p.locator('[data-action="memory-save"]').waitFor();
  assert.equal(await p.locator('.book-preview .memory-page').count(),1);
  assert.equal(await p.locator('.book-preview .memory-image').count(),2);
  await p.getByRole('button',{name:'다음 페이지',exact:true}).click();
  assert.match(await p.locator('.book-preview').innerText(),/Jack의 진짜 이야기/);
  assert.ok(!(await p.locator('.book-preview').textContent()).includes('Kay의 사진'));
  assert.ok(!(await p.locator('.book-preview').textContent()).includes('DENIED-STORY'));
  assert.ok(!(await p.locator('.book-preview .sample').innerText()).includes('가상 참가자'));
  for(const template of ['photobook','polaroid','album']){
   await p.locator('#memory-template').selectOption(template);await p.locator('#memory-palette').selectOption('peach');
   for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await p.locator('#modal').evaluate(el=>el.scrollWidth>el.clientWidth),false);}
  }
  assert.equal(await a.locator('#apply-update').isDisabled(),p===a);
  await p.setViewportSize({width:390,height:844});
  await p.screenshot({path:path.join(out,p===a?'host-memory.png':'guest-memory.png'),fullPage:true,animations:'disabled'});
  const ready=p.waitForEvent('download');await p.locator('[data-action="memory-save"]').click();const download=await ready;
  const file=path.join(out,p===a?'host-memory.html':'guest-memory.html');await download.saveAs(file);
  const html=await readFile(file,'utf8');assert.ok(html.includes('template-album palette-peach'));assert.ok(html.includes('Jack의 진짜 이야기'));
  for(const secret of ['Kay의 사진','DENIED-STORY','sessionToken','Bearer ',code,'blob:','<script'])assert.ok(!html.includes(secret),secret);
  const saved=await p.context().newPage();await saved.goto('file://'+file);assert.equal(await saved.locator('.memory-page').count(),1);
  if(p===a){await saved.screenshot({path:path.join(out,'real-memory-album.png'),fullPage:true});await saved.pdf({path:path.join(out,'real-memory.pdf'),format:'A4',printBackground:true});}
  await saved.close();await p.locator('#modal .modal-close').click();
 }
 assert.equal(await a.locator('#apply-update').isDisabled(),false);
 // Tab-only export state never survives a reload after server deletion.
 await b.reload();await b.waitForFunction(()=>document.body.dataset.screen==='finished');assert.equal(await b.locator('[data-action="memory-preview"]').isDisabled(),true);
 await a.locator('[data-action="rematch"]').click();await a.locator('#modal [data-action="confirm"]').click();
 for(const p of [a,b]){await p.waitForFunction(()=>document.body.dataset.screen==='lobby');assert.equal(await p.locator('.person').count(),2);assert.match(await p.locator('#app').innerText(),/사진 준비 중/);assert.equal(await p.locator('[data-action="memory-preview"]').count(),0);}

 for(const p of [a,b]){
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await p.evaluate(()=>localStorage.length),0);
  assert.equal(await p.evaluate(()=>navigator.serviceWorker.getRegistrations().then(r=>r.length)),0);
 }
 assert.deepEqual(errors,[]);
 console.log('BROWSER PASS: two isolated mobile sessions across separate HTTPS static/API origins, real uploads/SSE, approval, author exclusion, rotation, reconnect, final scores, deletion, authorized book delivery to both clients, denied-content exclusion, all templates, offline export/PDF, tab-only lifetime, update deferral and layout. Physical-device QA remains pending.');
}finally{await browser.close();await app.close();await new Promise(r=>api.close(r));await new Promise(r=>pages.close(r));await rm(dir,{recursive:true,force:true});}
