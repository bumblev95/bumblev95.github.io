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

export function buildMemoryBook({title,date,view,entries,sample=true}) {
  if (view?.phase !== 'finished' || view.endReason !== 'completed') throw new Error('게임을 끝까지 마친 뒤 추억집을 만들 수 있어요.');
  return {title:short(title,40),date:short(date,40),sample:sample===true,
    players:view.players.map(p=>({name:short(p.name,16),score:p.score})).sort((a,b)=>b.score-a.score),
    entries:[...entries].sort((a,b)=>a.round-b.round).slice(0,8)};
}


export const memoryTemplates = Object.freeze([
  {id:'photobook',name:'포토북'}, {id:'polaroid',name:'폴라로이드'}, {id:'album',name:'깔끔한 앨범'}
]);
export const memoryPalettes = Object.freeze([
  {id:'cream',name:'크림'}, {id:'peach',name:'피치'}, {id:'sage',name:'그린'}
]);
const safeImage = image => typeof image==='string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image) && image.length<1_500_000;
const photo = image => safeImage(image)?`<img class="memory-image" src="${image}" alt="저장이 허용된 추억 사진">`:'<div class="photo-empty">이 사진은 포함하지 않았어요.</div>';

// Shared, scoped styles make the preview and offline export use the same templates.
export const memoryStyleCSS = `
.memory-book{--paper:#fbf8f1;--tint:#eee8da;--accent:#69745a;--ink:#343b33;--line:#dedbce;color:var(--ink);background:var(--paper);font:14px/1.7 'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',system-ui,sans-serif;max-width:760px;margin:auto;padding:24px;overflow-wrap:anywhere;letter-spacing:normal;font-synthesis:none}
.memory-book.palette-peach{--paper:#fff5ee;--tint:#f4dfd1;--accent:#8c5849;--line:#e8d4c8}
.memory-book.palette-sage{--paper:#f4f7ef;--tint:#e0e8d5;--accent:#54644b;--line:#d4ddcb}
.memory-book *{box-sizing:border-box}.memory-book h1,.memory-book h2,.memory-book p{margin:0}.memory-book p{font:inherit;color:inherit;line-height:inherit}.memory-book h1,.memory-book h2{font-weight:700}.memory-book h1{font-size:36px;line-height:1.4;color:var(--accent)}.memory-book h2{font-size:23px;line-height:1.5;margin:20px 0 12px}.memory-book .kicker{font-size:11px;letter-spacing:.1em;color:var(--accent);margin:12px 0}.memory-book .sample,.memory-book .print-note{font-size:11px;padding:10px 12px;margin:12px 0;background:var(--tint);border-radius:8px}
.memory-book .book-cover,.memory-book .memory-page,.memory-book .book-ending{border:1px solid var(--line);background:#fffefa;border-radius:16px;padding:24px;margin:20px 0}.memory-book .book-cover{text-align:center;padding:32px 24px}.memory-book .cover-meta{margin:12px 0;color:var(--accent)}.memory-book .photo-frame{margin:16px 0}.memory-book .memory-image{display:block;width:100%;height:290px;object-fit:contain;background:var(--tint);border-radius:8px;margin:0}.memory-book .photo-empty{background:var(--tint);padding:30px;text-align:center}.memory-book .cover-count{font-size:12px;margin-top:16px}.memory-book .options{padding-left:25px;margin:12px 0}.memory-book .options li{padding:5px 8px}.memory-book .correct{background:var(--tint);color:var(--accent);border-radius:6px}.memory-book blockquote{padding:14px 16px;background:var(--tint);border-radius:8px;margin:16px 0;white-space:pre-wrap;font-size:13px}.memory-book .responses{border-top:1px solid var(--line);padding-top:12px;font-size:12px}.memory-book .responses p{margin:5px 0}.memory-book .responses span{color:var(--accent)}.memory-book .people{display:block;list-style:none;margin:20px 0;padding:0}.memory-book .people li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.memory-book .winner-names{font-size:24px;font-weight:700;color:var(--accent);margin:12px 0}.memory-book footer{font-size:10px;color:#626b5e;padding-top:20px;line-height:1.8}.memory-book .book-signature{font-size:12px;color:var(--accent);margin-top:25px;letter-spacing:.05em}
.memory-book.template-photobook .book-cover{border-top:7px solid var(--accent)}.memory-book.template-photobook .memory-page h2{border-left:3px solid var(--accent);padding-left:12px}
.memory-book.template-polaroid .book-cover,.memory-book.template-polaroid .memory-page,.memory-book.template-polaroid .book-ending{background:transparent;border:0}.memory-book.template-polaroid .photo-frame{position:relative;padding:14px 14px 30px;background:white;box-shadow:0 3px 12px #3331;transform:rotate(-1deg);margin:25px 2px}.memory-book.template-polaroid .photo-frame:before{content:'';position:absolute;width:64px;height:20px;background:var(--tint);opacity:.9;top:-10px;left:calc(50% - 32px);transform:rotate(5deg)}.memory-book.template-polaroid .memory-image{border-radius:0}.memory-book.template-polaroid .memory-page:nth-of-type(even) .photo-frame{transform:rotate(1deg)}
.memory-book.template-album .book-cover,.memory-book.template-album .memory-page,.memory-book.template-album .book-ending{background:white;border:0;border-radius:0;border-top:1px solid var(--line)}.memory-book.template-album .book-cover{text-align:left}.memory-book.template-album h1{font-size:32px}.memory-book.template-album .memory-image{border-radius:0;background:#f7f7f5}.memory-book.template-album blockquote{background:transparent;border-left:2px solid var(--accent);border-radius:0}.memory-book.template-album .kicker{letter-spacing:.15em}
@media(max-width:500px){.memory-book{padding:12px;font-size:12px}.memory-book .book-cover,.memory-book .memory-page,.memory-book .book-ending{padding:18px 14px}.memory-book h1{font-size:27px}.memory-book h2{font-size:19px}.memory-book .memory-image{height:210px}.memory-book .winner-names{font-size:21px}.memory-book.template-album h1{font-size:27px}}
@media print{@page{size:A4;margin:16mm}body{margin:0;background:white}.memory-book{padding:0;max-width:none;font-size:12px;background:white}.memory-book .print-note{display:none}.memory-book .book-cover,.memory-book .memory-page,.memory-book .book-ending{margin:0;padding:10mm 0;border:0;border-radius:0;box-shadow:none;background:white}.memory-book .memory-page,.memory-book .book-ending{break-before:page}.memory-book .memory-image{height:68mm}.memory-book h1{font-size:30px}.memory-book h2{font-size:20px}.memory-book .photo-frame{break-inside:avoid}.memory-book.template-polaroid .photo-frame{transform:none;box-shadow:none;border:1px solid var(--line)}.memory-book.template-polaroid .memory-page:nth-of-type(even) .photo-frame{transform:none}.memory-book blockquote,.memory-book .responses p,.memory-book .people li{break-inside:avoid}.memory-book .book-cover{padding:15mm 0}.memory-book .book-cover .memory-image{height:95mm}.memory-book .sample{margin:0 0 12px}.memory-book footer{break-inside:avoid}}
`;

function memoryCard(entry,index,image) {
  return `<article class="memory-page"><div class="kicker">기억 ${String(index+1).padStart(2,'0')} · ${escapeHTML(entry.author)}님의 이야기</div>
    <figure class="photo-frame">${photo(image)}</figure><h2>${escapeHTML(entry.prompt)}</h2><ol class="options">${entry.options.map((x,i)=>`<li class="${i===entry.correctIndex?'correct':''}">${escapeHTML(x)}${i===entry.correctIndex?' <strong>✓ 정답</strong>':''}</li>`).join('')}</ol>
    ${entry.story?`<blockquote>${escapeHTML(entry.story)}</blockquote>`:''}<div class="responses">${entry.responses.map(p=>`<p><strong>${escapeHTML(p.name)}</strong> · ${escapeHTML(p.answer)} <span>${p.correct?'기억이 맞았어요':'서로 다르게 기억했어요'}</span></p>`).join('')}</div></article>`;
}

export function renderMemoryHTML(book,images={},selection={}) {
  const template=memoryTemplates.find(x=>x.id===selection.template)||memoryTemplates[0];
  const palette=memoryPalettes.find(x=>x.id===selection.palette)||memoryPalettes[0];
  const coverImage=book.entries.map(e=>images[e.photoId]).find(safeImage);
  const topScore=Math.max(...book.players.map(p=>p.score));
  const winners=book.players.filter(p=>p.score===topScore);
  const ranked=[...book.players].sort((a,b)=>b.score-a.score);
  // Only allowlisted design identifiers, authorized content and bounded JPEG data.
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHTML(book.title)} · 그때 우리 추억집</title><style>body{margin:0;background:#f3f2ec}${memoryStyleCSS}</style></head><body><main><div class="memory-book template-${template.id} palette-${palette.id}"><header class="book-cover"><div class="sample">${book.sample?'무료 체험 추억집 · 예시 그림과 가상 참가자가 포함되어 있어요 · 실제 결제 없음':'무료 저장 체험 · 실제 결제 없음'}</div><div class="kicker">그때 우리 · OUR LITTLE MEMORY</div><h1>${escapeHTML(book.title)}</h1><p class="cover-meta">${escapeHTML(book.date)} · ${book.players.length}명이 함께한 시간</p>${coverImage?`<figure class="photo-frame">${photo(coverImage)}</figure>`:''}<p class="cover-count">저장이 허용된 추억 ${book.entries.length}개 · ${template.name} · ${palette.name}</p><div class="print-note">이 파일은 인터넷 없이 열 수 있어요. 브라우저 인쇄 메뉴에서 ‘PDF로 저장’을 선택하면 PDF로 간직할 수 있어요.</div></header>${book.entries.map((e,i)=>memoryCard(e,i,images[e.photoId])).join('')}<section class="book-ending"><div class="kicker">함께한 우리</div><h2>${winners.length>1?'오늘의 공동 기억왕':'오늘의 기억왕'}</h2><p class="winner-names">${winners.map(p=>escapeHTML(p.name)).join(' · ')}</p><ul class="people">${ranked.map(p=>`<li><span>${ranked.findIndex(x=>x.score===p.score)+1}. ${escapeHTML(p.name)}</span><strong>${p.score}점</strong></li>`).join('')}</ul><p class="book-signature">사진 한 장, 다시 만나는 우리</p><footer>사진과 내용은 저장을 허용한 범위 안에서만 공유해 주세요. 내려받은 파일은 기기에 남으며, 이후 앱에서 삭제해도 이 파일은 자동 삭제되지 않아요.<br>그때 우리 · ${escapeHTML(book.date)}</footer></section></div></main></body></html>`;
}
