import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/server.mjs';

const jpeg=await readFile(new URL('./fixtures/sample.jpg',import.meta.url));
const input=()=>({requestId:randomUUID(),memory:'PRIVATE-AI-MEMORY: 바다에 먼저 갔어요.',answer:'바다 보러 가기',focus:'activity',consent:true});
const valid={prompt:'가장 먼저 한 일은?',distractors:['점심 먹기','짐 풀기','기념품 고르기']};
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
async function harness(t,provider={roomLimit:2,dailyLimit:8,generate:async()=>valid}){
 const dir=await mkdtemp(path.join(tmpdir(),'gu-ai-api-'));let app,base;
 async function start(){app=await createApp({dataDir:dir,aiProvider:provider});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
 await start();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 async function request(route,secret,body,extra={}){
  const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:base,...(secret?{Authorization:'Bearer '+secret}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...extra.headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000),...extra});
  return {status:r.status,data:await r.json()};
 }
 async function create(){const r=await request('/api/rooms',null,{nickname:'방장',consent:true});assert.equal(r.status,201);return {code:r.data.code,id:r.data.you,secret:r.data.sessionToken};}
 const call=(p,route,body,extra)=>request(`/api/rooms/${p.code}/${route}`,p.secret,body,extra);
 async function join(a,approved=true){const r=await request(`/api/rooms/${a.code}/join`,null,{nickname:'친구',consent:true});const b={code:a.code,id:r.data.you,secret:r.data.sessionToken};if(approved)assert.equal((await call(a,'approve',{playerId:b.id})).status,200);return b;}
 async function question(p){const r=await call(p,'upload',null,{headers:{Origin:base,Authorization:'Bearer '+p.secret,'Content-Type':'image/jpeg','X-Photo-Consent':'yes'},body:jpeg});assert.equal(r.status,201);return call(p,'action',{type:'submitQuestion',photoId:r.data.photoId,prompt:'어디였지?',options:['바다','산','집','카페'],correctIndex:0,story:'기억',confirmed:true});}
 return {dir,request,create,call,join,question,get app(){return app;},get base(){return base;},async restart(){await app.close();await start();}};
}
test('default server advertises AI disabled and never spends or stores a rejected draft',async t=>{
 const h=await harness(t,null),a=await h.create();assert.equal((await h.request('/api/health')).data.aiEnabled,false);
 assert.equal((await h.call(a,'state')).data.ai.enabled,false);assert.equal((await h.call(a,'ai-draft',input())).status,503);
 await assert.rejects(access(path.join(h.dir,'ai-budget.json')));
});
test('draft endpoint requires active room membership, text consent and an allowed origin',async t=>{
 let calls=0;const h=await harness(t,{roomLimit:2,dailyLimit:8,generate:async()=>{calls++;return valid;}}),a=await h.create(),b=await h.join(a,false),other=await h.create();
 assert.equal((await h.call(b,'ai-draft',input())).status,403);
 assert.equal((await h.request(`/api/rooms/${a.code}/ai-draft`,other.secret,input())).status,403);
 assert.equal((await h.call(a,'ai-draft',{...input(),consent:false})).status,400);
 assert.equal((await h.call(a,'ai-draft',{...input(),photoId:'unwanted-photo'})).status,400);
 assert.equal((await h.call(a,'ai-draft',input(),{headers:{Origin:'https://attacker.example','Content-Type':'application/json',Authorization:'Bearer '+a.secret}})).status,403);
 assert.equal((await h.call(a,'ai-draft')).status,405);assert.equal(calls,0);
});
test('concurrent duplicate requests call the provider once and replay only to their author',async t=>{
 let calls=0;const h=await harness(t,{roomLimit:3,dailyLimit:8,generate:async()=>{calls++;return valid;}}),a=await h.create(),b=await h.join(a),data=input();
 const results=await Promise.all([h.call(a,'ai-draft',data),h.call(a,'ai-draft',data)]);assert.deepEqual(results.map(x=>x.status),[200,200]);assert.deepEqual(results[0].data,results[1].data);assert.equal(calls,1);
 const draft=results[0].data.draft;assert.equal(draft.options[draft.correctIndex],data.answer);assert.equal(draft.story,data.memory);
 assert.equal((await h.call(a,'ai-draft',data)).status,200);assert.equal(calls,1);
 assert.equal((await h.call(a,'ai-draft',{...data,answer:'다른 정답'})).status,409);
 // Identical request IDs from another approved player create a separate private request.
 assert.equal((await h.call(b,'ai-draft',{...data,memory:'친구의 다른 기억'})).status,200);assert.equal(calls,2);
 const room=JSON.parse(await readFile(path.join(h.dir,'rooms',a.code,'room.json'),'utf8'));assert.equal(room.aiUsage.successes,2);
 assert.equal(JSON.parse(await readFile(path.join(h.dir,'ai-budget.json'),'utf8')).attempts,2);
});
test('drafts are not published, persisted, automatically submitted or used to bypass confirmation',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),data=input();assert.equal((await h.call(a,'ai-draft',data)).status,200);
 for(const p of [a,b]){const state=(await h.call(p,'state')).data;assert.equal(state.view.myQuestion,null);assert.ok(!JSON.stringify(state).includes('PRIVATE-AI-MEMORY'));assert.equal(state.draft,undefined);assert.equal(state.ai.requests,undefined);}
 const disk=await readFile(path.join(h.dir,'rooms',a.code,'room.json'),'utf8');assert.ok(!disk.includes(data.memory));assert.ok(!disk.includes(data.answer));assert.ok(!disk.includes(valid.prompt));
 const abort=new AbortController();const response=await fetch(h.base+`/api/rooms/${a.code}/events`,{headers:{Origin:h.base,Authorization:'Bearer '+b.secret},signal:abort.signal});const reader=response.body.getReader();
 try{const chunk=new TextDecoder().decode((await reader.read()).value);assert.ok(!chunk.includes(data.memory));assert.ok(!chunk.includes(valid.prompt));}finally{abort.abort();await reader.cancel().catch(()=>{});}
 await h.question(a);const own=(await h.call(a,'state')).data.view.myQuestion;
 assert.equal((await h.call(a,'action',{type:'submitQuestion',...own,confirmed:false})).status,409);
 for(const resource of ['/geuttae-uri/server/src/ai.mjs','/geuttae-uri/server/data/ai-budget.json','/ai-budget.json'])assert.equal((await h.request(resource)).status,404);
});
test('room allowance is shared and concurrent pending requests cannot oversubscribe it',async t=>{
 const entered=deferred(),release=deferred();let calls=0;
 const h=await harness(t,{roomLimit:1,dailyLimit:8,generate:async()=>{calls++;entered.resolve();return release.promise;}}),a=await h.create(),b=await h.join(a);
 const running=h.call(a,'ai-draft',input());await entered.promise;
 assert.equal((await h.call(b,'ai-draft',input())).status,429);assert.equal((await h.call(b,'state')).data.ai.remaining,0);release.resolve(valid);assert.equal((await running).status,200);
 assert.equal((await h.call(b,'ai-draft',input())).status,429);assert.equal(calls,1);
});
test('daily provider-attempt cap covers all rooms and survives a process restart',async t=>{
 let calls=0;const h=await harness(t,{roomLimit:2,dailyLimit:1,generate:async()=>{calls++;return valid;}}),a=await h.create(),b=await h.create(),data=input();
 assert.equal((await h.call(a,'ai-draft',data)).status,200);await h.restart();
 assert.equal((await h.call(a,'ai-draft',data)).status,409);assert.equal((await h.call(b,'ai-draft',input())).status,429);assert.equal(calls,1);
 assert.equal((await h.call(a,'state')).data.ai.remaining,1);
});
for(const failure of ['provider','invalid'])test(`${failure} failure returns a safe error, refunds room allowance and does not re-call duplicate IDs`,async t=>{
 let calls=0;const h=await harness(t,{roomLimit:1,dailyLimit:2,generate:async()=>{calls++;if(failure==='provider')throw new Error('PRIVATE-PROVIDER-KEY-AND-MEMORY');return {...valid,distractors:['same','same','other']};}}),a=await h.create(),data=input();
 const response=await h.call(a,'ai-draft',data);assert.equal(response.status,502);assert.ok(!JSON.stringify(response).includes('PRIVATE-PROVIDER'));assert.equal((await h.call(a,'state')).data.ai.remaining,1);
 assert.equal((await h.call(a,'ai-draft',data)).status,409);assert.equal(calls,1);
 assert.equal((await h.call(a,'ai-draft',input())).status,502);assert.equal((await h.call(a,'ai-draft',input())).status,429);assert.equal(calls,2);
});
test('timeouts are bounded even if a provider ignores cancellation, and do not consume room allowance',async t=>{
 const h=await harness(t,{roomLimit:1,dailyLimit:2,timeoutMs:30,generate:()=>new Promise(()=>{})}),a=await h.create();
 assert.equal((await h.call(a,'ai-draft',input())).status,502);assert.equal((await h.call(a,'state')).data.ai.remaining,1);
});
for(const action of ['kick','leave','end'])test(`${action} completes during generation and revokes the pending draft without consuming allowance`,async t=>{
 const entered=deferred();const h=await harness(t,{roomLimit:1,dailyLimit:2,generate:()=>{entered.resolve();return new Promise(()=>{});}}),a=await h.create(),b=await h.join(a);
 const actor=action==='end'?a:b,running=h.call(actor,'ai-draft',input());await entered.promise;
 const change=action==='kick'?await h.call(a,'kick',{playerId:b.id,confirmed:true}):action==='leave'?await h.call(b,'leave',{}):await h.call(a,'action',{type:'end'});
 assert.equal(change.status,200);assert.equal((await running).status,409);assert.equal((await h.call(a,'state')).data.ai.remaining,1);
});
test('starting the game cancels a pending draft without delaying gameplay or revealing it',async t=>{
 const entered=deferred();const h=await harness(t,{roomLimit:1,dailyLimit:2,generate:()=>{entered.resolve();return new Promise(()=>{});}}),a=await h.create(),b=await h.join(a);
 await h.question(a);await h.question(b);const running=h.call(a,'ai-draft',input());await entered.promise;
 assert.equal((await h.call(a,'action',{type:'start'})).status,200);assert.equal((await running).status,409);assert.equal((await h.call(a,'ai-draft',input())).status,409);
});
test('a crashed pending reservation is not retried or counted as a success after restart',async t=>{
 let calls=0;const h=await harness(t,{roomLimit:1,dailyLimit:1,generate:async()=>{calls++;return valid;}}),a=await h.create(),data=input();
 await h.call(a,'ai-draft',data);const file=path.join(h.dir,'rooms',a.code,'room.json'),room=JSON.parse(await readFile(file,'utf8'));
 room.aiUsage.successes=0;Object.values(room.aiUsage.requests)[0].status='pending';await writeFile(file,JSON.stringify(room));await h.restart();
 assert.equal((await h.call(a,'state')).data.ai.remaining,1);assert.equal((await h.call(a,'ai-draft',data)).status,409);assert.equal((await h.call(a,'ai-draft',input())).status,429);assert.equal(calls,1);
});
test('expiry during generation denies the draft and deletes all abandoned private files',async t=>{
 const entered=deferred(),release=deferred();const h=await harness(t,{roomLimit:1,dailyLimit:2,generate:async()=>{entered.resolve();return release.promise;}}),a=await h.create();await h.question(a);
 const running=h.call(a,'ai-draft',input());await entered.promise;const file=path.join(h.dir,'rooms',a.code,'room.json'),room=JSON.parse(await readFile(file,'utf8'));room.expiresAt=Date.now()-1;await writeFile(file,JSON.stringify(room));
 release.resolve(valid);assert.equal((await running).status,410);await assert.rejects(access(path.dirname(file)));
});
