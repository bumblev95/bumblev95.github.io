import {storageKey,emptyBundle,observation,validateDrafts,mergeDrafts} from './playtest-drafts.mjs';

const ko=document.documentElement.lang==='ko';
const say=(en,kr)=>ko?kr:en;
const app=document.getElementById('notebook-app');
const message=document.getElementById('notebook-message');
const base='/player-codex/archeage-chronicles/data/';
const show=value=>{message.textContent=value;};
try {
  const responses=await Promise.all(['playtest-records.json','playtest.schema.json'].map(name=>fetch(base+name,{cache:'no-cache'})));
  if(responses.some(r=>!r.ok)) throw new Error('Unable to load the playtest form metadata.');
  const [meta,schema]=await Promise.all(responses.map(r=>r.json()));
  let bundle=emptyBundle(meta);
  let blocked=false;
  app.hidden=false;
  const form=document.getElementById('playtest-form');
  const target=form.elements.target_id;
  const kind=form.elements.kind;
  const types={class:['Class / weapons','클래스 / 무기'],skill:['Skill value','스킬 수치'],stat:['Attribute value','능력치 수치'],trait:['Weapon trait','무기 특성'],location:['NPC / quest / travel point','NPC / 퀘스트 / 이동 거점'],collectible:['Collectible position','수집물 위치'],boss_pattern:['Boss pattern','보스 패턴'],channel:['Channel difference','채널 차이']};
  for(const t of meta.checklist) target.add(new Option(t.title[ko?'ko':'en'],t.id));
  const fields=()=>{for(const set of form.querySelectorAll('[data-kinds]')) {set.hidden=!set.dataset.kinds.split(' ').includes(kind.value);set.disabled=set.hidden;}};
  const targetChanged=()=>{kind.replaceChildren();for(const k of meta.checklist.find(t=>t.id===target.value).kinds) kind.add(new Option(types[k][ko?1:0],k));fields();};
  target.addEventListener('change',targetChanged);kind.addEventListener('change',fields);targetChanged();
  function persist(next) {
    validateDrafts(next,schema,meta);
    bundle=next;
    try {localStorage.setItem(storageKey,JSON.stringify(bundle));return true;}
    catch {show(say('Browser storage unavailable. Export this session before leaving.','브라우저 저장을 사용할 수 없습니다. 나가기 전에 초안 파일을 내보내세요.'));return false;}
  }
  function list() {
    document.getElementById('draft-count').textContent=say(`${bundle.records.length} unverified local drafts`, `미검증 로컬 초안 ${bundle.records.length}개`);
    const ul=document.getElementById('draft-list');ul.replaceChildren();
    for(const r of bundle.records) {
      const li=document.createElement('li');
      const label=document.createElement('span');label.textContent=(r.title[ko?'ko':'en']||r.title.en||r.title.ko)+' · '+r.context.build;
      const remove=document.createElement('button');remove.type='button';remove.className='btn';remove.textContent=say('Remove draft','초안 삭제');
      remove.setAttribute('aria-label',say('Remove draft: ','초안 삭제: ')+label.textContent);
      remove.addEventListener('click',()=>{const next=structuredClone(bundle);next.records=next.records.filter(x=>x.id!==r.id);const used=new Set(next.records.flatMap(x=>x.evidence_ids));next.evidence=next.evidence.filter(e=>used.has(e.id));persist(next);list();});
      li.append(label,remove);ul.append(li);
    }
  }
  let saved;
  try {saved=localStorage.getItem(storageKey);} catch {show(say('Browser storage unavailable; use export to keep drafts.','브라우저 저장을 사용할 수 없습니다. 내보내기로 초안을 보관하세요.'));}
  if(saved) {
    try {bundle=validateDrafts(JSON.parse(saved),schema,meta);}
    catch {
      blocked=true;
      show(say('Saved draft metadata is old or invalid. Export it first; the stored draft will not be overwritten.','저장된 초안이 현재 데모와 다르거나 유효하지 않습니다. 먼저 내보내세요. 기존 초안은 덮어쓰지 않습니다.'));
      form.querySelector('button[type="submit"]').disabled=true;
      document.getElementById('import-drafts').disabled=true;
    }
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(blocked)return;
    try {
      const next=observation(Object.fromEntries(new FormData(form)),meta,bundle);
      const stored=persist(next);list();
      if(stored) show(say('Unverified draft saved in this browser. Export it for repository review.','미검증 초안을 이 브라우저에 저장했습니다. 파일로 내보내 검토할 수 있습니다.'));
    } catch(error) {show(say('Draft was not saved: ','초안을 저장하지 못했습니다: ')+error.message);}
  });
  document.getElementById('export-drafts').addEventListener('click',()=>{
    const blob=new Blob([blocked?saved:JSON.stringify(bundle,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='archeage-playtest-drafts.json';a.click();URL.revokeObjectURL(url);
    if(blocked) {
      document.getElementById('restart-drafts').hidden=false;
      show(say('Old draft exported. After keeping the file, use “Start a new notebook draft” to replace only this notebook’s saved draft.','기존 초안을 내보냈습니다. 파일을 보관한 뒤 “이 기록장에 새 초안 시작”을 누르면 이 기록장의 초안만 새로 시작합니다.'));
    }
  });
  document.getElementById('restart-drafts').addEventListener('click',()=>{
    if(!blocked)return;
    try {
      localStorage.removeItem(storageKey);
      bundle=emptyBundle(meta);blocked=false;saved=null;
      form.querySelector('button[type="submit"]').disabled=false;
      document.getElementById('import-drafts').disabled=false;
      document.getElementById('restart-drafts').hidden=true;
      list();show(say('New notebook draft started. Other browser data was preserved.','이 기록장에 새 초안을 시작했습니다. 다른 브라우저 데이터는 유지됩니다.'));
    } catch {show(say('Unable to reset the notebook draft; keep your exported file.','초안을 초기화하지 못했습니다. 내보낸 파일을 보관해 주세요.'));}
  });
  document.getElementById('import-drafts').addEventListener('change',async event=>{
    try {
      if(blocked)return;
      const file=event.target.files[0];if(!file)return;
      if(file.size>2_000_000)throw new Error('Draft file exceeds 2 MB.');
      const next=mergeDrafts(bundle,JSON.parse(await file.text()),schema,meta);
      const stored=persist(next);list();
      if(stored)show(say('Imported unverified drafts. No guide was published.','미검증 초안을 가져왔습니다. 공략으로 공개되지는 않았습니다.'));
    } catch(error) {show(say('Import failed; existing drafts were kept: ','가져오지 못했습니다. 기존 초안은 유지됩니다: ')+error.message);}
    finally {event.target.value='';}
  });
  list();
} catch(error) {
  app.hidden=false;
  for(const control of app.querySelectorAll('input,select,textarea,button')) control.disabled=true;
  show(say('The draft form could not load. Reload the page. ','기록 양식을 불러오지 못했습니다. 새로고침해 주세요. ')+error.message);
}
