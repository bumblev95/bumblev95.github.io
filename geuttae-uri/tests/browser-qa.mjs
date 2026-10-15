import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=fileURLToPath(new URL('./qa-output/',import.meta.url));await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  try{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname.endsWith('/'))pathname+='index.html';const file=path.resolve(root,'.'+pathname);assert.ok(file.startsWith(root+path.sep));const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({args:['--no-sandbox']});
const errors=[],requests=[];
try{
 const context=await browser.newContext({locale:'ko-KR',viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('dialog',d=>d.accept());
 await page.goto(base+'/geuttae-uri/');await page.getByText('TEST v0.5.2',{exact:true}).waitFor({state:'attached'});
 assert.equal(await page.locator('[data-action="memory-preview"]').count(),0);
 assert.equal(await page.locator('.banner-demo').count(),1);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`home width ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'home.png'),fullPage:true});
 await page.locator('[data-action="demo"]').first().click();
 await page.locator('[data-action="compose"]').first().click();
 // Select a real local JPEG; save permission defaults to off for a changed photo.
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=100;const g=c.getContext('2d');g.fillStyle='#e8bca8';g.fillRect(0,0,120,100);return c.toDataURL('image/jpeg').split(',')[1];});
 await page.locator('#photo-file').setInputFiles({name:'private.jpg',mimeType:'image/jpeg',buffer:Buffer.from(data,'base64')});
 await page.waitForFunction(()=>document.querySelector('#photo-pick img')?.src.startsWith('blob:'));
 assert.equal(await page.locator('[name="allowKeepsake"]').isChecked(),false);
 await page.locator('[name="prompt"]').fill('PRIVATE-NOT-FOR-EXPORT');await page.locator('[name="story"]').fill('PRIVATE-STORY');await page.locator('[name="confirmed"]').check();
 await page.locator('[name="prompt"]').fill('   ');await page.locator('[name="confirmed"]').check();await page.locator('#question-form [type="submit"]').click();
 assert.equal(await page.evaluate(()=>document.activeElement.name),'prompt');assert.match(await page.locator('#composer-error').innerText(),/질문을 적어/);
 await page.locator('[name="prompt"]').fill('PRIVATE-NOT-FOR-EXPORT');
 await page.locator('[name="option1"]').fill(await page.locator('[name="option0"]').inputValue());
 await page.locator('[name="confirmed"]').check();await page.locator('#question-form [type="submit"]').click();
 await page.getByText('같은 보기가 있어요. 서로 다르게 적어 주세요.',{exact:true}).first().waitFor();
 assert.equal(await page.locator('[name="option1"]').getAttribute('aria-invalid'),'true');
 await page.locator('[name="option1"]').fill('친구들과 산책하기');await page.locator('[name="confirmed"]').check();
 assert.match(await page.locator('#composer-progress').innerText(),/✓ 사진 · ✓ 질문 · ✓ 보기 · ✓ 정답/);
 await page.locator('#question-form [type="submit"]').click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.locator('[data-action="start"]').click();
 await page.locator('[data-action="zoom"]').first().click();await page.locator('.zoom-photo').evaluate(img=>img.decode());
 for(const [w,h] of [[390,844],[844,390]]){await page.setViewportSize({width:w,height:h});for(const [iw,ih] of [[300,900],[900,300]]){await page.locator('.zoom-photo').evaluate(async(img,[iw,ih])=>{const c=document.createElement('canvas');c.width=iw;c.height=ih;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,iw,ih);g.strokeStyle='red';g.lineWidth=20;g.strokeRect(10,10,iw-20,ih-20);img.src=c.toDataURL('image/png');await img.decode();},[iw,ih]);const fit=await page.locator('.zoom-photo').evaluate(img=>{const r=img.getBoundingClientRect(),d=img.closest('dialog').getBoundingClientRect();return getComputedStyle(img).objectFit==='contain'&&r.top>=d.top&&r.bottom<=d.bottom&&r.left>=d.left&&r.right<=d.right;});assert.equal(fit,true);}}
 await page.setViewportSize({width:390,height:844});await page.locator('.modal-close').click();
 
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
 await page.locator('[data-action="memory-preview"]').click();await page.locator('[data-action="memory-save"]').waitFor();await page.locator('#memory-customize').evaluate(el=>el.open=true);
 assert.equal(await page.locator('.book-preview .memory-page').count(),2);
 assert.equal(await page.locator('.book-preview .memory-image').count(),3);
 await page.locator('[data-action="book-category"][data-group="memory-layout"]').click();await page.locator('#memory-density input[value="two"]').locator('..').click();assert.equal(await page.locator('.collection-page').count(),1);await page.locator('#memory-density input[value="auto"]').locator('..').click();await page.locator('[data-action="book-category"][data-group="memory-template"]').click();
 assert.equal(await page.locator('#memory-customize select').count(),0);await page.locator('#memory-template').scrollIntoViewIfNeeded();await page.screenshot({path:out+'book-choice-cards.png'});
 assert.equal(await page.locator('.book-appendix').count(),0);assert.equal(await page.locator('#memory-palette input').count(),6);
 // Keep the active choice and the scrollable dialog in place when selecting.
 await page.locator('[data-action="book-category"][data-group="memory-layout"]').click();
 const layoutChoice=page.locator('#memory-layout input[value="gallery"]').locator('..');await layoutChoice.scrollIntoViewIfNeeded();
 const beforeChoice=await page.locator('#modal').evaluate(el=>el.scrollTop);
 await layoutChoice.click();await page.waitForTimeout(100);
 assert.ok(Math.abs(await page.locator('#modal').evaluate(el=>el.scrollTop)-beforeChoice)<3,'design selection must preserve dialog scroll');
 assert.ok(await page.locator('#memory-layout input[value="gallery"]').isChecked());
 await page.screenshot({path:out+'book-stable-choice.png'});
 await page.locator('[data-action="book-category"][data-group="memory-layout"]').click();await page.locator('#memory-layout input[value=\"gallery\"]').locator('..').click();await page.locator('[data-action="book-category"][data-group="memory-font"]').click();await page.locator('#memory-font input[value=\"serif\"]').locator('..').click();await page.locator('[data-action="book-category"][data-group="memory-cover-style"]').click();await page.locator('#memory-cover-style input[value=\"frame\"]').locator('..').click();await page.locator('#memory-message').fill('다시 만나도 우리답게');await page.locator('[data-action="memory-message-apply"]').click();assert.equal(await page.locator('.memory-book').getAttribute('data-layout'),'gallery');assert.equal(await page.locator('.memory-book').getAttribute('data-font'),'serif');assert.match(await page.locator('.cover-motto').innerText(),/다시 만나도/);
 const sampleSize=await page.locator('.book-preview .memory-image').first().evaluate(el=>[el.naturalWidth,el.naturalHeight]);
 // Fully decode the recovered cafe source, including the lower half.
 const cafeComplete=await page.evaluate(async()=>{const img=new Image();img.src='./assets/sample-cafe-v2.jpg';await img.decode();const c=document.createElement('canvas');c.width=c.height=2;c.getContext('2d').drawImage(img,0,0,2,2);return Array.from(c.getContext('2d').getImageData(0,1,2,1).data);});assert.ok(cafeComplete[3]===255&&cafeComplete[7]===255);
 assert.equal(sampleSize[0],1024);assert.equal(sampleSize[1],1024);
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
  const {renderMemoryHTML}=await import('./releases/0.5.2/memory.js'),{downloadBookPDF}=await import('./releases/0.5.2/book-viewer.js');
  const text='긴 이야기를 페이지 끝까지 안전하게 담는지 확인합니다. '.repeat(20);
  const players=Array.from({length:8},(_,i)=>({name:('참가자'+i+'가나다라마바사아자차카타파하').slice(0,16),score:100}));
  const entries=players.map((p,i)=>({round:i,photoId:'long'+i,author:p.name,story:text.slice(0,240),prompt:text.slice(0,160),options:Array(4).fill(text.slice(0,60)),correctIndex:0,responses:players.map(p=>({name:p.name,answer:text.slice(0,60),correct:false}))}));
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=720;const ctx=canvas.getContext('2d');ctx.fillStyle='#c6d7cf';ctx.fillRect(0,0,400,720);
  const images=Object.fromEntries(entries.map(e=>[e.photoId,canvas.toDataURL('image/jpeg')]));
  await downloadBookPDF(renderMemoryHTML({title:text.slice(0,40),date:'2026-10-13',players,entries,sample:true},images));
 });
 const longPDF=await longPDFEvent;await longPDF.saveAs(path.join(out,'downloaded-long-book.pdf'));
 await page.locator('#memory-title').fill('우리 가족의 가을 <추억>');await page.locator('[data-action="memory-title-apply"]').click();
 await page.locator('[data-action="book-category"][data-group="memory-cover"]').click();await page.locator('#memory-cover input').nth(1).locator('..').click();
 assert.equal(await page.locator('.book-cover h1').innerText(),'우리 가족의 가을 <추억>');
 const chosenCover=await page.locator('.book-cover img').getAttribute('src');assert.equal(chosenCover,await page.locator('.memory-page img').nth(1).getAttribute('src'));
 // Version application remains blocked with a private album dialog open.
 await page.route('**/version.json?*',async route=>{const r=await route.fetch();const v=await r.json();v.version='0.4.12';await route.fulfill({response:r,json:v});});
 await page.evaluate(()=>document.getElementById('check-update').click());await page.locator('#apply-update').waitFor();assert.equal(await page.locator('#apply-update').isDisabled(),true);
 const downloadEvent=page.waitForEvent('download');await page.locator('[data-action="memory-save"]').click();const download=await downloadEvent;
 assert.equal(download.suggestedFilename(),'Then-Us-Memory-Book.html');await download.saveAs(path.join(out,'memory.html'));
 const album=await readFile(path.join(out,'memory.html'),'utf8');assert.ok(!album.includes('PRIVATE-STORY'));assert.ok(!album.includes('PRIVATE-NOT-FOR-EXPORT'));assert.ok(album.includes('우리 가족의 가을 &lt;추억&gt;'));assert.ok(album.includes('실제 결제 없음'));assert.ok(album.includes('data:image/jpeg;base64,'));
 assert.ok(!album.includes('<ol class="options">'));assert.ok(!album.includes('<div class="responses">'));assert.ok(!album.includes('<section class="book-appendix">'));assert.ok(!album.includes('class="answer-only"'));
 const cleanBook=await context.newPage();await cleanBook.goto('file://'+path.join(out,'memory.html'));await cleanBook.screenshot({path:path.join(out,'photo-only-modern.png'),fullPage:true});await cleanBook.close();
 assert.ok(!album.includes('blob:'));assert.ok(!album.includes('DEMO2026'));assert.ok(!album.includes('<script'));
 await page.locator('#memory-quiz').locator('..').click();await page.locator('#memory-choices').locator('..').click();
 // All styles and palettes use the same preview/export markup; check mobile and print.
 for(const template of ['photobook','polaroid','album']){
   await page.locator('[data-action="book-category"][data-group="memory-template"]').click();await page.locator(`#memory-template input[value=\"${template}\"]`).locator('..').click();
   assert.equal(await page.locator('#memory-choices').isChecked(),true);
   for(const palette of ['cream','peach','sage']){
     await page.locator('[data-action="book-category"][data-group="memory-palette"]').click();await page.locator(`#memory-palette input[value=\"${palette}\"]`).locator('..').click();
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
 await page.locator('#settings-toggle').click();await page.locator('#settings-dialog [data-action="privacy"]').click();assert.equal(await page.locator('#modal').evaluate(el=>el.classList.contains('memory-modal')),false);await page.getByRole('button',{name:'닫기',exact:true}).click();
 assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(await page.evaluate(()=>sessionStorage.length),0);assert.equal(await page.evaluate(()=>navigator.serviceWorker.getRegistrations().then(r=>r.length)),0);
 assert.ok(!requests.some(url=>url.includes('/api/')));assert.ok(!requests.some(url=>!url.startsWith(base)&&!url.startsWith('data:')&&!url.startsWith('blob:')&&!url.startsWith('file:')));
 assert.deepEqual(errors,[]);
 console.log('BROWSER PASS: free quiz, one optional product, upload save permission off, denied photo/story excluded, one post-game ad placeholder, three templates and three palettes, local album download/render/print, update deferral, privacy reset and 320/390/768/1440 widths. No real billing, ad requests or multiplayer.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
