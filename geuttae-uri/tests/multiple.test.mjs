import test from 'node:test';import assert from 'node:assert/strict';
import {setup,validateAction,applyAction,viewFor,meta} from '../releases/0.4.10/logic.js';
const question=slot=>({type:'submitQuestion',slot,media:'text',photoId:'',prompt:'기억',options:['A','B','C','D'],correctIndex:0,story:'이야기',confirmed:true});
test('ten players prepare thirty questions in rotating author order; privacy and slot boundaries hold',()=>{
 const players=Array.from({length:10},(_,i)=>({id:'p'+i,name:'사람'+i}));let s=setup(players);assert.equal(meta.maxPlayers,10);
 for(const p of players)for(let slot=0;slot<3;slot++){assert.equal(validateAction(s,p.id,question(slot)).ok,true);s=applyAction(s,p.id,question(slot));}
 assert.equal(validateAction(s,'p0',question(3)).ok,false);assert.equal(viewFor(s,'p0').myQuestions.length,3);assert.equal(viewFor(s,'p0').totalPrepared,30);
 assert.equal(validateAction(s,'p0',{type:'start'}).ok,true);s=applyAction(s,'p0',{type:'start'});assert.equal(s.order.length,30);
 assert.deepEqual(s.order.slice(0,10),players.map(p=>p.id));assert.deepEqual(s.order.slice(10,20),players.map(p=>p.id+':1'));
 assert.equal(viewFor(s,'p1').current.correctIndex,undefined);assert.equal(validateAction(s,'p0',{type:'answer',round:0,choice:0}).ok,false);
});
test('answer-only readiness cannot start an empty game and returns to author participation on submission',()=>{
 let s=setup([{id:'a',name:'A'},{id:'b',name:'B'}]);for(const id of ['a','b'])s=applyAction(s,id,{type:'answerOnly',enabled:true});assert.equal(validateAction(s,'a',{type:'start'}).ok,false);
 s=applyAction(s,'a',question(0));assert.equal(viewFor(s,'a').answerOnlyIds.includes('a'),false);assert.equal(validateAction(s,'a',{type:'start'}).ok,true);
});
