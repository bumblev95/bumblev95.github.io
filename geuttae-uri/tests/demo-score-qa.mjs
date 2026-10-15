import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=fileURLToPath(new URL('./qa-output/',import.meta.url));await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{if(false){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="./releases/0.4.11/style.css"></head><body></body></html>');return;}try{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname.endsWith('/'))pathname+='index.html';const p=path.resolve(root,'.'+pathname);assert.ok(p.startsWith(root));const b=await readFile(p);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.jpg':'image/jpeg','.png':'image/png'})[path.extname(p)]||'application/octet-stream');res.end(b);}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({args:['--no-sandbox']});
try{
 for(const [wait,expected] of [[5000,75],[15000,25],[21000,0]]){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));await page.goto(base+'/geuttae-uri/');await page.locator('[data-action="demo"]').first().click();await page.locator('[data-action="compose"]').first().click();assert.equal(await page.locator('[data-action="question-media"]').count(),0);assert.equal(await page.locator('text=글로만').count(),0);await page.locator('.modal-close').click();await page.locator('[data-action="start"]').click();await page.clock.fastForward(wait);
  if(expected){assert.match(await page.locator('#round-clock').innerText(),new RegExp('지금 맞히면 '+expected+'점'));await page.locator('[data-action="choose"][data-choice="0"]').click();await page.locator('[data-action="answer"]').click();assert.match(await page.locator('.gain').innerText(),new RegExp('정답 \\+'+expected+'점'));}
  else{await page.locator('[data-action="next"]').waitFor();assert.match(await page.locator('.gain').innerText(),/미응답 · 0점/);assert.equal(await page.locator('[data-action="answer"]').count(),0);}
  await page.screenshot({path:out+'demo-speed-'+expected+'.png'});await context.close();
 }
 console.log('DEMO SCORE PASS: actual test UI awards 75 after 5s, 25 after 15s and zero with automatic reveal after timeout; text/placeholder composer options absent.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
