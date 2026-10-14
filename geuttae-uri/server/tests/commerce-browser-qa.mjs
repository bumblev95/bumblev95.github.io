// Public preview only: no store, payment, account login or live AI requests.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/server.mjs';

const dir=await mkdtemp(path.join(tmpdir(),'gu-plan-browser-'));
const out=fileURLToPath(new URL('./qa-output/',import.meta.url));await mkdir(out,{recursive:true});
const app=await createApp({dataDir:dir,aiProvider:null});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({args:['--no-sandbox']}),errors=[],requests=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(base+'/geuttae-uri/');await page.getByText('TEST v0.4.6',{exact:true}).waitFor();
 await page.getByRole('button',{name:'무료·선택 상품 안내',exact:true}).click();
 assert.match(await page.locator('#modal').innerText(),/지금은 결제 없는 테스트/);assert.match(await page.locator('#modal').innerText(),/파일 저장도 무료/);
 assert.equal(await page.locator('.plan-card').count(),2);assert.match(await page.locator('.plan-card').first().innerText(),/Ultimate.*출시 예정/s);assert.match(await page.locator('.plan-card').first().innerText(),/US\$7\.99 \/ 월/);
 assert.match(await page.locator('.plan-card').first().innerText(),/300회/);assert.match(await page.locator('.plan-card').first().innerText(),/월 이용분부터/);
 assert.match(await page.locator('.plan-card').last().innerText(),/US\$0\.99/);assert.match(await page.locator('.plan-card').last().innerText(),/허용된 사진/);
 assert.equal(await page.locator('#modal form,#modal input').count(),0);assert.equal(await page.getByRole('button',{name:/결제|구매|구독/}).count(),0);
 await page.locator('.plan-extras summary').click();assert.match(await page.locator('.plan-extras').innerText(),/AI 100회 이용권/);assert.match(await page.locator('.plan-extras').innerText(),/AI 300회 이용권/);assert.match(await page.locator('.plan-extras').innerText(),/출시 전에 확정/);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`guide ${width}`);assert.equal(await page.locator('#modal').evaluate(el=>el.scrollWidth>el.clientWidth),false);}
 await page.setViewportSize({width:390,height:844});await page.locator('.plan-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'product-guide.png'),fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'무료 게임 계속하기',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'plans');assert.equal(await page.evaluate(()=>document.body.dataset.screen),'home');
 await page.locator('[data-action="demo"]').first().click();await page.locator('[data-action="start"]').click();
 for(let round=0;round<3;round++){
  if(round<2){await page.locator('[data-action="choose"][data-choice="0"]').click();await page.locator('[data-action="answer"]').click();}else await page.locator('[data-action="demo-answers"]').click();
  await page.locator('[data-action="next"]').click();
 }
 await page.getByText('광고 위치 체험',{exact:true}).waitFor();await page.locator('#modal .button[data-action="close-modal"]').click();
 assert.equal(await page.evaluate(()=>document.body.dataset.screen),'finished');assert.equal(await page.locator('[data-action="memory-preview"]').isEnabled(),true);
 await page.getByRole('button',{name:'선택 상품 안내',exact:true}).click();assert.match(await page.locator('#modal').innerText(),/결제 없는 테스트/);await page.getByRole('button',{name:'무료 게임 계속하기',exact:true}).click();
 await page.locator('[data-action="memory-preview"]').click();await page.locator('[data-action="memory-save"]').waitFor();assert.equal(await page.locator('.book-preview .memory-page').count(),3);assert.match(await page.locator('.pack-disclosure').innerText(),/무료 저장 체험.*돈이 결제되지/s);
 assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(await page.evaluate(()=>sessionStorage.length),0);assert.equal(app.commerce.ledger.stats().purchases,0);
 assert.ok(requests.every(url=>url.startsWith(base)||url.startsWith('blob:')||url.startsWith('data:')));assert.ok(!requests.some(url=>url.includes('/api/')));assert.deepEqual(errors,[]);
 console.log('COMMERCE BROWSER PASS: two proposed main products, optional 100/300 packs, clear free-test disclosure, no checkout/login/provider requests, free game and consented book preview retained, focus restoration and 320/390/768/1440 widths. No purchases or live payments.');
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
