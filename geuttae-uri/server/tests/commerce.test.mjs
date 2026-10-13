import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openCommerceLedger,createCommerce,roomScopeFor} from '../src/commerce.mjs';
import {catalog} from '../../releases/0.3.3/products.js';
import {commerceFixture} from './helpers/commerce-fixture.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const roomScope=hash('test-room'),start=Date.parse('2026-10-13T00:00:00Z'),month=30*86400000;
async function harness(t){
 const dir=await mkdtemp(path.join(tmpdir(),'gu-commerce-')),filename=path.join(dir,'commerce.sqlite');let at=start,ledger=await openCommerceLedger(filename,{now:()=>at});
 const fixture=commerceFixture({now:()=>at});t.after(async()=>{ledger.close();await rm(dir,{recursive:true,force:true});});
 return {dir,filename,fixture,get ledger(){return ledger;},setTime(value){at=value;},async grant(accountId,productId,extra={}){const issued=fixture.issue(accountId,productId,extra);ledger.applyPurchase(await fixture.verifier.purchase(issued.receipt,{}));return issued;},
  async revoke(transactionId,extra){ledger.applyRevocation(await fixture.verifier.revocation(fixture.refund(transactionId,extra)));},
  async restart(){ledger.close();ledger=await openCommerceLedger(filename,{now:()=>at});}};
}
const use=(accountId,tag=randomUUID())=>({requestId:hash(tag),inputHash:hash('private-input'),accountId,roomScope});
const cycle=(tag='subscription-1',offset=0)=>({subscriptionId:tag,periodStart:start+offset,periodEnd:start+offset+month});
test('catalog preserves proposed main products and optional packs without turning payments on',()=>{
 assert.equal(catalog.paymentEnabled,false);assert.equal(catalog.aiEnabled,false);assert.equal(catalog.adsEnabled,false);
 assert.equal(catalog.products.find(p=>p.id==='ultimate_monthly').price,'US$7.99 / 월');assert.equal(catalog.products.find(p=>p.id==='memory_book').price,'US$0.99');
 assert.deepEqual(catalog.products.filter(p=>p.kind==='credits').map(p=>[p.credits,p.price]),[[100,null],[300,null]]);
 assert.ok(Object.isFrozen(catalog.products[0]));
});
test('unverified JSON, copied certification and client quantities cannot grant any entitlement',async t=>{
 const h=await harness(t),account=randomUUID(),issued=h.fixture.issue(account,'ai_100');
 for(const value of [issued.value,{...issued.value,verified:true},{...issued.value,paid:true}])assert.throws(()=>h.ledger.applyPurchase(value),e=>e.code==='UNVERIFIED');
 const verified=await h.fixture.verifier.purchase(issued.receipt,{});assert.throws(()=>h.ledger.applyPurchase({...verified}),e=>e.code==='UNVERIFIED');
 const forged=h.fixture.issue(account,'ai_100',{credits:999});await assert.rejects(h.fixture.verifier.purchase(forged.receipt,{}));assert.equal(h.ledger.balance(account).total,0);
});
test('restore is idempotent and preserves spent pack credits, including across restart',async t=>{
 const h=await harness(t),account=randomUUID(),purchase=await h.grant(account,'ai_100'),request=use(account);
 h.ledger.reserveAi(request);assert.equal(h.ledger.commitAi(request.requestId),true);assert.equal(h.ledger.balance(account).pack,99);
 assert.equal(h.ledger.applyPurchase(await h.fixture.verifier.purchase(purchase.receipt,{})).duplicate,true);await h.restart();
 assert.equal(h.ledger.applyPurchase(await h.fixture.verifier.purchase(purchase.receipt,{})).duplicate,true);assert.deepEqual(h.ledger.balance(account),{subscription:0,pack:99,total:99});
});
test('a transaction and subscription cannot be reassigned to another account',async t=>{
 const h=await harness(t),a=randomUUID(),b=randomUUID(),purchase=await h.grant(a,'ultimate_monthly',cycle());
 const same=h.fixture.issue(b,'ultimate_monthly',{...cycle(),transactionId:purchase.value.transactionId});
 await assert.rejects((async()=>h.ledger.applyPurchase(await h.fixture.verifier.purchase(same.receipt,{})))(),e=>e.code==='DUPLICATE_CONFLICT');
 const renewed=h.fixture.issue(b,'ultimate_monthly',cycle('subscription-1',month));
 await assert.rejects((async()=>h.ledger.applyPurchase(await h.fixture.verifier.purchase(renewed.receipt,{})))(),e=>e.code==='OWNER_MISMATCH');assert.equal(h.ledger.balance(b).total,0);
});
test('alias transactions for one subscription period cannot issue another 300 credits',async t=>{
 const h=await harness(t),a=randomUUID();await h.grant(a,'ultimate_monthly',cycle());
 await assert.rejects(h.grant(a,'ultimate_monthly',cycle()),e=>e.code==='DUPLICATE_PERIOD');assert.equal(h.ledger.balance(a).subscription,300);
});
test('subscription credits are consumed first; packs persist and unused monthly credits do not roll over',async t=>{
 const h=await harness(t),a=randomUUID();await h.grant(a,'ai_100');await h.grant(a,'ultimate_monthly',cycle());
 const request=use(a);h.ledger.reserveAi(request);h.ledger.commitAi(request.requestId);assert.deepEqual(h.ledger.balance(a),{subscription:299,pack:100,total:399});
 h.setTime(start+month);assert.deepEqual(h.ledger.balance(a),{subscription:0,pack:100,total:100});
 await h.grant(a,'ultimate_monthly',cycle('subscription-1',month));assert.deepEqual(h.ledger.balance(a),{subscription:300,pack:100,total:400});
});
test('an early or overlapping renewal does not stack monthly allowances or revive a refunded prior cycle',async t=>{
 const h=await harness(t),a=randomUUID();await h.grant(a,'ultimate_monthly',cycle());const next=await h.grant(a,'ultimate_monthly',cycle('subscription-1',month-86400000));
 assert.equal(h.ledger.balance(a).total,300);h.setTime(start+month-86400000);assert.equal(h.ledger.balance(a).total,300);
 await h.revoke(next.value.transactionId);assert.equal(h.ledger.balance(a).total,0);assert.equal(h.ledger.activeUltimate(a),false);
});
test('duplicate AI reservations settle once, and a changed request cannot take another credit',async t=>{
 const h=await harness(t),a=randomUUID();await h.grant(a,'ai_100');const request=use(a);
 assert.equal(h.ledger.reserveAi(request).duplicate,false);assert.equal(h.ledger.reserveAi(request).duplicate,true);assert.equal(h.ledger.balance(a).total,99);
 assert.throws(()=>h.ledger.reserveAi({...request,inputHash:hash('changed')}),e=>e.code==='DUPLICATE_CONFLICT');
 assert.equal(h.ledger.commitAi(request.requestId),true);assert.equal(h.ledger.commitAi(request.requestId),true);h.ledger.releaseAi(request.requestId);assert.equal(h.ledger.balance(a).total,99);
});
test('failure returns one pending credit only once, and cancelled IDs cannot be reissued',async t=>{
 const h=await harness(t),a=randomUUID();await h.grant(a,'ai_100');const request=use(a);h.ledger.reserveAi(request);
 h.ledger.releaseAi(request.requestId);h.ledger.releaseAi(request.requestId);assert.equal(h.ledger.balance(a).total,100);
 assert.deepEqual(h.ledger.reserveAi(request),{duplicate:true,state:'cancelled'});assert.equal(h.ledger.commitAi(request.requestId),false);
});
test('restart releases abandoned pending reservations and keeps their duplicate tombstones',async t=>{
 const h=await harness(t),a=randomUUID();await h.grant(a,'ai_100');const request=use(a);h.ledger.reserveAi(request);await h.restart();
 assert.equal(h.ledger.balance(a).total,99);assert.equal(h.ledger.recoverPending(),1);assert.equal(h.ledger.recoverPending(),0);assert.equal(h.ledger.balance(a).total,100);assert.equal(h.ledger.reserveAi(request).state,'cancelled');
});
test('refund removes remaining credits and pending uses; restore cannot resurrect them',async t=>{
 const h=await harness(t),a=randomUUID(),purchase=await h.grant(a,'ai_300'),one=use(a),two=use(a);
 h.ledger.reserveAi(one);h.ledger.commitAi(one.requestId);h.ledger.reserveAi(two);await h.revoke(purchase.value.transactionId);
 assert.equal(h.ledger.balance(a).total,0);assert.equal(h.ledger.replayAllowed(one.requestId),false);assert.equal(h.ledger.commitAi(two.requestId),false);h.ledger.releaseAi(two.requestId);
 assert.equal(h.ledger.applyPurchase(await h.fixture.verifier.purchase(purchase.receipt,{})).revoked,true);assert.equal(h.ledger.balance(a).total,0);
});
test('refund arriving before purchase creates a tombstone; duplicate refund events are idempotent',async t=>{
 const h=await harness(t),a=randomUUID(),purchase=h.fixture.issue(a,'ai_100'),notification=h.fixture.refund(purchase.value.transactionId);
 const verified=await h.fixture.verifier.revocation(notification);assert.equal(h.ledger.applyRevocation(verified).duplicate,false);assert.equal(h.ledger.applyRevocation(verified).duplicate,true);
 assert.equal(h.ledger.applyPurchase(await h.fixture.verifier.purchase(purchase.receipt,{})).revoked,true);assert.equal(h.ledger.balance(a).total,0);
});
test('expired subscriptions cannot complete pending generation or recover unused credits into the next cycle',async t=>{
 const h=await harness(t),a=randomUUID();await h.grant(a,'ultimate_monthly',cycle());const request=use(a);h.ledger.reserveAi(request);h.setTime(start+month);
 assert.equal(h.ledger.commitAi(request.requestId),false);h.ledger.releaseAi(request.requestId);assert.equal(h.ledger.balance(a).total,0);assert.equal(h.ledger.activeUltimate(a),false);
});
test('book rights are scoped to one room; Ultimate applies to the owner host room and personal ad removal stays personal',async t=>{
 const h=await harness(t),a=randomUUID(),b=randomUUID(),book=await h.grant(a,'memory_book',{roomScope});
 assert.equal(h.ledger.entitledToBook(roomScope,null),true);assert.equal(h.ledger.entitledToBook(hash('other-room'),null),false);await h.revoke(book.value.transactionId);assert.equal(h.ledger.entitledToBook(roomScope,null),false);
 await h.grant(a,'ad_free');assert.equal(h.ledger.adFree(a),true);assert.equal(h.ledger.adFree(b),false);
 const ultimate=await h.grant(b,'ultimate_monthly',cycle());assert.equal(h.ledger.entitledToBook(hash('other-room'),b),true);assert.equal(h.ledger.entitledToBook(hash('other-room'),a),false);assert.equal(h.ledger.adFree(b),true);
 await h.revoke(ultimate.value.transactionId);assert.equal(h.ledger.entitledToBook(hash('other-room'),b),false);assert.equal(h.ledger.adFree(b),false);assert.equal(h.ledger.adFree(a),true);
});
test('independent ledger connections cannot reserve past the final available credit',async t=>{
 const h=await harness(t),a=randomUUID();await h.grant(a,'ai_100');
 for(let i=0;i<99;i++){const request=use(a);h.ledger.reserveAi(request);h.ledger.commitAi(request.requestId);}
 const second=await openCommerceLedger(h.filename,{now:()=>start});try{h.ledger.reserveAi(use(a));assert.throws(()=>second.reserveAi(use(a)),e=>e.code==='NO_CREDITS');assert.equal(second.balance(a).total,0);}finally{second.close();}
});
test('ledger files are private and contain no receipt bytes, photos or draft input',async t=>{
 const h=await harness(t),a=randomUUID(),purchase=await h.grant(a,'ai_100');h.ledger.reserveAi(use(a));
 for(const suffix of ['','-wal','-shm'])assert.equal((await stat(h.filename+suffix)).mode&0o777,0o600);
 const bytes=Buffer.concat(await Promise.all(['','-wal'].map(s=>readFile(h.filename+s))));for(const content of [purchase.receipt,'private-input','data:image/jpeg','sessionToken','Bearer '])assert.equal(bytes.includes(Buffer.from(content)),false);
});
test('damaged or newer ledgers fail closed instead of resetting the balance',async t=>{
 const h=await harness(t);h.ledger.close();const db=new DatabaseSync(h.filename);db.exec('PRAGMA user_version=2');db.close();await assert.rejects(openCommerceLedger(h.filename));
 await writeFile(h.filename,'not a SQLite database');await assert.rejects(openCommerceLedger(h.filename));
});
test('preview and fixture services cannot accidentally enable real payments or accept a test adapter in production',async t=>{
 const h=await harness(t);assert.throws(()=>createCommerce({ledger:h.ledger,verifier:h.fixture.verifier,resolveAccount:h.fixture.resolveAccount}));
 const preview=createCommerce({ledger:h.ledger}),room={code:'ABCDEFGH',createdAt:start,game:{hostId:'host'},sessions:[{id:'host'}]};
 const account=randomUUID(),purchase=h.fixture.issue(account,'ai_100'),verified=await h.fixture.verifier.purchase(purchase.receipt,{});
 await h.grant(account,'memory_book',{roomScope:roomScopeFor(room)});
 assert.equal(h.ledger.entitledToBook(roomScopeFor(room),null),true);
 assert.equal(preview.statusFor(room,room.sessions[0]).hasBookRight,false);
 assert.equal(preview.statusFor(room,room.sessions[0]).roomAiRemaining,0);
 const previous=process.env.NODE_ENV;try{process.env.NODE_ENV='production';assert.throws(()=>createCommerce({ledger:h.ledger,...h.fixture,fixture:true}),e=>e.code==='FIXTURE_PRODUCTION');assert.throws(()=>h.ledger.applyPurchase(verified),e=>e.code==='FIXTURE_PRODUCTION');}finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
 assert.equal(preview.statusFor(room,room.sessions[0]).paymentEnabled,false);await assert.rejects(preview.verifyPurchase(room,room.sessions[0],{receipt:'fake'}),e=>e.code==='PAYMENTS_DISABLED');
 assert.notEqual(roomScopeFor({...room,createdAt:start+1}),roomScopeFor(room));
});
