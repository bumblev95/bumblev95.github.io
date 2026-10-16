import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {emptyBundle,observation,validateDrafts,mergeDrafts,canonicalURL,safeURL,mediaKey} from '../assets/playtest-drafts.mjs';
const meta=JSON.parse(readFileSync(new URL('../archeage-chronicles/data/playtest-records.json',import.meta.url)));
const schema=JSON.parse(readFileSync(new URL('../archeage-chronicles/data/playtest.schema.json',import.meta.url)));
const values={target_id:'class-weapons',kind:'class',subject_id:'synthetic-subject',fact_key:'synthetic-weapons',
  title_ko:'합성 테스트 전용',title_en:'SYNTHETIC TEST ONLY',claim_ko:'게임 관찰이 아닌 합성 테스트',claim_en:'SYNTHETIC TEST; NO GAMEPLAY',
  recorded_by:'synthetic-recorder',build:'synthetic-build',region:'synthetic-region',channel:'regular',variant:'synthetic-setup'};
const draft=(v=values,b=emptyBundle(meta))=>observation(v,meta,b,()=>String(b.records.length+1)+'-synthetic');

test('browser observations are unverified and never invent observation/capture times',()=>{
  const b=validateDrafts(draft(),schema,meta);
  assert.deepEqual(b.records[0].verification,{status:'unverified',review:null});
  assert.equal(b.records[0].observed_at,null);assert.deepEqual(b.evidence,[]);
});
test('same fact/context cannot be added twice with different IDs',()=>{
  const b=draft();assert.throws(()=>validateDrafts(draft(values,b),schema,meta),/Duplicate fact/);
});
test('import is idempotent and rejects conflicting IDs and forged approvals',()=>{
  const b=draft();assert.deepEqual(mergeDrafts(b,b,schema,meta),b);
  const changed=structuredClone(b);changed.records[0].claim.en='CHANGED';
  assert.throws(()=>mergeDrafts(b,changed,schema,meta),/Conflicting/);
  const forged=structuredClone(b);forged.records[0].verification.status='verified';
  assert.throws(()=>mergeDrafts(emptyBundle(meta),forged,schema,meta),/unverified drafts/);
  assert.equal(b.records[0].claim.en,values.claim_en);
});
test('drafts cannot silently change release metadata or schema',()=>{
  const b=draft();b.release.active_build='other';assert.throws(()=>validateDrafts(b,schema,meta),/metadata differs/);
  const other=draft();other.records[0].unexpected=true;assert.throws(()=>validateDrafts(other,schema,meta),/unknown field/);
});
test('source URL safety, video aliases and checksum deduplication',()=>{
  assert(!safeURL('javascript:alert(1)'));assert(!safeURL('https://user:secret@example.com/a'));
  assert(!safeURL('https://example.com/\\foo'));assert(safeURL('https://example.com/synthetic.png'));
  assert.equal(canonicalURL('https://youtu.be/synthetic-id?si=test'),canonicalURL('https://www.youtube.com/watch?v=synthetic-id'));
  assert.equal(canonicalURL('https://example.com/a?utm_source=test'),canonicalURL('https://example.com/a'));
  const v={...values,source_url:'https://example.com/synthetic.png',evidence_kind:'screenshot',creator:'synthetic',sha256:'f'.repeat(64)};
  const b=draft(v);validateDrafts(b,schema,meta);
  const next=draft({...v,subject_id:'different-subject'},b);validateDrafts(next,schema,meta);
  assert.equal(next.records.length,2);assert.equal(next.evidence.length,1);
  assert.equal(next.records[0].evidence_ids[0],next.records[1].evidence_ids[0]);
  assert.equal(mediaKey(next.evidence[0]),mediaKey(b.evidence[0]));
  assert.throws(()=>draft({...v,subject_id:'different-subject',sha256:'a'.repeat(64)},b),/different media/);
});
test('sources already in repository can be reused without duplicate media rows',()=>{
  const b=draft({...values,source_url:'https://example.com/synthetic.png',evidence_kind:'screenshot'});
  const sourceMeta=structuredClone(meta);sourceMeta.evidence=b.evidence;
  const next=observation({...values,source_url:'https://example.com/synthetic.png',evidence_kind:'screenshot'},sourceMeta,emptyBundle(sourceMeta),()=> 'new-id');
  assert.deepEqual(next.evidence,b.evidence);
});
test('video ranges and normalized map references are required',()=>{
  let v={...values,source_url:'https://example.com/synthetic.mp4',evidence_kind:'video'};
  assert.throws(()=>validateDrafts(draft(v),schema,meta),/clip start\/end/);
  v={...v,start_seconds:'0',end_seconds:'3'};validateDrafts(draft(v),schema,meta);
  v={...values,target_id:'diamond-shores',kind:'location',map_id:'synthetic-map',coordinate_system:'normalized_0_1',x:'0.5',y:'0.5'};
  assert.throws(()=>draft(v),/reference screenshot/);
  v={...v,source_url:'https://example.com/synthetic.png',evidence_kind:'screenshot'};validateDrafts(draft(v),schema,meta);
  assert.throws(()=>validateDrafts(draft({...v,x:'1.1'}),schema,meta),/between 0 and 1/);
});
test('future and pre-demo observations are rejected even for drafts',()=>{
  assert.throws(()=>validateDrafts(draft({...values,observed_at:'2099-01-01T01:00:00Z'}),schema,meta),/within the demo/);
  assert.throws(()=>validateDrafts(draft({...values,observed_at:'2026-01-01T01:00:00Z'}),schema,meta),/within the demo/);
});
test('broken evidence references cannot survive browser import',()=>{
  const b=draft();b.records[0].evidence_ids=['missing'];assert.throws(()=>mergeDrafts(emptyBundle(meta),b,schema,meta),/Missing evidence/);
});
