import test from 'node:test';
import assert from 'node:assert/strict';
import {t,tr,setLanguage,getLanguage,sampleText,appError} from '../releases/0.5.1/locale.js';
import {english} from '../releases/0.5.1/en.js';
import {memoryTemplates,renderMemoryHTML} from '../releases/0.5.1/memory.js';
test('English translates developer literals, never interpolated player text',()=>{
 setLanguage('en');assert.equal(t('가족 모드'),'Family Time');assert.equal(tr`정답 +${75}점`,'Correct +75 points');
 const player='사진',question='추억';assert.equal(tr`<strong>${player}</strong>님의 문제: ${question}`,"<strong>사진</strong>'s question: 추억");
 assert.equal(memoryTemplates[0].name,'Photobook');assert.equal(sampleText('What did we do first that day?'),'What did we do first that day?');
 assert.doesNotMatch(appError('한 사람당 사진은 최대 5장이에요.'),/[가-힣]/);
 setLanguage('ko');assert.equal(memoryTemplates[0].name,'포토북');assert.equal(sampleText('What did we do first that day?'),'이날 우리가 가장 먼저 한 일은?');assert.equal(getLanguage(),'ko');
});
test('English exported books have English labels while preserving user stories and titles exactly',()=>{
 setLanguage('en');const book={title:'우리의 작은 추억집',date:'2026-10-15',sample:false,scoring:false,players:[{name:'정답',score:0}],entries:[{round:0,photoId:'one',author:'사진',prompt:'기억',options:['추억','사진','정답','나'],correctIndex:0,story:'사진과 추억은 원문 그대로',responses:[]}]};
 const html=renderMemoryHTML(book,{},{});assert.match(html,/<html lang="en">/);assert.match(html,/사진과 추억은 원문 그대로/);assert.match(html,/우리의 작은 추억집/);assert.match(html,/'s memories/);assert.doesNotMatch(html,/함께한 우리|저장을 허용한 추억|정답<\/strong>/);setLanguage('ko');
});
test('every English catalogue value is translated and contains no Korean UI text',()=>{assert.ok(Object.keys(english).length>650);for(const [key,value] of Object.entries(english))assert.doesNotMatch(value,/[가-힣]/,key);});
