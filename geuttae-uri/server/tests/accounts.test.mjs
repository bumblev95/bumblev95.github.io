import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openAccounts} from '../src/accounts.mjs';
import {createApp} from '../src/server.mjs';

const clientId='123456789-testclient.apps.googleusercontent.com';
async function harness(t){
  const dir=await mkdtemp(path.join(os.tmpdir(),'thenus-accounts-'));let now=Date.now(),claims;
  const options={clientId,testing:true,now:()=>now,verifyToken:async token=>{assert.equal(token,'signed-by-google');return claims;}};
  let auth=await openAccounts(path.join(dir,'accounts.sqlite'),options);
  t.after(async()=>{auth.close();await rm(dir,{recursive:true,force:true});});
  return {get auth(){return auth;},get now(){return now;},advance:n=>{now+=n;},set:value=>{claims=value;},
    async login(subject='person-1',overrides={}){const c=auth.challenge();claims={iss:'https://accounts.google.com',aud:clientId,exp:Math.floor(now/1000)+3600,nonce:c.nonce,sub:subject,email_verified:true,email:'person@example.com',...overrides};return auth.signIn({challenge:c.challenge,idToken:'signed-by-google'});},
    async restart(){auth.close();auth=await openAccounts(path.join(dir,'accounts.sqlite'),options);},dir};
}
test('configuration is fail-closed and test verifiers cannot be enabled by an environment flag',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'thenus-disabled-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const auth=await openAccounts(path.join(dir,'a.sqlite'),{clientId:''});t.after(()=>auth.close());
  assert.equal(auth.config().enabled,false);assert.throws(()=>auth.challenge(),/SIGN_IN_NOT_CONFIGURED/);
  await assert.rejects(openAccounts(path.join(dir,'b.sqlite'),{clientId,verifyToken:async()=>({})}),/TEST_VERIFIER_FORBIDDEN/);
});
test('verified Google subject gives a stable account, native session secrets are hashed at rest, logout revokes only its session',async t=>{
  const h=await harness(t),a=await h.login(),b=await h.login();
  assert.equal(a.account.id,b.account.id);assert.notEqual(a.token,b.token);assert.equal(h.auth.me(a.token).paymentsEnabled,false);
  await h.restart();assert.equal(h.auth.me(a.token).account.id,a.account.id);
  const files=await Promise.all(['','-wal'].map(suffix=>readFile(path.join(h.dir,'accounts.sqlite'+suffix)).catch(()=>Buffer.alloc(0))));
  for(const bytes of files){assert.equal(bytes.includes(a.token),false);assert.equal(bytes.includes('signed-by-google'),false);assert.equal(bytes.includes('person-1'),false);}
  h.auth.logout(a.token);assert.throws(()=>h.auth.me(a.token),/SIGN_IN_REQUIRED/);assert.equal(h.auth.me(b.token).account.id,b.account.id);
  assert.throws(()=>h.auth.me('forged-room-session'),/SIGN_IN_REQUIRED/);
});
test('wrong nonce/audience/issuer, expired claims, unverified email and unsigned tokens cannot create an account',async t=>{
  const h=await harness(t);
  for(const overrides of [{nonce:'wrong'},{aud:'another-client'},{iss:'https://attacker.test'},{exp:1},{email_verified:false},{sub:''}])await assert.rejects(h.login('attacker',overrides),/GOOGLE_VERIFICATION_FAILED/);
  const c=h.auth.challenge();await assert.rejects(h.auth.signIn({challenge:c.challenge,idToken:'unsigned'}));
});
test('challenges are single use, including concurrent verification, and expire after five minutes',async t=>{
  const h=await harness(t),c=h.auth.challenge();h.set({iss:'accounts.google.com',aud:clientId,exp:Math.floor(h.now/1000)+3600,nonce:c.nonce,sub:'person',email_verified:true,email:'x@example.com'});
  const results=await Promise.allSettled([h.auth.signIn({challenge:c.challenge,idToken:'signed-by-google'}),h.auth.signIn({challenge:c.challenge,idToken:'signed-by-google'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const expired=h.auth.challenge();h.advance(5*60_000);await assert.rejects(h.auth.signIn({challenge:expired.challenge,idToken:'signed-by-google'}),/SIGN_IN_EXPIRED/);
});
test('deletion requires confirmation and recent verification, revokes every device, and recreates a distinct account on later sign-in',async t=>{
  const h=await harness(t),a=await h.login(),b=await h.login();
  assert.throws(()=>h.auth.delete(a.token,{}),/DELETE_CONFIRMATION_REQUIRED/);
  h.advance(5*60_000);assert.throws(()=>h.auth.delete(a.token,{confirmed:true}),/REAUTHENTICATE_TO_DELETE/);
  const recent=await h.login();assert.deepEqual(h.auth.delete(recent.token,{confirmed:true}),{deleted:true});
  for(const session of [a,b,recent])assert.throws(()=>h.auth.me(session.token),/SIGN_IN_REQUIRED/);
  const next=await h.login();assert.notEqual(next.account.id,a.account.id);
  h.advance(30*24*60*60_000);assert.throws(()=>h.auth.me(next.token),/SIGN_IN_REQUIRED/);
});
test('account HTTP endpoints preserve origin checks and never trust client account/paid flags',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'thenus-account-http-'));let nonce;
  const app=await createApp({dataDir:dir,accounts:{clientId,testing:true,verifyToken:async()=>({iss:'accounts.google.com',aud:clientId,exp:Math.floor(Date.now()/1000)+3600,nonce,sub:'http-user',email_verified:true,email:'http@example.com'})}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const call=async(endpoint,body,token,origin=base)=>{const r=await fetch(base+'/api/account/'+endpoint,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};};
  assert.equal((await call('challenge',{},null,'https://attacker.test')).status,403);
  const c=await call('challenge',{});nonce=c.data.nonce;
  const login=await call('google',{challenge:c.data.challenge,idToken:'signed-by-google',accountId:'forged',paid:true});
  assert.equal(login.status,200);assert.notEqual(login.data.account.id,'forged');assert.equal(login.data.paymentsEnabled,false);
  const me=await call('me',null,login.data.token);assert.equal(me.headers.get('cache-control'),'no-store');assert.equal(me.data.token,undefined);
  assert.equal((await call('me',null,'0'.repeat(64))).status,401);
  assert.equal((await call('delete',{confirmed:false},login.data.token)).status,400);
  assert.equal((await call('delete',{confirmed:true},login.data.token)).status,200);
  assert.equal((await call('me',null,login.data.token)).status,401);
});
