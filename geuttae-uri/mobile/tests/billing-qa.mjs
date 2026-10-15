// Web-view UI contract only; actual Play checkout must be verified with license testers.
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
  const context=await browser.newContext({locale,viewport:{width:360,height:800},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   window.calls=[];window.signedIn=false;window.billingReply={status:'BILLING_NOT_CONFIGURED'};
   const billing=async method=>{calls.push(method);return billingReply;};
   window.__NATIVE__={account:{status:async()=>({status:'signed-out'}),signIn:async()=>({status:'signed-in',account:{id:'a',email:'test@example.com'}}),signOut:async()=>({status:'signed-out'}),billingStatus:()=>billing('status'),billingBuy:()=>billing('buy'),billingRestore:()=>billing('restore')}};
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('.home-screen').waitFor();
  await page.locator('#settings-toggle').click();assert.equal(await page.locator('#billing-buy').isDisabled(),true);assert.equal(await page.locator('#billing-restore').isDisabled(),true);
  await page.locator('#account-sign-in').click();await page.waitForFunction(()=>calls.includes('status'));
  await page.waitForFunction(()=>!document.querySelector('#billing-restore').disabled);
  assert.equal(await page.locator('#billing-buy').isDisabled(),true);
  await page.evaluate(()=>{billingReply={status:'available',enabled:true,adFree:false,price:'CA$3.49'};});
  await page.locator('#billing-restore').click();await page.locator('#billing-buy').waitFor();await page.waitForFunction(()=>!document.querySelector('#billing-buy').disabled);
  assert.match(await page.locator('#billing-buy').innerText(),/CA\$3.49/);
  await page.evaluate(()=>{billingReply={status:'PURCHASE_PENDING',enabled:true,adFree:false};});await page.locator('#billing-buy').click();
  await page.waitForFunction(()=>document.querySelector('#billing-buy').disabled&&!document.querySelector('#billing-restore').disabled);
  assert.match(await page.locator('#billing-status').innerText(),locale==='ko-KR'?/대기/:/pending/);
  await page.evaluate(()=>{billingReply={status:'PURCHASE_ACCOUNT_MISMATCH',enabled:true,adFree:false};});await page.locator('#billing-restore').click();
  await page.waitForFunction(()=>document.querySelector('#billing-status').textContent.includes(document.documentElement.lang==='ko'?'구매할 때':'used for'));
  await page.evaluate(()=>{billingReply={status:'ad-free',enabled:true,adFree:true};});await page.locator('#billing-restore').click();
  await page.locator('#billing-buy').waitFor({state:'hidden'});
  assert.match(await page.locator('#billing-status').innerText(),locale==='ko-KR'?/적용됐어요/:/active/);
  if(locale==='en-CA')assert.doesNotMatch(await page.locator('#account-settings').innerText(),/[가-힣]/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,`billing-${locale}.png`)});
  await page.locator('#account-sign-out').click();await page.locator('#account-sign-out').waitFor({state:'hidden'});
  assert.equal(await page.locator('#billing-buy').isDisabled(),true);assert.equal(await page.locator('#billing-restore').isDisabled(),true);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('BILLING UI PASS: KO/EN, sign-in gate, unavailable configuration, Play price, pending/account mismatch, verified-only ad removal and sign-out reset. Native Play bridge stubbed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
