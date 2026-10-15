import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../www/',import.meta.url));
const out=fileURLToPath(new URL('../qa-output/',import.meta.url));await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);assert.ok(file.startsWith(root));res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({args:['--no-sandbox']});const errors=[];
try{
 for(const locale of ['ko-KR','en-CA']){
  const context=await browser.newContext({locale,hasTouch:true,isMobile:true,viewport:{width:390,height:700}});await context.addInitScript(()=>{window.__NATIVE__={share:async()=>{},saveFile:async()=>{},exit:()=>{window.didExit=true;}};});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('.home-screen').waitFor();
  await page.addStyleTag({content:':root{--safe-area-inset-top:28px;--safe-area-inset-bottom:24px}'});
  for(const [width,height] of [[360,640],[390,700],[412,650],[412,732],[390,844],[320,568],[768,720]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
   const geometry=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('.home-screen [data-action]')].map(x=>{const r=x.getBoundingClientRect();return {action:x.dataset.action,bottom:r.bottom,height:r.height};})}));
   assert.ok(geometry.sw<=width,JSON.stringify(geometry));assert.ok(geometry.sh<=height+1,JSON.stringify(geometry));for(const b of geometry.buttons){assert.ok(b.bottom<=height-24+1,JSON.stringify(geometry));assert.ok(b.height>=43.9,JSON.stringify(geometry));}
  }
  await page.setViewportSize({width:412,height:650});await page.screenshot({path:path.join(out,`home-${locale}.png`)});
  assert.equal(await page.locator('.language-switch').isVisible(),false);assert.equal(await page.locator('#release-notes').isVisible(),false);
  await page.locator('#settings-toggle').click();await page.locator('[data-language="ko"]').click();await page.locator('[data-language="en"]').click();assert.equal(await page.locator('#settings-heading').innerText(),'Settings');await page.locator('#release-notes').click();assert.equal(await page.locator('#settings-dialog').isVisible(),false);await page.locator('#close-release').click();
  await page.locator('#settings-toggle').click();await page.evaluate(()=>window.dispatchEvent(new Event('thenus-back')));assert.equal(await page.locator('#settings-dialog').isVisible(),false);assert.equal(await page.evaluate(()=>window.didExit),undefined);
  await page.reload();await page.locator('.home-screen').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('HOME PASS: KO/EN, 7 screen sizes, simulated Android safe areas, all home actions in one viewport, touch targets, settings, release notes, back and persistent language.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
