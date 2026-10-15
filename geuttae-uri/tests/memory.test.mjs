import test from 'node:test';
import assert from 'node:assert/strict';
import {captureMemory,buildMemoryBook,renderMemoryHTML,memoryProduct} from '../releases/0.5.1/memory.js';
import {setup,applyAction,viewFor} from '../releases/0.5.1/logic.js';
const players=[{id:'a',name:'가영'},{id:'b',name:'잭'}];
function revealed(){let s=setup(players);for(const p of players)s=applyAction(s,p.id,{type:'submitQuestion',photoId:p.id,prompt:'누가 기억할까?',options:['가','나','다','라'],correctIndex:0,story:'즐거운 날',confirmed:true});s=applyAction(s,'a',{type:'start'});return applyAction(s,'b',{type:'answer',choice:0,round:0});}
test('only revealed, explicitly allowed memories can be captured',()=>{const v=viewFor(revealed(),'b');assert.equal(captureMemory(v,false),null);assert.equal(captureMemory(v,undefined),null);assert.equal(captureMemory({...v,phase:'question'},true),null);const entry=captureMemory(v,true);assert.equal(entry.author,'가영');assert.deepEqual(entry.responses,[{name:'잭',answer:'가',correct:true}]);assert.equal(entry.correctIndex,0);});
test('early termination and reports cannot produce a book',()=>{const v=viewFor(revealed(),'b');for(const endReason of ['reported','host-ended'])assert.throws(()=>buildMemoryBook({title:'방',date:'오늘',view:{...v,phase:'finished',endReason},entries:[]}));assert.throws(()=>buildMemoryBook({title:'방',date:'오늘',view:v,entries:[]}));});
test('export does not change quiz scoring or include transport identifiers',()=>{const s=revealed(),v=viewFor(s,'b'),entry=captureMemory(v,true);const book=buildMemoryBook({title:'함께',date:'2026',view:{...v,phase:'finished',endReason:'completed'},entries:[entry]});assert.deepEqual(book.players,[{name:'잭',score:100},{name:'가영',score:0}]);const html=renderMemoryHTML(book,{a:'data:image/jpeg;base64,YQ=='},{includeQuiz:true,includeChoices:true});assert.ok(html.includes('data:image/jpeg;base64,YQ=='));for(const secret of ['sessionToken','DEMO2026','Bearer ','authorId','photoId','/api/'])assert.ok(!html.includes(secret),secret);assert.equal(s.players.find(p=>p.id==='a').score,0);assert.equal(s.players.find(p=>p.id==='b').score,100);});
test('untrusted text and remote or executable image content cannot run',()=>{const v=viewFor(revealed(),'b'),entry=captureMemory(v,true);entry.prompt='<script>alert(1)</script>';entry.story='<img src=x onerror=alert(1)>';entry.author='"><svg onload=alert(1)>';entry.options[0]='</li><script>x</script>';const book=buildMemoryBook({title:'<script>x</script>',date:'today',view:{...v,phase:'finished',endReason:'completed'},entries:[entry]});for(const image of ['https://example.com/track','blob:secret','data:image/svg+xml;base64,YQ==','data:image/jpeg;base64,YQ==" onerror="x']){const html=renderMemoryHTML(book,{a:image});assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<svg onload'));assert.ok(!html.includes('https://example.com'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('이 사진은 포함하지 않았어요.'));}});
test('sample export is never treated as a paid entitlement',()=>{assert.equal(memoryProduct.paymentEnabled,false);assert.equal(memoryProduct.price,'US$0.99');assert.equal(memoryProduct.billing,'one-time');const v=viewFor(revealed(),'b');const book=buildMemoryBook({title:'체험',date:'오늘',view:{...v,phase:'finished',endReason:'completed'},entries:[]});assert.ok(renderMemoryHTML(book).includes('실제 결제 없음'));});
test('all agreed templates retain actual memories, cover and tied winners',()=>{
 const v=viewFor(revealed(),'b'),entry=captureMemory(v,true);
 const book=buildMemoryBook({title:'우리 모임',date:'오늘',view:{...v,phase:'finished',endReason:'completed',players:v.players.map(p=>({...p,score:100}))},entries:[entry]});
 for(const template of ['photobook','polaroid','album'])for(const palette of ['cream','peach','sage']){
  const html=renderMemoryHTML(book,{a:'data:image/jpeg;base64,YQ=='},{template,palette,includeQuiz:true});
  assert.ok(html.includes(`class="memory-book template-${template} palette-${palette}"`));
  for(const text of ['book-cover','book-ending','누가 기억할까?','즐거운 날','오늘의 공동 기억왕','가영 · 잭'])assert.ok(html.includes(text),text);
  assert.equal((html.match(/<img class="memory-image"/g)||[]).length,2);
 }
});
test('design values are allowlisted and cannot inject styles or executable markup',()=>{
 const v=viewFor(revealed(),'b'),entry=captureMemory(v,true);
 const book=buildMemoryBook({title:'우리',date:'오늘',view:{...v,phase:'finished',endReason:'completed'},entries:[entry]});
 const html=renderMemoryHTML(book,{}, {template:'"><script>evil()</script>',palette:'sage; background:url(https://tracker.test)'});
 assert.ok(html.includes('class="memory-book template-photobook palette-cream"'));
 assert.ok(!html.includes('evil()'));assert.ok(!html.includes('tracker.test'));
});
test('photo journal puts the supplied story before the complete quiz record without dropping answers',()=>{
 const v=viewFor(revealed(),'b'),entry=captureMemory(v,true);
 const book=buildMemoryBook({title:'우리 모임',date:'오늘',view:{...v,phase:'finished',endReason:'completed'},entries:[entry]});
 const html=renderMemoryHTML(book,{a:'data:image/jpeg;base64,YQ=='},{includeQuiz:true,includeChoices:true}),start=html.indexOf('<article class="memory-page photo-page '),end=html.indexOf('<section class="book-appendix">');
 assert.ok(start>=0&&end>start);const photoPage=html.slice(start,end),quiz=html.slice(end);
 assert.ok(photoPage.includes(entry.story));assert.ok(!photoPage.includes(entry.prompt));assert.ok(!photoPage.includes('<ol'));
 for(const text of [entry.prompt,...entry.options,entry.responses[0].name,entry.responses[0].answer])assert.ok(quiz.includes(text),text);
 assert.ok(quiz.includes('✓ 정답'));assert.ok(quiz.includes('100점'));assert.ok(html.includes("script-src 'none'"));
});
test('a photo without a supplied story gets no invented journal text and missing images stay excluded',()=>{
 const v=viewFor(revealed(),'b'),entry={...captureMemory(v,true),story:''};
 const book=buildMemoryBook({title:'추억',date:'오늘',view:{...v,phase:'finished',endReason:'completed'},entries:[entry],sample:false});
 const html=renderMemoryHTML(book,{}),photoPage=html.slice(html.indexOf('<article class="memory-page photo-page '),html.indexOf('<section class="book-appendix">'));
 assert.ok(photoPage.includes('no-story'));assert.ok(!photoPage.includes('<blockquote>'));assert.ok(!photoPage.includes('journal-note'));
 assert.ok(photoPage.includes('이 사진은 포함하지 않았어요.'));assert.ok(!html.includes(entry.prompt));assert.ok(html.includes('무료 저장 체험 · 실제 결제 없음'));
 assert.equal((html.match(/<img /g)||[]).length,0);
});
test('custom cover only uses consented entries and escapes its title without mutating the book',()=>{
 const v=viewFor(revealed(),'b'),entry=captureMemory(v,true);
 const book=buildMemoryBook({title:'원래 제목',date:'오늘',view:{...v,phase:'finished',endReason:'completed'},entries:[entry]});
 const html=renderMemoryHTML(book,{[entry.photoId]:'data:image/jpeg;base64,YQ==',denied:'data:image/jpeg;base64,Yg=='},{title:'<script>추억</script>',coverPhotoId:'denied'});
 assert.ok(html.includes('&lt;script&gt;추억&lt;/script&gt;'));assert.ok(!html.includes('data:image/jpeg;base64,Yg=='));assert.equal(book.title,'원래 제목');
});
test('unscored family book preserves stories without rankings or points',()=>{
 const view={phase:'finished',endReason:'completed',scoring:false,players};const book=buildMemoryBook({title:'가족',date:'오늘',view,entries:[]});
 for(const template of ['photobook','polaroid','album']){const html=renderMemoryHTML(book,{}, {template});assert.ok(!html.includes('기억왕'));assert.ok(!html.includes('undefined점'));assert.ok(html.includes('함께한 우리'));}
});
test('photo-only books omit quiz answers and scores unless explicitly selected',()=>{
 const v=viewFor(revealed(),'b'),entry=captureMemory(v,true),book=buildMemoryBook({title:'우리',date:'오늘',view:{...v,phase:'finished',endReason:'completed'},entries:[entry]});
 for(const template of ['photobook','polaroid','album']){const html=renderMemoryHTML(book,{a:'data:image/jpeg;base64,YQ=='},{template});assert.ok(!html.includes('<section class="book-appendix">'));assert.ok(!html.includes(entry.prompt));assert.ok(!html.includes('100점'));assert.ok(!html.includes('오늘의 기억왕'));assert.ok(html.includes(entry.story));}
 const custom=renderMemoryHTML(book,{}, {layout:'gallery',font:'serif',cover:'type',palette:'navy',message:'우리의 <가을>'});assert.ok(custom.includes('data-layout="gallery"'));assert.ok(custom.includes('data-font="serif"'));assert.ok(custom.includes('data-cover="type"'));assert.ok(custom.includes('우리의 &lt;가을&gt;'));
 const invalid=renderMemoryHTML(book,{}, {layout:'" onclick="x',font:'evil',cover:'bad',message:'<script>x</script>'});assert.ok(invalid.includes('data-layout="editorial"'));assert.ok(!invalid.includes('<script>'));assert.ok(!invalid.includes('onclick='));
});
