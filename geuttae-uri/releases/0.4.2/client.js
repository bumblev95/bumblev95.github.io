import {mountBook,downloadBookPDF} from './book-viewer.js';
import {setup,validateAction,applyAction,viewFor} from './logic.js';
import {memoryProduct,captureMemory,buildMemoryBook,renderMemoryHTML,memoryTemplates,memoryPalettes,memoryStyleCSS} from './memory.js';
import {questionStarters,sampleDraft,validateDraftInput} from './draft.js';
import {productFor} from './products.js';
const $=s=>document.querySelector(s);
const app=$('#app'),modal=$('#modal');
const apiBase=window.__API_BASE__||'';
const offline=location.protocol==='file:'||window.__OFFLINE__===true;
const asset=name=>window.__ASSETS__?.[name]||(window.__ASSET_BASE__||'/assets/')+name;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
 plus:'<path d="M12 5v14M5 12h14"/>',
 join:'<path d="M14 4h5v16h-5M3 12h12M10 7l5 5-5 5"/>',
 back:'<path d="M15 5l-7 7 7 7"/>',
 photo:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="M3 17l6-6 4 4 3-3 5 5"/>',
 share:'<path d="M12 16V3M7 8l5-5 5 5M5 13v7h14v-7"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 018 0v4M12 14v3"/>',
 trophy:'<path d="M7 3h10v7a5 5 0 01-10 0V3zM7 5H3v3a5 5 0 005 5M17 5h4v3a5 5 0 01-5 5M12 15v5M8 21h8"/>',
 heart:'<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-4 5 3 11 8 15 5-4 12-10 8-15z"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.photo}</svg>`;
const ui={data:null,code:'',demo:false,demoState:null,demoPhotos:{},selected:null,connected:false,busy:false,nickname:'',source:null};
let draft=null,confirmation=null,previousFocus=null,toastTimer=null;
let serverClockOffset=0;
let memoryEntries=new Map(),memoryConsent=new Map(),memoryBook=null,memoryHTML='',memoryEpoch=0,adShown=false,memoryImages={},memoryMissing=[],memoryTemplate='photobook',memoryPalette='cream',memoryIncludeChoices=false,memoryTitle='',memoryCoverPhotoId='';
function clearMemory(){memoryEpoch++;memoryEntries.clear();memoryConsent.clear();memoryBook=null;memoryHTML='';adShown=false;memoryImages={};memoryMissing=[];memoryTemplate='photobook';memoryPalette='cream';memoryIncludeChoices=false;memoryTitle='';memoryCoverPhotoId='';}
function recordMemory(view){const entry=captureMemory(view,memoryConsent.get(view?.current?.photoId));if(entry)memoryEntries.set(view.round,entry);}
const photos=new Map();
const sessionKey=code=>'gu-session:'+apiBase+':'+code;
function sessionToken(code){try{return sessionStorage.getItem(sessionKey(code))||'';}catch{return '';}}
function remember(code,secret){if(secret)try{sessionStorage.setItem(sessionKey(code),secret);}catch{throw new Error('이 브라우저에서 세션 저장을 허용한 뒤 다시 입장해 주세요.');}}
function authHeaders(code=ui.code){const secret=sessionToken(code);return secret?{Authorization:'Bearer '+secret}:{};}
function clearPhotos(keep=[]){for(const [id,p] of photos)if(!keep.includes(id)){p.abort.abort();if(p.url)URL.revokeObjectURL(p.url);photos.delete(id);}}

function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4200);}
function photoSrc(id){
 if(ui.demo)return ui.demoPhotos[id]||asset(id+'.svg');
 const cached=photos.get(id);if(cached)return cached.url||asset('icon.svg');
 const entry={abort:new AbortController(),url:null};photos.set(id,entry);
 const timer=setTimeout(()=>entry.abort.abort(),12000);
 fetch(apiBase+`/api/rooms/${ui.code}/photo/${id}`,{headers:authHeaders(),credentials:'omit',cache:'no-store',signal:entry.abort.signal})
  .then(async r=>{if(!r.ok)throw new Error('사진을 불러오지 못했어요.');const blob=await r.blob();if(photos.get(id)!==entry)return;entry.url=URL.createObjectURL(blob);render();
   if(draft?.photoId===id&&$('#photo-pick img'))$('#photo-pick img').src=entry.url;
   if(modal.open&&modal.querySelector('.zoom-photo'))modal.querySelector('.zoom-photo').src=entry.url;
  }).catch(e=>{if(e.name!=='AbortError')toast(e.message+' 화면을 다시 연결하면 재시도해요.');}).finally(()=>clearTimeout(timer));
 return asset('icon.svg');
}
function avatar(p,index=0){return `<span class="avatar c${index%4}" aria-hidden="true">${esc((p.name||'?').slice(0,1))}</span>`;}
function button(label,action,style='primary',disabled=false,extra=''){return `<button class="button ${style}" data-action="${action}" ${disabled?'disabled':''} ${extra}>${label}</button>`;}
function stateAccept(data){
 if(data.code===ui.code&&Number.isFinite(data.revision)&&data.revision<(ui.data?.revision||0))return;
 if(ui.code&&data.code!==ui.code)clearMemory();
 if(Number.isFinite(data.serverNow))serverClockOffset=data.serverNow-Date.now();
 const prev=ui.data?.view;const next=data.view;
 if(ui.data&&data.code===ui.code&&(data.gameNumber||0)!==(ui.data.gameNumber||0)){if(modal.open)closeModal();clearMemory();clearPhotos();adShown=false;}
 if(data.access!=='active'||(next?.phase==='finished'&&next.endReason!=='completed'))clearMemory();
 if(data.access==='active'&&next?.phase==='finished'&&next.endReason==='completed'&&data.memorySnapshot){
  memoryBook={...data.memorySnapshot.book,date:new Date(data.memorySnapshot.createdAt).toLocaleDateString('ko-KR')};memoryImages=data.memorySnapshot.images;memoryMissing=data.memorySnapshot.missing;
 }
 if(ui.demo)recordMemory(next);
 if(!ui.demo){const keep=data.access==='active'&&next?.phase!=='finished'?[next?.myQuestion?.photoId,next?.current?.photoId].filter(Boolean):[];clearPhotos(keep);}
 if((data.access!=='active'||draft&&next?.phase!=='lobby')&&modal.open)closeModal();
 if(!prev||prev.round!==next?.round||prev.phase!==next?.phase||ui.code!==data.code)ui.selected=null;
 const {memorySnapshot,...state}=data;ui.data=state;ui.code=data.code;updateAiControls();
 if(['blocked','left'].includes(data.access)){ui.source?.close();ui.source=null;}
 render();
}
async function request(pathPart,body,opts={}){
 const control=new AbortController();const timer=setTimeout(()=>control.abort(),25000);
 try{
  const code=pathPart.match(/\/rooms\/([A-HJ-NP-Z2-9]{8})/)?.[1]||ui.code;
  const response=await fetch(apiBase+pathPart,{method:body===undefined?'GET':'POST',credentials:'omit',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:control.signal,...opts,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...authHeaders(code),...(opts.headers||{})}});
  let result;try{result=await response.json();}catch{throw new Error('서버 응답을 확인하지 못했어요.');}
  if(!response.ok){const error=new Error(result.error||'요청을 처리하지 못했어요.');error.status=response.status;throw error;}
  if(result.sessionToken){remember(result.code,result.sessionToken);delete result.sessionToken;}
  if(result.access)stateAccept(result);return result;
 }catch(e){if(e.name==='AbortError')throw new Error('연결이 지연됐어요. 새로고침해 등록 여부를 확인해 주세요.');throw e;}finally{clearTimeout(timer);}
}
function connect(code){
 ui.source?.close();ui.connected=false;
 let closed=false,controller=null,retry=null,watchdog=null;
 const source={close(){closed=true;clearTimeout(retry);clearTimeout(watchdog);controller?.abort();}};ui.source=source;
 async function run(){
  controller=new AbortController();
  try{
   const response=await fetch(apiBase+`/api/rooms/${code}/events`,{headers:authHeaders(code),credentials:'omit',cache:'no-store',signal:controller.signal});
   if([401,403,404,410].includes(response.status)){
    source.close();ui.source=null;ui.connected=false;clearPhotos();
    if(response.status===401){goHomeNow();openEntry('join',code);}else if(response.status===403){await request(`/api/rooms/${code}/state`);}else{goHomeNow();toast('모임이 없거나 만료됐어요. 새 모임을 만들어 주세요.');}
    return;
   }
   if(!response.ok)throw new Error('연결 지연');
   // A new transport fetches the latest personalized snapshot; actions are never replayed.
   clearPhotos();ui.connected=true;render();
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
   while(!closed){clearTimeout(watchdog);watchdog=setTimeout(()=>controller.abort(),45000);const {done,value}=await reader.read();if(closed||done)break;buffer+=decoder.decode(value,{stream:true});let end;
    while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
     if(frame.includes('event: expired')){source.close();goHomeNow();toast('모임이 만료되어 사진 접근을 차단했어요.');return;}
     const line=frame.split('\n').find(x=>x.startsWith('data: '));if(line){ui.connected=true;stateAccept(JSON.parse(line.slice(6)));}
    }
   }
  }catch(e){if(!closed&&e.name!=='AbortError')ui.connected=false;}
  finally{clearTimeout(watchdog);controller?.abort();if(!closed){ui.connected=false;render();retry=setTimeout(run,1500);}}
 }
 run();
}
function networkBanner(){return !ui.demo&&!ui.connected?'<div class="connection" role="status">연결을 확인하고 있어요. 자동으로 다시 연결돼요.</div>':'';}
function screenTop(label){return `<div class="screen-top"><button class="back" data-action="home">${icon('back')}<span>${label||'홈으로'}</span></button><span class="pill ${ui.demo?'demo':''}">${ui.demo?'체험 모드':'우리끼리 비공개'}</span></div>`;}
function render(){
 document.body.dataset.screen=ui.data?.view&&['question','reveal'].includes(ui.data.view.phase)?'quiz':(ui.data?.view?.phase||'home');
 if(!ui.data){app.innerHTML=homeMarkup();return;}
 if(ui.data.access!=='active'){app.innerHTML=pendingMarkup();return;}
 const v=ui.data.view;if(!v){app.innerHTML='<div class="loading-state">방 상태를 다시 확인해 주세요.</div>';return;}
 app.innerHTML=v.phase==='lobby'?lobbyMarkup(v):v.phase==='finished'?resultMarkup(v):quizMarkup(v);
}
function homeMarkup(){return `<section class="fade-in">${offline?'<div class="offline-note">서버 연결이 아직 설정되지 않았어요. 가상 친구 체험은 사용할 수 있어요.</div>':''}
 <div class="eyebrow">우리의 기억으로 노는 시간</div><h1 class="home-title">같은 사진,<br><em>서로 다른 기억.</em></h1>
 <p class="intro-sub">친구와 가족, 사진 한 장이면 충분해요.<br>그날의 이야기를 다시 꺼내 볼까요?</p>
 <div class="memory-collage" aria-label="바다 여행, 피크닉, 카페를 담은 예시 그림 세 장"><figure class="polaroid first"><span class="tape"></span><img src="${asset('seaside.svg')}" alt="햇살 아래 바다와 파라솔의 예시 그림"><figcaption>함께 갔던 바다</figcaption></figure><figure class="polaroid second"><span class="tape"></span><img src="${asset('picnic.svg')}" alt="돗자리와 소풍 바구니의 예시 그림"><figcaption>유난히 웃던 날</figcaption></figure><figure class="polaroid third"><img src="${asset('cafe.svg')}" alt="따뜻한 카페에서 마시는 음료의 예시 그림"><figcaption>우리의 작은 순간</figcaption></figure><span class="tiny-star" aria-hidden="true">✧</span><span class="tiny-flower" aria-hidden="true">✳</span></div>
 <div class="collage-note">사진은 예시 그림이에요. 모임에서는 여러분의 사진을 써요.</div>
 <div class="home-actions">${offline?button('먼저 체험해 보기 <span aria-hidden="true">→</span>','demo'):button(icon('plus')+'새 모임 만들기','new')}${offline?button('친구 초대 · 준비 중','new','outline'):button(icon('join')+'방 코드로 참여하기','join','outline')}</div>
 <div class="home-facts">${offline?'<span>다운로드 없이</span><span>가상 친구와</span><span>사진 전송 없음</span>':'<span>친구끼리만</span><span>2–8명</span><span>회원가입 없이</span>'}</div>
 ${offline?'':button('먼저 체험해 보기 <span aria-hidden="true">→</span>','demo','secondary')}
 <div class="how-row"><strong>친구를 초대하고</strong><span class="arrow">→</span><strong>사진을 꺼내고</strong><span class="arrow">→</span><strong>기억을 맞혀요</strong></div>${button('무료·선택 상품 안내','plans','quiet')}</section>`;}
function pendingMarkup(){
 const blocked=['blocked','left'].includes(ui.data.access);
 return `${screenTop()}<section class="waiting-view"><span class="waiting-icon" aria-hidden="true">${blocked?'○':'✉'}</span><h1>${blocked?'이 모임에 참여할 수 없어요':'입장 요청을 보냈어요'}</h1><p>${blocked?'방장에게 확인하거나 새로운 모임을 만들어 주세요.':`${esc(ui.data.nickname)}님, 방장이 친구인지 확인 중이에요.<br>승인되면 대기방으로 자동으로 이동해요.`}</p><span class="pill muted">${esc(ui.data.title)}</span>${!blocked?'<div class="notice">아직 다른 참가자의 사진과 문제는<br>전혀 보이지 않아요.</div>':''}</section>${button('홈으로 돌아가기','home','outline')}`;
}
function playerList(v,rank=false){return `<div class="people">${v.players.map((p,i)=>`<div class="person">${avatar(p,i)}<span class="person-name">${esc(p.name)}${!ui.demo&&!ui.data.connectedIds?.includes(p.id)?'<small>잠시 연결 끊김 · 재접속 대기</small>':''}${p.id===v.you&&p.name!=='나'?'<span class="badge-me">나</span>':''}${p.id===v.hostId?'<small>방장</small>':''}</span>${rank?`<span class="score">${p.score}점</span>`:`<span class="status ${v.readyIds.includes(p.id)?'ready':''}">${v.readyIds.includes(p.id)?'✓ 준비 완료':'사진 준비 중'}</span>${v.you===v.hostId&&p.id!==v.you&&!ui.demo?`<button class="text-button warning" data-action="kick" data-id="${p.id}" aria-label="${esc(p.name)}님 내보내기">×</button>`:''}`}</div>`).join('')}</div>`;}
function lobbyMarkup(v){
 const ready=v.players.length>=2&&v.players.every(p=>v.readyIds.includes(p.id))&&!(ui.data.pending?.length);
 const myQ=v.myQuestion;
 return `<section>${screenTop()}${networkBanner()}<h1 class="section-heading">${esc(ui.data.title)}</h1><p class="small-text muted">각자 사진 한 장, 문제 하나만 준비해 주세요.</p>
 ${ui.demo?'<p class="demo-note">예시 그림과 가상 참가자로 진행하는 체험이에요.</p>':''}
 <div class="invite-card"><div class="invite-heading">${ui.demo?'준비된 예시로 먼저 놀아 봐요':'친구에게 이 방 코드를 알려 주세요'}</div><div class="code-row"><span class="room-code">${ui.demo?'우리의 체험방':esc(ui.code.slice(0,4)+' '+ui.code.slice(4))}</span>${!ui.demo?`<button class="icon-button" data-action="copy-code" aria-label="방 코드 복사">${icon('copy')}</button>`:''}</div>${!ui.demo?button(icon('share')+'초대 링크 보내기','share','small'):''}<p class="microcopy">${ui.demo?'가상 친구 2명과 세 문제를 풀어 볼 수 있어요.':'코드로 입장한 친구를 방장이 승인하면 함께할 수 있어요.'}</p></div>
 <div class="card"><div class="card-heading"><span>함께할 사람들 <small>${v.players.length}/8</small></span><small>${v.readyIds.length}명 준비 완료</small></div>${playerList(v)}${v.players.length<2?'<div class="empty-person" style="margin-top:14px">친구가 들어오면 이곳에서 만나요.</div>':''}
 ${ui.data.pending?.length?`<div class="pending-list"><div class="pending-label">입장 요청 ${ui.data.pending.length}명 · 아는 친구인지 확인해 주세요</div>${ui.data.pending.map(p=>`<div class="pending-person"><span class="person-name">${esc(p.name)}</span><button class="button small secondary" data-action="approve" data-id="${p.id}" ${ui.busy?'disabled':''}>승인</button><button class="button small outline" data-action="deny" data-id="${p.id}" ${ui.busy?'disabled':''}>거절</button></div>`).join('')}</div>`:''}</div>
 <div class="card no-shadow"><div class="card-heading"><span>내가 꺼낼 추억</span><small>한 사람당 1문제</small></div>${myQ?`<div class="photo-ready"><img src="${esc(photoSrc(myQ.photoId))}" alt="내가 준비한 문제의 사진"><div><small>✓ 문제 준비 완료</small><strong>${esc(myQ.prompt)}</strong></div></div><div class="photo-controls"><button class="text-button" data-action="compose">수정하기</button><button class="text-button warning" data-action="remove-question">삭제하기</button></div>`:`<button class="photo-add" data-action="compose"><span class="add-icon">+</span><span><strong>사진으로 문제 만들기</strong><small>그날의 기억, 정답은 내가 가장 잘 아니까.</small></span></button>`}</div>
 <div class="room-bottom">${v.you===v.hostId?button(ui.busy?'처리하는 중…':ui.demo?'기억 대결 체험 시작':'기억 대결 시작하기','start','primary',!ready||ui.busy||(!ui.demo&&!ui.connected)):button('방장이 시작하면 함께 출발해요','none','secondary',true)}<p class="helper">${ready?'돌아가며 출제해요. 내 문제에서는 점수를 얻지 않아요.':'모두 한 문제씩 준비하면 시작할 수 있어요.'}</p></div>
 <div class="notice">${v.mode==='family'?'가족 모드는 속도 감점 없이 함께 이야기해요.':'정답은 최대 100점! 남은 시간 비율로 점수가 줄어요.<br>오답·시간 초과는 0점이에요.'}</div>
 <div style="text-align:center;margin-top:20px"><button class="text-button warning" data-action="${v.you===v.hostId?'end':'leave'}">${v.you===v.hostId?'모임 종료하고 임시 사진 삭제':'대기방 나가기'}</button></div></section>`;
}
function partyMissionMarkup(v){
 const m=v.partyMission;if(!m)return '';
 const target=v.players.find(p=>p.id===m.targetId);if(!target)return '';
 const mine=v.you===m.targetId,host=v.you===v.hostId,disabled=ui.busy||(!ui.demo&&!ui.connected);
 return `<div class="party-mission card" aria-label="선택형 파티 미션"><span class="eyebrow">함께 웃는 잠깐의 미션</span><h2>${esc(target.name)}님의 차례</h2><p>${esc(m.prompt)}</p><p class="microcopy">이번 문제 점수가 가장 낮은 답변자 중 한 명이에요. 동점이면 돌아가며 선택해요.<br>참여는 자유예요. 건너뛰어도 점수는 그대로예요.</p>${m.status==='pending'?`<div class="mission-actions">${mine?button('미션 했어요','missionDone','secondary',disabled):''}${mine||host?button('이번 미션 건너뛰기','missionSkip','quiet',disabled):'<p class="notice">이야기를 듣거나 바로 다음 문제로 넘어가도 좋아요.</p>'}</div>`:`<p class="notice">${m.status==='done'?'함께 이야기했어요!':'이번 미션은 쉬어 가요.'}</p>`}</div>`;
}
function quizMarkup(v){
 const q=v.current;if(!q)return '<div class="loading-state">문제를 불러오고 있어요…</div>';
 const author=v.players.find(p=>p.id===q.authorId),mine=q.authorId===v.you,reveal=v.phase==='reveal';
 const selected=v.myAnswer??ui.selected;
 const mayNext=v.you===v.hostId;
 const choices=q.options.map((answer,i)=>`<button class="choice ${reveal&&q.correctIndex===i?'correct':reveal&&v.myAnswer===i?'wrong':selected===i&&!mine?'selected':''}" data-action="choose" data-choice="${i}" ${mine||reveal||v.myAnswer!==null||ui.busy?'disabled':''} aria-pressed="${selected===i}"><span class="number">${i+1}</span><span class="answer-label">${esc(answer)}</span>${reveal&&q.correctIndex===i?'<span class="checkmark" aria-label="정답">✓</span>':''}</button>`).join('');
 return `<section>${screenTop()}${networkBanner()}<div class="round-line"><span>${({memory:'기억 대결',battle:'추억 배틀',party:'파티 모드',family:'가족 모드'})[v.mode]||'기억 대결'}</span><strong>${String(v.round+1).padStart(2,'0')} <small>/ ${String(v.total).padStart(2,'0')}</small></strong></div><div class="progress" aria-label="${v.total}문제 중 ${v.round+1}번째">${Array.from({length:v.total},(_,i)=>`<span class="${i<v.round?'done':i===v.round?'current':''}"></span>`).join('')}</div>
 ${ui.demo?'<div class="demo-note">예시 그림 · 가상 참가자와의 체험</div>':''}${!ui.demo?v.players.filter(p=>!ui.data.connectedIds?.includes(p.id)).map(p=>`<p class="notice warning">${esc(p.name)}님 연결을 기다리고 있어요. 돌아오면 현재 문제와 점수로 이어져요.</p>`).join(''):''}
 <div class="author-line">${avatar(author,v.round)}<span><strong>${esc(author.name)}</strong>님이 꺼낸 추억 ${mine?'· 내가 출제한 문제':''}</span></div>
 <figure class="quiz-photo" data-action="zoom" role="button" tabindex="0" aria-label="추억 사진 크게 보기"><img src="${esc(photoSrc(q.photoId))}" alt="${esc(author.name)}님이 공유한 추억 사진"><figcaption>${ui.demo?'SAMPLE MEMORY':'OUR LITTLE MEMORY'} · 터치해서 크게 보기</figcaption></figure>
 ${!reveal?'<p id="round-clock" class="notice" role="timer">'+(ui.data.roundDeadlineAt?'남은 시간 확인 중…':'시간제한 없이 함께 풀어요')+'</p>':''}
 <h1 class="question-title">${esc(q.prompt)}</h1><div class="choices" aria-label="문제의 보기">${choices}</div>
 ${mine&&!reveal?`<div class="author-notice"><strong>지금은 내가 이야기꾼이에요.</strong>내가 선택한 정답은 ${q.correctIndex+1}번이에요.<br>친구들이 답하는 동안 기다려 주세요. 내 점수는 변하지 않아요.</div>`:''}
 ${reveal?`<div class="reveal-title">${mine?'친구들은 이렇게 기억했네요.':v.myAnswer!==null&&v.myAnswer===q.correctIndex?'기억이 딱 맞았네요!':'서로 다르게 기억하고 있었네요.'}</div><div class="gain">${v.scoring===false?'점수 없이 함께 기억하는 시간':mine?'출제자 · 이번 문제 점수 없음':v.myAnswer!==null&&v.myAnswer===q.correctIndex?`정답 +${v.awards[v.you]}점`:v.myAnswer===null?'미응답 · 0점':'이번 문제는 0점, 다음 추억도 함께해요.'}</div>${partyMissionMarkup(v)}${q.story?`<div class="story-card"><small>${esc(author.name)}님이 들려주는 그날의 이야기</small><p>${esc(q.story)}</p></div>`:''}<div class="answer-area">${mayNext?button(v.round+1===v.total?(v.scoring===false?'우리 이야기 마치기':'오늘의 기억왕 만나기'):'다음 추억으로','next','primary',ui.busy||(!ui.demo&&!ui.connected)):button('방장이 다음으로 넘겨 주세요','none','secondary',true)}</div>`:
 `<div class="answer-area">${!mine?(v.myAnswer!==null?'<div class="sent-state">✓ 답변을 보냈어요. 잠깐만 기다려 주세요.</div>':button('이 답으로 제출하기','answer','primary',ui.selected===null||ui.busy||(!ui.demo&&!ui.connected))):ui.demo?button('가상 친구들의 답변 확인','demo-answers','secondary',ui.busy):''}<div class="answer-count">${v.answeredIds.length} / ${v.players.length-1}명이 답했어요</div>${v.you===v.hostId&&!ui.demo&&!ui.data.roundDeadlineAt?'<div style="text-align:center"><button class="text-button" data-action="reveal">기다리기 / 미응답자 건너뛰기</button></div>':''}</div>`}
 <details class="mini-score" ${v.scoring===false?'hidden':''} ${reveal?'open':''}><summary>지금까지의 점수</summary>${playerList(v,true)}</details>
 ${!ui.demo?'<div style="display:flex;justify-content:space-between;margin-top:19px"><button class="text-button warning" data-action="report">사진 신고·숨기기</button>'+ (v.you===v.hostId?'<button class="text-button warning" data-action="end">모임 종료</button>':'')+'</div>':''}</section>`;
}
function memoryOfferMarkup(){
 const count=memoryBook?.entries.length||0;
 return `<div class="memory-offer"><span class="memory-offer-icon" aria-hidden="true">${icon('heart')}</span><div class="eyebrow">오늘의 모임을 간직하고 싶다면</div><h2>우리의 작은 추억집</h2><p>사진, 문제, 서로 다른 답변까지.<br>오늘의 이야기를 한 권에 담아요.</p><div class="memory-price"><strong>${memoryProduct.price}</strong><span>한 게임 · 한 번 구매 · 구독 없음</span></div>${button('추억집 미리 보기','memory-preview','secondary',count===0)}<small>${count?`미리보기는 무료예요 · 저장 허용된 추억 ${count}개`:'저장 허용된 추억을 받지 못했어요. 종료 때 연결된 탭에서만 받을 수 있어요.'}</small><small class="preview-disclosure">현재는 무료 저장 체험이며 실제 결제는 없어요.</small></div>`;
}
async function photoForMemory(id){
 const src=photoSrc(id);
 const image=new Image();image.src=src;
 await image.decode();
 // These bundled vector samples have a 700 × 520 viewBox. Rasterize them at
 // book resolution instead of the browser's small default SVG image size.
 const vectorSample=['seaside.svg','picnic.svg','cafe.svg'].some(name=>src===asset(name));
 const width=vectorSample?700:image.naturalWidth,height=vectorSample?520:image.naturalHeight;
 const canvas=document.createElement('canvas'),scale=vectorSample?1200/Math.max(width,height):Math.min(1,1200/Math.max(width,height));
 canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fffdf5';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/jpeg',.8);
}
async function openMemoryPreview(){
 if(!memoryBook?.entries.length||ui.busy)return;
 if(!ui.demo){renderMemoryPreview();return;}
 const book=memoryBook,epoch=memoryEpoch;ui.busy=true;
 showModal('우리의 작은 추억집','<div class="loading-state">저장이 허용된 추억만 모으고 있어요…</div>');
 const images={},missing=[];
 await Promise.all(book.entries.map(async entry=>{try{images[entry.photoId]=await photoForMemory(entry.photoId);}catch{missing.push(entry.photoId);}}));
 ui.busy=false;
 if(epoch!==memoryEpoch||book!==memoryBook||!modal.open)return;
 memoryImages=images;memoryMissing=missing;renderMemoryPreview();
}
function renderMemoryPreview(){
 memoryHTML=renderMemoryHTML(memoryBook,memoryImages,{template:memoryTemplate,palette:memoryPalette,includeChoices:memoryIncludeChoices,title:memoryTitle,coverPhotoId:memoryCoverPhotoId});
 const pages=memoryHTML.split('<main>')[1].split('</main>')[0];
 const choices=(items,selected)=>items.map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${x.name}</option>`).join('');
 showModal('우리의 작은 추억집',`<style>${memoryStyleCSS}</style><p class="pack-disclosure">출시 예정 가격 ${memoryProduct.price} · 한 게임 · 구독 없음<br><strong>현재는 무료 저장 체험이며 돈이 결제되지 않아요.</strong></p><div class="field"><label for="memory-title">추억집 제목</label><input id="memory-title" type="text" maxlength="40" value="${esc(memoryTitle||memoryBook.title)}"><button class="button quiet" type="button" data-action="memory-title-apply">제목 적용</button></div><div class="field"><label for="memory-cover">표지 사진</label><select id="memory-cover"><option value="">첫 번째 사진</option>${memoryBook.entries.filter(entry=>memoryImages[entry.photoId]).map((entry,index)=>`<option value="${esc(entry.photoId)}" ${memoryCoverPhotoId===entry.photoId?'selected':''}>${index+1}. ${esc(entry.author)}님의 사진</option>`).join('')}</select><small>저장을 허용하고 불러온 사진 중에서 골라요.</small></div><div class="memory-design"><label for="memory-template">추억집 디자인<select id="memory-template">${choices(memoryTemplates,memoryTemplate)}</select></label><label for="memory-palette">색상<select id="memory-palette">${choices(memoryPalettes,memoryPalette)}</select></label></div><label class="check-field"><input type="checkbox" id="memory-choices" ${memoryIncludeChoices?'checked':''}>퀴즈 선택지도 포함하기 · 친구들이 고른 답도 담아요</label><p class="microcopy">기본은 질문과 정답만 담아요. 포토북은 사진과 이야기를 먼저 담고, 기억 대결 기록은 뒤쪽에 모아요. 선택한 디자인 그대로 저장돼요.</p>${memoryMissing.length?'<p class="notice warning">불러오지 못한 사진은 빼고 내용만 담았어요.</p>':''}${button('PDF로 간직하기 · 무료','memory-pdf','primary')}${button('앨범 HTML 파일 저장','memory-save','quiet')}<p class="microcopy">저장을 허용한 추억만 포함해요. 내려받은 파일은 기기에 남아요.</p><div id="book-reader" class="book-preview" tabindex="0" aria-label="추억집 페이지 넘기기">${pages}</div><p class="microcopy">좌우로 밀거나 화살표로 넘겨 보세요. PDF는 기기에서 만들어 저장해요. 홈 이동·새로고침·탭 종료 시 앱 안의 추억집은 사라져요. 실제 결제와 장기 클라우드 보관은 아직 연결되지 않았어요.</p>`,'memory');
 mountBook(document.querySelector('#book-reader'));
}

function downloadMemory(){
 if(!memoryBook?.entries.length||!memoryHTML){toast('게임을 마친 뒤 미리보기를 먼저 열어 주세요.');return;}
 const blob=new Blob([memoryHTML],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='Then-Us-Memory-Book-TEST.html';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 toast('앨범 파일 저장을 요청했어요. 다운로드 목록을 확인해 주세요.');
}
function resultMarkup(v){
 const complete=v.endReason==='completed',sorted=[...v.players].sort((a,b)=>b.score-a.score);
 const winners=v.players.filter(p=>v.result.winners?.includes(p.id));const names=v.scoring===false?'함께한 우리':winners.map(p=>p.name).join(' · ');
 const mediaText=ui.demo?'체험에서 선택한 사진은 서버로 보내지 않았어요.':ui.data.mediaStatus==='done'?'서버의 임시 사진을 삭제했어요. 휴대폰 원본은 그대로예요.':'사진 접근을 차단했어요. 서버에서 삭제를 다시 시도하고 있어요.';
 return `<section class="fade-in">${screenTop()}<div class="result-hero"><div class="trophy">${icon(complete?'trophy':'heart')}</div><div class="result-kicker">${v.scoring===false?'우리의 사진 이야기를 마쳤어요':complete?(winners.length>1?'함께 기억한, 오늘의 공동 기억왕':'함께 기억한, 오늘의 기억왕'):'오늘의 모임을 마쳤어요'}</div><h1 class="winner">${complete?`<em>${esc(names)}</em>${winners.length===1?'님!':''}`:v.endReason==='reported'?'사진을 숨기고<br>모임을 종료했어요.':'다음 추억에서<br>또 만나요.'}</h1><p class="result-sub">${complete?'같은 순간을, 이렇게 함께 기억하고 있었네요.':v.endReason==='reported'?'신고 정보는 이 방에 기록됐어요.<br>이번 버전에는 상시 검토 담당자가 연결되어 있지 않아요.':'진행하던 게임의 점수를 아래에 남겼어요.'}</p></div>
 <div class="card no-shadow" ${v.scoring===false?'hidden':''}><div class="card-heading"><span>${complete?'오늘의 기억 순위':'마지막 점수'}</span><small>${v.players.length}명 함께한 시간</small></div><div class="ranking">${sorted.map((p,i)=>{const rank=sorted.findIndex(x=>x.score===p.score)+1;return `<div class="rank-row ${rank===1&&complete?'first':''}"><span class="rank-num">${rank}</span>${avatar(p,i)}<span class="person-name">${esc(p.name)}${p.id===v.you&&p.name!=='나'?'<span class="badge-me">나</span>':''}</span><span class="score">${p.score}<small>점</small></span></div>`;}).join('')}</div></div>
 ${complete?memoryOfferMarkup()+button('선택 상품 안내','plans','quiet'):''}<div class="notice ${ui.data.mediaStatus==='pending'?'warning':''}">${mediaText}</div><p class="closing-quote">사진은 달라도,<br>좋았던 마음은 같으니까.</p>
 ${complete&&!ui.demo&&ui.data.rematchSupported?(v.you===v.hostId?button('같은 멤버로 한 판 더','rematch','primary',ui.busy||!ui.connected||ui.data.mediaStatus!=='done'):'<p class="notice">추억집을 저장한 뒤 방장이 다음 게임을 시작할 수 있어요.</p>'):''}
 ${button(ui.demo?'다른 모임도 만들어 볼까요?':'새로운 모임 만들기','new','primary')}${button('홈으로 돌아가기','home','quiet')}</section>`;
}
function showPlans(){
 const ultimate=productFor('ultimate_monthly'),book=productFor('memory_book');
 showModal('무료로 함께, 우리답게 간직해요',`<p>사진으로 직접 문제를 만들고, 친구를 초대하고, 기억 대결을 즐기는 건 무료예요.</p><div class="notice plan-notice"><strong>지금은 결제 없는 테스트예요.</strong><br>추억집 파일 저장도 무료로 체험할 수 있어요. 아래는 출시를 준비하는 상품 안내예요.</div>
 <section class="plan-card"><div class="plan-heading"><h3>Ultimate</h3><span class="plan-badge">출시 예정</span></div><p class="plan-price">${esc(ultimate.price)}</p><ul><li>매월 AI 초안 300회</li><li>내가 연 모임의 추억집 저장</li><li>광고 없는 모임</li></ul><p class="microcopy">모임의 AI 초안은 방장의 이용 횟수를 함께 써요. 한 번 생성하면 한 번만 사용하고, 생성 실패는 차감하지 않아요.</p><p class="microcopy">월 이용분은 다음 달로 넘어가지 않아요. 따로 산 이용권의 잔액은 남겨 두고, 월 이용분부터 써요.</p><p class="plan-pending">AI 생성·구독·광고 제거는 아직 연결 준비 중이에요.</p></section>
 <section class="plan-card"><div class="plan-heading"><h3>모임 추억집</h3><span class="plan-badge">출시 예정</span></div><p class="plan-price">${esc(book.price)} <small>한 모임 · 일회 구매</small></p><p class="small-text">허용된 사진과 이야기를 참가자들이 함께 간직해요. 우리가 만든 세 가지 디자인에서 골라요.</p><p class="microcopy">구매 여부와 별개로 사진 주인이 저장을 허용한 추억만 담아요. 현재는 무료 저장 체험이에요.</p></section>
 <details class="plan-extras"><summary>필요한 것만 따로</summary><ul><li>AI 100회 이용권</li><li>AI 300회 이용권</li><li>내 화면의 광고 제거</li></ul><p class="microcopy">낱개 옵션도 유지해요. 가격과 실제 구매 연결은 출시 전에 확정할 예정이에요.</p></details>${button('무료 게임 계속하기','close-modal','primary')}`);
}
function showModal(title,body,variant=''){
 modal.classList.toggle('memory-modal',variant==='memory');
 if(!modal.open)previousFocus=document.activeElement;modal.innerHTML=`<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="modal-close" data-action="close-modal" aria-label="닫기">×</button></div><div class="modal-body">${body}</div>`;
 if(!modal.open)modal.showModal();document.body.classList.add('modal-open');
 setTimeout(()=>{const el=modal.querySelector('[autofocus]');if(el)el.focus();},40);
}
function clearDraft(){if(draft?.preview?.startsWith('blob:'))URL.revokeObjectURL(draft.preview);draft=null;}
function closeModal(){modal.close();document.body.classList.remove('modal-open');clearDraft();confirmation=null;if(previousFocus?.isConnected)previousFocus.focus();}
modal.addEventListener('cancel',()=>{document.body.classList.remove('modal-open');clearDraft();confirmation=null;});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
function confirmDialog(title,message,label,callback){showModal(title,`<p>${message}</p><div class="confirm-actions">${button('취소','close-modal','outline')}${button(label,'confirm','primary')}</div>`);confirmation=callback;}
function offlineInfo(){showModal('친구 초대는 준비 중이에요','<p>지금은 가상 친구 2명과 사진 퀴즈를 체험할 수 있어요. 직접 사진을 고르고 질문을 바꾸는 것도 가능해요.</p><p>이 페이지는 화면 체험판이에요. 실제 친구와 연결되는 서버와 AI 자동 출제는 아직 연결되지 않았어요.</p>'+button('먼저 체험하기','demo','secondary'));}
function openEntry(kind,code=''){
 if(offline){offlineInfo();return;}
 showModal(kind==='new'?'새로운 모임 만들기':'친구들의 모임에 참여하기',`<p>${kind==='new'?'사진 한 장으로 시작하는 우리만의 모임이에요.':'방 코드로 입장 요청을 보내면 방장이 확인해 줘요.'}</p><form id="entry-form" data-kind="${kind}">${kind==='join'?`<label class="field"><span>방 코드</span><input name="code" class="code-input" placeholder="ABCD EFGH" value="${esc(code)}" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" required ${!code?'autofocus':''}></label>`:''}<label class="field"><span>나를 부를 닉네임</span><input name="nickname" placeholder="친구들이 알아볼 이름" maxlength="16" value="${esc(ui.nickname)}" required ${kind==='new'||code?'autofocus':''} autocomplete="off"></label>${kind==='new'?'<label class="field"><span>게임 모드</span><select name="mode" id="room-mode"><option value="memory">기억 대결</option><option value="battle">추억 배틀</option><option value="party">파티 모드</option><option value="family">가족 모드</option></select></label><label class="check-field" id="party-missions" hidden><input type="checkbox" name="partyMissions"><span>정답 공개 후 가벼운 파티 미션 켜기 · 언제든 건너뛸 수 있어요</span></label><label class="field" id="room-time"><span>문제당 제한 시간</span><select name="timeLimitSeconds"><option value="10">10초</option><option value="20" selected>20초</option><option value="30">30초</option></select></label><label class="check-field" id="family-scoring" hidden><input type="checkbox" name="familyScoring"><span>가족 모드에서도 점수 계산하기 · 시간제한은 없어요</span></label><label class="field"><span>모임 이름 <small class="muted">선택</small></span><input name="title" placeholder="예: 오랜만이야, 우리" maxlength="40"></label>':''}<label class="check-field"><input type="checkbox" name="consent" required><span>아는 사람끼리만 참여하며, 공유 동의를 받은 일반 사진만 사용하겠습니다.</span></label><div class="form-error" role="alert"></div><button class="button primary" type="submit">${kind==='new'?'모임 만들기':'입장 요청하기'}</button></form><p class="microcopy" style="margin:14px 0 0">축소 사본은 종료 시 삭제하고, 방은 생성 후 24시간에 만료돼요.<br>현재는 일반 사진으로만 테스트해 주세요.</p>`);
}
async function submitEntry(form){
 if(!form.reportValidity())return;const fd=new FormData(form),kind=form.dataset.kind;const nickname=fd.get('nickname').trim();
 const code=String(fd.get('code')||'').replace(/[\s-]/g,'').toUpperCase();
 if(kind==='join'&&!/^[A-HJ-NP-Z2-9]{8}$/.test(code)){form.querySelector('.form-error').textContent='영문·숫자 8자리 방 코드를 확인해 주세요.';return;}
 const submit=form.querySelector('[type=submit]');submit.disabled=true;submit.classList.add('busy');
 try{
  if(kind==='new'){const health=await request('/api/health');if(fd.has('partyMissions')&&fd.get('mode')==='party'&&!health.partyMissionsSupported)throw new Error('파티 미션 서버 업데이트를 준비 중이에요. 미션을 끄면 먼저 플레이할 수 있어요.');if(!health.timedModesSupported)throw new Error('새 게임 모드 업데이트를 준비 중이에요. 잠시 후 다시 만들어 주세요.');}
  clearMemory();ui.nickname=nickname;ui.demo=false;
  const data=await request(kind==='new'?'/api/rooms':`/api/rooms/${code}/join`,{nickname,title:fd.get('title')||undefined,consent:fd.has('consent'),...(kind==='new'?{mode:fd.get('mode'),timeLimitSeconds:Number(fd.get('timeLimitSeconds')),partyMissions:fd.get('mode')==='party'&&fd.has('partyMissions'),familyScoring:fd.has('familyScoring')}: {})});
  history.pushState({},'',`?room=${data.code}`);closeModal();connect(data.code);window.scrollTo(0,0);
 }catch(e){form.querySelector('.form-error').textContent=e.message;}finally{submit.disabled=false;submit.classList.remove('busy');}
}
function openComposer(){
 const q=ui.data?.view?.myQuestion;clearDraft();draft={photoId:q?.photoId||'',blob:null,preview:q?photoSrc(q.photoId):'',ticket:0,aiBusy:false,aiResult:null,aiRequest:null};
 showModal(q?'내 추억 문제 수정하기':'사진으로 문제 만들기',`<div class="mode-switch composer-modes" aria-label="문제 만드는 방법"><button class="mode-option selected" data-action="composer-mode" data-mode="manual" aria-pressed="true">직접 출제<small>내가 기억하는 그날의 정답</small></button><button class="mode-option" data-action="composer-mode" data-mode="ai" aria-pressed="false">AI 초안 도움<small>내 기억으로 시작하는 초안</small></button></div>
 <form id="question-form" novalidate>
 <div id="composer-progress" class="composer-progress" role="status"></div><h3 class="composer-step">1. 사진 한 장 고르기</h3>
 <label class="upload-pick" id="photo-pick" for="photo-file" tabindex="0" role="button">${draft.preview?`<img src="${esc(draft.preview)}" alt="선택한 추억 사진">사진 바꾸기`:icon('photo')+'사진 한 장 고르기'}<small>사진을 고르는 동안에는 이 기기 안에만 있어요.</small></label><input class="file-hidden" type="file" id="photo-file" accept="image/jpeg,image/png,image/webp">
 <section id="ai-compose" class="ai-compose" aria-label="AI 초안 도움" hidden>
 <h3>정답은 내 기억에서 꺼내요</h3><p class="small-text">사진은 AI로 보내지 않아요. 직접 적은 기억과 정답으로 질문 문장과 오답 보기를 제안받아요.</p>
 <p id="ai-status" class="ai-status" role="status"></p>
 <div id="ai-inputs" hidden><label class="field"><span>이날 기억하는 사실</span><textarea name="aiMemory" maxlength="240" placeholder="예: 바다에 도착하자마자 짐을 풀기 전에 바다부터 보러 갔어요."></textarea></label><label class="field"><span>반드시 맞는 정답</span><input name="aiAnswer" maxlength="60" placeholder="예: 바다 보러 가기" autocomplete="off"></label><label class="field"><span>어떤 기억을 물어볼까요?</span><select name="aiFocus">${questionStarters.map(x=>`<option value="${x.id}">${x.label}</option>`).join('')}</select></label><label class="check-field"><input type="checkbox" name="aiConsent"><span>위의 기억·정답·질문 주제를 OpenAI에 보내는 데 동의해요. 사진·닉네임·방 코드는 보내지 않아요.</span></label><p class="microcopy">개인정보는 빼고 적어 주세요. OpenAI의 보관 정책이 적용되며 안전 점검 기록은 기본 최대 30일 보관될 수 있어요. <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">보관 안내</a></p><button class="button secondary" type="button" data-action="ai-generate">내 기억으로 초안 만들기</button></div>
 <button class="text-button" type="button" data-action="ai-sample">예시 초안 살펴보기 · AI 미사용</button><div id="ai-error" class="form-error" role="alert"></div><div id="ai-preview" aria-live="polite"></div>
 </section>
 <h3 class="composer-step">2. 질문 적기</h3><div id="manual-starters"><p class="microcopy">질문이 떠오르지 않으면 여기서 시작해 보세요.</p><div class="starter-chips" aria-label="질문 시작하기">${questionStarters.map(x=>`<button type="button" data-action="question-starter" data-focus="${x.id}">${x.label}</button>`).join('')}</div></div>
 <label class="field"><span>친구들에게 물어볼 질문</span><textarea name="prompt" maxlength="160" required placeholder="예: 이날 우리가 가장 먼저 한 일은?">${esc(q?.prompt||'')}</textarea></label><h3 class="composer-step">3. 보기와 정답 고르기</h3><div class="answer-edit-label">보기 네 개와 정답 하나</div><p id="correct-feedback" class="composer-feedback" aria-live="polite"></p><div class="answer-hint">정답인 보기 왼쪽의 동그라미를 눌러 주세요.</div>${[0,1,2,3].map(i=>`<label class="answer-editor"><input type="radio" name="correct" value="${i}" required ${q?.correctIndex===i?'checked':''} aria-label="${i+1}번을 정답으로 선택"><input type="text" name="option${i}" placeholder="${i+1}번 보기" maxlength="60" value="${esc(q?.options[i]||'')}" required aria-label="${i+1}번 보기"></label>`).join('')}<label class="field" style="margin-top:17px"><span>정답을 공개한 뒤 들려줄 이야기 <small class="muted">선택</small></span><textarea name="story" maxlength="240" placeholder="그날의 짧은 뒷이야기를 적어 주세요.">${esc(q?.story||'')}</textarea></label>
 <h3 class="composer-step">4. 확인하고 공유하기</h3><label class="check-field"><input type="checkbox" name="confirmed" required><span>질문·보기·정답을 확인했고, 사진 속 사람들의 동의를 포함해 이 사진을 방 참가자에게 공유할 권한이 있습니다.</span></label>
 <label class="check-field export-permission"><input type="checkbox" name="allowKeepsake" ${(ui.demo?memoryConsent.get(q?.photoId)===true:q?.allowKeepsake===true)?'checked':''}><span><strong>추억집에 담아도 괜찮아요 <small>선택</small></strong><br>이 사진과 내 문제·이야기를 참가자가 파일로 저장·공유하는 데 필요한 동의를 받았어요. 체크하지 않아도 게임은 그대로 즐길 수 있어요.</span></label><div id="composer-error" class="form-error" role="alert"></div><button type="submit" class="button primary">문제 준비 완료</button><p class="microcopy" style="margin-bottom:0;margin-top:12px">${ui.demo?'체험 모드에서는 서버로 사진을 보내지 않아요.':'완료를 누르면 위치 정보 등을 제거한 축소 JPG 사본을 서버에 보내요. 휴대폰 원본은 변경하지 않아요.'}</p></form>`);
 updateAiControls();composerFeedback();
}
function composerFeedback(force=false){
 const form=$('#question-form');if(!form||!draft)return [];
 const fields=form.elements,options=[0,1,2,3].map(i=>fields['option'+i].value.trim().normalize('NFC')),issues=[];
 const add=(name,message)=>issues.push({name,message});
 if(!draft.photoId&&!draft.blob)add('photo-file','사진 한 장을 먼저 골라 주세요.');
 if(!fields.prompt.value.trim())add('prompt','친구들에게 물어볼 질문을 적어 주세요.');
 options.forEach((value,i)=>{if(!value)add('option'+i,`${i+1}번 보기를 적어 주세요.`);else if(options.some((other,j)=>j!==i&&other===value))add('option'+i,'같은 보기가 있어요. 서로 다르게 적어 주세요.');});
 if(!fields.correct.value)add('correct','정답인 보기의 동그라미를 눌러 주세요.');
 if(!fields.confirmed.checked)add('confirmed','질문·정답과 사진 공유 권한을 확인해 주세요.');
 for(const name of ['prompt','option0','option1','option2','option3','confirmed']){
  const input=fields[name],issue=issues.find(x=>x.name===name),show=issue&&(force||input.dataset.touched==='true');
  input.setAttribute('aria-invalid',String(!!show));let note=form.querySelector(`[data-composer-error="${name}"]`);
  if(!note){note=document.createElement('small');note.className='composer-feedback';note.dataset.composerError=name;note.id='composer-error-'+name;input.closest('label').after(note);input.setAttribute('aria-describedby',note.id);}
  note.textContent=show?issue.message:'';
 }
 const correct=fields.correct.value,answer=correct?options[Number(correct)]:'';
 $('#correct-feedback').textContent=correct?`선택한 정답: ${answer||'이 보기를 적어 주세요.'}`:(force?'정답인 보기의 동그라미를 눌러 주세요.':'아직 정답을 고르지 않았어요.');
 $('#composer-progress').textContent=`${draft.photoId||draft.blob?'✓':'○'} 사진 · ${fields.prompt.value.trim()?'✓':'○'} 질문 · ${options.every(Boolean)&&new Set(options).size===4?'✓':'○'} 보기 · ${correct?'✓':'○'} 정답`;
 return issues;
}
function focusComposerIssue(issue){
 const form=$('#question-form');const el=issue.name==='photo-file'?$('#photo-pick'):issue.name==='correct'?form.querySelector('[name="correct"]'):form.elements[issue.name];
 el.focus();el.scrollIntoView({block:'center',behavior:'auto'});
}

function composerMode(mode){
 if(!draft)return;
 $('#ai-compose').hidden=mode!=='ai';$('#manual-starters').hidden=mode==='ai';
 for(const el of modal.querySelectorAll('[data-action="composer-mode"]')){const selected=el.dataset.mode===mode;el.setAttribute('aria-pressed',String(selected));el.classList.toggle('selected',selected);}
}
function updateAiControls(){
 if(!draft||!$('#ai-status'))return;
 const enabled=!ui.demo&&ui.data?.ai?.enabled===true,remaining=ui.data?.ai?.remaining||0;
 $('#ai-inputs').hidden=!enabled;
 $('#ai-status').textContent=ui.demo?'체험에서는 준비된 예시로 흐름을 살펴봐요. 실제 AI 호출과 비용은 없어요.':enabled?`이 모임에서 함께 쓸 수 있는 AI 초안 ${remaining}회 · 성공한 초안만 차감해요.`:'AI 연결 준비 중이에요. 직접 출제와 예시 미리보기는 지금 사용할 수 있어요.';
 const generate=$('[data-action="ai-generate"]');generate.disabled=!enabled||remaining===0&&!draft.aiRequest||draft.aiBusy;generate.textContent=draft.aiBusy?'초안 만드는 중…':'내 기억으로 초안 만들기';
 for(const el of $('#ai-inputs').querySelectorAll('input,textarea,select'))el.disabled=draft.aiBusy;
 $('[data-action="ai-sample"]').disabled=draft.aiBusy;
}
function draftPreview(value,source){
 if(!draft)return;draft.aiResult=value;draft.aiSource=source;
 $('#ai-preview').innerHTML=`<article class="ai-review"><span class="eyebrow">${source==='sample'?'흐름 예시 · AI가 만든 결과가 아니에요':'AI가 제안한 초안 · 아직 제출하지 않았어요'}</span><h3>${esc(value.prompt)}</h3><ol>${value.options.map((x,i)=>`<li>${esc(x)}${i===value.correctIndex?' <strong>내가 정한 정답</strong>':''}</li>`).join('')}</ol><p class="small-text">${esc(value.story)}</p><p class="microcopy">질문이 기억과 맞는지, 다른 보기도 정답이 될 수 있는지 확인해 주세요. 오답 보기는 실제 있었던 일이라는 뜻이 아니에요.</p>${source!=='sample'||ui.demo?'<button class="button secondary" type="button" data-action="ai-apply">작성 칸에 적용하고 검토하기</button>':'<button class="button secondary" type="button" data-action="ai-manual">내 기억으로 직접 만들기</button>'}</article>`;
}
async function generateDraft(){
 if(!draft||draft.aiBusy||ui.demo||ui.data?.ai?.enabled!==true)return;
 const current=draft,code=ui.code,form=$('#question-form'),error=$('#ai-error');error.textContent='';
 let input;
 try{input=validateDraftInput({requestId:current.aiRequest?.requestId||crypto.randomUUID(),memory:form.elements.aiMemory.value.replace(/\s+/g,' '),answer:form.elements.aiAnswer.value,focus:form.elements.aiFocus.value,consent:form.elements.aiConsent.checked});}
 catch(e){error.textContent=e.message;return;}
 current.aiRequest=input;current.aiBusy=true;updateAiControls();
 try{
  const response=await request(`/api/rooms/${code}/ai-draft`,input);
  if(draft!==current||ui.code!==code||ui.data?.view?.phase!=='lobby')return;
  draftPreview(response.draft,'ai');current.aiRequest=null;
  if(ui.data.ai&&response.revision>=(ui.data.revision||0))ui.data.ai.remaining=response.remaining;
 }catch(e){if(draft===current){error.textContent=e.message;if(e.status)current.aiRequest=null;}}
 finally{if(draft===current){current.aiBusy=false;updateAiControls();}}
}
function applyAiDraft(){
 if(!draft?.aiResult)return;const value=draft.aiResult,form=$('#question-form');
 form.elements.prompt.value=value.prompt;form.elements.story.value=value.story;
 value.options.forEach((x,i)=>form.elements['option'+i].value=x);form.elements.correct.value=String(value.correctIndex);
 form.elements.confirmed.checked=false;form.elements.allowKeepsake.checked=false;
 composerMode('manual');composerFeedback();form.elements.prompt.focus();toast('초안을 적용했어요. 정답과 저장 동의를 다시 확인해 주세요.');
}
async function pickPhoto(file){
 if(!file||!draft)return;const current=draft,ticket=++draft.ticket;
 const form=$('#question-form'),error=form.querySelector('#composer-error');error.textContent='';
 const save=form.querySelector('[type=submit]');save.disabled=true;
 try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG, PNG, WebP 사진을 골라 주세요. HEIC는 JPG로 바꿔 주세요.');
  if(file.size>20_000_000)throw new Error('20MB 이하의 사진을 골라 주세요.');
  const image=await createImageBitmap(file);const scale=Math.min(1,1440/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fffdf5';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();
  let quality=.84,blob;
  do{blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));quality-=.12;}while(blob&&blob.size>850_000&&quality>=.35);
  if(!blob||blob.size>900_000)throw new Error('사진을 줄이지 못했어요. 다른 사진을 골라 주세요.');
  if(draft!==current||draft.ticket!==ticket)return;
  if(draft.preview?.startsWith('blob:'))URL.revokeObjectURL(draft.preview);
  draft.blob=blob;draft.preview=URL.createObjectURL(blob);draft.photoId='';
  form.elements.allowKeepsake.checked=false;form.elements.confirmed.checked=false;
  $('#photo-pick').innerHTML=`<img src="${draft.preview}" alt="선택한 추억 사진">사진 바꾸기<small>축소 사진 ${Math.round(blob.size/1024)}KB · 아직 서버로 보내지 않았어요.</small>`;
 }catch(e){if(form.isConnected)error.textContent=e.message;}finally{if(form.isConnected&&draft===current&&draft.ticket===ticket){save.disabled=false;composerFeedback();}}
}
async function submitQuestion(form){
 if(!draft)return;const error=form.querySelector('#composer-error');error.textContent='';
 const issues=composerFeedback(true);if(issues.length){error.textContent=issues[0].message;focusComposerIssue(issues[0]);return;}
 if(!draft.photoId&&!draft.blob){error.textContent='먼저 사진 한 장을 골라 주세요.';return;}
 const fd=new FormData(form),options=[0,1,2,3].map(i=>String(fd.get('option'+i)).trim());
 if(new Set(options.map(s=>s.normalize('NFC'))).size!==4){error.textContent='보기는 서로 다르게 적어 주세요.';return;}
 const submit=form.querySelector('[type=submit]');submit.disabled=true;submit.classList.add('busy');
 try{
  let photoId=draft.photoId;
  if(draft.blob){
   if(ui.demo){photoId='local-'+[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');ui.demoPhotos[photoId]=URL.createObjectURL(draft.blob);}
   else{const uploaded=await request(`/api/rooms/${ui.code}/upload`,null,{headers:{'Content-Type':'image/jpeg','X-Photo-Consent':'yes'},body:draft.blob});photoId=uploaded.photoId;draft.photoId=photoId;draft.blob=null;}
  }
  const action={type:'submitQuestion',gameNumber:ui.data.gameNumber||0,photoId,prompt:String(fd.get('prompt')).trim(),options,correctIndex:Number(fd.get('correct')),story:String(fd.get('story')||'').trim(),confirmed:fd.has('confirmed'),allowKeepsake:fd.has('allowKeepsake')};
  if(ui.demo){memoryConsent.set(photoId,fd.has('allowKeepsake'));demoAction(action);}else await request(`/api/rooms/${ui.code}/action`,action);
  closeModal();toast('내 추억 문제가 준비됐어요.');
 }catch(e){error.textContent=e.message;}finally{if(submit.isConnected){submit.disabled=false;submit.classList.remove('busy');}}
}
function demoView(){const s=ui.demoState;return {access:'active',code:'DEMO2026',title:'우리의 작은 추억 모임',expiresAt:null,mediaStatus:s.phase==='finished'?'demo-deleted':'local-only',view:viewFor(s,'d-me'),connectedIds:s.players.map(p=>p.id),pending:[]};}
function startDemo(){
 clearPhotos();
 closeModal();clearMemory();ui.source?.close();ui.source=null;ui.demo=true;ui.connected=true;ui.selected=null;ui.busy=false;
 for(const url of Object.values(ui.demoPhotos))if(url.startsWith('blob:'))URL.revokeObjectURL(url);ui.demoPhotos={};
 const players=[{id:'d-yuna',name:'유나'},{id:'d-minho',name:'민호'},{id:'d-me',name:ui.nickname||'나'}];
 let s=setup(players);s.hostId='d-me';
 const questions=[
  {photoId:'seaside',prompt:'이날 우리가 가장 먼저 한 일은?',options:['바다 보러 가기','점심부터 먹기','숙소에서 낮잠 자기','기념품 고르기'],correctIndex:0,story:'바다가 너무 보고 싶어서 짐도 풀기 전에 달려갔어. 결국 신발은 모래투성이가 됐지.'},
  {photoId:'picnic',prompt:'돗자리를 펴자마자 생긴 일은?',options:['소나기가 내렸어','김밥이 굴러갔어','친구가 잠들었어','사진기가 꺼졌어'],correctIndex:1,story:'도시락을 열다가 김밥 하나가 데굴데굴. 그걸 보고 한참을 웃었어.'},
  {photoId:'cafe',prompt:'이날 내가 주문한 메뉴는?',options:['아이스 아메리카노','따뜻한 녹차','딸기라테','초코 케이크'],correctIndex:2,story:'평소엔 커피만 마셨는데, 그날은 친구를 따라 달콤한 걸 골랐어.'}
 ];
 questions.forEach((q,i)=>{s=applyAction(s,players[i].id,{type:'submitQuestion',...q,confirmed:true});memoryConsent.set(q.photoId,true);});
 ui.demoState=s;stateAccept(demoView());window.scrollTo(0,0);
}
function simulatedAnswers(){
 let s=ui.demoState;const q=s.questions[s.order[s.round]];
 for(const p of s.players){if(s.phase!=='question')break;if(p.id==='d-me'||p.id===q.authorId||Object.hasOwn(s.answers,p.id))continue;
  const choice=p.id==='d-minho'?(q.correctIndex+1)%4:q.correctIndex;
  s=applyAction(s,p.id,{type:'answer',choice,round:s.round});
 }
 ui.demoState=s;
}
function demoAction(action){
 const allowed=validateAction(ui.demoState,'d-me',action);if(!allowed.ok)throw new Error(allowed.error);
 ui.demoState=applyAction(ui.demoState,'d-me',action);
 if(action.type==='answer')simulatedAnswers();
 if(ui.demoState.phase==='finished'){
  if(ui.demoState.endReason==='completed')memoryBook=buildMemoryBook({title:ui.data.title,date:new Date().toLocaleDateString('ko-KR'),view:viewFor(ui.demoState,'d-me'),entries:memoryEntries.values()});
  else{memoryEntries.clear();memoryBook=null;memoryHTML='';}
  const keep=new Set(memoryBook?.entries.map(e=>e.photoId)||[]);
  for(const [id,u] of Object.entries(ui.demoPhotos))if(!keep.has(id)){if(u.startsWith('blob:'))URL.revokeObjectURL(u);delete ui.demoPhotos[id];}
 }
 stateAccept(demoView());
}
async function act(type,extra={}){
 if(ui.busy)return;const prior=ui.data?.view;ui.busy=true;render();
 try{const action={type,round:ui.data.view.round,gameNumber:ui.data.gameNumber||0,...extra};if(ui.demo)demoAction(action);else await request(`/api/rooms/${ui.code}/action`,action);
  if(prior?.round!==ui.data.view.round||prior?.phase!==ui.data.view.phase)window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }catch(e){toast(e.message);}finally{ui.busy=false;render();if(ui.demo&&ui.data?.view?.endReason==='completed'&&!adShown){adShown=true;showModal('오늘의 모임을 마쳤어요',`<div class="interstitial-demo"><span>광고 위치 체험</span><strong>한 판이 끝난 뒤,<br>잠깐 쉬어가는 자리예요.</strong><p>출시 앱에서는 이 위치에 전면 광고가 최대 한 번 표시돼요. 지금은 실제 광고가 없어요.</p></div>${button('오늘의 기억왕 만나기','close-modal','primary')}`);}}
}
function goHomeNow(){
 clearMemory();clearPhotos();
 ui.source?.close();ui.source=null;ui.data=null;ui.code='';ui.demo=false;ui.selected=null;ui.busy=false;
 for(const url of Object.values(ui.demoPhotos))if(url.startsWith('blob:'))URL.revokeObjectURL(url);ui.demoPhotos={};ui.demoState=null;
 if(!offline)history.replaceState({},'',location.pathname);closeModal();render();window.scrollTo(0,0);
}
function goHome(){
 if(memoryBook?.entries.length){confirmDialog('홈으로 돌아갈까요?','저장하지 않은 추억집은 사라져요. 이미 내려받은 파일은 기기에 남아요.','홈으로',goHomeNow);return;}
 if(ui.data?.access==='active'&&ui.data.view?.phase!=='finished'&&!ui.demo){confirmDialog('홈으로 돌아갈까요?','방과 임시 사진은 계속 유지돼요. 완전히 끝내려면 방장이 <strong>모임 종료</strong>를 눌러 주세요.','홈으로',goHomeNow);}else goHomeNow();
}
async function manage(kind,id){if(ui.busy)return;ui.busy=true;render();try{await request(`/api/rooms/${ui.code}/${kind}`,{playerId:id});}catch(e){toast(e.message);}finally{ui.busy=false;render();}}
async function share(){
 const url=location.origin+location.pathname+'?room='+ui.code;
 if(navigator.share){try{await navigator.share({title:'그때 우리 — 같이 기억해 볼까요?',text:`우리의 사진으로 노는 시간. 방 코드 ${ui.code}`,url});return;}catch(e){if(e.name==='AbortError')return;}}
 try{await navigator.clipboard.writeText(url);toast('초대 링크를 복사했어요. 친구에게 보내 주세요.');}catch{showModal('친구에게 이 링크를 보내 주세요',`<p>방 코드 <strong>${esc(ui.code)}</strong></p><div class="share-link">${esc(url)}</div><p style="margin-top:15px">링크를 길게 눌러 복사하거나, 방 코드를 직접 알려 주세요.</p>`);}
}
function showHelp(){showModal('우리, 이렇게 놀아요',`<div class="help-step"><span>1</span><div><strong>아는 친구를 초대해요.</strong><p>방 코드나 링크를 보내고, 방장이 입장 요청을 승인해요.</p></div></div><div class="help-step"><span>2</span><div><strong>사진 한 장, 문제 하나를 준비해요.</strong><p>질문과 보기 4개, 정답을 직접 입력해요. 모두 준비하면 출발해요.</p></div></div><div class="help-step"><span>3</span><div><strong>돌아가며 기억을 맞혀요.</strong><p>출제자는 자신의 문제에 답하지 않아요. 정답은 최대 100점이며 남은 시간 비율로 줄어요. 가족 모드는 시간제한과 속도 감점이 없어요.</p></div></div><div class="help-step"><span>4</span><div><strong>정답보다 그날의 이야기를 나눠요.</strong><p>모두 답하면 정답을 공개해요. 이야기를 나눈 뒤 방장이 모두 함께 다음 문제를 시작해요.</p></div></div><div class="notice warm">이 버전의 AI 자동 출제는 미연결 상태예요. 친구와 직접 출제하는 퀴즈와 가상 친구 체험을 사용할 수 있어요.</div>`);}
function showPrivacy(){if(offline){showModal('체험판의 사진 보호','<div class="privacy-section"><h3>선택한 사진은 이 기기에만</h3><p>체험판에서는 사진을 서버로 업로드하지 않아요. 브라우저 메모리에서만 사용하며, 원본은 수정하지 않아요.</p><h3>저장하거나 AI에 보내지 않아요</h3><p>체험 사진은 서버로 보내지 않아요. 저장을 허용한 추억만 탭 메모리에서 모으며, 직접 파일 저장을 눌러야 기기에 저장돼요. 홈 이동·새로고침·탭 종료 시 탭 안의 추억집은 사라져요. 내려받은 파일은 기기에 남아요.</p><h3>공유할 때는 사진 속 사람의 동의를 먼저</h3><p>민감한 사진은 테스트에 사용하지 마세요. 화면 캡처까지 막는 기능은 없어요.</p><h3>이 링크와 코드는 공개되어 있어요</h3><p>누구나 체험 링크를 열 수 있지만, 다른 방문자가 여러분이 선택한 사진을 볼 수는 없어요. 사진 전송이나 실시간 방 기능이 없는 화면 체험판이에요.</p></div>');return;}showModal('우리 사진, 이렇게 다뤄요',`<div class="privacy-section"><h3>원본은 내 휴대폰에 그대로</h3><p>공유 완료를 누르면 축소한 JPG 사본만 서버에 보내요. 사진의 위치 정보 등 메타데이터는 제거해요.</p><h3>방장이 승인한 참가자만</h3><p>공개 사진 주소나 방 목록은 없어요. 내 사진은 내가 확인할 수 있고, 다른 참가자의 사진은 그 문제가 나왔을 때 볼 수 있어요. 정답은 공개 전까지 서버가 숨겨요.</p><h3>게임 종료 시 임시 사진 삭제</h3><p>게임을 끝내면 사본을 삭제해요. 버려진 방도 생성 후 최대 24시간에 만료돼요. 항상 실행되는 서버가 30초마다 정리해요. 서버가 꺼져 있으면 다시 시작할 때 삭제하며, 만료된 방의 접근은 먼저 차단해요. 삭제에 실패하면 접근을 먼저 막고 재시도해요.</p><h3>함께 찍은 사람의 동의를 먼저</h3><p>사진 속 사람들이 공유에 동의했는지 확인해 주세요. 신분증, 의료 정보 등 민감한 사진과 성적 이미지는 이번 테스트에 사용하지 마세요. 참가자의 화면 캡처까지 막을 수는 없어요.</p><h3>불편한 사진은 즉시 숨겨요</h3><p>사진 신고·숨기기를 누르면 해당 게임을 종료하고 임시 사진을 삭제해요. 신고는 방 기록에 남지만, 상시 운영자 검토나 자동 콘텐츠 필터는 아직 연결되지 않았어요.</p><h3>추억집 저장은 별도 동의</h3><p>사진별로 출제자가 저장·공유 동의를 선택해요. 끝까지 마친 게임에서 허용된 사진과 문제·이야기·답변만 종료 때 연결된 참가자 탭에 전달하고 서버 사본을 삭제해요. 전달된 추억집은 탭 메모리에만 남으며, 홈 이동·새로고침·탭 종료 후 다시 받을 수 없어요. 직접 내려받은 파일은 기기에 남고 앱에서 회수할 수 없어요. 신고·중도 종료 시에는 추억집을 만들지 않아요. 현재 저장은 무료 체험이며 실제 결제는 없어요.</p><h3>재접속과 세션</h3><p>이 탭에는 방의 접근 키만 세션 저장소에 보관해요. 사진과 문제는 저장하지 않아요. 같은 탭을 새로고침하면 승인과 점수가 복원돼요. 탭을 닫거나 다른 브라우저를 쓰면 다시 입장 승인이 필요해요.</p><h3>현재 버전의 범위</h3><p>AI 초안 연결은 아직 꺼져 있어요. 연결한 경우에도 사진 대신 직접 적은 기억·정답·질문 주제만 OpenAI에 보내며, 별도 동의를 받아요. AI가 만든 오답 보기는 실제 기억이 아니에요. 추억은 출제자가 확인해야 해요. 성인 모드와 앱 스토어 배포는 포함되어 있지 않아요.</p></div>`);}
document.addEventListener('keydown',e=>{if(e.target.id==='photo-pick'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('#photo-file').click();}});
app.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-action="zoom"]')){e.preventDefault();e.target.click();}});
document.addEventListener('click',async e=>{
 const target=e.target.closest('[data-action]');if(!target||target.disabled)return;
 const action=target.dataset.action;
 if(action==='close-modal')return closeModal();
 if(action==='confirm'){const task=confirmation;closeModal();if(task)await task();return;}
 if(action==='home')return goHome();
 if(action==='new')return openEntry('new');
 if(action==='join')return openEntry('join');
 if(action==='demo')return startDemo();
 if(action==='help')return showHelp();
 if(action==='plans')return showPlans();
 if(action==='privacy')return showPrivacy();
 if(action==='compose')return openComposer();
 if(action==='memory-preview')return openMemoryPreview();
 if(action==='memory-title-apply'){memoryTitle=$('#memory-title').value.trim().slice(0,40);renderMemoryPreview();$('#memory-title').focus();return;}
 if(action==='memory-save')return downloadMemory();
 if(action==='memory-pdf'){target.disabled=true;try{await downloadBookPDF(memoryHTML,message=>target.textContent=message);toast('PDF 저장을 요청했어요. 다운로드 목록을 확인해 주세요.');}catch(error){toast('PDF를 만들지 못했어요. 다시 시도하거나 HTML 파일을 저장해 주세요.');}finally{target.disabled=false;target.textContent='PDF로 간직하기 · 무료';}return;}


 if(action==='composer-mode')return composerMode(target.dataset.mode);
 if(action==='ai-generate')return generateDraft();
 if(action==='ai-sample')return draftPreview(sampleDraft,'sample');
 if(action==='ai-apply')return applyAiDraft();
 if(action==='ai-manual')return composerMode('manual');
 if(action==='question-starter'){const item=questionStarters.find(x=>x.id===target.dataset.focus);if(item&&draft){const form=$('#question-form');form.elements.prompt.value=item.prompt;form.elements.confirmed.checked=false;composerFeedback();form.elements.prompt.focus();}return;}
 if(action==='choose'){ui.selected=Number(target.dataset.choice);render();app.querySelector(`[data-choice="${ui.selected}"]`)?.focus({preventScroll:true});return;}
 if(action==='answer'&&ui.data.roundDeadlineAt&&Date.now()+serverClockOffset>=ui.data.roundDeadlineAt){toast('시간이 끝났어요. 서버의 정답 공개를 기다려 주세요.');return;}
 if(action==='answer')return act('answer',{choice:ui.selected});
 if(action==='start')return act('start');
 if(action==='rematch')return confirmDialog('같은 멤버로 한 판 더 할까요?','모두 추억집을 저장했는지 확인해 주세요. 저장하지 않은 이전 추억집은 사라져요. 방 코드와 참가자는 유지하고 점수·문제는 새로 시작해요.','다음 게임 시작',()=>act('rematch',{confirmed:true}));
 if(['missionDone','missionSkip'].includes(action))return act(action);
 if(action==='next')return act('next');
 if(action==='demo-answers'){simulatedAnswers();stateAccept(demoView());window.scrollTo(0,0);return;}
 if(action==='share')return share();
 if(action==='copy-code'){try{await navigator.clipboard.writeText(ui.code);toast('방 코드를 복사했어요.');}catch{toast('방 코드: '+ui.code);}return;}
 if(action==='approve'||action==='deny')return manage(action,target.dataset.id);
 if(action==='kick'){const id=target.dataset.id,name=ui.data.view.players.find(p=>p.id===id)?.name;return confirmDialog('이 친구를 내보낼까요?',`${esc(name)}님의 문제와 임시 사진도 삭제해요.`,'내보내기',()=>manage('kick',id));}
 if(action==='remove-question')return confirmDialog('내 문제를 삭제할까요?','문제와 서버의 해당 임시 사진을 삭제해요. 다시 사진을 골라 출제할 수 있어요.','삭제하기',()=>act('removeQuestion'));
 if(action==='reveal')return confirmDialog('지금 정답을 공개할까요?','취소를 누르면 계속 기다려요. 정답을 공개하면 아직 답하지 않은 친구만 이번 문제에서 0점이며, 기존 점수는 유지돼요.','정답 공개',()=>act('reveal',{confirmed:true}));
 if(action==='end')return confirmDialog('모임을 끝낼까요?','진행 중인 게임을 종료하고 서버의 모든 임시 사진을 삭제해요. 다시 시작하려면 새 모임을 만들어 주세요.','종료하기',()=>act('end'));
 if(action==='report')return confirmDialog('사진을 신고하고 숨길까요?','모든 참가자에게 사진을 숨기고 게임을 종료해요. 서버 임시 사진도 삭제해요. 이 버전에는 상시 신고 검토 담당자가 연결되어 있지 않아요.','숨기고 종료',()=>act('report',{reason:'inappropriate'}));
 if(action==='leave')return confirmDialog('대기방에서 나갈까요?','내 문제와 임시 사진을 삭제하고 이 방에서 나가요.','나가기',async()=>{try{await request(`/api/rooms/${ui.code}/leave`,{});goHomeNow();}catch(e){toast(e.message);}});
 if(action==='zoom'){const src=photoSrc(ui.data.view.current.photoId);return showModal('그날의 사진',`<img class="zoom-photo" src="${esc(src)}" alt="크게 보는 추억 사진">`);}
});
document.addEventListener('submit',e=>{if(e.target.id==='entry-form'){e.preventDefault();submitEntry(e.target);}if(e.target.id==='question-form'){e.preventDefault();submitQuestion(e.target);}});
document.addEventListener('input',e=>{
 if(!draft||!e.target.closest('#question-form'))return;
 if(['prompt','story','correct','option0','option1','option2','option3'].includes(e.target.name))$('#question-form').elements.confirmed.checked=false;
 e.target.dataset.touched='true';$('#composer-error').textContent='';composerFeedback();
 if(['aiMemory','aiAnswer','aiFocus','aiConsent'].includes(e.target.name)){draft.aiRequest=null;draft.aiResult=null;$('#ai-preview').replaceChildren();}
});
document.addEventListener('change',e=>{
 if(e.target.id==='room-mode'){const family=e.target.value==='family';$('#party-missions').hidden=e.target.value!=='party';$('#room-time').hidden=family;$('#family-scoring').hidden=!family;}
 if(e.target.closest('#question-form')&&e.target.id!=='photo-file'){e.target.dataset.touched='true';$('#composer-error').textContent='';composerFeedback();}
 if(e.target.id==='photo-file')pickPhoto(e.target.files[0]);
 if(!memoryBook||!memoryHTML)return;
 const id=e.target.id;
 if(id==='memory-template'&&memoryTemplates.some(x=>x.id===e.target.value))memoryTemplate=e.target.value;
 else if(id==='memory-palette'&&memoryPalettes.some(x=>x.id===e.target.value))memoryPalette=e.target.value;
 else if(id==='memory-cover')memoryCoverPhotoId=e.target.value;
 else if(id==='memory-choices')memoryIncludeChoices=e.target.checked;
 else return;
 const body=$('#modal .modal-body'),scroll=body.scrollTop;renderMemoryPreview();$('#modal .modal-body').scrollTop=scroll;$('#'+id).focus({preventScroll:true});
});

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ui.code&&!ui.demo)connect(ui.code);});
window.addEventListener('online',()=>{if(ui.code&&!ui.demo)connect(ui.code);});
window.addEventListener('offline',()=>{if(!ui.demo){ui.connected=false;render();}});
window.addEventListener('popstate',()=>location.reload());
const banner=document.createElement('aside');banner.className='banner-demo';banner.setAttribute('aria-label','하단 광고 위치 체험');banner.innerHTML='<span>광고 영역</span><small>테스트에는 실제 광고가 표시되지 않아요.</small>';app.after(banner);
render();
if(!offline){
 const code=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
 if(/^[A-HJ-NP-Z2-9]{8}$/.test(code)){
  request(`/api/rooms/${code}/state`).then(data=>{if(['active','pending'].includes(data.access))connect(code);}).catch(()=>openEntry('join',code));
 }
}

setInterval(()=>{const node=$('#round-clock'),deadline=ui.data?.roundDeadlineAt;if(!node||!deadline)return;const remaining=Math.max(0,Math.ceil((deadline-Date.now()-serverClockOffset)/1000));node.textContent=remaining?`남은 시간 ${remaining}초`:'시간 종료 · 정답 공개를 기다려 주세요';if(!remaining){for(const button of app.querySelectorAll('[data-action="answer"],[data-action="choose"]'))button.disabled=true;}},200);
