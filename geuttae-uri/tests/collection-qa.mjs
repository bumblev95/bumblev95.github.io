import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=fileURLToPath(new URL('./qa-output/',import.meta.url));await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{if(req.url==='/geuttae-uri/collection-test.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="./releases/0.5.1/style.css"></head><body></body></html>');return;}try{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname.endsWith('/'))pathname+='index.html';const p=path.resolve(root,'.'+pathname);assert.ok(p.startsWith(root));const b=await readFile(p);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.jpg':'image/jpeg','.png':'image/png'})[path.extname(p)]||'application/octet-stream');res.end(b);}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/geuttae-uri/collection-test.html');
 await page.evaluate(async()=>{
  const memory=await import('./releases/0.5.1/memory.js'),viewer=await import('./releases/0.5.1/book-viewer.js');window.qa={memory,viewer};
  const pictures=await Promise.all(['seaside-v1.png','picnic-v1.png','cafe-v2.jpg'].map(async f=>{const i=new Image();i.src='./assets/sample-'+f;await i.decode();const c=document.createElement('canvas');c.width=c.height=500;c.getContext('2d').drawImage(i,0,0,500,500);return c.toDataURL('image/jpeg',.9);}));
  const players=Array.from({length:10},(_,i)=>({name:'친구 '+(i+1),score:i*100}));const entries=Array.from({length:30},(_,i)=>({round:i,photoId:'photo-'+i,author:players[i%10].name,media:i%7===0?'text':'photo',prompt:'우리의 질문 '+i,options:['A','B','C','D'],correctIndex:0,story:('기억 '+(i+1)+' · 그날 함께 웃고 이야기를 나누던 시간을 오래 간직하고 싶어요. ').repeat(5).slice(0,240),responses:[]}));
  qa.book={title:'함께한 서른 개의 기억',date:'2026년 10월 14일',sample:true,players,entries};qa.images=Object.fromEntries(entries.filter(e=>e.media==='photo').map((e,i)=>[e.photoId,pictures[i%3]]));
  qa.show=selection=>{qa.html=memory.renderMemoryHTML(qa.book,qa.images,selection);document.body.innerHTML=`<style>${memory.memoryStyleCSS}</style><div id="collection-reader" class="book-preview">${qa.html.split('<main>')[1].split('</main>')[0]}</div>`;viewer.mountBook(document.querySelector('#collection-reader'));};qa.show({});
 });
 assert.equal(await page.locator('.memory-record').count(),30);assert.equal(await page.locator('.collection-page').count(),15);assert.equal(await page.locator('.book-index').count(),1);assert.equal(await page.locator('.overview-item').count(),30);assert.equal(await page.locator('.quiz-record').count(),0);
 assert.equal(await page.locator('.book-page-grid button').count(),20);assert.equal(await page.locator('.journal-note').count(),30);
 // One click reaches the last chapter, then a particular memory and the last page.
 await page.locator('.book-page-picker summary').click();await page.locator('.book-page-grid button').nth(1).click();await page.locator('[data-book-target="chapter-2"]').click();assert.equal(await page.locator('#collection-reader').getAttribute('data-book-page'),'14');
 await page.locator('.book-page-picker summary').click();await page.locator('.book-page-grid button').nth(3).click();await page.locator('.overview-item[data-book-target="memory-29"]').click();assert.equal(await page.locator('#memory-29').isVisible(),true);assert.equal(await page.locator('#collection-reader').getAttribute('data-book-page'),'18');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.memory-record').evaluateAll(es=>es.some(e=>e.scrollWidth>e.clientWidth)),false);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'collection-thirty-mobile.png',fullPage:true});
 for(const template of ['photobook','polaroid','album']){await page.evaluate(template=>qa.show({template}),template);assert.equal(await page.locator('.memory-record').count(),30);assert.equal(await page.locator('.collection-page').count(),15);assert.equal(await page.locator('.overview-item').count(),30);}
 await page.evaluate(()=>qa.show({density:'one'}));assert.equal(await page.locator('.collection-page').count(),30);assert.equal(await page.locator('.memory-record').count(),30);
 await page.evaluate(()=>qa.show({density:'two',includeQuiz:true}));assert.equal(await page.locator('.collection-page').count(),15);assert.equal(await page.locator('.quiz-record').count(),30);assert.equal(await page.locator('.book-page-grid button').count(),50);
 await page.evaluate(()=>qa.show({}));const html=await page.evaluate(()=>qa.html);await writeFile(out+'collection-thirty.html',html);
 const pdfEvent=page.waitForEvent('download',{timeout:120000});await page.evaluate(()=>qa.viewer.downloadBookPDF(qa.html));const pdf=await pdfEvent;await pdf.saveAs(out+'collection-thirty.pdf');const bytes=await readFile(out+'collection-thirty.pdf');assert.match(bytes.toString('latin1').slice(0,300),/\/Count 20\b/);assert.equal((bytes.toString('latin1').match(/\/Subtype \/Link/g)||[]).length,33);assert.match(bytes.toString('latin1'),/\/Type \/Outlines/);
 // Abort after rendering has started; no download and no orphaned export iframe.
 let downloads=0;page.on('download',()=>downloads++);const cancelled=await page.evaluate(async()=>{const c=new AbortController();try{await qa.viewer.downloadBookPDF(qa.html,()=>c.abort(),{signal:c.signal});return false;}catch(e){return e.name==='AbortError';}});assert.equal(cancelled,true);assert.equal(downloads,0);assert.equal(await page.locator('iframe').count(),0);
 assert.deepEqual(errors,[]);console.log('COLLECTION PASS: 30 complete memories, 3 chapters, 30 navigable thumbnails, 20/35 page books, explicit-only quiz appendix, mobile overflow checks, real 20-page local PDF and cancelled export cleanup.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
