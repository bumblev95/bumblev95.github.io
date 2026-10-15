import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBirthDate} from '../src/age-gate.js';

test('neutral date-of-birth gate handles 13 and 18 boundaries without storing DOB',()=>{
 const today=new Date(2026,9,15);
 assert.equal(classifyBirthDate('2013-10-15',today),'teen');
 assert.equal(classifyBirthDate('2013-10-16',today),'under13');
 assert.equal(classifyBirthDate('2008-10-15',today),'adult');
 assert.equal(classifyBirthDate('2008-10-16',today),'teen');
 assert.equal(classifyBirthDate('2026-10-16',today),null);
 assert.equal(classifyBirthDate('2010-02-30',today),null);
 assert.equal(classifyBirthDate('2010-13-20',today),null);
 assert.equal(classifyBirthDate('not a date',today),null);
});
