import {buildMemoryBook} from '../releases/0.5.1/memory.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {setup,validateAction,applyAction,viewFor,meta,pointsForTime} from '../releases/0.5.1/logic.js';
const question=slot=>({type:'submitQuestion',slot,media:'photo',photoId:'photo-'+slot,prompt:'기억',options:['A','B','C','D'],correctIndex:0,story:'이야기',confirmed:true});
test('ten optional authors can submit fifty photos with five slots each and rotating order',()=>{
 const ps=Array.from({length:10},(_,i)=>({id:'p'+i,name:'친구'+i}));let s=setup(ps);assert.equal(meta.maxPlayers,10);
 for(const p of ps)for(let slot=0;slot<5;slot++){assert.equal(validateAction(s,p.id,question(slot)).ok,true);s=applyAction(s,p.id,question(slot));}
 assert.equal(validateAction(s,'p0',question(5)).ok,false);assert.equal(viewFor(s,'p0').myQuestions.length,5);assert.equal(viewFor(s,'p0').totalPrepared,50);
 s=applyAction(s,'p0',{type:'start'});assert.equal(s.order.length,50);assert.deepEqual(s.order.slice(10,20),ps.map(p=>p.id+':1'));assert.equal(viewFor(s,'p1').current.correctIndex,undefined);
});
test('one photo author can start while everyone else only answers, without readiness choices',()=>{
 let s=setup([{id:'a',name:'A'},{id:'b',name:'B'}]);assert.equal(validateAction(s,'a',{type:'start'}).ok,false);s=applyAction(s,'a',question(0));assert.equal(validateAction(s,'a',{type:'start'}).ok,true);s=applyAction(s,'a',{type:'start'});assert.equal(s.order.length,1);assert.equal(validateAction(s,'b',{type:'answer',round:0,choice:0}).ok,true);
});
test('battle permits only the host to author, with no five-photo limit',()=>{
 let s=setup([{id:'a',name:'A'},{id:'b',name:'B'}],{mode:'battle'});assert.equal(validateAction(s,'b',question(0)).ok,false);
 for(let slot=0;slot<12;slot++){assert.equal(validateAction(s,'a',question(slot)).ok,true);s=applyAction(s,'a',question(slot));}
 assert.equal(viewFor(s,'a').questionLimit,null);assert.equal(viewFor(s,'b').questionLimit,0);s=applyAction(s,'a',{type:'start'});assert.equal(s.order.length,12);assert.equal(s.questions[s.order[11]].slot,11);
});
test('text and placeholder submissions are rejected and shared speed points match the server',()=>{
 const s=setup([{id:'a',name:'A'},{id:'b',name:'B'}]);for(const media of ['text','illustration'])assert.equal(validateAction(s,'a',{...question(0),media,photoId:''}).ok,false);
 assert.equal(pointsForTime(20000,20,0),100);assert.equal(pointsForTime(20000,20,5000),75);assert.equal(pointsForTime(20000,20,15000),25);assert.equal(pointsForTime(20000,20,20000),0);assert.equal(pointsForTime(null,0,15000),100);
});

test('larger photo books retain every authorized entry rather than stopping at thirty',()=>{const entries=Array.from({length:60},(_,round)=>({round,photoId:'p'+round,author:'A'}));const book=buildMemoryBook({title:'기억',date:'오늘',view:{phase:'finished',endReason:'completed',players:[{name:'A',score:0}]},entries});assert.equal(book.entries.length,60);});
