import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=fileURLToPath(new URL('./qa-output/',import.meta.url));await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  try{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname.endsWith('/'))pathname+='index.html';const file=path.resolve(root,'.'+pathname);assert.ok(file.startsWith(root+path.sep));const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({args:['--no-sandbox']});
const errors=[],requests=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('dialog',d=>d.accept());
 await page.goto(base+'/geuttae-uri/');await page.getByText('TEST v0.3.6',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-action="memory-preview"]').count(),0);
 assert.equal(await page.locator('.banner-demo').count(),1);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`home width ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'home.png'),fullPage:true});
 await page.locator('[data-action="demo"]').first().click();
 await page.locator('[data-action="compose"]').click();
 // Select a real local JPEG; save permission defaults to off for a changed photo.
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=100;const g=c.getContext('2d');g.fillStyle='#e8bca8';g.fillRect(0,0,120,100);return c.toDataURL('image/jpeg').split(',')[1];});
 await page.locator('#photo-file').setInputFiles({name:'private.jpg',mimeType:'image/jpeg',buffer:Buffer.from(data,'base64')});
 await page.waitForFunction(()=>document.querySelector('#photo-pick img')?.src.startsWith('blob:'));
 assert.equal(await page.locator('[name="allowKeepsake"]').isChecked(),false);
 await page.locator('[name="prompt"]').fill('PRIVATE-NOT-FOR-EXPORT');await page.locator('[name="story"]').fill('PRIVATE-STORY');await page.locator('[name="confirmed"]').check();
 await page.locator('#question-form [type="submit"]').click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.locator('[data-action="start"]').click();
 for(let round=0;round<3;round++){
   if(round<2){await page.locator('[data-action="choose"][data-choice="0"]').click();await page.locator('[data-action="answer"]').click();}
   else await page.locator('[data-action="demo-answers"]').click();
   await page.locator('[data-action="next"]').click();
 }
 await page.getByText('광고 위치 체험',{exact:true}).waitFor();
 assert.equal(await page.locator('.interstitial-demo').count(),1);
 await page.locator('#modal .button[data-action="close-modal"]').click();
 assert.equal(await page.evaluate(()=>document.body.dataset.screen),'finished');
 assert.equal(await page.locator('[data-action="memory-preview"]').count(),1);
 assert.match(await page.locator('.memory-offer').innerText(),/US\$0.99/);
 assert.match(await page.locator('.memory-offer').innerText(),/추억 2개/);
 await page.screenshot({path:path.join(out,'results.png'),fullPage:true,animations:'disabled'});
 await page.locator('[data-action="memory-preview"]').click();await page.locator('[data-action="memory-save"]').waitFor();
 assert.equal(await page.locator('.book-preview .memory-page').count(),2);
 assert.equal(await page.locator('.book-preview .memory-image').count(),3);
 const sampleSize=await page.locator('.book-preview .memory-image').first().evaluate(el=>[el.naturalWidth,el.naturalHeight]);
 assert.equal(sampleSize[0],1200);assert.ok(Math.abs(sampleSize[0]/sampleSize[1]-700/520)<.002);
 assert.ok(!(await page.locator('.book-preview').innerText()).includes('PRIVATE-NOT-FOR-EXPORT'));
 assert.ok(!(await page.locator('.book-preview').innerText()).includes('PRIVATE-STORY'));
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`preview width ${width}`);assert.equal(await page.locator('#modal').evaluate(el=>el.scrollWidth>el.clientWidth),false);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'memory-preview.png'),fullPage:true});
 await page.locator('#book-reader').evaluate(el=>{const event=new Event('touchstart');event.changedTouches=[{clientX:300,clientY:200}];el.dispatchEvent(event);});
 await page.locator('#book-reader').evaluate(el=>{const event=new Event('touchend');event.changedTouches=[{clientX:100,clientY:210}];el.dispatchEvent(event);});
 assert.equal(await page.locator('.memory-book > :visible').count(),1);
 await page.locator('#book-reader').focus();await page.keyboard.press('ArrowLeft');
 assert.equal(await page.getByRole('button',{name:'이전 페이지',exact:true}).isDisabled(),true);
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'다음 페이지',exact:true}).click();
 await page.waitForTimeout(100);assert.equal(await page.locator('.memory-book > :visible').count(),2);
 await page.screenshot({path:path.join(out,'book-spread.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const pdfEvent=page.waitForEvent('download',{timeout:120000});await page.locator('[data-action="memory-pdf"]').click();
 const pdf=await pdfEvent;assert.equal(pdf.suggestedFilename(),'Then-Us-Memory-Book.pdf');await pdf.saveAs(path.join(out,'downloaded-book.pdf'));
 assert.ok((await readFile(path.join(out,'downloaded-book.pdf'))).subarray(0,8).toString().startsWith('%PDF-1.4'));
 const longPDFEvent=page.waitForEvent('download',{timeout:120000});
 await page.evaluate(async()=>{
  const {renderMemoryHTML}=await import('./releases/0.3.6/memory.js'),{downloadBookPDF}=await import('./releases/0.3.6/book-viewer.js');
  const text='긴 이야기를 페이지 끝까지 안전하게 담는지 확인합니다. '.repeat(20);
  const players=Array.from({length:8},(_,i)=>({name:('참가자'+i+'가나다라마바사아자차카타파하').slice(0,16),score:100}));
  const entries=players.map((p,i)=>({round:i,photoId:'long'+i,author:p.name,story:text.slice(0,240),prompt:text.slice(0,160),options:Array(4).fill(text.slice(0,60)),correctIndex:0,responses:players.map(p=>({name:p.name,answer:text.slice(0,60),correct:false}))}));
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=720;const ctx=canvas.getContext('2d');ctx.fillStyle='#c6d7cf';ctx.fillRect(0,0,400,720);
  const images=Object.fromEntries(entries.map(e=>[e.photoId,canvas.toDataURL('image/jpeg')]));
  await downloadBookPDF(renderMemoryHTML({title:text.slice(0,40),date:'2026-10-13',players,entries,sample:true},images));
 });
 const longPDF=await longPDFEvent;await longPDF.saveAs(path.join(out,'downloaded-long-book.pdf'));
 // Version application remains blocked with a private album dialog open.
 await page.route('**/version.json?*',async route=>{const r=await route.fetch();const v=await r.json();v.version='0.3.7';await route.fulfill({response:r,json:v});});
 await page.evaluate(()=>document.getElementById('check-update').click());await page.locator('#apply-update').waitFor();assert.equal(await page.locator('#apply-update').isDisabled(),true);
 const downloadEvent=page.waitForEvent('download');await page.locator('[data-action="memory-save"]').click();const download=await downloadEvent;
 assert.equal(download.suggestedFilename(),'Then-Us-Memory-Book-TEST.html');await download.saveAs(path.join(out,'memory.html'));
 const album=await readFile(path.join(out,'memory.html'),'utf8');assert.ok(!album.includes('PRIVATE-STORY'));assert.ok(!album.includes('PRIVATE-NOT-FOR-EXPORT'));assert.ok(album.includes('실제 결제 없음'));assert.ok(album.includes('data:image/jpeg;base64,'));
 assert.ok(!album.includes('<ol class="options">'));assert.ok(!album.includes('<div class="responses">'));assert.ok(album.includes('class="answer-only"'));
 assert.ok(!album.includes('blob:'));assert.ok(!album.includes('DEMO2026'));assert.ok(!album.includes('<script'));
 await page.locator('#memory-choices').check();
 // All styles and palettes use the same preview/export markup; check mobile and print.
 for(const template of ['photobook','polaroid','album']){
   await page.locator('#memory-template').selectOption(template);
   assert.equal(await page.locator('#memory-choices').isChecked(),true);
   for(const palette of ['cream','peach','sage']){
     await page.locator('#memory-palette').selectOption(palette);
     assert.equal(await page.locator(`.book-preview .template-${template}.palette-${palette}`).count(),1);
     for(const width of [320,390,768,1440]){
       await page.setViewportSize({width,height:900});
       assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${template}/${palette}/${width}`);
       assert.equal(await page.locator('#modal').evaluate(el=>el.scrollWidth>el.clientWidth),false);
     }
   }
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:path.join(out,`${template}-preview.png`),fullPage:true,animations:'disabled'});
   const pending=page.waitForEvent('download');await page.locator('[data-action="memory-save"]').click();
   const chosen=await pending;const file=path.join(out,`${template}.html`);await chosen.saveAs(file);
   const content=await readFile(file,'utf8');assert.ok(content.includes(`class="memory-book template-${template} palette-sage"`));
   assert.ok(content.includes('<ol class="options">'));assert.ok(content.includes('<div class="responses">'));assert.ok(!content.includes('PRIVATE-STORY'));assert.ok(!content.includes('PRIVATE-NOT-FOR-EXPORT'));
   const saved=await context.newPage();await saved.goto('file://'+file);await saved.locator('.memory-image').first().waitFor();
   assert.equal(await saved.locator('.book-cover').count(),1);assert.equal(await saved.locator('.book-ending').count(),1);
   assert.equal(await saved.locator('.memory-page').count(),2);
   const previewCSS=await page.locator('.memory-book').evaluate(el=>getComputedStyle(el).getPropertyValue('--paper'));
   assert.equal(await saved.locator('.memory-book').evaluate(el=>getComputedStyle(el).getPropertyValue('--paper')),previewCSS);
   await saved.setViewportSize({width:390,height:844});
   const textStyle=el=>{const s=getComputedStyle(el);return [s.fontSize,s.lineHeight,s.color,s.letterSpacing]};
   assert.deepEqual(await saved.locator('.responses p').first().evaluate(textStyle),await page.locator('.responses p').first().evaluate(textStyle));
   assert.equal(await saved.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await saved.screenshot({path:path.join(out,`${template}-album.png`),fullPage:true});
   await saved.pdf({path:path.join(out,`${template}.pdf`),format:'A4',printBackground:true});await saved.close();
 }
 await page.locator('#modal .modal-close').click();assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'memory-preview');assert.equal(await page.locator('#apply-update').isDisabled(),false);
 await page.locator('[data-action="home"]').last().click();await page.locator('#modal [data-action="confirm"]').click();assert.equal(await page.evaluate(()=>document.body.dataset.screen),'home');
 assert.equal(await page.locator('[data-action="memory-preview"]').count(),0);
 await page.getByRole('button',{name:'사진은 어떻게 보관되나요?',exact:true}).click();assert.equal(await page.locator('#modal').evaluate(el=>el.classList.contains('memory-modal')),false);await page.getByRole('button',{name:'닫기',exact:true}).click();
 assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(await page.evaluate(()=>sessionStorage.length),0);assert.equal(await page.evaluate(()=>navigator.serviceWorker.getRegistrations().then(r=>r.length)),0);
 assert.ok(!requests.some(url=>url.includes('/api/')));assert.ok(!requests.some(url=>!url.startsWith(base)&&!url.startsWith('data:')&&!url.startsWith('blob:')&&!url.startsWith('file:')));
 assert.deepEqual(errors,[]);
 console.log('BROWSER PASS: free quiz, one optional product, upload save permission off, denied photo/story excluded, one post-game ad placeholder, three templates and three palettes, local album download/render/print, update deferral, privacy reset and 320/390/768/1440 widths. No real billing, ad requests or multiplayer.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
