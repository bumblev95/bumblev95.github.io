// Exact bundled UI, three independent browser sessions, and a local real API.
// Native bridge is stubbed; this does not replace physical Android testing.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {readFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../../server/src/server.mjs';
const www=path.resolve(fileURLToPath(new URL('../www/',import.meta.url)));
const out=fileURLToPath(new URL('../qa-output/moderation/',import.meta.url));await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(tmpdir(),'thenus-moderation-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),'-days','1','-subj','/CN=127.0.0.1'],{stdio:'ignore'});
const tls={key:await readFile(path.join(temp,'key.pem')),cert:await readFile(path.join(temp,'cert.pem'))};
let app;
const api=createServer(tls,(req,res)=>app.server.emit('request',req,res));
const ui=createServer(tls,async(req,res)=>{try{
 let pathname=new URL(req.url,'https://localhost').pathname;if(pathname.endsWith('/'))pathname+='index.html';
 const file=path.resolve(www,'.'+pathname);assert.ok(file.startsWith(www+path.sep));
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>api.listen(0,'127.0.0.1',r));await new Promise(r=>ui.listen(0,'127.0.0.1',r));
const apiBase=`https://127.0.0.1:${api.address().port}`,base=`https://127.0.0.1:${ui.address().port}`;
app=await createApp({dataDir:path.join(temp,'data'),publicOrigin:apiBase,frontendOrigins:base,gameClock:()=>100000});
const browser=await chromium.launch({args:['--no-sandbox']}),errors=[];
async function session(locale,player){
 const context=await browser.newContext({locale,ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{window.__NATIVE__={share:async()=>{},saveFile:async()=>{},exit:()=>{}};});
 await context.route('https://geuttae-api-test-production.up.railway.app/**',route=>route.continue({url:apiBase+new URL(route.request().url()).pathname}));
 const page=await context.newPage();page.on('console',m=>{if(m.type()==='error')console.log('BROWSER',m.text());});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);await page.goto(base+'/');await page.waitForSelector('[data-action="new"]',{timeout:5000}).catch(async e=>{console.log('BOOT',errors,await page.locator('body').innerText());throw e;});
 return {context,page,player};
}
async function join(s,code){
 await s.page.locator('[data-action="join"]').first().click();await s.page.locator('[name="code"]').fill(code);await s.page.locator('[name="nickname"]').fill(s.player);await s.page.locator('[name="consent"]').check();await s.page.locator('#entry-form [type="submit"]').click();await s.page.locator('.waiting-view').waitFor();
}
async function compose(page,prompt){
 await page.locator('[data-action="compose"]').first().click();await page.locator('#photo-file').setInputFiles(fileURLToPath(new URL('../../server/tests/fixtures/sample.jpg',import.meta.url)));
 await page.locator('[name="prompt"]').fill(prompt);for(let i=0;i<4;i++)await page.locator(`[name="option${i}"]`).fill(['Sea','Mountain','Cafe','Home'][i]);await page.locator('[name="correct"][value="0"]').check();await page.locator('[name="confirmed"]').check();await page.locator('#question-form [type="submit"]').click();await page.locator('#modal').waitFor({state:'hidden'});await page.locator('.question-item').waitFor();
}
try{
 const host=await session('ko-KR','HOST'),guest=await session('en-CA','GUEST'),third=await session('ko-KR','THIRD');const a=host.page,b=guest.page,c=third.page;
 // Privacy disclosure is readable before affirmative consent; expanding it preserves input.
 for(const [session, nickname] of [[host,'HOST'],[guest,'GUEST']]){
  const page=session.page;
  await page.locator('[data-action="join"]').first().click();
  await page.locator('[name="nickname"]').fill(nickname);
  assert.equal(await page.locator('[name="consent"]').isChecked(),false);
  await page.locator('.entry-privacy summary').click();
  const notice=await page.locator('.entry-privacy').innerText();
  assert.match(notice,/Railway/);assert.match(notice,/keetojt@gmail.com/);assert.match(notice,/24/);
  if(session===guest)assert.doesNotMatch(notice,/[가-힣]/);
  assert.equal(await page.locator('[name="nickname"]').inputValue(),nickname);
  assert.equal(await page.locator('[name="consent"]').isChecked(),false);
  await page.locator('.modal-close').click();
 }

 await a.locator('[data-action="new"]').first().click();await a.locator('[name="nickname"]').fill('HOST');await a.locator('#entry-form [type="submit"]').click();await a.locator('[name="mode"][value="family"]').check();await a.locator('[name="familyScoring"]').check();await a.locator('[name="consent"]').check();await a.locator('#entry-form [type="submit"]').click();await a.waitForURL(/room=/);const code=new URL(a.url()).searchParams.get('room');
 await join(guest,code);await a.locator('[data-action="approve"]').click();await b.locator('[data-action="compose"]').waitFor();await join(third,code);await a.locator('[data-action="approve"]').click();await c.locator('[data-action="compose"]').waitFor();
 await compose(a,'Host photo');await compose(b,'Guest photo');await compose(c,'Third photo');await a.locator('[data-action="start"]').click();await b.locator('.quiz-photo').waitFor();
 await b.locator('[data-action="hide-photo"]').click();await b.locator('.hidden-photo').waitFor();assert.equal(await a.locator('.quiz-photo').count(),1);await b.reload();await b.locator('.hidden-photo').waitFor();await b.locator('[data-action="show-photo"]').click();await b.locator('.quiz-photo').waitFor();
 let reportPosts=0;b.on('request',r=>{if(r.postData()?.includes('"type":"report"'))reportPosts++;});
 await b.locator('[data-action="report"]').click();await b.locator('#report-reason').selectOption('privacy');await b.locator('#report-form [type="submit"]').click();assert.match(await b.locator('#modal').innerText(),/The gathering continues/);await b.locator('[data-action="close-modal"]').first().click();assert.equal(reportPosts,0);assert.equal(await b.locator('.quiz-photo').count(),1);
 await b.locator('[data-action="report"]').click();await b.locator('#report-reason').selectOption('privacy');await b.screenshot({path:path.join(out,'en-report.png'),fullPage:true});assert.doesNotMatch(await b.locator('#modal').innerText(),/[가-힣]/);await b.locator('#report-form [type="submit"]').click();await b.locator('[data-action="confirm"]').click();await b.locator('.hidden-photo').waitFor();assert.equal(reportPosts,1);assert.equal(await a.locator('.quiz-photo').count(),1);assert.equal(await b.locator('[data-action="manage-players"]').count(),0);
 await a.locator('[data-action="report"]').click();await a.screenshot({path:path.join(out,'ko-report.png'),fullPage:true});await a.locator('.modal-close').click();
 await b.locator('[data-action="choose"][data-choice="0"]').click();await b.locator('[data-action="answer"]').click();await c.locator('[data-action="choose"][data-choice="0"]').click();await c.locator('[data-action="answer"]').click();await a.locator('[data-action="next"]').click();await a.getByRole('heading',{name:'Guest photo',exact:true}).waitFor();
 await a.locator('[data-action="manage-players"]').click();await a.screenshot({path:path.join(out,'ko-players.png'),fullPage:true});const kick=a.locator('#modal .person').filter({hasText:'GUEST'}).locator('[data-action="kick"]');await kick.click();await a.locator('[data-action="close-modal"]').first().click();await a.getByRole('heading',{name:'Guest photo',exact:true}).waitFor();
 await a.locator('[data-action="manage-players"]').click();await a.locator('#modal .person').filter({hasText:'GUEST'}).locator('[data-action="kick"]').click();await a.locator('[data-action="confirm"]').click();await a.getByRole('heading',{name:'Third photo',exact:true}).waitFor();await b.getByRole('heading',{name:'The host removed you from this gathering',exact:true}).waitFor();
 assert.match(await c.locator('.mini-score').textContent(),/100/);assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await a.screenshot({path:path.join(out,'ko-after-kick.png'),fullPage:true});assert.deepEqual(errors,[]);console.log('PASS: bundled KO/EN, hide/show/reload, report reason/cancel/confirm, no auto-kick/end, host kick cancel/confirm and live author removal.');
}finally{await browser.close();await app.close();await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>ui.close(r))]);await rm(temp,{recursive:true,force:true});}
