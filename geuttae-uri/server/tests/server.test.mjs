import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {createApp} from '../src/server.mjs';
const jpeg=await readFile(new URL('./fixtures/sample.jpg',import.meta.url));
async function harness(t,options={}){
 const dir=await mkdtemp(path.join(tmpdir(),'geuttae-test-'));let app=await createApp({dataDir:dir,gameClock:()=>100000,...options});
 async function listen(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${app.server.address().port}`;}
 let base=await listen();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 async function request(url,{cookie,body,raw,headers={}}={}){const res=await fetch(base+url,{method:body!==undefined||raw!==undefined?'POST':'GET',headers:{...(body!==undefined||raw!==undefined?{'Origin':base,'Content-Type':raw?'image/jpeg':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:raw|| (body===undefined?undefined:JSON.stringify(body)),signal:AbortSignal.timeout(5000)});const type=res.headers.get('content-type')||'';const data=type.includes('application/json')?await res.json():Buffer.from(await res.arrayBuffer());return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};}
 async function create(name='방장',settings={}){const r=await request('/api/rooms',{body:{nickname:name,consent:true,...settings}});assert.equal(r.status,201);return {cookie:r.cookie,code:r.data.code,id:r.data.view.you};}
 async function call(p,route,body,extra={}){return request(`/api/rooms/${p.code}/${route}`,{cookie:p.cookie,...(body===undefined?{}:{body}),...extra});}
 async function join(host,name='친구'){const r=await request(`/api/rooms/${host.code}/join`,{body:{nickname:name,consent:true}});assert.equal(r.status,200);return {cookie:r.cookie,code:host.code,id:r.data.you};}
 async function approve(host,p){assert.equal((await call(host,'approve',{playerId:p.id})).status,200);}
 async function photo(p){const r=await call(p,'upload',undefined,{raw:jpeg,headers:{'X-Photo-Consent':'yes'}});assert.equal(r.status,201);return r.data.photoId;}
 async function question(p,id){const photoId=id||await photo(p);const r=await call(p,'action',{type:'submitQuestion',photoId,prompt:'우리 추억은?',options:['바다','산','카페','집'],correctIndex:0,story:'SECRET-STORY',confirmed:true});assert.equal(r.status,200);return photoId;}
 return {dir,get base(){return base;},request,create,call,join,approve,photo,question,get app(){return app;},async restart(){await app.close();app=await createApp({dataDir:dir,gameClock:()=>100000,...options});base=await listen();}};
}
test('nickname, consent and same-origin checks',async t=>{const h=await harness(t);assert.equal((await h.request('/api/rooms',{body:{nickname:'A',consent:false}})).status,400);assert.equal((await h.request('/api/rooms',{body:{nickname:'A',consent:true},headers:{Origin:'https://other.example'}})).status,403);assert.equal((await h.request('/api/rooms',{body:{nickname:'x'.repeat(17),consent:true}})).status,400);});
test('pending participant cannot see photos, participants, or answers until approved',async t=>{const h=await harness(t),host=await h.create(),id=await h.question(host),guest=await h.join(host);const p=await h.call(guest,'state');assert.equal(p.data.access,'pending');assert.equal(p.data.view,undefined);assert.equal((await h.call(guest,'photo/'+id)).status,403);assert.equal((await h.call(guest,'approve',{playerId:guest.id})).status,403);await h.approve(host,guest);assert.equal((await h.call(guest,'photo/'+id)).status,403);assert.equal((await h.call(guest,'state')).data.view.myQuestion,null);});
test('session spoofing and cross-room reads are refused',async t=>{const h=await harness(t),a=await h.create(),b=await h.create('다른방');assert.equal((await h.request(`/api/rooms/${a.code}/state`)).status,401);assert.equal((await h.request(`/api/rooms/${a.code}/state`,{cookie:b.cookie})).status,401);assert.equal((await h.request(`/api/rooms/${a.code}/state`,{cookie:`gu_${a.code}=${a.id}`})).status,401);});
test('only the owner can submit a photo; unknown photo IDs do not bypass access checks',async t=>{const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);const id=await h.photo(a);const result=await h.call(b,'action',{type:'submitQuestion',photoId:id,prompt:'질문',options:['1','2','3','4'],correctIndex:0,story:'',confirmed:true});assert.equal(result.status,403);assert.equal((await h.call(b,'photo/'+id)).status,403);});
test('upload requires consent and actual bounded JPEG bytes',async t=>{const h=await harness(t),a=await h.create();assert.equal((await h.call(a,'upload',undefined,{raw:jpeg})).status,400);assert.equal((await h.call(a,'upload',undefined,{raw:Buffer.from('<script>fake</script>'),headers:{'X-Photo-Consent':'yes'}})).status,400);});
test('author excluded, correct answer hidden, scoring atomic under concurrent duplicate submissions',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a,'친구B'),c=await h.join(a,'친구C');await h.approve(a,b);await h.approve(a,c);await h.question(a);await h.question(b);await h.question(c);await h.call(a,'action',{type:'start'});
 const view=(await h.call(b,'state')).data.view;assert.equal(view.current.correctIndex,undefined);assert.equal(view.current.story,undefined);assert.equal((await h.call(b,'photo/'+view.current.photoId)).status,200);
 assert.equal((await h.call(a,'action',{type:'answer',round:0,choice:0,playerId:b.id})).status,409);
 const attempts=await Promise.all([h.call(b,'action',{type:'answer',round:0,choice:0}),h.call(b,'action',{type:'answer',round:0,choice:0})]);assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);
 const result=await h.call(c,'action',{type:'answer',round:0,choice:1});assert.equal(result.data.view.phase,'reveal');assert.deepEqual(result.data.view.players.map(p=>p.score),[0,100,0]);
});
test('full two-person game ends, deletes all temporary photos, and rejects photo access',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);const id=await h.question(a);await h.question(b);await h.call(a,'action',{type:'start'});await h.call(b,'action',{type:'answer',round:0,choice:0});await h.call(a,'action',{type:'next',round:0});await h.call(a,'action',{type:'answer',round:1,choice:0});const end=await h.call(a,'action',{type:'next',round:1});assert.equal(end.data.mediaStatus,'done');assert.equal(end.data.view.phase,'finished');assert.equal((await h.call(a,'photo/'+id)).status,410);await assert.rejects(access(path.join(h.dir,'rooms',a.code,'media')));assert.deepEqual(end.data.view.result.winners.sort(),[a.id,b.id].sort());
});
test('confirmed report hides only the reporter photo, preserves the game and does not kick its author',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);const id=await h.question(a);await h.question(b);await h.call(a,'action',{type:'start'});
 const report={type:'report',reason:'privacy',round:0,questionId:a.id,confirmed:true};
 for(const change of [{confirmed:false},{reason:'invalid'},{round:1},{questionId:b.id}])assert.equal((await h.call(b,'action',{...report,...change})).status,409);
 const r=await h.call(b,'action',report);assert.equal(r.status,200);assert.equal(r.data.reportReceived,true);assert.equal(r.data.view.phase,'question');assert.deepEqual(r.data.view.players.map(p=>p.score),[0,0]);
 assert.equal((await h.call(b,'photo/'+id)).status,403);assert.equal((await h.call(a,'photo/'+id)).status,200);assert.equal((await h.call(a,'state')).data.access,'active');
 await h.call(b,'action',report);const disk=JSON.parse(await readFile(path.join(h.dir,'rooms',a.code,'room.json'),'utf8'));assert.deepEqual(disk.reports,[]);assert.match(r.data.reportId,/^[a-f0-9-]{36}$/);
 await h.restart();assert.deepEqual((await h.call(b,'state')).data.hiddenPhotoIds,[id]);assert.equal((await h.call(b,'action',{type:'answer',round:0,choice:0})).data.view.phase,'reveal');
});
test('photo hiding is reversible and does not change another participant or scoring',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);const id=await h.question(a);await h.question(b);await h.call(a,'action',{type:'start'});
 const action={type:'hidePhoto',round:0,questionId:a.id,hidden:true};assert.equal((await h.call(b,'action',action)).status,200);assert.equal((await h.call(b,'photo/'+id)).status,403);assert.equal((await h.call(a,'photo/'+id)).status,200);
 assert.equal((await h.call(b,'action',{...action,hidden:false})).status,200);assert.equal((await h.call(b,'photo/'+id)).status,200);
 await h.call(b,'action',{type:'answer',round:0,choice:0});await h.call(a,'action',{type:'next',round:0});assert.equal((await h.call(b,'action',action)).status,409);
});
test('host kick deletes member media and makes existing session unusable',async t=>{const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);await h.question(b);await h.call(a,'kick',{playerId:b.id,confirmed:true});assert.equal((await h.call(b,'state')).data.access,'kicked');assert.equal((await h.call(b,'action',{type:'start'})).status,403);assert.equal((await h.call(b,'join',{nickname:'new',consent:true})).status,403);});
test('server restart restores sessions and game state from disk',async t=>{const h=await harness(t),a=await h.create();await h.question(a);await h.restart();const r=await h.call(a,'state');assert.equal(r.status,200);assert.equal(r.data.view.you,a.id);assert.equal(r.data.view.myQuestion.prompt,'우리 추억은?');});
test('expiry refuses access and deletes abandoned room data',async t=>{const h=await harness(t),a=await h.create();await h.question(a);const file=path.join(h.dir,'rooms',a.code,'room.json'),r=JSON.parse(await readFile(file,'utf8'));r.expiresAt=Date.now()-1;await writeFile(file,JSON.stringify(r));assert.equal((await h.call(a,'state')).status,410);await assert.rejects(access(file));});
test('private state and photos are no-store; no data files can be served as static assets',async t=>{const h=await harness(t),a=await h.create(),id=await h.question(a);for(const route of ['state','photo/'+id]){const r=await h.call(a,route);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');}assert.equal((await h.request(`/data/rooms/${a.code}/room.json`)).status,404);});
async function eventReader(h,p){
 const abort=new AbortController();const res=await fetch(`${h.base}/api/rooms/${p.code}/events`,{headers:{Cookie:p.cookie},signal:abort.signal});assert.equal(res.status,200);
 const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';
 return {async next(predicate){
  const timer=setTimeout(()=>abort.abort(),3000);
  try{for(;;){let end;while((end=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=chunk.split('\n').find(s=>s.startsWith('data: '));if(data){const value=JSON.parse(data.slice(6));if(predicate(value))return value;}}
   const chunk=await reader.read();assert.equal(chunk.done,false,'SSE closed prematurely');buffer+=decoder.decode(chunk.value,{stream:true});
  }}finally{clearTimeout(timer);}
 },async close(){abort.abort();try{await reader.cancel();}catch{}}};
}
test('real SSE transports deliver join and approval to two independent sessions',async t=>{
 const h=await harness(t),a=await h.create();const aEvents=await eventReader(h,a);
 let bEvents;
 try{
  await aEvents.next(v=>v.view?.you===a.id);
  const b=await h.join(a,'새친구');bEvents=await eventReader(h,b);
  const pending=await bEvents.next(v=>v.access==='pending');assert.equal(pending.view,undefined);
  const host=await aEvents.next(v=>v.pending?.some(p=>p.id===b.id));assert.equal(host.pending[0].name,'새친구');
  await h.approve(a,b);
  const approved=await bEvents.next(v=>v.access==='active');assert.equal(approved.view.players.length,2);assert.equal(approved.view.you,b.id);
  assert.equal(approved.view.questions,undefined);
 }finally{await aEvents.close();if(bEvents)await bEvents.close();}
});
test('SSE score changes reach both players with role-specific views',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);await h.question(a);await h.question(b);
 const x=await eventReader(h,a),y=await eventReader(h,b);
 try{
  await h.call(a,'action',{type:'start'});
  const author=await x.next(v=>v.view?.phase==='question'),answerer=await y.next(v=>v.view?.phase==='question');
  assert.equal(author.view.current.correctIndex,0);assert.equal(answerer.view.current.correctIndex,undefined);
  await h.call(b,'action',{type:'answer',round:0,choice:0});
  for(const events of [x,y]){const r=await events.next(v=>v.view?.phase==='reveal');assert.equal(r.view.players.find(p=>p.id===b.id).score,100);assert.equal(r.view.players.find(p=>p.id===a.id).score,0);}
 }finally{await x.close();await y.close();}
});

test('save permission defaults off, rejects non-booleans and can only be changed by the photo owner',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);
 const id=await h.question(a);
 const action={type:'submitQuestion',photoId:id,prompt:'우리 추억은?',options:['바다','산','카페','집'],correctIndex:0,story:'SECRET-STORY',confirmed:true};
 assert.equal((await h.call(a,'state')).data.view.myQuestion.allowKeepsake,false);
 assert.equal((await h.call(a,'action',{...action,allowKeepsake:'true'})).status,409);
 assert.equal((await h.call(b,'action',{...action,allowKeepsake:true})).status,403);
 assert.equal((await h.call(a,'action',{...action,allowKeepsake:true})).data.view.myQuestion.allowKeepsake,true);
 assert.equal((await h.call(a,'action',{...action,allowKeepsake:false})).data.view.myQuestion.allowKeepsake,false);
 await h.question(b);await h.call(a,'action',{type:'start'});await h.call(b,'action',{type:'answer',round:0,choice:0});await h.call(a,'action',{type:'next',round:0});await h.call(a,'action',{type:'answer',round:1,choice:0});
 assert.equal((await h.call(a,'action',{type:'next',round:1})).data.memorySnapshot,undefined);
});

async function allowedQuestion(h,p){
 const id=await h.question(p);
 assert.equal((await h.call(p,'action',{type:'submitQuestion',photoId:id,prompt:'ALLOWED-QUESTION',options:['바다','산','카페','집'],correctIndex:0,story:'ALLOWED-STORY',confirmed:true,allowKeepsake:true})).status,200);
 return id;
}
test('completed finish delivers only consented revealed content to approved callers and SSE, then purges media and transcript',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a,'친구B');await h.approve(a,b);
 const allowed=await allowedQuestion(h,a),denied=await h.question(b),pending=await h.join(a,'미승인');
 // Deny before start; a blocked session cannot receive the completed snapshot.
 await h.call(a,'deny',{playerId:pending.id});
 await h.call(a,'action',{type:'start'});await h.call(b,'action',{type:'answer',round:0,choice:0});
 await h.restart();assert.equal((await h.call(b,'state')).data.view.phase,'reveal');
 const events=await eventReader(h,b);
 try{
  await h.call(a,'action',{type:'next',round:0});await h.call(a,'action',{type:'answer',round:1,choice:0});
  const finish=await h.call(a,'action',{type:'next',round:1});
  const received=await events.next(v=>v.view?.phase==='finished');
  assert.deepEqual(received.memorySnapshot,finish.data.memorySnapshot);
  const snap=finish.data.memorySnapshot;assert.equal(snap.book.sample,false);assert.equal(snap.book.entries.length,1);assert.equal(snap.book.entries[0].photoId,allowed);
  assert.equal(snap.book.entries[0].responses[0].correct,true);assert.equal(snap.book.entries[0].responses[0].name,'친구B');
  assert.deepEqual(Object.keys(snap.images),[allowed]);assert.ok(snap.images[allowed].startsWith('data:image/jpeg;base64,'));
  const serialized=JSON.stringify(snap);assert.ok(!serialized.includes(denied));assert.ok(!serialized.includes('SECRET-STORY'));assert.ok(!serialized.includes('tokenHash'));
  assert.equal(finish.data.mediaStatus,'done');await assert.rejects(access(path.join(h.dir,'rooms',a.code,'media')));
  const disk=await readFile(path.join(h.dir,'rooms',a.code,'room.json'),'utf8');
  assert.ok(!disk.includes('ALLOWED-STORY'));assert.ok(!disk.includes('ALLOWED-QUESTION'));assert.ok(!disk.includes('SECRET-STORY'));assert.ok(!disk.includes('data:image/'));
  assert.deepEqual(JSON.parse(disk).memories,[]);
  for(const p of [a,b,pending])assert.equal((await h.call(p,'state')).data.memorySnapshot,undefined);
  const other=await h.create('별도방');assert.equal((await h.request(`/api/rooms/${a.code}/state`,{cookie:other.cookie})).status,401);
  await h.restart();assert.equal((await h.call(a,'state')).data.memorySnapshot,undefined);
 }finally{await events.close();}
});
for(const type of ['end'])test(`${type} after an allowed reveal never exports a book and purges its transcript`,async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);const id=await allowedQuestion(h,a);await h.question(b);
 await h.call(a,'action',{type:'start'});await h.call(b,'action',{type:'answer',round:0,choice:0});
 const finish=await h.call(a,'action',{type,reason:'privacy'});assert.equal(finish.data.memorySnapshot,undefined);assert.equal(finish.data.mediaStatus,'done');
 assert.equal((await h.call(b,'photo/'+id)).status,410);const disk=await readFile(path.join(h.dir,'rooms',a.code,'room.json'),'utf8');assert.ok(!disk.includes('ALLOWED-STORY'));assert.deepEqual(JSON.parse(disk).memories,[]);
});
test('a missing authorized JPEG does not prevent finish/delete and is explicitly omitted from the export images',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);const id=await allowedQuestion(h,a);await h.question(b);
 await h.call(a,'action',{type:'start'});await h.call(b,'action',{type:'answer',round:0,choice:0});await h.call(a,'action',{type:'next',round:0});await h.call(a,'action',{type:'answer',round:1,choice:0});
 await rm(path.join(h.dir,'rooms',a.code,'media',id+'.jpg'));const finish=await h.call(a,'action',{type:'next',round:1});
 assert.equal(finish.status,200);assert.equal(finish.data.mediaStatus,'done');assert.deepEqual(finish.data.memorySnapshot.missing,[id]);assert.deepEqual(finish.data.memorySnapshot.images,{});
});
test('five concurrent rooms finish independently and rematch preserves membership but rejects stale actions',async t=>{
 const h=await harness(t),started=performance.now();
 await Promise.all(Array.from({length:5},async(_,i)=>{
 const a=await h.create('방장'+i),b=await h.join(a,'친구'+i);await h.approve(a,b);const photo=await h.question(a);await h.question(b);
 assert.equal((await h.call(a,'action',{type:'start'})).status,200);
 await h.call(b,'action',{type:'answer',round:0,choice:0});await h.call(a,'action',{type:'next',round:0});
 await h.call(a,'action',{type:'answer',round:1,choice:0});await h.call(a,'action',{type:'next',round:1});
 assert.equal((await h.call(b,'action',{type:'rematch',confirmed:true})).status,409);
 const result=await h.call(a,'action',{type:'rematch',confirmed:true});assert.equal(result.status,200);assert.equal(result.data.gameNumber,1);assert.equal(result.data.view.phase,'lobby');assert.ok(result.data.view.players.every(p=>p.score===0));assert.deepEqual(result.data.view.players.map(p=>p.id),[a.id,b.id]);
 assert.equal((await h.call(a,'action',{type:'start',gameNumber:0})).status,409);assert.equal((await h.call(a,'action',{type:'rematch',gameNumber:0,confirmed:true})).status,409);assert.equal((await h.call(a,'photo/'+photo)).status,403);
 assert.equal((await h.call(b,'state')).data.gameNumber,1);
 }));console.log('Concurrent room smoke test: 5 rooms / 10 participants, '+Math.round(performance.now()-started)+'ms. Local test, not a production capacity guarantee.');
});
test('timed modes share deadlines, reject late answers, preserve points and restart safely',async t=>{
 let now=100000;const h=await harness(t,{gameClock:()=>now});
 for(const seconds of [10,20,30]){const p=await h.create('설정',{timeLimitSeconds:seconds,mode:'party'});assert.equal((await h.call(p,'state')).data.timeLimitSeconds,seconds);}
 assert.equal((await h.request('/api/rooms',{body:{nickname:'오류',consent:true,timeLimitSeconds:60}})).status,400);
 const a=await h.create(),b=await h.join(a),c=await h.join(a,'세번째');await h.approve(a,b);await h.approve(a,c);for(const p of [a,b,c])await h.question(p);
 const start=await h.call(a,'action',{type:'start'});assert.equal(start.data.roundDeadlineAt,now+20000);assert.equal((await h.call(b,'state')).data.roundDeadlineAt,start.data.roundDeadlineAt);
 assert.equal((await h.call(a,'action',{type:'reveal',round:0,confirmed:true})).status,409);
 await h.call(b,'action',{type:'answer',round:0,choice:0});assert.equal((await h.call(a,'state')).data.view.phase,'question');
 now+=20000;assert.equal((await h.call(c,'action',{type:'answer',round:0,choice:0})).status,409);
 let v=(await h.call(a,'state')).data.view;assert.equal(v.phase,'reveal');assert.deepEqual(v.players.map(p=>p.score),[0,100,0]);assert.equal(v.awards[c.id],0);
 assert.equal((await h.call(b,'action',{type:'next',round:0})).status,409);const next=await h.call(a,'action',{type:'next',round:0});assert.equal(next.data.roundDeadlineAt,now+20000);
 await h.restart();assert.equal((await h.call(c,'state')).data.roundDeadlineAt,next.data.roundDeadlineAt);now+=20000;v=(await h.call(c,'state')).data.view;assert.equal(v.phase,'reveal');assert.deepEqual(v.players.map(p=>p.score),[0,100,0]);
 assert.deepEqual((await h.call(a,'state')).data.view.players.map(p=>p.score),[0,100,0]);
});
test('family mode has no deadline and optional scoring',async t=>{
 let now=100000;const h=await harness(t,{gameClock:()=>now}),a=await h.create('가족',{mode:'family',timeLimitSeconds:30}),b=await h.join(a);await h.approve(a,b);await h.question(a);await h.question(b);await h.call(a,'action',{type:'start'});
 now+=1000000;const state=await h.call(b,'state');assert.equal(state.data.timeLimitSeconds,0);assert.equal(state.data.roundDeadlineAt,null);assert.equal(state.data.view.phase,'question');assert.equal(state.data.view.scoring,false);
 await h.call(b,'action',{type:'answer',round:0,choice:0});assert.deepEqual((await h.call(a,'state')).data.view.players.map(p=>p.score),[0,0]);
 const scored=await h.create('점수 가족',{mode:'family',familyScoring:true});assert.equal((await h.call(scored,'state')).data.view.scoring,true);
});
test('deadline automatically reveals over SSE without a state poll or host action',async t=>{
 let now=100000;const h=await harness(t,{gameClock:()=>now}),a=await h.create(),b=await h.join(a);await h.approve(a,b);await h.question(a);await h.question(b);
 const events=await eventReader(h,b);try{await h.call(a,'action',{type:'start'});await events.next(v=>v.view?.phase==='question');now+=20000;const revealed=await events.next(v=>v.view?.phase==='reveal');assert.equal(revealed.view.awards[b.id],0);assert.equal(revealed.roundDeadlineAt,null);}finally{await events.close();}
});
test('server scores correct answers by remaining time and ignores forged points across restart',async t=>{
 let now=100000;const h=await harness(t,{gameClock:()=>now});
 for(const seconds of [10,20,30]){
 const a=await h.create('방장',{timeLimitSeconds:seconds}),b=await h.join(a),c=await h.join(a,'세번째');await h.approve(a,b);await h.approve(a,c);for(const p of [a,b,c])await h.question(p);
 await h.call(a,'action',{type:'start'});now+=seconds*250;const first=await h.call(b,'action',{type:'answer',round:0,choice:0,serverPoints:100});assert.deepEqual(first.data.view.awards,{});assert.equal(first.data.view.players.find(p=>p.id===b.id).score,0);
 await h.restart();now+=seconds*500;const reveal=await h.call(c,'action',{type:'answer',round:0,choice:0,serverPoints:100});assert.equal(reveal.data.view.awards[b.id],75);assert.equal(reveal.data.view.awards[c.id],25);assert.equal(reveal.data.view.awards[a.id],0);
 assert.equal((await h.call(c,'action',{type:'answer',round:0,choice:0})).status,409);await h.call(a,'action',{type:'next',round:0});
 await h.call(a,'action',{type:'answer',round:1,choice:1});now+=seconds*1000;const timeout=await h.call(c,'state');assert.equal(timeout.data.view.awards[a.id],0);assert.equal(timeout.data.view.awards[c.id],0);assert.deepEqual(timeout.data.view.players.map(p=>p.score),[0,75,25]);
 }
 const a=await h.create('가족',{mode:'family',familyScoring:true}),b=await h.join(a);await h.approve(a,b);await h.question(a);await h.question(b);await h.call(a,'action',{type:'start'});now+=1000000;const family=await h.call(b,'action',{type:'answer',round:0,choice:0,serverPoints:0});assert.equal(family.data.view.awards[b.id],100);
});
test('optional party missions are shared, skippable, permission checked and never change scores or block next',async t=>{
 const h=await harness(t),a=await h.create('방장',{mode:'party',partyMissions:true}),b=await h.join(a),c=await h.join(a,'다른친구');await h.approve(a,b);await h.approve(a,c);for(const p of [a,b,c])await h.question(p);
 await h.call(a,'action',{type:'start'});assert.equal((await h.call(b,'state')).data.view.partyMission,null);await h.call(b,'action',{type:'answer',round:0,choice:1});await h.call(c,'action',{type:'answer',round:0,choice:0});
 let v=(await h.call(a,'state')).data.view;assert.equal(v.partyMission.targetId,b.id);assert.equal(v.partyMission.status,'pending');assert.deepEqual((await h.call(b,'state')).data.view.partyMission,v.partyMission);
 assert.equal((await h.call(c,'action',{type:'missionDone',round:0})).status,409);assert.equal((await h.call(c,'action',{type:'missionSkip',round:0})).status,409);
 const scores=v.players.map(p=>p.score);await h.restart();assert.equal((await h.call(b,'state')).data.view.partyMission.status,'pending');
 const done=await h.call(b,'action',{type:'missionDone',round:0});assert.equal(done.data.view.partyMission.status,'done');assert.deepEqual(done.data.view.players.map(p=>p.score),scores);assert.equal((await h.call(b,'action',{type:'missionSkip',round:0})).status,409);
 await h.call(a,'action',{type:'next',round:0});assert.equal((await h.call(a,'state')).data.view.partyMission,null);assert.equal((await h.call(b,'action',{type:'missionDone',round:0})).status,409);
 await h.call(a,'action',{type:'answer',round:1,choice:1});await h.call(c,'action',{type:'answer',round:1,choice:1});v=(await h.call(a,'state')).data.view;assert.notEqual(v.partyMission.targetId,b.id);
 assert.equal((await h.call(a,'action',{type:'missionSkip',round:1})).data.view.partyMission.status,'skipped');await h.call(a,'action',{type:'next',round:1});await h.call(a,'action',{type:'answer',round:2,choice:0});await h.call(b,'action',{type:'answer',round:2,choice:0});
 assert.equal((await h.call(a,'state')).data.view.partyMission.status,'pending');const end=await h.call(a,'action',{type:'next',round:2});assert.equal(end.data.view.phase,'finished');assert.equal(end.data.view.partyMission,null);
 const again=await h.call(a,'action',{type:'rematch',confirmed:true});assert.equal(again.data.view.partyMissions,true);assert.equal(again.data.view.partyMission,null);
});
test('party missions default off and cannot be enabled in another mode',async t=>{
 const h=await harness(t);for(const settings of [{mode:'party'},{mode:'family',partyMissions:true},{mode:'memory',partyMissions:true}]){const a=await h.create('테스트',settings);assert.equal((await h.call(a,'state')).data.view.partyMissions,false);}
 assert.equal((await h.request('/api/rooms',{body:{nickname:'오류',consent:true,partyMissions:'yes'}})).status,400);
});


test('five photos are independent and non-authors can play without a readiness action',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);const photos=[];
 for(let slot=0;slot<5;slot++){const photoId=await h.photo(a);photos.push(photoId);assert.equal((await h.call(a,'action',{type:'submitQuestion',slot,photoId,prompt:'사진 기억 '+slot,options:['A','B','C','D'],correctIndex:0,story:'우리의 이야기',confirmed:true,allowKeepsake:true})).status,200);}
 for(const id of photos)assert.equal((await h.call(a,'photo/'+id)).status,200);
 const q={type:'submitQuestion',slot:5,photoId:photos[0],prompt:'여섯 번째',options:['A','B','C','D'],correctIndex:0,story:'',confirmed:true};assert.equal((await h.call(a,'action',q)).status,409);assert.equal((await h.call(a,'action',{...q,slot:0,media:'text',photoId:''})).status,409);
 assert.equal((await h.call(a,'action',{type:'start'})).data.view.total,5);let end;
 for(let round=0;round<5;round++){assert.equal((await h.call(a,'action',{type:'answer',round,choice:0})).status,409);await h.call(b,'action',{type:'answer',round,choice:0});end=await h.call(a,'action',{type:'next',round});}
 assert.equal(end.data.view.players.find(p=>p.id===b.id).score,500);assert.equal(end.data.memorySnapshot.book.entries.length,5);assert.equal(end.data.mediaStatus,'done');
});
test('battle host can upload and author more than five; guest uploads and authoring are rejected',async t=>{
 const h=await harness(t),a=await h.create('방장',{mode:'battle'}),b=await h.join(a);await h.approve(a,b);
 assert.equal((await h.call(b,'upload',undefined,{raw:jpeg,headers:{'X-Photo-Consent':'yes'}})).status,403);
 for(let slot=0;slot<7;slot++){const photoId=await h.photo(a);assert.equal((await h.call(a,'action',{type:'submitQuestion',slot,photoId,prompt:'방장의 기억 '+slot,options:['A','B','C','D'],correctIndex:0,story:'',confirmed:true})).status,200);}
 const start=await h.call(a,'action',{type:'start'});assert.equal(start.data.view.total,7);assert.equal(start.data.view.hostOnlyQuestions,true);
});
test('only a confirmed host kick can remove a player during a live round, preserve scores and skip removed questions',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a,'B'),c=await h.join(a,'C');await h.approve(a,b);await h.approve(a,c);
 await h.question(a);const id=await h.question(b);await h.question(c);await h.call(a,'action',{type:'start'});
 await h.call(b,'action',{type:'answer',round:0,choice:0});await h.call(c,'action',{type:'answer',round:0,choice:0});await h.call(a,'action',{type:'next',round:0});
 assert.equal((await h.call(c,'kick',{playerId:b.id,confirmed:true})).status,403);assert.equal((await h.call(a,'kick',{playerId:b.id})).status,409);assert.equal((await h.call(a,'kick',{playerId:a.id,confirmed:true})).status,400);
 const bEvents=await eventReader(h,b);try{
 const r=await h.call(a,'kick',{playerId:b.id,confirmed:true});assert.equal(r.status,200);assert.equal(r.data.view.phase,'question');assert.equal(r.data.view.current.authorId,c.id);assert.equal(r.data.view.round,2);assert.deepEqual(r.data.view.players.map(p=>p.score),[0,100]);
 const kicked=await bEvents.next(d=>d.access==='kicked');assert.equal(kicked.view,undefined);
 }finally{await bEvents.close();}
 assert.equal((await h.call(b,'photo/'+id)).status,403);await assert.rejects(access(path.join(h.dir,'rooms',a.code,'media',id+'.jpg')));
 assert.equal((await h.call(a,'action',{type:'answer',round:1,choice:0})).status,409);
 await h.restart();const reveal=await h.call(a,'action',{type:'answer',round:2,choice:0});assert.equal(reveal.data.view.phase,'reveal');assert.deepEqual(reveal.data.view.players.map(p=>p.score),[100,100]);
 assert.equal((await h.call(a,'action',{type:'next',round:2})).data.view.phase,'finished');
});
test('kicking the last unanswered player reveals once and future missing questions are skipped',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a,'B'),c=await h.join(a,'C');await h.approve(a,b);await h.approve(a,c);await h.question(a);await h.question(b);await h.question(c);await h.call(a,'action',{type:'start'});await h.call(b,'action',{type:'answer',round:0,choice:0});
 const r=await h.call(a,'kick',{playerId:c.id,confirmed:true});assert.equal(r.data.view.phase,'reveal');assert.equal(r.data.view.players.find(p=>p.id===b.id).score,100);
 const n=await h.call(a,'action',{type:'next',round:0});assert.equal(n.data.view.current.authorId,b.id);await h.call(a,'action',{type:'answer',round:1,choice:0});assert.equal((await h.call(a,'action',{type:'next',round:1})).data.view.phase,'finished');
});
test('explicit host kick with fewer than two remaining ends without a winner and deletes photos',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);const id=await h.question(a);await h.question(b);await h.call(a,'action',{type:'start'});
 const r=await h.call(a,'kick',{playerId:b.id,confirmed:true});assert.equal(r.data.view.endReason,'not-enough-players');assert.deepEqual(r.data.view.result.winners,[]);assert.equal(r.data.mediaStatus,'done');assert.equal((await h.call(a,'photo/'+id)).status,410);assert.equal(r.data.memorySnapshot,undefined);
});
test('hidden or reported photos never reach that player in a completed book over HTTP or SSE',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.approve(a,b);const id=await allowedQuestion(h,a);await h.question(b);await h.call(a,'action',{type:'start'});
 await h.call(a,'action',{type:'hidePhoto',round:0,questionId:a.id,hidden:true});await h.call(b,'action',{type:'answer',round:0,choice:0});await h.call(a,'action',{type:'next',round:0});await h.call(a,'action',{type:'answer',round:1,choice:0});
 const events=await eventReader(h,a);try{const end=await h.call(a,'action',{type:'next',round:1});assert.equal(end.data.memorySnapshot.book.entries.length,0);assert.equal(end.data.memorySnapshot.images[id],undefined);
 const delivered=await events.next(d=>d.view?.phase==='finished');assert.equal(delivered.memorySnapshot.book.entries.length,0);assert.deepEqual(delivered.memorySnapshot.images,{});
 }finally{await events.close();}
});

test('participant reports and blocking persist, hide the blocked photos and do not remove the player', async t=>{
 const h=await harness(t),host=await h.create(),guest=await h.join(host,'친구');
 await h.approve(host,guest);
 const photoId=await h.question(host);
 await h.question(guest);
 assert.equal((await h.call(host,'action',{type:'start'})).status,200);
 assert.equal((await h.call(guest,'photo/'+photoId)).status,200);
 assert.equal((await h.call(guest,'action',{type:'blockPlayer',playerId:guest.id,confirmed:true})).status,400);
 assert.equal((await h.call(guest,'action',{type:'reportPlayer',playerId:host.id,reason:'invalid',confirmed:true})).status,400);
 let blocked=await h.call(guest,'action',{type:'blockPlayer',playerId:host.id,confirmed:true});
 assert.equal(blocked.status,200);
 assert.equal(blocked.data.playerBlockingSupported,true);
 assert.deepEqual(blocked.data.blockedPlayerIds,[host.id]);
 assert.ok(blocked.data.hiddenPhotoIds.includes(photoId));
 assert.equal((await h.call(guest,'photo/'+photoId)).status,403);
 assert.equal((await h.call(host,'photo/'+photoId)).status,200);
 assert.equal((await h.call(host,'state')).data.access,'active');
 const report=await h.call(guest,'action',{type:'reportPlayer',playerId:host.id,reason:'harassment',confirmed:true});
 assert.equal(report.status,200);
 assert.equal(report.data.reportReceived,true);
 await h.call(guest,'action',{type:'reportPlayer',playerId:host.id,reason:'harassment',confirmed:true});
 const disk=JSON.parse(await readFile(path.join(h.dir,'rooms',host.code,'room.json'),'utf8'));
 assert.deepEqual(disk.reports,[]);
 await h.restart();
 assert.equal((await h.call(guest,'photo/'+photoId)).status,403);
 const unblocked=await h.call(guest,'action',{type:'unblockPlayer',playerId:host.id,confirmed:true});
 assert.equal(unblocked.status,200);
 assert.deepEqual(unblocked.data.blockedPlayerIds,[]);
 assert.equal((await h.call(guest,'photo/'+photoId)).status,200);
});
