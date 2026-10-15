// Local fixture provider only. This script never contacts OpenAI or spends credits.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/server.mjs';

const dir=await mkdtemp(path.join(tmpdir(),'gu-ai-browser-'));
const out=fileURLToPath(new URL('./qa-output/',import.meta.url));await mkdir(out,{recursive:true});
let calls=0;
const provider={roomLimit:2,dailyLimit:4,generate:async input=>{
 calls++;assert.equal(input.answer,'바다 보러 가기');
 return {prompt:'도착해서 가장 먼저 한 일은?',distractors:['점심 먹기','짐 풀기','기념품 고르기']};
}};
const app=await createApp({dataDir:dir,aiProvider:provider});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({args:['--no-sandbox']});
const errors=[];
try{
 const context=await browser.newContext({locale:'ko-KR',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const outbound=[];page.on('request',r=>outbound.push(r.url()));
 await page.goto(base+'/geuttae-uri/');await page.locator('[data-action="new"]').first().click();
 await page.locator('[name="nickname"]').fill('초안 테스트');await page.locator('#entry-form [type="submit"]').click();await page.locator('[name="consent"]').check();
 await page.locator('#entry-form [type="submit"]').click();await page.waitForURL(/room=/);
 await page.locator('[data-action="compose"]').first().click();
 await page.locator('[name="prompt"]').fill('직접 적은 질문');await page.locator('[name="story"]').fill('기존 이야기');
 await page.locator('[name="confirmed"]').check();await page.locator('[name="allowKeepsake"]').check();
 await page.locator('[data-action="composer-mode"][data-mode="ai"]').click();
 assert.match(await page.locator('#ai-compose').innerText(),/출시 예정/);assert.equal(await page.locator('[data-action="ai-generate"], [name="aiConsent"], [data-action="ai-sample"]').count(),0);
 assert.equal(calls,0);assert.equal(await page.locator('[name="prompt"]').inputValue(),'직접 적은 질문');
 assert.equal(await page.locator('[name="story"]').inputValue(),'기존 이야기');assert.equal(await page.locator('[name="confirmed"]').isChecked(),true);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('#modal').evaluate(el=>el.scrollWidth>el.clientWidth),false);}
 await page.setViewportSize({width:390,height:844});await page.locator('#ai-compose').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'ai-coming-soon.png'),fullPage:true,animations:'disabled'});
 await page.locator('[data-action="ai-manual"]').click();
 for(const [i,value] of ['바다','산','강','호수'].entries())await page.locator('[name="option'+i+'"]').fill(value);
 await page.locator('[name="correct"][value="0"]').check();
 await page.locator('#photo-file').setInputFiles(fileURLToPath(new URL('./fixtures/sample.jpg',import.meta.url)));await page.waitForFunction(()=>document.querySelector('#photo-pick img')?.src.startsWith('blob:'));
 await page.locator('#question-form [type="submit"]').click();assert.equal(await page.locator('#modal').isVisible(),true);assert.equal(await page.locator('.question-item').count(),0);
 await page.locator('[name="confirmed"]').check();await page.locator('#question-form [type="submit"]').click();await page.locator('#modal').waitFor({state:'hidden'});await page.locator('.question-item').waitFor();
 assert.match(await page.locator('.question-item').innerText(),/직접 적은 질문/);
 // Upcoming AI is visible without enabling requests, even if a provider is configured.
 const demo=await context.newPage(),demoRequests=[];demo.on('request',r=>demoRequests.push(r.url()));demo.on('pageerror',e=>errors.push(e.message));
 await demo.goto(base+'/geuttae-uri/');await demo.locator('[data-action="demo"]').first().click();await demo.locator('[data-action="compose"]').first().click();
 await demo.locator('[name="confirmed"]').check();await demo.locator('[data-action="question-starter"][data-focus="place"]').click();assert.equal(await demo.locator('[name="confirmed"]').isChecked(),false);
 assert.equal(await demo.locator('[name="prompt"]').inputValue(),'이 사진을 찍은 곳은 어디였을까요?');
 await demo.locator('[data-action="composer-mode"][data-mode="ai"]').click();assert.match(await demo.locator('#ai-compose').innerText(),/출시 예정/);
 await demo.locator('[data-action="ai-manual"]').click();assert.equal(await demo.locator('[name="prompt"]').inputValue(),'이 사진을 찍은 곳은 어디였을까요?');
 assert.ok(!demoRequests.some(x=>x.includes('/api/')));assert.equal(calls,0);
 for(const p of [page,demo])assert.equal(await p.evaluate(()=>localStorage.length),0);
 assert.ok(outbound.every(x=>x.startsWith(base)||x.startsWith('blob:')||x.startsWith('data:')));assert.deepEqual(errors,[]);
 console.log('AI COMING SOON PASS: visible upcoming notice in room and demo; no generate/consent/sample controls or provider calls; manual work retained; author confirmation and consent still required; mobile widths checked.');
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
