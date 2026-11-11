import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameBreakGate} from '../../releases/1.0.0/ads.js';
const completed = {code:'ABCDEFGH',gameNumber:0,view:{phase:'finished',endReason:'completed'}};

test('ads never interrupt questions, reveals, unfinished games, demos or a first home visit', async()=>{
 let ads=0,next=0;const gate=createGameBreakGate(async()=>{ads++;return {shown:true};});
 for(const state of [{},{...completed,demo:true},{...completed,view:{phase:'question'}},{...completed,view:{phase:'reveal'}},{...completed,view:{phase:'finished',endReason:'not-enough-players'}}])await gate(state,()=>{next++;});
 assert.equal(ads,0);assert.equal(next,5);
});
test('the next game starts only after the interstitial dismisses; duplicate taps cannot start twice',async()=>{
 let dismiss,ads=0,next=0;const gate=createGameBreakGate(()=>{ads++;return new Promise(r=>{dismiss=r;});});
 const first=gate(completed,()=>{next++;});assert.equal(ads,1);assert.equal(next,0);
 assert.equal(await gate(completed,()=>{next++;}),false);assert.equal(next,0);
 dismiss({shown:true});await first;assert.equal(next,1);
});
test('no-fill or an SDK error always continues and the same game cannot retry an ad',async()=>{
 for(const show of [async()=>({shown:false}),async()=>{throw new Error('offline');}]){
  let ads=0,next=0;const gate=createGameBreakGate(async o=>{ads++;return show(o);});
  await gate(completed,()=>{next++;});await gate(completed,()=>{next++;});
  assert.equal(ads,1);assert.equal(next,2);
 }
});
test('different rooms/rematches respect five minutes between shown ads',async()=>{
 let at=0,ads=0;const gate=createGameBreakGate(async()=>{ads++;return {shown:true};},()=>at);
 await gate(completed,()=>{});at=299999;await gate({...completed,gameNumber:1},()=>{});assert.equal(ads,1);
 at=300000;await gate({...completed,gameNumber:2},()=>{});assert.equal(ads,2);
 at=600000;await gate({...completed,code:'HGFEDCBA'},()=>{});assert.equal(ads,3);
});
test('a failed transition releases the tap lock for recovery',async()=>{
 const gate=createGameBreakGate(async()=>({shown:false}));
 await assert.rejects(gate(completed,()=>{throw new Error('room expired');}),/room expired/);
 let continued=false;await gate({},()=>{continued=true;});assert.equal(continued,true);
});
