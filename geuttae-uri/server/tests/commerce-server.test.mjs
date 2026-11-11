import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {roomScopeFor} from '../src/commerce.mjs';
import {commerceFixture} from './helpers/commerce-fixture.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex'),jpeg=await readFile(new URL('./fixtures/sample.jpg',import.meta.url));
const draftInput=()=>({requestId:randomUUID(),memory:'테스트 기억',answer:'바다',focus:'place',consent:true});
const output={prompt:'어디에 갔을까요?',distractors:['산','집','카페']};
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
async function harness(t,{preview=false,generate=async()=>output,dailyLimit=8}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'gu-commerce-api-'));let at=Date.now(),app,base,calls=0;
 const fixture=commerceFixture({now:()=>at});
 async function start(){app=await createApp({dataDir:dir,commerceClock:()=>at,...(preview?{}:{commerceFixture:{verifier:fixture.verifier,resolveAccount:fixture.resolveAccount}}),aiProvider:{roomLimit:1,dailyLimit,generate:async(...args)=>{calls++;return generate(...args);}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
 await start();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 async function request(route,secret,body,extra={}){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:base,...(secret?{Authorization:'Bearer '+secret}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...extra.headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000),...extra});return {status:r.status,data:await r.json()};}
 const call=(p,route,body,extra)=>request(`/api/rooms/${p.code}/${route}`,p.secret,body,extra);
 async function create(accountId=randomUUID()){const r=await request('/api/rooms',null,{nickname:'방장',consent:true,paid:true,credits:999});assert.equal(r.status,201);const p={code:r.data.code,id:r.data.you,secret:r.data.sessionToken,accountId};fixture.bind(p.id,accountId);return p;}
 async function join(a,approved=true){const r=await request(`/api/rooms/${a.code}/join`,null,{nickname:'친구',consent:true});const p={code:a.code,id:r.data.you,secret:r.data.sessionToken,accountId:randomUUID()};fixture.bind(p.id,p.accountId);if(approved)await call(a,'approve',{playerId:p.id});return p;}
 async function scopeFor(p){return roomScopeFor(JSON.parse(await readFile(path.join(dir,'rooms',p.code,'room.json'),'utf8')));}
 async function purchase(p,productId,extra={}){const issued=fixture.issue(p.accountId,productId,{...(productId==='memory_book'?{roomScope:await scopeFor(p)}:{}),...extra});const r=await call(p,'verify-purchase',{receipt:issued.receipt});assert.equal(r.status,200);assert.equal(r.data.testOnly,true);assert.equal(r.data.commerce.paymentEnabled,false);return issued;}
 async function question(p){const r=await call(p,'upload',null,{headers:{Origin:base,Authorization:'Bearer '+p.secret,'Content-Type':'image/jpeg','X-Photo-Consent':'yes'},body:jpeg});assert.equal(r.status,201);const q=await call(p,'action',{type:'submitQuestion',photoId:r.data.photoId,prompt:'어디였지?',options:['바다','산','집','카페'],correctIndex:0,story:'',confirmed:true,allowKeepsake:false});assert.equal(q.status,200);return q;}
 return {dir,fixture,request,call,create,join,purchase,question,scopeFor,get app(){return app;},get calls(){return calls;},get time(){return at;},setTime(n){at=n;},async restart(){await app.close();await start();}};
}
test('public preview has no checkout, trusted account or purchasable entitlement even with forged client flags',async t=>{
 const h=await harness(t,{preview:true}),a=await h.create();const catalog=await h.request('/api/commerce/catalog');assert.equal(catalog.status,200);assert.equal(catalog.data.paymentEnabled,false);assert.deepEqual(catalog.data.products.map(p=>p.id),['memory_book','ad_free']);assert.equal(catalog.data.adsEnabled,false);
 const state=(await h.call(a,'state')).data;assert.equal(state.commerce.mode,'preview');assert.equal(state.commerce.accountLinked,false);assert.equal(state.commerce.ownAi.total,0);assert.equal(state.commerce.hasBookRight,false);assert.equal(state.commerce.freeExportTrial,true);
 for(const body of [{receipt:'fake'},{verified:true,paid:true,credits:999,accountId:a.accountId},{testMode:true,productId:'ultimate_monthly'}])assert.equal((await h.call(a,'verify-purchase',body)).status,503);
 assert.equal(h.app.commerce.ledger.stats().purchases,0);assert.equal((await h.request('/api/health')).data.paymentsEnabled,false);
});
test('pending, blocked, unlinked and cross-room sessions cannot claim purchases or read benefits',async t=>{
 const h=await harness(t),a=await h.create(),pending=await h.join(a,false),other=await h.create();
 assert.equal((await h.call(pending,'benefits')).status,403);assert.equal((await h.call(pending,'verify-purchase',{receipt:'fake'})).status,403);
 assert.equal((await h.request(`/api/rooms/${a.code}/benefits`,other.secret)).status,401);assert.equal((await h.request(`/api/rooms/${a.code}/benefits`)).status,401);
 await h.call(a,'deny',{playerId:pending.id});assert.equal((await h.call(pending,'verify-purchase',{receipt:'fake'})).status,403);
 h.fixture.bind(a.id,null);assert.equal((await h.call(a,'verify-purchase',{receipt:'fake'})).status,403);
});
test('only certified fixture receipts for the authenticated owner and correct room are recorded',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),issued=h.fixture.issue(a.accountId,'ai_100');
 assert.equal((await h.call(b,'verify-purchase',{receipt:issued.receipt})).status,403);
 assert.equal((await h.call(a,'verify-purchase',{receipt:issued.receipt,credits:999})).status,400);
 assert.equal((await h.call(a,'verify-purchase',{receipt:'unrecognized'})).status,400);
 const wrong=h.fixture.issue(a.accountId,'memory_book',{roomScope:hash('different-room')});assert.equal((await h.call(a,'verify-purchase',{receipt:wrong.receipt})).status,403);
 assert.equal(h.app.commerce.ledger.stats().purchases,0);await h.purchase(a,'ai_100');assert.equal((await h.call(a,'benefits')).data.ownAi.total,100);
});
test('approved players share host credits; duplicate generation and repeated restore consume exactly once',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),issued=await h.purchase(a,'ai_100'),input=draftInput();
 assert.equal((await h.call(b,'benefits')).data.ownAi.total,0);assert.equal((await h.call(b,'benefits')).data.roomAiRemaining,100);
 const both=await Promise.all([h.call(b,'ai-draft',input),h.call(b,'ai-draft',input)]);assert.deepEqual(both.map(x=>x.status),[200,200]);assert.equal(h.calls,1);assert.equal((await h.call(a,'benefits')).data.ownAi.pack,99);
 const restore=await h.call(a,'verify-purchase',{receipt:issued.receipt});assert.equal(restore.data.commerce.ownAi.pack,99);assert.equal(h.app.commerce.ledger.stats().committed,1);
 const serialized=JSON.stringify((await h.call(b,'state')).data);for(const secret of [a.accountId,b.accountId,issued.receipt,issued.value.transactionId])assert.ok(!serialized.includes(secret));
 // The paid-fixture balance is authoritative, rather than the free room test limit of 1.
 assert.equal((await h.call(a,'ai-draft',draftInput())).status,200);assert.equal((await h.call(a,'benefits')).data.ownAi.pack,98);
});
test('a guest balance cannot fund a room whose host has no credits',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.purchase(b,'ai_100');
 assert.equal((await h.call(b,'benefits')).data.ownAi.total,100);assert.equal((await h.call(b,'ai-draft',draftInput())).status,429);assert.equal(h.calls,0);
});
test('concurrent generation in different rooms cannot overspend the host final credit',async t=>{
 const entered=deferred(),release=deferred(),h=await harness(t,{generate:()=>{entered.resolve();return release.promise;}}),account=randomUUID(),a=await h.create(account),b=await h.create(account);await h.purchase(a,'ai_100');
 for(let i=0;i<99;i++){const requestId=hash('prior-use-'+i);h.app.commerce.ledger.reserveAi({requestId,inputHash:hash('prior-input'),accountId:account,roomScope:await h.scopeFor(a)});h.app.commerce.ledger.commitAi(requestId);}
 const running=h.call(a,'ai-draft',draftInput());await entered.promise;assert.equal((await h.call(b,'ai-draft',draftInput())).status,429);release.resolve(output);assert.equal((await running).status,200);assert.equal(h.calls,1);assert.equal((await h.call(a,'benefits')).data.ownAi.total,0);
});
test('generation failure and a daily budget refusal return the reserved credit without retrying the provider',async t=>{
 const h=await harness(t,{dailyLimit:1,generate:()=>{throw new Error('PRIVATE-RECEIPT-KEY');}}),a=await h.create();await h.purchase(a,'ai_100');
 const first=await h.call(a,'ai-draft',draftInput());assert.equal(first.status,502);assert.ok(!JSON.stringify(first).includes('PRIVATE-RECEIPT'));assert.equal((await h.call(a,'benefits')).data.ownAi.total,100);
 assert.equal((await h.call(a,'ai-draft',draftInput())).status,429);assert.equal((await h.call(a,'benefits')).data.ownAi.total,100);assert.equal(h.calls,1);assert.equal(h.app.commerce.ledger.stats().pending,0);
});
test('refund during generation prevents draft delivery and cannot be undone by restoring the receipt',async t=>{
 const entered=deferred(),release=deferred(),h=await harness(t,{generate:()=>{entered.resolve();return release.promise;}}),a=await h.create(),issued=await h.purchase(a,'ai_100');
 const running=h.call(a,'ai-draft',draftInput());await entered.promise;await h.app.commerce.verifiedRefund(h.fixture.refund(issued.value.transactionId));release.resolve(output);
 assert.equal((await running).status,502);assert.equal(h.app.commerce.ledger.stats().committed,0);assert.equal((await h.call(a,'benefits')).data.ownAi.total,0);
 const restore=await h.call(a,'verify-purchase',{receipt:issued.receipt});assert.equal(restore.data.commerce.ownAi.total,0);
});
test('a refund denies a cached draft replay and revokes room book benefits',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),issued=await h.purchase(a,'ai_100'),input=draftInput();assert.equal((await h.call(a,'ai-draft',input)).status,200);
 await h.app.commerce.verifiedRefund(h.fixture.refund(issued.value.transactionId));assert.equal((await h.call(a,'ai-draft',input)).status,409);assert.equal(h.calls,1);
 const book=await h.purchase(b,'memory_book');assert.equal((await h.call(a,'benefits')).data.hasBookRight,true);await h.app.commerce.verifiedRefund(h.fixture.refund(book.value.transactionId));assert.equal((await h.call(a,'benefits')).data.hasBookRight,false);
});
test('subscription expiry during generation does not charge, deliver a draft or roll the credit into a new cycle',async t=>{
 const entered=deferred(),release=deferred(),h=await harness(t,{generate:()=>{entered.resolve();return release.promise;}}),a=await h.create(),expires=h.time+1000;
 await h.purchase(a,'ultimate_monthly',{subscriptionId:'test-subscription',periodStart:h.time-1,periodEnd:expires});
 const running=h.call(a,'ai-draft',draftInput());await entered.promise;h.setTime(expires);release.resolve(output);assert.equal((await running).status,502);assert.equal((await h.call(a,'benefits')).data.ownAi.total,0);
});
for(const reason of ['end','expire'])test(`${reason} during generation releases credits and leaves the ledger outside room cleanup`,async t=>{
 const entered=deferred(),release=deferred(),h=await harness(t,{generate:()=>{entered.resolve();return release.promise;}}),a=await h.create();await h.purchase(a,'ai_100');await h.question(a);
 const running=h.call(a,'ai-draft',draftInput());await entered.promise;
 if(reason==='end')await h.call(a,'action',{type:'end'});
 else{const file=path.join(h.dir,'rooms',a.code,'room.json'),room=JSON.parse(await readFile(file,'utf8'));room.expiresAt=Date.now()-1;await writeFile(file,JSON.stringify(room));release.resolve(output);}
 assert.equal((await running).status,reason==='end'?409:410);assert.equal(h.app.commerce.ledger.balance(a.accountId).total,100);await access(path.join(h.dir,'commerce.sqlite'));assert.equal(h.app.commerce.ledger.stats().purchases,1);
});
test('server restart retains purchase consumption, and a missing room request record cannot cause a second generation',async t=>{
 const h=await harness(t),a=await h.create(),issued=await h.purchase(a,'ai_100'),input=draftInput();await h.call(a,'ai-draft',input);await h.restart();
 assert.equal((await h.call(a,'benefits')).data.ownAi.total,99);assert.equal((await h.call(a,'verify-purchase',{receipt:issued.receipt})).data.commerce.ownAi.total,99);
 const file=path.join(h.dir,'rooms',a.code,'room.json'),room=JSON.parse(await readFile(file,'utf8'));room.aiUsage.requests={};await writeFile(file,JSON.stringify(room));
 assert.equal((await h.call(a,'ai-draft',input)).status,409);assert.equal(h.calls,1);assert.equal((await h.call(a,'benefits')).data.ownAi.total,99);
});
test('a book entitlement cannot override photo-owner save consent or manufacture a finished snapshot',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.purchase(a,'memory_book');await h.question(a);await h.question(b);
 assert.equal((await h.call(a,'state')).data.view.myQuestion.allowKeepsake,false);await h.call(a,'action',{type:'start'});await h.call(b,'action',{type:'answer',round:0,choice:0});await h.call(a,'action',{type:'next',round:0});await h.call(a,'action',{type:'answer',round:1,choice:0});
 const finished=await h.call(a,'action',{type:'next',round:1});assert.equal(finished.data.memorySnapshot,undefined);assert.equal(finished.data.commerce.hasBookRight,true);
 for(const resource of ['/geuttae-uri/server/src/commerce.mjs','/geuttae-uri/server/data/commerce.sqlite','/commerce.sqlite','/commerce.sqlite-wal'])assert.equal((await h.request(resource)).status,404);
});
