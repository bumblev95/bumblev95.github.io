// Local, explicit export only. This module never stores photos or calls a payment API.
export const memoryProduct = Object.freeze({id:'memory-pack-one-game',price:'US$0.99',billing:'one-time',paymentEnabled:false});
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short = (value, limit) => String(value ?? '').slice(0, limit);

export function captureMemory(view, consent) {
  const q = view?.current;
  if (view?.phase !== 'reveal' || !q || consent !== true) return null;
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) return null;
  const options = q.options.map(x => short(x,60));
  return {round:view.round,photoId:q.photoId,author:short(view.players.find(p=>p.id===q.authorId)?.name,16),
    prompt:short(q.prompt,160),options,correctIndex:q.correctIndex,story:short(q.story,240),
    responses:view.players.filter(p=>p.id!==q.authorId).map(p=>({name:short(p.name,16),answer:Number.isInteger(view.answers[p.id])?options[view.answers[p.id]]:'미응답',correct:view.answers[p.id]===q.correctIndex}))};
}

export function buildMemoryBook({title,date,view,entries}) {
  if (view?.phase !== 'finished' || view.endReason !== 'completed') throw new Error('게임을 끝까지 마친 뒤 추억집을 만들 수 있어요.');
  return {title:short(title,40),date:short(date,40),sample:true,
    players:view.players.map(p=>({name:short(p.name,16),score:p.score})).sort((a,b)=>b.score-a.score),
    entries:[...entries].sort((a,b)=>a.round-b.round).slice(0,8)};
}

function memoryCard(entry,index,image) {
  const safeImage = typeof image==='string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image) && image.length<1_500_000;
  return `<article class="memory-page"><div class="kicker">기억 ${String(index+1).padStart(2,'0')} · ${escapeHTML(entry.author)}님의 이야기</div>
    ${safeImage?`<img class="memory-image" src="${image}" alt="저장이 허용된 추억 사진">`:'<div class="photo-empty">이 사진은 포함하지 않았어요.</div>'}
    <h2>${escapeHTML(entry.prompt)}</h2><ol class="options">${entry.options.map((x,i)=>`<li class="${i===entry.correctIndex?'correct':''}">${escapeHTML(x)}${i===entry.correctIndex?' <strong>✓ 정답</strong>':''}</li>`).join('')}</ol>
    ${entry.story?`<blockquote>${escapeHTML(entry.story)}</blockquote>`:''}<div class="responses">${entry.responses.map(p=>`<p><strong>${escapeHTML(p.name)}</strong> · ${escapeHTML(p.answer)} <span>${p.correct?'기억이 맞았어요':'서로 다르게 기억했어요'}</span></p>`).join('')}</div></article>`;
}

export function renderMemoryHTML(book,images={}) {
  // No room code, token, original filename, remote URLs, executable SVGs or scripts.
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHTML(book.title)} · 그때 우리 추억집</title><style>
    :root{color-scheme:light;font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',system-ui,sans-serif;color:#343b33;background:#fbf8f1}*{box-sizing:border-box}body{margin:0;line-height:1.7}main{max-width:760px;margin:auto;padding:32px 24px}h1,h2,p{margin:0}h1{font-size:36px;color:#64765e;overflow-wrap:anywhere}h2{font-size:23px;margin:20px 0 15px;overflow-wrap:anywhere}.kicker{font-size:12px;color:#747e68;letter-spacing:.06em;margin:12px 0}header{padding:32px 0;border-bottom:1px solid #dfdfcf}.sample,.print-note{padding:12px 16px;border-radius:12px;background:#e9eedf;font-size:12px;margin:16px 0}.sample{background:#f7e8d5}.people{list-style:none;padding:0}.people li{display:flex;justify-content:space-between;gap:15px;padding:12px;border-bottom:1px solid #e8e5db;overflow-wrap:anywhere}.memory-page{background:#fffdfa;border:1px solid #e8e5db;border-radius:20px;margin:24px 0;padding:24px}.memory-image{width:100%;height:320px;object-fit:contain;background:#f0eee4;border-radius:12px;margin-top:12px}.photo-empty{padding:30px;text-align:center;background:#eeeee6}.options{padding-left:26px}.options li{padding:7px;overflow-wrap:anywhere}.correct{background:#e9eedf;border-radius:8px;color:#526647}.responses{font-size:13px;border-top:1px solid #e8e5db;padding-top:12px}.responses p{padding:4px 0;overflow-wrap:anywhere}.responses span{color:#7a8273}blockquote{margin:20px 0;padding:18px;background:#f5e5d9;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}footer{font-size:11px;color:#777e72;padding:20px 0}.sample{font-weight:600}
    @media(max-width:400px){main{padding:20px 14px}h1{font-size:27px}.memory-page{padding:17px}.memory-image{height:230px}}@media print{@page{size:A4;margin:16mm}body{background:white}main{padding:0;max-width:none}.print-note{display:none}header{break-after:page}.memory-page{break-before:page;border:0;margin:0;padding:0}.memory-image{height:78mm}h2,blockquote,.responses{break-inside:avoid}footer{break-inside:avoid}}
    </style></head><body><main><div class="sample">무료 체험 추억집 · 예시 그림과 가상 참가자가 포함되어 있어요 · 실제 결제 없음</div><div class="print-note">이 파일은 인터넷 없이 열 수 있어요. 브라우저의 인쇄 메뉴에서 ‘PDF로 저장’을 선택하면 PDF로 간직할 수 있어요.</div><header><div class="kicker">그때 우리 · OUR LITTLE MEMORY</div><h1>${escapeHTML(book.title)}</h1><p>${escapeHTML(book.date)} · ${book.players.length}명이 함께한 시간</p><ul class="people">${book.players.map((p,i)=>`<li><span>${book.players.findIndex(x=>x.score===p.score)+1}. ${escapeHTML(p.name)}</span><strong>${p.score}점</strong></li>`).join('')}</ul><p>저장이 허용된 추억 ${book.entries.length}개를 담았어요.</p></header>${book.entries.map((e,i)=>memoryCard(e,i,images[e.photoId])).join('')}<footer>사진과 내용은 저장을 허용한 범위 안에서만 공유해 주세요. 내려받은 파일은 기기에 남으며, 이후 앱에서 삭제해도 이 파일은 자동 삭제되지 않아요.<br>그때 우리 · 사진 한 장, 다시 만나는 우리</footer></main></body></html>`;
}
