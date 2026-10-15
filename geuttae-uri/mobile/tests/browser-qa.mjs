// Verifies the exact bundled UI with a stub native bridge, not an Android emulator.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../www/',import.meta.url)),out=fileURLToPath(new URL('../qa-output/',import.meta.url));await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname.endsWith('/'))pathname+='index.html';const file=path.resolve(root,'.'+pathname);assert.ok(file.startsWith(root));res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({args:['--no-sandbox']}),errors=[];
try{
 const context=await browser.newContext({locale:'ko-KR',viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{window.nativeCalls=[];window.__NATIVE__={share:async value=>nativeCalls.push({share:value}),saveFile:async(blob,filename)=>{nativeCalls.push({filename,type:blob.type,size:blob.size,head:(await blob.text()).slice(0,20)});},exit:()=>nativeCalls.push({exit:true})};});
 const outbound=[];page.on('request',req=>outbound.push(req.url()));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.getByText('ANDROID TEST v0.5.1',{exact:true}).waitFor();
 assert.equal(await page.locator('.banner-demo').count(),0);
 await page.locator('[data-action="demo"]').first().click();await page.locator('[data-action="compose"]').first().click();await page.locator('[data-mode="ai"]').click();assert.match(await page.locator('#ai-compose').innerText(),/출시 예정/);
 await page.evaluate(()=>window.dispatchEvent(new Event('thenus-back')));assert.equal(await page.locator('#modal').isVisible(),false);
 await page.locator('[data-action="start"]').click();
 for(let round=0;round<3;round++){if(round<2){await page.locator('[data-action="choose"][data-choice="0"]').click();await page.locator('[data-action="answer"]').click();}else await page.locator('[data-action="demo-answers"]').click();await page.locator('[data-action="next"]').click();}
 assert.equal(await page.locator('#modal').isVisible(),false);await page.locator('[data-action="memory-preview"]').click();
 await page.locator('[data-action="memory-save"]').click();await page.waitForFunction(()=>nativeCalls.length>0);let calls=await page.evaluate(()=>nativeCalls);assert.match(calls[0].head,/<!doctype html>/i);assert.equal(calls[0].filename,'Then-Us-Memory-Book.html');
 await page.locator('[data-action="memory-pdf"]').click();await page.waitForFunction(()=>nativeCalls.length===2);calls=await page.evaluate(()=>nativeCalls);assert.equal(calls[1].filename,'Then-Us-Memory-Book.pdf');assert.match(calls[1].head,/%PDF-1.4/);assert.ok(calls[1].size>10000);
 await page.locator('[data-action="memory-pdf"]').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-action="memory-pdf"]').disabled);
 await page.evaluate(()=>{window.__NATIVE__.saveFile=async()=>{const e=new Error('cancel');e.code='CANCELLED';throw e;};});await page.locator('[data-action="memory-pdf"]').click();await page.waitForFunction(()=>document.getElementById('toast').textContent==='PDF 저장을 중단했어요.');
 await page.screenshot({path:path.join(out,'android-book.png'),fullPage:true});
 const enContext=await browser.newContext({locale:'en-CA',viewport:{width:390,height:844}});await enContext.addInitScript(()=>{window.__NATIVE__={share:async()=>{},saveFile:async()=>{},exit:()=>{}};});const en=await enContext.newPage();en.on('pageerror',e=>errors.push(e.message));await en.goto(`http://127.0.0.1:${server.address().port}/`);await en.getByRole('button',{name:'Create a gathering',exact:true}).waitFor();assert.equal(await en.locator('html').getAttribute('lang'),'en');await en.locator('[data-action="demo"]').first().click();await en.locator('[data-action="compose"]').first().click();await en.locator('[data-mode="ai"]').click();assert.match(await en.locator('#ai-compose').innerText(),/Coming soon/);await en.locator('.modal-close').click();await en.locator('[data-language="ko"]').click();assert.equal(await en.locator('html').getAttribute('lang'),'ko');await en.locator('[data-language="en"]').click();assert.equal(await en.locator('html').getAttribute('lang'),'en');await enContext.close();
 assert.ok(outbound.every(url=>url.startsWith(`http://127.0.0.1:${server.address().port}/`)||url.startsWith('blob:')||url.startsWith('data:')));assert.deepEqual(errors,[]);
 console.log('ANDROID BUNDLE PASS: local-only UI/assets/PDF renderer, upcoming AI, modal back, full demo, native HTML/PDF handoff and save cancellation. Native bridge stubbed; device QA remains separate.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
