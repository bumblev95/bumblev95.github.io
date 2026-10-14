import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {renderMemoryHTML} from '../releases/0.4.1/memory.js';

const out=fileURLToPath(new URL('./qa-output/',import.meta.url));await mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox']});
const errors=[],requests=[];
try{
 const context=await browser.newContext({viewport:{width:900,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const pictures=await page.evaluate(()=>[[720,360],[400,720],[420,420]].map(([w,h],i)=>{
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d'),gradient=g.createLinearGradient(0,0,w,h);
  gradient.addColorStop(0,['#c6d7cf','#e2c5b1','#bdc8af'][i]);gradient.addColorStop(1,['#799995','#b78c6e','#62785d'][i]);g.fillStyle=gradient;g.fillRect(0,0,w,h);
  g.fillStyle='#fffdf3';g.fillRect(14,14,50,50);g.fillRect(w-64,14,50,50);g.fillRect(14,h-64,50,50);g.fillRect(w-64,h-64,50,50);
  g.font='24px sans-serif';g.fillStyle='#344338';g.fillText('PHOTO '+(i+1),w/2-55,h/2);return c.toDataURL('image/jpeg',.85);
 }));
 const players=Array.from({length:8},(_,i)=>({name:('참가자'+(i+1)+'가나다라마바사아자차카타').slice(0,16),score:100}));
 const long='긴 글과 줄바꿈을 확인하는 테스트 문장입니다. '.repeat(12).slice(0,240);
 const entries=Array.from({length:8},(_,i)=>({round:i,photoId:'fixture-'+i,author:players[i].name,prompt:('이 질문은 긴 문제 문장의 줄바꿈을 확인합니다. ').repeat(8).slice(0,160),options:Array.from({length:4},(_,j)=>('보기'+j+' 가나다라마바사아자차카타파하 ').repeat(5).slice(0,60)),correctIndex:i%4,story:i%3===0?'':long,responses:players.filter((_,j)=>j!==i).map(p=>({name:p.name,answer:('긴 답변 가나다라마바사아자차카타파하 ').repeat(4).slice(0,60),correct:false}))}));
 const scenarios=[{name:'photobook-one',entries:entries.slice(0,1),palette:'cream'},{name:'photobook-eight',entries,palette:'peach'},{name:'photobook-missing',entries:entries.slice(0,2).map(e=>({...e,story:''})),palette:'sage',missing:true}];
 for(const scenario of scenarios){
  const images=Object.fromEntries(scenario.entries.map((e,i)=>[e.photoId,scenario.missing?undefined:pictures[i%3]]));
  const book={title:'함께한 우리의 기억이 한 권의 책으로 오래 남기를 바라요'.repeat(2).slice(0,40),date:'2026년 10월 13일',sample:true,players,entries:scenario.entries};
  const html=renderMemoryHTML(book,images,{template:'photobook',palette:scenario.palette,includeChoices:true}),file=path.join(out,scenario.name+'.html');await writeFile(file,html);
  await page.goto('file://'+file);await page.evaluate(()=>document.fonts.ready);await page.locator('.book-cover').waitFor();
  assert.equal(await page.locator('.memory-page').count(),scenario.entries.length);assert.equal(await page.locator('.quiz-record').count(),scenario.entries.length);
  assert.equal(await page.locator('.memory-page .options,.memory-page .responses').count(),0);
  assert.equal(await page.locator('.journal-note').count(),scenario.entries.filter(e=>e.story).length);
  if(scenario.missing)assert.equal(await page.locator('img').count(),0);
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,scenario.name+'/'+width);
   assert.ok((await page.locator('.memory-image').evaluateAll(els=>els.map(e=>getComputedStyle(e).objectFit))).every(fit=>fit==='contain'));
   assert.equal(await page.locator('.memory-page').evaluateAll(els=>els.some(e=>e.scrollWidth>e.clientWidth)),false);
  }
  await page.setViewportSize({width:900,height:1000});
  if(scenario.name==='photobook-eight'){
   await page.screenshot({path:path.join(out,'photobook-cover-desktop.png'),animations:'disabled'});
   await page.locator('.memory-page').nth(1).screenshot({path:path.join(out,'photobook-story-desktop.png'),animations:'disabled'});
   await page.setViewportSize({width:390,height:844});await page.locator('.memory-page').nth(1).screenshot({path:path.join(out,'photobook-story-mobile.png'),animations:'disabled'});
  }
  await page.emulateMedia({media:'print'});
  assert.ok((await page.locator('.memory-image').evaluateAll(els=>els.map(e=>getComputedStyle(e).objectFit))).every(fit=>fit==='contain'));
  await page.pdf({path:path.join(out,scenario.name+'.pdf'),format:'A4',printBackground:true});
  await page.emulateMedia({media:null});
 }
 assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith('file:')||url.startsWith('data:')));
 console.log('PHOTOBOOK PASS: 1/8 memories, empty stories and missing pictures, long Korean titles/names/questions/answers, 320/390/768/1440 widths, preserved image ratios, complete quiz appendix, offline export and three print PDFs. No external requests or invented stories.');
}finally{await browser.close();}
