// Opt-in smoke check: creates one synthetic room, never lists/reads other rooms.
// This checks deployed API behavior, not physical-device UX or disk/backups.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
if(process.argv[2]!=='--live-own-test-room')throw new Error('Explicit --live-own-test-room required. This creates and ends a synthetic room.');
const base='https://geuttae-api-test-production.up.railway.app';
const jpeg=await readFile(new URL('../../server/tests/fixtures/sample.jpg',import.meta.url));
let host,ended=false;
async function request(route,body,player,raw){
 const response=await fetch(base+route,{method:body!==undefined||raw?'POST':'GET',headers:{Origin:'https://bumblev95.github.io',...(player?{Authorization:'Bearer '+player.sessionToken}:{}),...(raw?{'Content-Type':'image/jpeg','X-Photo-Consent':'yes'}:body!==undefined?{'Content-Type':'application/json'}:{})},body:raw|| (body===undefined?undefined:JSON.stringify(body)),signal:AbortSignal.timeout(15000)});
 const value=(response.headers.get('content-type')||'').includes('application/json')?await response.json():await response.arrayBuffer();
 return {status:response.status,value};
}
const path=(p,route)=>`/api/rooms/${p.code}/${route}`;
async function call(player,route,body){return request(path(player,route),body,player);}
try{
 const health=await request('/api/health');assert.equal(health.status,200);assert.equal(health.value.aiEnabled,false);assert.equal(health.value.paymentsEnabled,false);
 const created=await request('/api/rooms',{nickname:'ReleaseQA-host',title:'Synthetic release QA',mode:'family',consent:true,termsVersion:'2026-10-15'});assert.equal(created.status,201);host=created.value;assert.equal(host.moderationSupported,true);
 const joined=await request(`/api/rooms/${host.code}/join`,{nickname:'ReleaseQA-guest',consent:true,termsVersion:'2026-10-15'});assert.equal(joined.status,200);const guest={...joined.value,code:host.code};
 assert.equal((await call(host,'approve',{playerId:guest.you})).status,200);
 const photos=[];
 for(const p of [host,guest]){
  const upload=await request(path(p,'upload'),undefined,p,jpeg);assert.equal(upload.status,201);photos.push(upload.value.photoId);
  assert.equal((await call(p,'action',{type:'submitQuestion',photoId:upload.value.photoId,prompt:'Synthetic QA',options:['A','B','C','D'],correctIndex:0,story:'No personal content',confirmed:true})).status,200);
 }
 assert.equal((await call(host,'action',{type:'start'})).status,200);
 const state=(await call(guest,'state')).value, q=state.view.current;
 const target={round:state.view.round,questionId:q.questionId};
 assert.equal((await call(guest,'photo/'+photos[0])).status,200);
 assert.equal((await call(guest,'action',{type:'hidePhoto',...target,hidden:true})).status,200);
 assert.equal((await call(guest,'photo/'+photos[0])).status,403);
 assert.equal((await call(host,'photo/'+photos[0])).status,200);
 assert.equal((await call(guest,'action',{type:'hidePhoto',...target,hidden:false})).status,200);
 assert.equal((await call(guest,'photo/'+photos[0])).status,200);
 const report=await call(guest,'action',{type:'report',...target,reason:'other',confirmed:true});assert.equal(report.status,200);assert.equal(report.value.reportReceived,true);assert.equal(report.value.view.phase,'question');
 assert.equal((await call(guest,'photo/'+photos[0])).status,403);
 assert.equal((await call(guest,'kick',{playerId:host.you,confirmed:true})).status,403);
 const kick=await call(host,'kick',{playerId:guest.you,confirmed:true});assert.equal(kick.status,200);assert.equal(kick.value.view.phase,'finished');ended=true;
 assert.equal((await call(guest,'state')).value.access,'kicked');
 assert.notEqual((await call(host,'photo/'+photos[0])).status,200);
 assert.notEqual((await call(host,'photo/'+photos[1])).status,200);
 console.log('LIVE API PASS: own synthetic room only; approval, scoped hide/show, report without ending, unauthorized kick refused, host kick revoked access and ended room, photo endpoints inaccessible. No device, disk-erasure, backup-retention or operator-delivery certification.');
}finally{
 if(host&&!ended){const result=await call(host,'action',{type:'end'});assert.equal(result.status,200,'Synthetic room cleanup failed; inspect the private test session.');}
}
