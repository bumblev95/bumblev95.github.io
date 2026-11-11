import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openAccounts} from '../src/accounts.mjs';
import {createApp} from '../src/server.mjs';
import {BillingError} from '../src/play-billing.mjs';

const clientId='123-test.apps.googleusercontent.com',keyHex='ab'.repeat(32);
async function harness(t,extra={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'thenus-billing-')),file=path.join(dir,'accounts.sqlite');
 let claims,acks=0,gets=0,ackFailure=false,outage=false;
 const receipts=new Map();
 const provider={async get(token){gets++;if(outage)throw Error('service-account-secret');if(!receipts.has(token))throw new BillingError('PURCHASE_NOT_FOUND',400);return {...receipts.get(token)};},async acknowledge(token){acks++;if(ackFailure)throw Error('service-account-secret');receipts.get(token).acknowledgementState=1;}};
 const options={clientId,testing:true,verifyToken:async()=>claims,billing:{enabled:true,keyHex,provider,testing:true,...extra}};
 const auth=await openAccounts(file,options);
 t.after(async()=>{auth.close();await rm(dir,{recursive:true,force:true});});
 async function login(sub='alice'){
  const c=auth.challenge();claims={iss:'accounts.google.com',aud:clientId,exp:Math.floor(Date.now()/1000)+3600,nonce:c.nonce,sub,email_verified:true,email:sub+'@example.com'};
  return auth.signIn({challenge:c.challenge,idToken:'verified-google-token'});
 }
 async function receipt(session,token='play-secret-token',overrides={}){
  const c=await auth.billing.context(session);
  receipts.set(token,{purchaseState:0,consumptionState:0,acknowledgementState:0,productId:'thenus_remove_ads',obfuscatedExternalAccountId:c.obfuscatedAccountId,quantity:1,...overrides});return token;
 }
 return {auth,login,receipt,receipts,file,dir,provider,options,get acks(){return acks;},get gets(){return gets;},failAck(v){ackFailure=v;},outage(v){outage=v;}};
}
test('billing stays disabled by default/partial configuration; authenticated identity is required',async t=>{
 const h=await harness(t,{enabled:false}),a=await h.login();
 assert.equal((await h.auth.billing.status(a.token)).enabled,false);
 await assert.rejects(h.auth.billing.verify(a.token,'receipt'),/BILLING_NOT_CONFIGURED/);
 await assert.rejects(h.auth.billing.context(a.token),/BILLING_NOT_CONFIGURED/);
 await assert.rejects(h.auth.billing.status('0'.repeat(64)),/SIGN_IN_REQUIRED/);
 assert.equal(h.gets,0);
});
test('server-bound product and account, purchased state, quantity and non-consumption are mandatory',async t=>{
 const h=await harness(t),a=await h.login();
 const cases=[{purchaseState:2},{purchaseState:1},{consumptionState:1},{quantity:2},{refundableQuantity:0},{productId:'different-product'},{obfuscatedExternalAccountId:'bob'}, {obfuscatedExternalAccountId:undefined}, {acknowledgementState:undefined}];
 for(let i=0;i<cases.length;i++){
  const token=await h.receipt(a.token,'invalid-'+i,cases[i]);
  await assert.rejects(h.auth.billing.verify(a.token,token));
 }
 assert.equal(h.acks,0);assert.equal((await h.auth.billing.status(a.token)).adFree,false);
});
test('concurrent delivery acknowledges once, survives restart and never stores raw purchase/session tokens',async t=>{
 const h=await harness(t),a=await h.login(),token=await h.receipt(a.token);
 const values=await Promise.all([h.auth.billing.verify(a.token,token),h.auth.billing.verify(a.token,token)]);
 assert.deepEqual(values,[{adFree:true},{adFree:true}]);assert.equal(h.acks,1);
 assert.equal((await h.auth.billing.status(a.token)).adFree,true);
 const reopened=await openAccounts(h.file,h.options);
 try{assert.equal((await reopened.billing.status(a.token)).adFree,true);}finally{reopened.close();}
 for(const suffix of ['','-wal','-shm']){const bytes=await readFile(h.file+suffix).catch(()=>Buffer.alloc(0));for(const secret of [token,a.token,'verified-google-token'])assert.equal(bytes.includes(secret),false);}
});
test('another signed-in app account cannot claim or transfer an existing Play receipt',async t=>{
 const h=await harness(t),a=await h.login(),token=await h.receipt(a.token),b=await h.login('bob');
 await assert.rejects(h.auth.billing.verify(b.token,token),/PURCHASE_ACCOUNT_MISMATCH/);
 await h.auth.billing.verify(a.token,token);
 await assert.rejects(h.auth.billing.verify(b.token,token),/PURCHASE_ACCOUNT_MISMATCH/);
 assert.equal((await h.auth.billing.status(b.token)).adFree,false);
});
test('acknowledgement failure grants nothing; restore retries without buying or consuming again',async t=>{
 const h=await harness(t),a=await h.login(),token=await h.receipt(a.token);h.failAck(true);
 await assert.rejects(h.auth.billing.verify(a.token,token),/PURCHASE_VERIFY_RETRY/);
 await assert.rejects(h.auth.billing.status(a.token),/PURCHASE_VERIFY_RETRY/);
 h.failAck(false);assert.equal((await h.auth.billing.status(a.token)).adFree,true);
});
test('refund/cancel and not-found revoke on entitlement check; network errors never invent active entitlement',async t=>{
 const h=await harness(t),a=await h.login(),token=await h.receipt(a.token);await h.auth.billing.verify(a.token,token);
 h.outage(true);await assert.rejects(h.auth.billing.status(a.token),/BILLING_UNAVAILABLE/);h.outage(false);
 h.receipts.get(token).purchaseState=1;assert.equal((await h.auth.billing.status(a.token)).adFree,false);
 const token2=await h.receipt(a.token,'second-receipt');await h.auth.billing.verify(a.token,token2);h.receipts.delete(token2);
 assert.equal((await h.auth.billing.status(a.token)).adFree,false);
});
test('account deletion removes stored receipts; same Google identity can restore to a new app account',async t=>{
 const h=await harness(t),a=await h.login(),token=await h.receipt(a.token);await h.auth.billing.verify(a.token,token);
 h.auth.delete(a.token,{confirmed:true});await assert.rejects(h.auth.billing.status(a.token),/SIGN_IN_REQUIRED/);
 const next=await h.login();assert.notEqual(next.account.id,a.account.id);assert.equal((await h.auth.billing.status(next.token)).adFree,false);
 await h.auth.billing.verify(next.token,token);assert.equal((await h.auth.billing.status(next.token)).adFree,true);
});
test('deletion or sign-out while Google verification is in flight cannot grant a late entitlement',async t=>{
 const h=await harness(t),a=await h.login(),token=await h.receipt(a.token);
 const pending=h.auth.billing.verify(a.token,token);h.auth.logout(a.token);await assert.rejects(pending,/SIGN_IN_REQUIRED/);
 assert.equal(h.acks,0);
});
test('billing HTTP endpoints retain origin/auth checks and reject forged client paid flags',async t=>{
 const h=await harness(t),app=await createApp({dataDir:path.join(h.dir,'http'),accounts:h.options});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 for(const [endpoint,body,origin,status] of [['status',null,base,401],['verify',{purchaseToken:'fake',adFree:true},'https://evil.test',403],['verify',{purchaseToken:'fake',adFree:true},base,401]]){
  const r=await fetch(base+'/api/account/billing/'+endpoint,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.text()).includes('service-account-secret'),false);
 }
});
