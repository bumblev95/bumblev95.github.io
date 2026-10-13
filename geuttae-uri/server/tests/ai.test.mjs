import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {aiConfig,createAiProvider,createAiBudget} from '../src/ai.mjs';
import {validateDraftInput,validateDraftOutput,assembleDraft} from '../../releases/0.3.2/draft.js';

const input=()=>({requestId:randomUUID(),memory:'짐을 풀기 전에 바다를 보러 갔어요.',answer:'바다 보러 가기',focus:'activity',consent:true});
const output={prompt:'바다에 도착해서 가장 먼저 한 일은?',distractors:['점심 먹기','짐 풀기','기념품 고르기']};
const enabled={AI_ENABLED:'1',OPENAI_API_KEY:'test-secret-not-a-real-key',AI_MODEL:'test-fixture',AI_DAILY_REQUEST_LIMIT:'4',AI_ROOM_SUCCESS_LIMIT:'2'};
test('AI is off unless explicitly opted in; enabling requires a key, chosen model and both hard limits',()=>{
 assert.equal(aiConfig({}),null);assert.equal(aiConfig({...enabled,AI_ENABLED:'0'}),null);
 assert.deepEqual(Object.keys(aiConfig(enabled)).sort(),['apiKey','dailyLimit','model','roomLimit','timeoutMs']);
 for(const key of ['OPENAI_API_KEY','AI_MODEL','AI_DAILY_REQUEST_LIMIT','AI_ROOM_SUCCESS_LIMIT'])assert.throws(()=>aiConfig({...enabled,[key]:undefined}));
 for(const value of ['0','-1','1.5','NaN','1001'])assert.throws(()=>aiConfig({...enabled,AI_DAILY_REQUEST_LIMIT:value}));
 for(const value of ['0','21','2e1','1.5'])assert.throws(()=>aiConfig({...enabled,AI_ROOM_SUCCESS_LIMIT:value}));
 assert.throws(()=>aiConfig({...enabled,AI_MODEL:'https://untrusted.test/model'}));
});
test('draft inputs require separate consent and reject photos, entitlements and unbounded or controlled text',()=>{
 assert.equal(validateDraftInput(input()).answer,'바다 보러 가기');
 for(const patch of [{consent:false},{consent:'true'},{memory:''},{memory:'x'.repeat(241)},{memory:'a\nb'},{answer:'x'.repeat(61)},{answer:'\x00'},{focus:'unknown'},{requestId:'../../secret'},{photoId:'photo'},{credits:100},{paid:true},{image:'data:image/jpeg'}])assert.throws(()=>validateDraftInput({...input(),...patch}));
});
test('AI cannot replace the true answer or story; invalid or duplicate decoys fail closed',()=>{
 const data=input();for(let index=0;index<4;index++){const draft=assembleDraft(output,data,index);assert.equal(draft.options[index],data.answer);assert.equal(draft.story,data.memory);assert.equal(draft.correctIndex,index);assert.equal(draft.options.length,4);}
 for(const value of [null,[],{...output,correctIndex:0},{...output,prompt:'x'.repeat(161)},{...output,distractors:['a','b']},{...output,distractors:['a','a','b']},{...output,distractors:[input().answer,'a','b']},{...output,distractors:['A',' a ','b']},{...output,distractors:['a','b','x'.repeat(61)]}])assert.throws(()=>validateDraftOutput(value,input().answer));
});
function response(value=output){return new Response(JSON.stringify({id:'resp_fixture',object:'response',created_at:1,model:'test-fixture',status:'completed',output:[{id:'msg_fixture',type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(value),annotations:[]}]}],usage:{input_tokens:80,output_tokens:40,total_tokens:120}}),{headers:{'content-type':'application/json'}});}
test('installed SDK builds a text-only Responses request with storage off and no implicit identifiers',async()=>{
 const data=input();let calls=0;
 const provider=await createAiProvider(enabled,{fetchImpl:async(url,options)=>{
  calls++;assert.equal(String(url),'https://api.openai.com/v1/responses');
  const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,1000);assert.equal(body.text.format.type,'json_schema');assert.equal(body.text.format.strict,true);
  const serialized=JSON.stringify(body);assert.ok(serialized.includes(data.answer));assert.ok(serialized.includes(data.memory));assert.ok(!serialized.includes(data.requestId));
  assert.ok(!serialized.includes('input_image'));assert.ok(!serialized.includes('image_url'));assert.equal(body.user,undefined);assert.equal(body.metadata,undefined);
  return response();
 }});
 assert.deepEqual(await provider.generate(data,{signal:new AbortController().signal}),output);assert.equal(calls,1);
});
test('SDK provider failure and bad output never silently retry',async()=>{
 for(const value of ['fail','bad']){let calls=0;const provider=await createAiProvider(enabled,{fetchImpl:async()=>{calls++;return value==='fail'?new Response(JSON.stringify({error:{message:'fixture failure',type:'rate_limit_error'}}),{status:429,headers:{'content-type':'application/json'}}):response({...output,distractors:['same','same','other']});}});
  await assert.rejects(provider.generate(input(),{signal:new AbortController().signal}));assert.equal(calls,1);
 }
});
test('global daily attempt budget is atomic, private and survives restart without remembering content',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'gu-ai-budget-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const now=()=>Date.parse('2026-10-13T12:00:00Z');const budget=await createAiBudget(dir,2,{now});
 const reserved=await Promise.all(Array.from({length:12},()=>budget.reserve()));assert.equal(reserved.filter(Boolean).length,2);
 const file=path.join(dir,'ai-budget.json');assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{version:1,day:'2026-10-13',attempts:2});assert.equal((await stat(file)).mode&0o777,0o600);
 const restarted=await createAiBudget(dir,2,{now});assert.equal(await restarted.reserve(),false);
 const tomorrow=await createAiBudget(dir,2,{now:()=>Date.parse('2026-10-14T00:00:00Z')});assert.equal(await tomorrow.reserve(),true);
 const backwards=await createAiBudget(dir,2,{now});await assert.rejects(backwards.reserve());
 await writeFile(file,'bad ledger');await assert.rejects(createAiBudget(dir,2,{now}));
});
