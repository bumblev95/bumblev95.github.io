import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../src/server.mjs';
const pageOrigin='https://bumblev95.github.io';
const jpeg=await readFile(new URL('./fixtures/sample.jpg',import.meta.url));
async function harness(t){
 const dir=await mkdtemp(path.join(tmpdir(),'gu-pages-'));
 let app=await createApp({gameClock:()=>100000,dataDir:dir,frontendOrigins:pageOrigin});
 async function listen(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${app.server.address().port}`;}
 let base=await listen();
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 async function request(route,secret,body,extra={}){
  const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:pageOrigin,...(secret?{Authorization:'Bearer '+secret}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...extra.headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000),...extra});
  return {status:r.status,headers:r.headers,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.arrayBuffer()};
 }
 async function create(){const r=await request('/api/rooms',null,{nickname:'Jack',consent:true});assert.equal(r.status,201);return {code:r.data.code,id:r.data.you,secret:r.data.sessionToken};}
 const call=(p,route,body,extra)=>request(`/api/rooms/${p.code}/${route}`,p.secret,body,extra);
 return {dir,request,create,call,get base(){return base;},get app(){return app;},async restart(){await app.close();app=await createApp({gameClock:()=>100000,dataDir:dir,frontendOrigins:pageOrigin});base=await listen();}};
}
test('Pages origin preflight accepts exact origin and bearer headers, rejects other origins',async t=>{
 const h=await harness(t);
 for(const origin of [pageOrigin,'https://attacker.example','https://bumblev95.github.io.attacker.example']){
  const r=await fetch(h.base+'/api/rooms',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,x-photo-consent'}});
  assert.equal(r.status,origin===pageOrigin?204:403);
  assert.equal(r.headers.get('access-control-allow-origin'),origin===pageOrigin?pageOrigin:null);
  assert.equal(r.headers.get('access-control-allow-credentials'),null);
 }
});
test('bearer sessions survive restart and never appear in state, SSE, or invitation URLs',async t=>{
 const h=await harness(t),a=await h.create();assert.match(a.secret,/^[a-f0-9]{64}$/);
 await h.restart();const r=await h.call(a,'state');assert.equal(r.status,200);assert.equal(r.data.you,a.id);assert.equal(r.data.sessionToken,undefined);assert.equal(JSON.stringify(r.data).includes(a.secret),false);
 assert.equal((await h.request(`/api/rooms/${a.code}/state`,a.secret.slice(1))).status,401);
 const abort=new AbortController();const stream=await fetch(h.base+`/api/rooms/${a.code}/events`,{headers:{Origin:pageOrigin,Authorization:'Bearer '+a.secret},signal:abort.signal});
 const reader=stream.body.getReader();const chunk=new TextDecoder().decode((await reader.read()).value);assert.equal(chunk.includes(a.secret),false);abort.abort();await reader.cancel().catch(()=>{});
});
test('Pages clients complete two-person game over authenticated HTTP and reconnect without replaying answers',async t=>{
 const h=await harness(t),a=await h.create();
 const joined=await h.request(`/api/rooms/${a.code}/join`,null,{nickname:'Kay',consent:true});
 const b={code:a.code,id:joined.data.you,secret:joined.data.sessionToken};
 assert.equal(joined.data.access,'pending');assert.equal(joined.data.view,undefined);
 await h.call(a,'approve',{playerId:b.id});
 async function question(p){
  const upload=await fetch(h.base+`/api/rooms/${p.code}/upload`,{method:'POST',headers:{Origin:pageOrigin,Authorization:'Bearer '+p.secret,'Content-Type':'image/jpeg','X-Photo-Consent':'yes'},body:jpeg});
  assert.equal(upload.status,201);const {photoId}=await upload.json();
  const q=await h.call(p,'action',{type:'submitQuestion',photoId,prompt:'어디였지?',options:['바다','산','집','카페'],correctIndex:0,story:'그날의 기억',confirmed:true});assert.equal(q.status,200);return photoId;
 }
 const aPhoto=await question(a);await question(b);
 assert.equal((await h.call(b,'action',{type:'start'})).status,409);
 assert.equal((await h.call(b,'photo/'+aPhoto)).status,403);
 await h.call(a,'action',{type:'start'});
 const before=await h.call(b,'state');assert.equal(before.data.view.current.correctIndex,undefined);assert.equal((await h.call(b,'photo/'+aPhoto)).status,200);
 const duplicate=await Promise.all([h.call(b,'action',{type:'answer',round:0,choice:0}),h.call(b,'action',{type:'answer',round:0,choice:0})]);assert.deepEqual(duplicate.map(x=>x.status).sort(),[200,409]);
 await h.restart();let restored=await h.call(b,'state');assert.equal(restored.data.view.phase,'reveal');assert.equal(restored.data.view.players.find(p=>p.id===b.id).score,100);
 await h.call(b,'action',{type:'next',round:0});assert.equal((await h.call(b,'state')).data.view.round,0); // guest is not this round's author/host
 await h.call(a,'action',{type:'next',round:0});
 assert.equal((await h.call(b,'action',{type:'answer',round:1,choice:0})).status,409);
 await h.call(a,'action',{type:'answer',round:1,choice:0});assert.equal((await h.call(b,'action',{type:'next',round:1})).status,409);const end=await h.call(a,'action',{type:'next',round:1});
 assert.equal(end.data.view.phase,'finished');assert.deepEqual(end.data.view.players.map(p=>p.score),[100,100]);assert.equal(end.data.mediaStatus,'done');assert.equal((await h.call(a,'photo/'+aPhoto)).status,410);
 await assert.rejects(access(path.join(h.dir,'rooms',a.code,'media')));
});
test('expiry sweep deletes abandoned media without a visitor triggering cleanup',async t=>{
 const h=await harness(t),a=await h.create();const file=path.join(h.dir,'rooms',a.code,'room.json');
 const room=JSON.parse(await readFile(file,'utf8'));room.expiresAt=Date.now()-1;await writeFile(file,JSON.stringify(room));await h.app.sweep();await assert.rejects(access(file));
});
test('server assets are confined to the app and runtime config names the current API origin',async t=>{
 const h=await harness(t);
 const config=await h.request('/geuttae-uri/runtime-config.json');assert.equal(config.data.apiBase,h.base);
 for(const p of ['/geuttae-uri/server/src/server.mjs','/geuttae-uri/server/tests/fixtures/sample.jpg','/geuttae-uri/README.md','/index.html'])assert.equal((await h.request(p)).status,404);
 assert.equal((await h.request('/geuttae-uri/')).status,200);
});
