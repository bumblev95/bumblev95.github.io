/** Deterministic quiz engine. Network identity and photo ownership belong to the server. */
export const meta = Object.freeze({game:'그때 우리',minPlayers:2,maxPlayers:10,maxQuestions:30,maxQuestionsPerPlayer:3});
export function setup(players,settings={}) {
  return {partyMissions:settings.mode==='party'&&settings.partyMissions===true,partyMission:null,mode:settings.mode||'memory',scoring:settings.scoring!==false,phase:'lobby',players:players.map(p=>({...p,score:0})),hostId:players[0]?.id||'',answerOnlyIds:[],questions:{},order:[],round:0,answers:{},answerPoints:{},awards:{},partyMission:null,endReason:''};
}
export const questionKey=(id,slot=0)=>slot===0?id:id+':'+slot;
const myQuestions=(s,id)=>Object.entries(s.questions).filter(([,q])=>q.authorId===id);
const fail = error => ({ok:false,error});
const text = (s,n) => typeof s==='string' && s.trim().length>0 && s.length<=n;
export function validateAction(s,id,a) {
  if(!a||typeof a!=='object'||Array.isArray(a))return fail('올바르지 않은 요청이에요.');
  if(!s.players.some(p=>p.id===id))return fail('이 방의 참가자가 아니에요.');
  const q=s.questions[s.order[s.round]];
  if(['submitQuestion','removeQuestion'].includes(a.type)&&a.slot!==undefined&&(!Number.isInteger(a.slot)||a.slot<0||a.slot>2))return fail('한 사람당 최대 3문제예요.');
  if(a.type==='answerOnly')return s.phase==='lobby'&&typeof a.enabled==='boolean'?{ok:true}:fail('대기방에서 참여 방식을 선택해 주세요.');
  if(a.type==='submitQuestion') {
    if(s.phase!=='lobby')return fail('대기방에서만 문제를 등록할 수 있어요.');
    if(a.media!==undefined&&!['photo','text','illustration'].includes(a.media))return fail('사진 또는 글 문제를 선택해 주세요.');
    if(!text(a.prompt,160)||(!(['text','illustration'].includes(a.media)&&a.photoId==='')&&!text(a.photoId,64))||!Array.isArray(a.options)||a.options.length!==4||!a.options.every(x=>text(x,60)))return fail('사진, 질문, 보기 네 개를 확인해 주세요.');
    if(new Set(a.options.map(x=>x.trim().normalize('NFC'))).size!==4)return fail('보기는 서로 다르게 적어 주세요.');
    if(!Number.isInteger(a.correctIndex)||a.correctIndex<0||a.correctIndex>3)return fail('정답을 하나 선택해 주세요.');
    if(typeof a.story!=='string'||a.story.length>240||a.confirmed!==true)return fail('정답과 사진 공유 동의를 확인해 주세요.');
    if(a.allowKeepsake!==undefined&&typeof a.allowKeepsake!=='boolean')return fail('추억집 저장 동의를 확인해 주세요.');
    return {ok:true};
  }
  if(a.type==='removeQuestion')return s.phase==='lobby'?{ok:true}:fail('진행 중에는 수정할 수 없어요.');
  if(a.type==='start') {
    if(id!==s.hostId||s.phase!=='lobby')return fail('방장만 대기방에서 시작할 수 있어요.');
    if(s.players.length<2)return fail('친구 한 명 이상을 초대해 주세요.');
    if(!Object.keys(s.questions).length)return fail('문제를 하나 이상 준비해 주세요.');
    if(!s.players.every(p=>myQuestions(s,p.id).length||(s.answerOnlyIds||[]).includes(p.id)))return fail('문제를 준비하거나 답만 맞히기를 선택해 주세요.');
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
  if(['missionDone','missionSkip'].includes(a.type))return s.phase==='reveal'&&s.partyMission?.status==='pending'&&(id===s.partyMission.targetId||(a.type==='missionSkip'&&id===s.hostId))?{ok:true}:fail('미션 대상자만 완료할 수 있고, 대상자나 방장은 건너뛸 수 있어요.');
  if(a.type==='reveal')return s.phase==='question'&&id===s.hostId&&a.confirmed===true?{ok:true}:fail('방장만 미응답자를 확인하고 정답을 공개할 수 있어요.');
  if(a.type==='next')return s.phase==='reveal'&&id===s.hostId?{ok:true}:fail('방장이 다음으로 넘겨 주세요.');
  return fail('지원하지 않는 요청이에요.');
}
function revealed(s) {
  const q=s.questions[s.order[s.round]],awards={};
  const players=s.players.map(p=>{const gain=s.scoring!==false&&p.id!==q.authorId&&s.answers[p.id]===q.correctIndex?(s.answerPoints?.[p.id]??100):0;awards[p.id]=gain;return {...p,score:p.score+gain};});
  const eligible=players.filter(p=>p.id!==q.authorId),lowest=Math.min(...eligible.map(p=>awards[p.id]));
  const tied=eligible.filter(p=>awards[p.id]===lowest),target=tied[s.round%tied.length];
  const prompts=['사진 속 그날을 세 단어로 표현해 주세요.','함께한 사람 한 명에게 고마웠던 일을 말해 주세요.','그날 어울리는 노래 제목 하나를 골라 주세요.','사진에 재미있는 제목을 붙여 주세요.','그날 가장 기억나는 음식이나 장소를 말해 주세요.','다음에 함께 하고 싶은 일을 하나 말해 주세요.'];
  const partyMission=s.mode==='party'&&s.partyMissions&&target?{targetId:target.id,prompt:prompts[s.round%prompts.length],status:'pending'}:null;
  return {...s,phase:'reveal',players,awards,partyMission};
}
export function applyAction(s,id,a) {
  if(['missionDone','missionSkip'].includes(a.type))return {...s,partyMission:{...s.partyMission,status:a.type==='missionDone'?'done':'skipped'}};
  if(a.type==='answerOnly')return {...s,answerOnlyIds:a.enabled?[...new Set([...(s.answerOnlyIds||[]),id])]:(s.answerOnlyIds||[]).filter(x=>x!==id)};
  if(a.type==='submitQuestion')return {...s,answerOnlyIds:(s.answerOnlyIds||[]).filter(x=>x!==id),questions:{...s.questions,[questionKey(id,a.slot||0)]:{questionId:questionKey(id,a.slot||0),slot:a.slot||0,authorId:id,media:a.media||'photo',photoId:a.photoId,prompt:a.prompt.trim(),options:a.options.map(x=>x.trim()),correctIndex:a.correctIndex,story:a.story.trim(),allowKeepsake:a.allowKeepsake===true}}};
  if(a.type==='removeQuestion'){const questions={...s.questions};delete questions[questionKey(id,a.slot||0)];return {...s,questions};}
  if(a.type==='start')return {...s,phase:'question',order:[0,1,2].flatMap(slot=>s.players.map(p=>questionKey(p.id,slot)).filter(key=>s.questions[key])),round:0,answers:{},answerPoints:{},awards:{},partyMission:null};
  if(a.type==='answer'){const next={...s,answers:{...s.answers,[id]:a.choice},answerPoints:{...s.answerPoints,[id]:Number.isInteger(a.serverPoints)?Math.max(0,Math.min(100,a.serverPoints)):100}};return Object.keys(next.answers).length===s.players.length-1?revealed(next):next;}
  if(a.type==='reveal')return revealed(s);
  if(a.type==='next')return s.round+1>=s.order.length?{...s,phase:'finished',questions:{},answers:{},answerPoints:{},awards:{},partyMission:null,endReason:'completed'}:{...s,phase:'question',round:s.round+1,answers:{},answerPoints:{},awards:{},partyMission:null};
  if(a.type==='end'||a.type==='report')return {...s,phase:'finished',questions:{},answers:{},answerPoints:{},awards:{},partyMission:null,endReason:a.type==='report'?'reported':'host-ended'};
  return s;
}
export function isGameOver(s) {
  if(s.phase!=='finished')return {over:false};
  const best=Math.max(0,...s.players.map(p=>p.score));
  const winners=s.endReason==='completed'&&s.scoring!==false?s.players.filter(p=>p.score===best).map(p=>p.id):[];
  return {over:true,winner:winners[0]||null,winners};
}
export function viewFor(s,id) {
  if(!s.players.some(p=>p.id===id))return null;
  const q=s.questions[s.order[s.round]],show=s.phase==='reveal';
  return {partyMissions:s.partyMissions===true,partyMission:show&&s.partyMission?{...s.partyMission}:null,mode:s.mode||'memory',scoring:s.scoring!==false,phase:s.phase,players:s.players.map(p=>({...p})),hostId:s.hostId,you:id,round:s.round,total:s.order.length,questionLimit:3,totalPrepared:Object.keys(s.questions).length,questionCounts:Object.fromEntries(s.players.map(p=>[p.id,myQuestions(s,p.id).length])),answerOnlyIds:[...(s.answerOnlyIds||[])],readyIds:s.players.filter(p=>myQuestions(s,p.id).length||(s.answerOnlyIds||[]).includes(p.id)).map(p=>p.id),myQuestions:s.phase==='lobby'?myQuestions(s,id).map(([,q])=>({...q})):[],myQuestion:s.phase==='lobby'?(s.questions[id]||null):null,current:q?{questionId:q.questionId||s.order[s.round],media:q.media||'photo',authorId:q.authorId,photoId:q.photoId,prompt:q.prompt,options:[...q.options],allowKeepsake:q.allowKeepsake===true,...(show||id===q.authorId?{correctIndex:q.correctIndex}:{}),...(show?{story:q.story}:{})}:null,answeredIds:Object.keys(s.answers),myAnswer:s.answers[id]??null,answers:show?{...s.answers}:{},awards:show?{...s.awards}:{},endReason:s.endReason,result:isGameOver(s)};
}
