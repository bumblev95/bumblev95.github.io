/** Deterministic quiz engine. Network identity and photo ownership belong to the server. */
export const meta = Object.freeze({game:'그때 우리',minPlayers:2,maxPlayers:8});
export function setup(players) {
  return {phase:'lobby',players:players.map(p=>({...p,score:0})),hostId:players[0]?.id||'',questions:{},order:[],round:0,answers:{},awards:{},endReason:''};
}
const fail = error => ({ok:false,error});
const text = (s,n) => typeof s==='string' && s.trim().length>0 && s.length<=n;
export function validateAction(s,id,a) {
  if(!a||typeof a!=='object'||Array.isArray(a))return fail('올바르지 않은 요청이에요.');
  if(!s.players.some(p=>p.id===id))return fail('이 방의 참가자가 아니에요.');
  const q=s.questions[s.order[s.round]];
  if(a.type==='submitQuestion') {
    if(s.phase!=='lobby')return fail('대기방에서만 문제를 등록할 수 있어요.');
    if(!text(a.prompt,160)||!text(a.photoId,64)||!Array.isArray(a.options)||a.options.length!==4||!a.options.every(x=>text(x,60)))return fail('사진, 질문, 보기 네 개를 확인해 주세요.');
    if(new Set(a.options.map(x=>x.trim().normalize('NFC'))).size!==4)return fail('보기는 서로 다르게 적어 주세요.');
    if(!Number.isInteger(a.correctIndex)||a.correctIndex<0||a.correctIndex>3)return fail('정답을 하나 선택해 주세요.');
    if(typeof a.story!=='string'||a.story.length>240||a.confirmed!==true)return fail('정답과 사진 공유 동의를 확인해 주세요.');
    return {ok:true};
  }
  if(a.type==='removeQuestion')return s.phase==='lobby'?{ok:true}:fail('진행 중에는 수정할 수 없어요.');
  if(a.type==='start') {
    if(id!==s.hostId||s.phase!=='lobby')return fail('방장만 대기방에서 시작할 수 있어요.');
    if(s.players.length<2)return fail('친구 한 명 이상을 초대해 주세요.');
    if(!s.players.every(p=>s.questions[p.id]))return fail('모두 한 문제씩 준비하면 시작할 수 있어요.');
    return {ok:true};
  }
  if(a.type==='end')return id===s.hostId&&s.phase!=='finished'?{ok:true}:fail('방장만 모임을 종료할 수 있어요.');
  if(a.type==='report')return q&&['question','reveal'].includes(s.phase)?{ok:true}:fail('현재 문제에서만 신고할 수 있어요.');
  if(!q||a.round!==s.round)return fail('문제가 바뀌었어요. 현재 화면에서 다시 시도해 주세요.');
  if(a.type==='answer') {
    if(s.phase!=='question')return fail('이미 정답을 공개했어요.');
    if(q.authorId===id)return fail('출제자는 자신의 문제에 답하거나 점수를 받을 수 없어요.');
    if(Object.hasOwn(s.answers,id))return fail('이미 답을 제출했어요.');
    if(!Number.isInteger(a.choice)||a.choice<0||a.choice>3)return fail('보기 중 하나를 선택해 주세요.');
    return {ok:true};
  }
  if(a.type==='reveal')return s.phase==='question'&&id===s.hostId&&a.confirmed===true?{ok:true}:fail('방장만 미응답자를 확인하고 정답을 공개할 수 있어요.');
  if(a.type==='next')return s.phase==='reveal'&&(id===s.hostId||id===q.authorId)?{ok:true}:fail('방장 또는 출제자가 다음으로 넘겨 주세요.');
  return fail('지원하지 않는 요청이에요.');
}
function revealed(s) {
  const q=s.questions[s.order[s.round]],awards={};
  const players=s.players.map(p=>{const gain=p.id!==q.authorId&&s.answers[p.id]===q.correctIndex?100:0;awards[p.id]=gain;return {...p,score:p.score+gain};});
  return {...s,phase:'reveal',players,awards};
}
export function applyAction(s,id,a) {
  if(a.type==='submitQuestion')return {...s,questions:{...s.questions,[id]:{authorId:id,photoId:a.photoId,prompt:a.prompt.trim(),options:a.options.map(x=>x.trim()),correctIndex:a.correctIndex,story:a.story.trim()}}};
  if(a.type==='removeQuestion'){const questions={...s.questions};delete questions[id];return {...s,questions};}
  if(a.type==='start')return {...s,phase:'question',order:s.players.map(p=>p.id),round:0,answers:{},awards:{}};
  if(a.type==='answer'){const next={...s,answers:{...s.answers,[id]:a.choice}};return Object.keys(next.answers).length===s.players.length-1?revealed(next):next;}
  if(a.type==='reveal')return revealed(s);
  if(a.type==='next')return s.round+1>=s.order.length?{...s,phase:'finished',questions:{},answers:{},awards:{},endReason:'completed'}:{...s,phase:'question',round:s.round+1,answers:{},awards:{}};
  if(a.type==='end'||a.type==='report')return {...s,phase:'finished',questions:{},answers:{},awards:{},endReason:a.type==='report'?'reported':'host-ended'};
  return s;
}
export function isGameOver(s) {
  if(s.phase!=='finished')return {over:false};
  const best=Math.max(0,...s.players.map(p=>p.score));
  const winners=s.endReason==='completed'?s.players.filter(p=>p.score===best).map(p=>p.id):[];
  return {over:true,winner:winners[0]||null,winners};
}
export function viewFor(s,id) {
  if(!s.players.some(p=>p.id===id))return null;
  const q=s.questions[s.order[s.round]],show=s.phase==='reveal';
  return {phase:s.phase,players:s.players.map(p=>({...p})),hostId:s.hostId,you:id,round:s.round,total:s.order.length,readyIds:Object.keys(s.questions),myQuestion:s.phase==='lobby'?(s.questions[id]||null):null,current:q?{authorId:q.authorId,photoId:q.photoId,prompt:q.prompt,options:[...q.options],...(show||id===q.authorId?{correctIndex:q.correctIndex}:{}),...(show?{story:q.story}:{})}:null,answeredIds:Object.keys(s.answers),myAnswer:s.answers[id]??null,answers:show?{...s.answers}:{},awards:show?{...s.awards}:{},endReason:s.endReason,result:isGameOver(s)};
}
