// Account menu behavior with a stub native bridge; Google OAuth/device validation is separate.
import {chromium} from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../www/',import.meta.url))),out=fileURLToPath(new URL('../qa-output/',import.meta.url));
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));assert.ok(file.startsWith(root+path.sep));res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']});
try{
 for(const locale of ['ko-KR','en-CA']){
  const context=await browser.newContext({locale,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   window.calls=[];window.reply={status:'SIGN_IN_NOT_CONFIGURED'};
   const result=async(method,options)=>{calls.push({method,options});return reply;};
   window.__NATIVE__={share:async()=>{},saveFile:async()=>{},exit:()=>{},account:{status:()=>result('status'),signIn:()=>result('signIn'),signOut:()=>result('signOut'),deleteAccount:options=>result('deleteAccount',options)}};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('.home-screen').waitFor();
  assert.equal(await page.locator('#account-sign-in').isVisible(),false);
  await page.locator('#settings-toggle').click();await page.waitForFunction(()=>document.querySelector('#account-note').textContent.includes('Google'));
  assert.equal(await page.locator('#account-sign-in').innerText(),locale==='ko-KR'?'Google로 로그인':'Sign in with Google');
  await page.locator('#account-sign-in').click();await page.waitForFunction(()=>calls.some(x=>x.method==='signIn'));
  assert.equal(await page.locator('#account-delete').isVisible(),false);
  await page.evaluate(()=>{reply={status:'cancelled'};});await page.locator('#account-sign-in').click();
  assert.equal(await page.locator('#account-sign-out').isVisible(),false);
  await page.evaluate(()=>{reply={status:'signed-in',account:{id:'safe-account',email:'<img src=x onerror=alert(1)>@example.com'}};});
  await page.locator('#account-sign-in').click();await page.locator('#account-sign-out').waitFor();
  assert.equal(await page.locator('#account-status img').count(),0);assert.match(await page.locator('#account-status').innerText(),/<img/);
  await page.locator('#account-delete').click();await page.locator('#account-delete-cancel').click();assert.equal(await page.evaluate(()=>calls.filter(x=>x.method==='deleteAccount').length),0);
  await page.evaluate(()=>{reply={status:'REAUTHENTICATE_TO_DELETE'};});await page.locator('#account-delete').click();await page.locator('#account-delete-confirm').click();
  await page.waitForFunction(()=>calls.some(x=>x.method==='deleteAccount'));assert.deepEqual(await page.evaluate(()=>calls.find(x=>x.method==='deleteAccount').options),{confirmed:true});
  assert.equal(await page.locator('#account-sign-out').isVisible(),true);
  await page.screenshot({path:path.join(out,`account-${locale}.png`)});
  await page.evaluate(()=>{reply={status:'signed-out'};});await page.locator('#account-sign-out').click();await page.locator('#account-sign-out').waitFor({state:'hidden'});
  if(locale==='en-CA')assert.doesNotMatch(await page.locator('#account-settings').innerText(),/[가-힣]/);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('ACCOUNT UI PASS: visible KO/EN menu, unconfigured/cancelled/verified states, safe profile rendering, delete confirmation/reauth and logout. Native Google bridge stubbed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
