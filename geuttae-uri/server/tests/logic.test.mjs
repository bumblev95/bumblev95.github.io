import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,validateAction,applyAction,viewFor,isGameOver} from '../src/logic.mjs';
const players=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
const q={type:'submitQuestion',photoId:'photo',prompt:'질문',options:['가','나','다','라'],correctIndex:2,story:'아직 공개하면 안 되는 이야기',confirmed:true};
function prepared(n=3){let s=setup(players.slice(0,n));for(const p of s.players)s=applyAction(s,p.id,{...q,photoId:p.id});return s;}
function playing(n=3){return applyAction(prepared(n),'a',{type:'start'});}
const allowed=(s,id,a)=>assert.equal(validateAction(s,id,a).ok,true);
const denied=(s,id,a)=>assert.equal(validateAction(s,id,a).ok,false);
test('initial states have no shared mutable arrays',()=>{const a=setup(players),b=setup(players);a.players[0].name='changed';assert.equal(b.players[0].name,'A');assert.equal(players[0].name,'A');});
test('everyone must prepare one question; a solo user cannot start',()=>{denied(setup(players),'a',{type:'start'});denied(prepared(1),'a',{type:'start'});allowed(prepared(),'a',{type:'start'});});
test('only the host can start',()=>denied(prepared(),'b',{type:'start'}));
test('invalid or duplicate options and unconfirmed answers are rejected',()=>{const s=setup(players);for(const changed of [{options:['가','가','다','라']},{correctIndex:4},{correctIndex:1.5},{confirmed:false},{options:['가']},{prompt:' '},{story:'x'.repeat(241)}])denied(s,'a',{...q,...changed});});
test('outsiders cannot read state or act',()=>{assert.equal(viewFor(playing(),'outsider'),null);denied(playing(),'outsider',{type:'answer',round:0,choice:2});});
test('author cannot answer their own question',()=>denied(playing(),'a',{type:'answer',round:0,choice:2}));
test('answers and story are hidden before reveal, including future questions',()=>{const v=viewFor(playing(),'b');assert.equal('correctIndex' in v.current,false);assert.equal('story' in v.current,false);assert.equal(v.myQuestion,null);assert.equal('questions' in v,false);assert.deepEqual(v.answers,{});});
test('author may see their own correct answer without scoring',()=>{assert.equal(viewFor(playing(),'a').current.correctIndex,2);assert.equal(viewFor(playing(),'a').players[0].score,0);});
test('one submission only, and immutable state',()=>{const s=playing(),before=JSON.stringify(s);const next=applyAction(s,'b',{type:'answer',choice:2,round:0});assert.equal(JSON.stringify(s),before);denied(next,'b',{type:'answer',choice:1,round:0});});
test('all answers trigger reveal; exact 100 points only for correct eligible players',()=>{let s=playing();s=applyAction(s,'b',{type:'answer',choice:2,round:0});s=applyAction(s,'c',{type:'answer',choice:0,round:0});assert.equal(s.phase,'reveal');assert.deepEqual(s.players.map(p=>p.score),[0,100,0]);assert.equal(viewFor(s,'b').current.story,q.story);denied(s,'c',{type:'answer',choice:2,round:0});});
test('force reveal needs host confirmation and does not reward missing answers',()=>{let s=playing();denied(s,'b',{type:'reveal',round:0,confirmed:true});denied(s,'a',{type:'reveal',round:0});allowed(s,'a',{type:'reveal',round:0,confirmed:true});s=applyAction(s,'a',{type:'reveal'});assert.deepEqual(s.players.map(p=>p.score),[0,0,0]);});
test('rotation changes author and stale next/answer actions are rejected',()=>{let s=applyAction(playing(),'a',{type:'reveal'});allowed(s,'a',{type:'next',round:0});s=applyAction(s,'a',{type:'next'});assert.equal(s.order[s.round],'b');denied(s,'a',{type:'next',round:0});denied(s,'c',{type:'answer',round:0,choice:2});});
test('equal opportunity, tied winners, finished state contains no photos or answers',()=>{let s=playing(2);s=applyAction(s,'b',{type:'answer',round:0,choice:2});s=applyAction(s,'a',{type:'next'});s=applyAction(s,'a',{type:'answer',round:1,choice:2});s=applyAction(s,'b',{type:'next'});assert.equal(s.phase,'finished');assert.deepEqual(isGameOver(s).winners,['a','b']);assert.deepEqual(s.players.map(p=>p.score),[100,100]);assert.deepEqual(s.questions,{});assert.equal(viewFor(s,'a').current,null);});
test('report ends the room without declaring a winner',()=>{let s=playing();allowed(s,'b',{type:'report'});s=applyAction(s,'b',{type:'report'});assert.equal(s.endReason,'reported');assert.deepEqual(isGameOver(s).winners,[]);assert.deepEqual(s.questions,{});});
