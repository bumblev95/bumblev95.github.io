import { t, tr, appError, getLanguage, dateLocale, sampleText, installLanguagePicker } from "./locale.js";
import { saveFile, inviteURL } from './platform.js';
let memoryCategory = 'memory-template',
  memoryDensity = 'auto',
  pdfController = null;
import { mountBook, downloadBookPDF } from './book-viewer.js';
import { pointsForTime, setup, validateAction, applyAction, viewFor } from './logic.js';
import { memoryProduct, captureMemory, buildMemoryBook, renderMemoryHTML, memoryTemplates, memoryPalettes, memoryStyleCSS } from './memory.js';
import { questionStarters } from './draft.js';
import { productFor } from './products.js';
import { createGameBreakGate } from './ads.js';
const atGameBreak = createGameBreakGate(options => window.__NATIVE__?.ads?.showAtBreak(options));
const $ = s => document.querySelector(s);
const app = $('#app'),
  modal = $('#modal');
const apiBase = window.__API_BASE__ || '';
const offline = location.protocol === 'file:' || window.__OFFLINE__ === true;
const asset = name => window.__ASSETS__?.[name] || (window.__ASSET_BASE__ || '/assets/') + name;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  join: '<path d="M14 4h5v16h-5M3 12h12M10 7l5 5-5 5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="M3 17l6-6 4 4 3-3 5 5"/>',
  share: '<path d="M12 16V3M7 8l5-5 5 5M5 13v7h14v-7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 018 0v4M12 14v3"/>',
  trophy: '<path d="M7 3h10v7a5 5 0 01-10 0V3zM7 5H3v3a5 5 0 005 5M17 5h4v3a5 5 0 01-5 5M12 15v5M8 21h8"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-4 5 3 11 8 15 5-4 12-10 8-15z"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.photo}</svg>`;
const ui = {
  data: null,
  code: '',
  demo: false,
  demoState: null,
  demoPhotos: {},
  selected: null,
  connected: false,
  busy: false,
  nickname: '',
  source: null
};
let draft = null,
  confirmation = null,
  previousFocus = null,
  toastTimer = null;
let serverClockOffset = 0;
let memoryEntries = new Map(),
  memoryConsent = new Map(),
  memoryBook = null,
  memoryHTML = '',
  memoryEpoch = 0,
  adShown = false,
  memoryImages = {},
  memoryMissing = [],
  memoryTemplate = 'photobook',
  memoryPalette = 'cream',
  memoryIncludeChoices = false,
  memoryTitle = '',
  memoryCoverPhotoId = '',
  memoryIncludeQuiz = false,
  memoryLayout = 'editorial',
  memoryFont = 'sans',
  memoryCoverStyle = 'photo',
  memoryMessage = '',
  memoryDesignOpen = false;
function clearMemory() {
  pdfController?.abort();
  memoryDensity = 'auto';
  memoryEpoch++;
  memoryEntries.clear();
  memoryConsent.clear();
  memoryBook = null;
  memoryHTML = '';
  adShown = false;
  memoryImages = {};
  memoryMissing = [];
  memoryTemplate = 'photobook';
  memoryPalette = 'cream';
  memoryIncludeChoices = false;
  memoryTitle = '';
  memoryCoverPhotoId = '';
  memoryIncludeQuiz = false;
  memoryLayout = 'editorial';
  memoryFont = 'sans';
  memoryCoverStyle = 'photo';
  memoryMessage = '';
  memoryDesignOpen = false;
}
function recordMemory(view) {
  const entry = captureMemory(view, memoryConsent.get(view?.current?.photoId || view?.current?.questionId));
  if (entry) memoryEntries.set(view.round, entry);
}
const photos = new Map();
const sessionKey = code => 'gu-session:' + apiBase + ':' + code;
function sessionToken(code) {
  try {
    return sessionStorage.getItem(sessionKey(code)) || '';
  } catch {
    return '';
  }
}
function remember(code, secret) {
  if (secret) try {
    sessionStorage.setItem(sessionKey(code), secret);
  } catch {
    throw new Error(t("이 브라우저에서 세션 저장을 허용한 뒤 다시 입장해 주세요."));
  }
}
function authHeaders(code = ui.code) {
  const secret = sessionToken(code);
  return secret ? {
    Authorization: 'Bearer ' + secret
  } : {};
}
function clearPhotos(keep = []) {
  for (const [id, p] of photos) if (!keep.includes(id)) {
    p.abort.abort();
    if (p.url) URL.revokeObjectURL(p.url);
    photos.delete(id);
  }
}
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4200);
}
function photoSrc(id) {
  if (ui.demo) return ui.demoPhotos[id] || asset('sample-' + id + (id === 'cafe' ? '-v2.jpg' : '-v1.png'));
  const cached = photos.get(id);
  if (cached) return cached.url || asset('icon.svg');
  const entry = {
    abort: new AbortController(),
    url: null
  };
  photos.set(id, entry);
  const timer = setTimeout(() => entry.abort.abort(), 12000);
  fetch(apiBase + `/api/rooms/${ui.code}/photo/${id}`, {
    headers: authHeaders(),
    credentials: 'omit',
    cache: 'no-store',
    signal: entry.abort.signal
  }).then(async r => {
    if (!r.ok) throw new Error(t("사진을 불러오지 못했어요."));
    const blob = await r.blob();
    if (photos.get(id) !== entry) return;
    entry.url = URL.createObjectURL(blob);
    render();
    if (draft?.photoId === id && $('#photo-pick img')) $('#photo-pick img').src = entry.url;
    if (modal.open && modal.querySelector('.zoom-photo')) modal.querySelector('.zoom-photo').src = entry.url;
  }).catch(e => {
    if (e.name !== 'AbortError') toast(appError(e) + t(" 화면을 다시 연결하면 재시도해요."));
  }).finally(() => clearTimeout(timer));
  return asset('icon.svg');
}
function avatar(p, index = 0) {
  return `<span class="avatar c${index % 4}" aria-hidden="true">${esc((p.name || '?').slice(0, 1))}</span>`;
}
function button(label, action, style = 'primary', disabled = false, extra = '') {
  return `<button type="button" class="button ${style}" data-action="${action}" ${disabled ? 'disabled' : ''} ${extra}>${label}</button>`;
}
function stateAccept(data) {
  if (data.code === ui.code && Number.isFinite(data.revision) && data.revision < (ui.data?.revision || 0)) return;
  if (ui.code && data.code !== ui.code) clearMemory();
  if (Number.isFinite(data.serverNow)) serverClockOffset = data.serverNow - Date.now();
  const prev = ui.data?.view;
  const next = data.view;
  if (ui.data && data.code === ui.code && (data.gameNumber || 0) !== (ui.data.gameNumber || 0)) {
    if (modal.open) closeModal();
    clearMemory();
    clearPhotos();
    adShown = false;
  }
  if (data.access !== 'active' || next?.phase === 'finished' && next.endReason !== 'completed') clearMemory();
  if (data.access === 'active' && next?.phase === 'finished' && next.endReason === 'completed' && data.memorySnapshot) {
    memoryBook = {
      ...data.memorySnapshot.book,
      date: new Date(data.memorySnapshot.createdAt).toLocaleDateString(dateLocale())
    };
    memoryImages = data.memorySnapshot.images;
    memoryMissing = data.memorySnapshot.missing;
  }
  if (ui.demo) recordMemory(next);
  if (!ui.demo) {
    const keep = data.access === 'active' && next?.phase !== 'finished' ? [...(next?.myQuestions || []).map(q => q.photoId), next?.myQuestion?.photoId, next?.current?.photoId].filter(Boolean) : [];
    clearPhotos(keep);
  }
  if ((data.access !== 'active' || draft && next?.phase !== 'lobby') && modal.open) closeModal();
  if (!prev || prev.round !== next?.round || prev.phase !== next?.phase || ui.code !== data.code) ui.selected = null;
  const {
    memorySnapshot,
    ...state
  } = data;
  ui.data = state;
  ui.code = data.code;
  if (!ui.demo && next?.phase === 'lobby' && !next.photoOnlyPolicy && data.multiQuestionsSupported && !next.myQuestion && !next.answerOnlyIds?.includes(next.you) && !ui.autoReady) {
    ui.autoReady = true;
    request(`/api/rooms/${data.code}/action`, {
      type: 'answerOnly',
      enabled: true,
      gameNumber: data.gameNumber || 0
    }).catch(() => {}).finally(() => {
      ui.autoReady = false;
    });
  }
  if (['blocked', 'kicked', 'left'].includes(data.access)) {
    ui.source?.close();
    ui.source = null;
  }
  render();
}
async function request(pathPart, body, opts = {}) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 25000);
  try {
    const code = pathPart.match(/\/rooms\/([A-HJ-NP-Z2-9]{8})/)?.[1] || ui.code;
    const response = await fetch(apiBase + pathPart, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'omit',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: control.signal,
      ...opts,
      headers: {
        ...(body === undefined ? {} : {
          'Content-Type': 'application/json'
        }),
        ...authHeaders(code),
        ...(opts.headers || {})
      }
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(t("서버 응답을 확인하지 못했어요."));
    }
    if (!response.ok) {
      const error = new Error(appError(result.error) || t("요청을 처리하지 못했어요."));
      error.status = response.status;
      throw error;
    }
    if (result.sessionToken) {
      remember(result.code, result.sessionToken);
      delete result.sessionToken;
    }
    if (result.access) stateAccept(result);
    return result;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(t("연결이 지연됐어요. 새로고침해 등록 여부를 확인해 주세요."));
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
function connect(code) {
  ui.source?.close();
  ui.connected = false;
  let closed = false,
    controller = null,
    retry = null,
    watchdog = null;
  const source = {
    close() {
      closed = true;
      clearTimeout(retry);
      clearTimeout(watchdog);
      controller?.abort();
    }
  };
  ui.source = source;
  async function run() {
    controller = new AbortController();
    try {
      const response = await fetch(apiBase + `/api/rooms/${code}/events`, {
        headers: authHeaders(code),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal
      });
      if ([401, 403, 404, 410].includes(response.status)) {
        source.close();
        ui.source = null;
        ui.connected = false;
        clearPhotos();
        if (response.status === 401) {
          goHomeNow();
          openEntry('join', code);
        } else if (response.status === 403) {
          await request(`/api/rooms/${code}/state`);
        } else {
          goHomeNow();
          toast(t("모임이 없거나 만료됐어요. 새 모임을 만들어 주세요."));
        }
        return;
      }
      if (!response.ok) throw new Error(t("연결 지연"));
      // A new transport fetches the latest personalized snapshot; actions are never replayed.
      clearPhotos();
      ui.connected = true;
      render();
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '';
      while (!closed) {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => controller.abort(), 45000);
        const {
          done,
          value
        } = await reader.read();
        if (closed || done) break;
        buffer += decoder.decode(value, {
          stream: true
        });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (frame.includes('event: expired')) {
            source.close();
            goHomeNow();
            toast(t("모임이 만료되어 사진 접근을 차단했어요."));
            return;
          }
          const line = frame.split('\n').find(x => x.startsWith('data: '));
          if (line) {
            ui.connected = true;
            stateAccept(JSON.parse(line.slice(6)));
          }
        }
      }
    } catch (e) {
      if (!closed && e.name !== 'AbortError') ui.connected = false;
    } finally {
      clearTimeout(watchdog);
      controller?.abort();
      if (!closed) {
        ui.connected = false;
        render();
        retry = setTimeout(run, 1500);
      }
    }
  }
  run();
}
function networkBanner() {
  return !ui.demo && !ui.connected ? t("<div class=\"connection\" role=\"status\">연결을 확인하고 있어요. 자동으로 다시 연결돼요.</div>") : '';
}
function screenTop(label) {
  return `<div class="screen-top"><button class="back" data-action="home">${icon('back')}<span>${label || t("홈으로")}</span></button><span class="pill ${ui.demo ? 'demo' : ''}">${ui.demo ? t("체험 모드") : t("우리끼리 비공개")}</span></div>`;
}
function render() {
  document.body.dataset.screen = ui.data?.view && ['question', 'reveal'].includes(ui.data.view.phase) ? 'quiz' : ui.data?.view?.phase || 'home';
  if (!ui.data) {
    app.innerHTML = homeMarkup();
    return;
  }
  if (ui.data.access !== 'active') {
    app.innerHTML = pendingMarkup();
    return;
  }
  const v = ui.data.view;
  if (!v) {
    app.innerHTML = t("<div class=\"loading-state\">방 상태를 다시 확인해 주세요.</div>");
    return;
  }
  app.innerHTML = v.phase === 'lobby' ? lobbyMarkup(v) : v.phase === 'finished' ? resultMarkup(v) : quizMarkup(v);
}
function homeMarkup() {
  return tr`<section class="fade-in home-screen">${offline ? t("<div class=\"offline-note\">서버 연결이 아직 설정되지 않았어요. 가상 친구 체험은 사용할 수 있어요.</div>") : ''}
 <div class="home-copy"><div class="eyebrow">우리의 기억으로 노는 시간</div><h1 class="home-title">같은 사진,<br><em>서로 다른 기억.</em></h1>
 <p class="intro-sub">친구와 가족, 사진 한 장이면 충분해요.<br>그날의 이야기를 다시 꺼내 볼까요?</p></div>
 <div class="memory-collage" aria-label="바다 여행, 피크닉, 카페를 담은 AI 생성 예시 사진 세 장"><figure class="polaroid first"><span class="tape"></span><img src="${asset('sample-seaside-v1-thumb.png')}" alt="친구들이 해변을 걷는 AI 생성 예시 사진"><figcaption>함께 갔던 바다</figcaption></figure><figure class="polaroid second"><span class="tape"></span><img src="${asset('sample-picnic-v1-thumb.png')}" alt="친구들이 소풍 도시락을 여는 AI 생성 예시 사진"><figcaption>유난히 웃던 날</figcaption></figure><figure class="polaroid third"><img src="${asset('sample-cafe-v1-thumb.png')}" alt="친구들이 딸기라테를 마시는 AI 생성 예시 사진"><figcaption>우리의 작은 순간</figcaption></figure><span class="tiny-star" aria-hidden="true">✧</span><span class="tiny-flower" aria-hidden="true">✳</span></div>
 <div class="collage-note">AI 생성 예시 · 모임에서는 내 사진으로</div>
 <div class="home-actions">${offline ? button(t("먼저 체험해 보기 <span aria-hidden=\"true\">→</span>"), 'demo') : button(icon('plus') + t("새 모임 만들기"), 'new')}${offline ? button(t("친구 초대 · 준비 중"), 'new', 'outline') : button(icon('join') + t("방 코드로 참여하기"), 'join', 'outline')}</div>
 <div class="home-facts">${offline ? t("<span>다운로드 없이</span><span>가상 친구와</span><span>사진 전송 없음</span>") : t("<span>친구끼리만</span><span>친구·가족과</span><span>회원가입 없이</span>")}</div>
 ${offline ? '' : button(t("먼저 체험해 보기 <span aria-hidden=\"true\">→</span>"), 'demo', 'secondary')}
</section>`;
}
function pendingMarkup() {
  const blocked = ['blocked', 'kicked', 'left'].includes(ui.data.access);
  return `${screenTop()}<section class="waiting-view"><span class="waiting-icon" aria-hidden="true">${blocked ? '○' : '✉'}</span><h1>${blocked ? (ui.data.access === 'kicked' ? t("방장이 모임에서 내보냈어요") : t("이 모임에 참여할 수 없어요")) : t("입장 요청을 보냈어요")}</h1><p>${blocked ? t("방장에게 확인하거나 새로운 모임을 만들어 주세요.") : tr`${esc(ui.data.nickname)}님, 방장이 친구인지 확인 중이에요.<br>승인되면 대기방으로 자동으로 이동해요.`}</p><span class="pill muted">${esc(ui.data.title)}</span>${!blocked ? t("<div class=\"notice\">아직 다른 참가자의 사진과 문제는<br>전혀 보이지 않아요.</div>") : ''}</section>${button(t("홈으로 돌아가기"), 'home', 'outline')}`;
}
function participantSafetyButtons(v,p) {
  if (ui.demo || p.id === v.you || !ui.data?.playerBlockingSupported) return '';
  const blocked = ui.data.blockedPlayerIds?.includes(p.id);
  const en = getLanguage() === 'en';
  return `<div class="person-safety">
    <button class="text-button" type="button" data-action="${blocked?'unblock-player':'block-player'}" data-id="${esc(p.id)}" ${ui.busy?'disabled':''}>${blocked?(en?'Unblock':'차단 해제'):(en?'Block player':'참가자 차단')}</button>
    <button class="text-button warning" type="button" data-action="report-player" data-id="${esc(p.id)}" ${ui.busy?'disabled':''}>${en?'Report player':'참가자 신고'}</button>
  </div>`;
}
function playerList(v, rank = false, managePlayers = false) {
  return `<div class="people">${v.players.map((p, i) => `<div class="person">${avatar(p, i)}<span class="person-name">${esc(p.name)}${!ui.demo && !ui.data.connectedIds?.includes(p.id) ? t("<small>잠시 연결 끊김 · 재접속 대기</small>") : ''}${p.id === v.you && p.name !== t("나") ? t("<span class=\"badge-me\">나</span>") : ''}${p.id === v.hostId ? t("<small>방장</small>") : ''}</span>${rank && !managePlayers ? tr`<span class="score">${p.score}점</span>` : `<span class="status ${v.readyIds.includes(p.id) ? 'ready' : ''}">${v.photoOnlyPolicy ? v.questionCounts?.[p.id] ? (getLanguage()==='en'?v.questionCounts[p.id]+' photo'+(v.questionCounts[p.id]===1?'':'s')+' ready':tr`사진 ${v.questionCounts[p.id]}장 준비`) : t("맞히며 참여해요") : v.readyIds.includes(p.id) ? t("✓ 준비 완료") : t("참여 준비 중")}</span>${participantSafetyButtons(v,p)}${v.you === v.hostId && p.id !== v.you && !ui.demo ? tr`<button class="text-button warning" data-action="kick" data-id="${p.id}" aria-label="${esc(p.name)}님 내보내기" ${ui.busy ? 'disabled' : ''}>강퇴</button>` : ''}`}</div>`).join('')}</div>`;
}
function lobbyMarkup(v) {
  const ready = v.players.length >= 2 && (v.photoOnlyPolicy ? v.totalPrepared > 0 : v.players.every(p => v.readyIds.includes(p.id))) && !ui.data.pending?.length;
  const myQs = v.myQuestions || [v.myQuestion].filter(Boolean),
    limit = v.questionLimit === null ? Infinity : v.questionLimit ?? 1,
    hostOnly = v.hostOnlyQuestions || v.mode === 'battle',
    mayCompose = !hostOnly || v.you === v.hostId;
  const myQ = myQs[0];
  return tr`<section>${screenTop()}${networkBanner()}<h1 class="section-heading">${esc(ui.data.title)}</h1><p class="small-text muted">${hostOnly ? t("방장이 사진을 준비하고, 친구들이 맞혀요.") : t("사진은 원하는 사람만 내요 · 1인 최대 5장")}</p>
 ${ui.demo ? t("<p class=\"demo-note\">AI 생성 예시 사진과 가상 참가자로 진행하는 체험이에요.</p>") : ''}
 <div class="invite-card"><div class="invite-heading">${ui.demo ? t("준비된 예시로 먼저 놀아 봐요") : t("친구에게 이 방 코드를 알려 주세요")}</div><div class="code-row"><span class="room-code">${ui.demo ? t("우리의 체험방") : esc(ui.code.slice(0, 4) + ' ' + ui.code.slice(4))}</span>${!ui.demo ? tr`<button class="icon-button" data-action="copy-code" aria-label="방 코드 복사">${icon('copy')}</button>` : ''}</div>${!ui.demo ? button(icon('share') + t("초대 링크 보내기"), 'share', 'small') : ''}<p class="microcopy">${ui.demo ? t("가상 친구 2명과 세 문제를 풀어 볼 수 있어요.") : t("코드로 입장한 친구를 방장이 승인하면 함께할 수 있어요.")}</p></div>
 <div class="card"><div class="card-heading"><span>함께할 사람들 <small>${v.players.length}/${v.photoOnlyPolicy || v.questionLimit ? 10 : 8}</small></span><small>사진 문제 ${v.totalPrepared ?? v.readyIds.length}개</small></div>${playerList(v)}${v.players.length < 2 ? t("<div class=\"empty-person\" style=\"margin-top:14px\">친구가 들어오면 이곳에서 만나요.</div>") : ''}
 ${ui.data.pending?.length ? tr`<div class="pending-list"><div class="pending-label">입장 요청 ${ui.data.pending.length}명 · 아는 친구인지 확인해 주세요</div>${ui.data.pending.map(p => tr`<div class="pending-person"><span class="person-name">${esc(p.name)}</span><button class="button small secondary" data-action="approve" data-id="${p.id}" ${ui.busy ? 'disabled' : ''}>승인</button><button class="button small outline" data-action="deny" data-id="${p.id}" ${ui.busy ? 'disabled' : ''}>거절</button></div>`).join('')}</div>` : ''}</div>
 <div class="card no-shadow"><div class="card-heading"><span>${hostOnly && !mayCompose ? t("방장의 사진을 기다려요") : t("내가 꺼낼 추억")}</span><small>${hostOnly ? t("방장만 출제 · 사진 수 제한 없음") : myQs.length + '/' + limit + t("장")}</small></div>${myQs.map(q => tr`<div class="question-item"><img src="${esc(photoSrc(q.photoId))}" alt="내 문제 사진"><strong>${esc(q.prompt)}</strong><button class="text-button" data-action="compose" data-slot="${q.slot || 0}">수정</button><button class="text-button warning" data-action="remove-question" data-slot="${q.slot || 0}">삭제</button></div>`).join('')}${mayCompose && myQs.length < limit ? `<button class="photo-add" data-action="compose" data-slot="${Array.from({
    length: myQs.length + 1
  }, (_, i) => i).find(slot => !myQs.some(q => (q.slot || 0) === slot))}"><span class="add-icon">+</span><span><strong>${myQs.length ? t("사진 문제 더 추가") : t("사진으로 문제 만들기")}</strong><small>${hostOnly ? t("방장만 출제해요") : t("사진이 없어도 답을 맞히며 참여할 수 있어요")}</small></span></button>` : ''}<p class="microcopy">사진을 내지 않아도 모든 문제에 참여할 수 있어요.${hostOnly ? t(" 방장은 출제자로 참여해요.") : ''}</p></div>
 <div class="room-bottom">${v.you === v.hostId ? button(ui.busy ? t("처리하는 중…") : ui.demo ? t("기억 대결 체험 시작") : t("기억 대결 시작하기"), 'start', 'primary', !ready || ui.busy || !ui.demo && !ui.connected) : button(t("방장이 시작하면 함께 출발해요"), 'none', 'secondary', true)}<p class="helper">${ready ? t("돌아가며 출제해요. 내 문제에서는 점수를 얻지 않아요.") : t("사진 문제가 하나 이상 있으면 함께 시작할 수 있어요.")}</p></div>
 <div class="notice">${v.mode === 'family' ? t("가족 모드는 속도 감점 없이 함께 이야기해요.") : t("정답은 최대 100점! 남은 시간 비율로 점수가 줄어요.<br>오답·시간 초과는 0점이에요.")}</div>
 <div style="text-align:center;margin-top:20px"><button class="text-button warning" data-action="${v.you === v.hostId ? 'end' : 'leave'}">${v.you === v.hostId ? t("모임 종료하고 임시 사진 삭제") : t("대기방 나가기")}</button></div></section>`;
}
function partyMissionMarkup(v) {
  const m = v.partyMission;
  if (!m) return '';
  const target = v.players.find(p => p.id === m.targetId);
  if (!target) return '';
  const mine = v.you === m.targetId,
    host = v.you === v.hostId,
    disabled = ui.busy || !ui.demo && !ui.connected;
  return tr`<div class="party-mission card" aria-label="선택형 파티 미션"><span class="eyebrow">함께 웃는 잠깐의 미션</span><h2>${esc(target.name)}님의 차례</h2><p>${esc(t(m.prompt))}</p><p class="microcopy">이번 문제 점수가 가장 낮은 답변자 중 한 명이에요. 동점이면 돌아가며 선택해요.<br>참여는 자유예요. 건너뛰어도 점수는 그대로예요.</p>${m.status === 'pending' ? `<div class="mission-actions">${mine ? button(t("미션 했어요"), 'missionDone', 'secondary', disabled) : ''}${mine || host ? button(t("이번 미션 건너뛰기"), 'missionSkip', 'quiet', disabled) : t("<p class=\"notice\">이야기를 듣거나 바로 다음 문제로 넘어가도 좋아요.</p>")}</div>` : `<p class="notice">${m.status === 'done' ? t("함께 이야기했어요!") : t("이번 미션은 쉬어 가요.")}</p>`}</div>`;
}
function quizMarkup(v) {
  const q = v.current;
  if (!q) return t("<div class=\"loading-state\">문제를 불러오고 있어요…</div>");
  const author = v.players.find(p => p.id === q.authorId),
    mine = q.authorId === v.you,
    reveal = v.phase === 'reveal';
  const blockedAuthor = !ui.demo && ui.data.blockedPlayerIds?.includes(q.authorId);
  const photoHidden = !ui.demo && ui.data.hiddenPhotoIds?.includes(q.photoId);
  const selected = v.myAnswer ?? ui.selected;
  const mayNext = v.you === v.hostId;
  const choices = q.options.map((answer, i) => `<button class="choice ${reveal && q.correctIndex === i ? 'correct' : reveal && v.myAnswer === i ? 'wrong' : selected === i && !mine ? 'selected' : ''}" data-action="choose" data-choice="${i}" ${mine || reveal || v.myAnswer !== null || ui.busy ? 'disabled' : ''} aria-pressed="${selected === i}"><span class="number">${i + 1}</span><span class="answer-label">${esc(answer)}</span>${reveal && q.correctIndex === i ? t("<span class=\"checkmark\" aria-label=\"정답\">✓</span>") : ''}</button>`).join('');
  return tr`<section>${screenTop()}${networkBanner()}<div class="round-line"><span>${{
    memory: t("기억 대결"),
    battle: t("추억 배틀"),
    party: t("파티 모드"),
    family: t("가족 모드")
  }[v.mode] || t("기억 대결")}</span><strong>${String(v.round + 1).padStart(2, '0')} <small>/ ${String(v.total).padStart(2, '0')}</small></strong></div><div class="progress" aria-label="${v.total}문제 중 ${v.round + 1}번째">${Array.from({
    length: v.total
  }, (_, i) => `<span class="${i < v.round ? 'done' : i === v.round ? 'current' : ''}"></span>`).join('')}</div>
 ${ui.demo ? t("<div class=\"demo-note\">AI 생성 예시 사진 · 가상 참가자와의 체험</div>") : ''}${!ui.demo ? v.players.filter(p => !ui.data.connectedIds?.includes(p.id)).map(p => tr`<p class="notice warning">${esc(p.name)}님 연결을 기다리고 있어요. 돌아오면 현재 문제와 점수로 이어져요.</p>`).join('') : ''}
 <div class="author-line">${avatar(author, v.round)}<span><strong>${blockedAuthor?(getLanguage()==='en'?'Blocked player':'차단한 참가자'):esc(author.name)}</strong>님이 꺼낸 추억 ${mine ? t("· 내가 출제한 문제") : ''}</span></div>
 ${photoHidden ? tr`<div class="hidden-photo notice"><p>${blockedAuthor?(getLanguage()==='en'?'Blocked participant content is hidden.':'차단한 참가자의 콘텐츠를 숨겼어요.'):'내 화면에서 사진을 숨겼어요.'}</p>${blockedAuthor?'':button(t("사진 다시 보기"), 'show-photo', 'quiet', ui.busy)}</div>` : q.photoId ? `<figure class="quiz-photo" data-action="zoom" role="button" tabindex="0" aria-label="${t('추억 사진 크게 보기')}"><img src="${esc(photoSrc(q.photoId))}" alt="${esc(author.name)}${t('님이 공유한 추억 사진')}"><figcaption>${ui.demo ? 'SAMPLE MEMORY' : 'OUR LITTLE MEMORY'}${t(' · 터치해서 크게 보기')}</figcaption></figure>` : t('<div class="no-photo-question">사진을 불러오고 있어요.</div>')}
 ${!reveal ? '<p id="round-clock" class="notice" role="timer">' + (ui.data.roundDeadlineAt ? t("남은 시간 확인 중…") : t("시간제한 없이 함께 풀어요")) + '</p>' : ''}
 <h1 class="question-title">${esc(q.prompt)}</h1><div class="choices" aria-label="문제의 보기">${choices}</div>
 ${mine && !reveal ? tr`<div class="author-notice"><strong>지금은 내가 이야기꾼이에요.</strong>내가 선택한 정답은 ${q.correctIndex + 1}번이에요.<br>친구들이 답하는 동안 기다려 주세요. 내 점수는 변하지 않아요.</div>` : ''}
 ${reveal ? `<div class="reveal-title">${mine ? t("친구들은 이렇게 기억했네요.") : v.myAnswer !== null && v.myAnswer === q.correctIndex ? t("기억이 딱 맞았네요!") : t("서로 다르게 기억하고 있었네요.")}</div><div class="gain">${v.scoring === false ? t("점수 없이 함께 기억하는 시간") : mine ? t("출제자 · 이번 문제 점수 없음") : v.myAnswer !== null && v.myAnswer === q.correctIndex ? tr`정답 +${v.awards[v.you]}점` : v.myAnswer === null ? t("미응답 · 0점") : t("이번 문제는 0점, 다음 추억도 함께해요.")}</div>${partyMissionMarkup(v)}${q.story ? tr`<div class="story-card"><small>${esc(author.name)}님이 들려주는 그날의 이야기</small><p>${esc(q.story)}</p></div>` : ''}<div class="answer-area">${mayNext ? button(v.round + 1 === v.total ? v.scoring === false ? t("우리 이야기 마치기") : t("오늘의 기억왕 만나기") : t("다음 추억으로"), 'next', 'primary', ui.busy || !ui.demo && !ui.connected) : button(t("방장이 다음으로 넘겨 주세요"), 'none', 'secondary', true)}</div>` : tr`<div class="answer-area">${!mine ? v.myAnswer !== null ? t("<div class=\"sent-state\">✓ 답변을 보냈어요. 잠깐만 기다려 주세요.</div>") : button(t("이 답으로 제출하기"), 'answer', 'primary', ui.selected === null || ui.busy || !ui.demo && !ui.connected) : ui.demo ? button(t("가상 친구들의 답변 확인"), 'demo-answers', 'secondary', ui.busy) : ''}<div class="answer-count">${v.answeredIds.length} / ${v.players.length - 1}명이 답했어요</div>${v.you === v.hostId && !ui.demo && !ui.data.roundDeadlineAt ? t("<div style=\"text-align:center\"><button class=\"text-button\" data-action=\"reveal\">기다리기 / 미응답자 건너뛰기</button></div>") : ''}</div>`}
 <details class="mini-score" ${v.scoring === false ? 'hidden' : ''} ${reveal ? 'open' : ''}><summary>지금까지의 점수</summary>${playerList(v, true)}</details>
 ${!ui.demo ? `<div class="photo-tools">${!photoHidden ? button(t("사진 숨기기"), 'hide-photo', 'quiet', ui.busy || !ui.data.moderationSupported) : ''}${button(t("사진 신고"), 'report', 'quiet', ui.busy || !ui.data.moderationSupported)}${v.you === v.hostId ? button(t("참가자 관리"), 'manage-players', 'quiet', !ui.data.moderationSupported) + button(t("모임 종료"), 'end', 'quiet') : ''}</div>` : ''}</section>`;
}
function memoryOfferMarkup() {
  const count = memoryBook?.entries.length || 0;
  return tr`<div class="memory-offer"><span class="memory-offer-icon" aria-hidden="true">${icon('heart')}</span><div class="eyebrow">오늘의 모임을 간직하고 싶다면</div><h2>우리의 작은 추억집</h2><p>사진, 문제, 서로 다른 답변까지.<br>오늘의 이야기를 한 권에 담아요.</p><div class="memory-price"><strong>${memoryProduct.price}</strong><span>한 게임 · 한 번 구매 · 구독 없음</span></div>${button(t("추억집 미리 보기"), 'memory-preview', 'secondary', count === 0)}<small>${count ? tr`미리보기는 무료예요 · 저장 허용된 추억 ${count}개` : t("저장 허용된 추억을 받지 못했어요. 종료 때 연결된 탭에서만 받을 수 있어요.")}</small><small class="preview-disclosure">현재는 무료 저장 체험이며 실제 결제는 없어요.</small></div>`;
}
async function photoForMemory(id) {
  const src = photoSrc(id);
  const image = new Image();
  image.src = src;
  await image.decode();
  const width = image.naturalWidth,
    height = image.naturalHeight;
  const canvas = document.createElement('canvas'),
    scale = Math.min(1, 1600 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fffdf5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .92);
}
async function openMemoryPreview() {
  if (!memoryBook?.entries.length || ui.busy) return;
  if (!ui.demo) {
    renderMemoryPreview();
    return;
  }
  const book = memoryBook,
    epoch = memoryEpoch;
  ui.busy = true;
  showModal(t("우리의 작은 추억집"), t("<div class=\"loading-state\">저장이 허용된 추억만 모으고 있어요…</div>"));
  const images = {},
    missing = [];
  await Promise.all(book.entries.map(async entry => {
    if (entry.media && entry.media !== 'photo') return;
    try {
      images[entry.photoId] = await photoForMemory(entry.photoId);
    } catch {
      missing.push(entry.photoId);
    }
  }));
  ui.busy = false;
  if (epoch !== memoryEpoch || book !== memoryBook || !modal.open) return;
  memoryImages = images;
  memoryMissing = missing;
  renderMemoryPreview();
}
function updateMemoryBook() {
  memoryHTML = renderMemoryHTML(memoryBook, memoryImages, {
    template: memoryTemplate,
    palette: memoryPalette,
    includeChoices: memoryIncludeChoices,
    title: memoryTitle,
    coverPhotoId: memoryCoverPhotoId,
    includeQuiz: memoryIncludeQuiz,
    layout: memoryLayout,
    font: memoryFont,
    cover: memoryCoverStyle,
    message: memoryMessage,
    density: memoryDensity
  });
}
function updateMemoryReader() {
  updateMemoryBook();
  const reader = $('#book-reader');
  if (!reader) return;
  reader.innerHTML = memoryHTML.split('<main>')[1].split('</main>')[0];
  mountBook(reader);
  $('#memory-choices').closest('label').hidden = !memoryIncludeQuiz;
}
function renderMemoryPreview() {
  const currentDesign = $('#memory-customize');
  if (currentDesign) memoryDesignOpen = currentDesign.open;
  if ($('#memory-title')) memoryTitle = $('#memory-title').value.trim();
  if ($('#memory-message')) memoryMessage = $('#memory-message').value.trim();
  updateMemoryBook();
  const pages = memoryHTML.split('<main>')[1].split('</main>')[0];
  const cards = (id, title, items, selected, kind = '') => `<fieldset class="book-choice-group" id="${id}" ${memoryCategory === id || id === 'memory-density' && memoryCategory === 'memory-layout' ? '' : 'hidden'}><legend>${title}</legend><div class="book-choice-grid ${kind}">${items.map(x => `<label class="book-choice"><input type="radio" name="${id}" value="${esc(x.id)}" ${x.id === selected ? 'checked' : ''}><span class="book-choice-face">${x.image ? `<img class="book-photo-thumb" src="${x.image}" alt="">` : kind === 'colors' ? `<span class="book-color" style="background:${{
    cream: '#f3ebdd',
    peach: '#efc7b5',
    sage: '#bdcbb7',
    white: '#fff',
    navy: '#263747',
    rose: '#d4a5ae'
  }[x.id]}"></span>` : tr`<span aria-hidden="true" class="book-mini ${kind} mini-${x.id}"><i></i><b>우리의 순간</b><em></em></span>`}<strong>${esc(x.name)}</strong>${x.description ? `<small>${esc(x.description)}</small>` : ''}<span class="book-selected" aria-hidden="true">✓</span></span></label>`).join('')}</div></fieldset>`;
  const coverEntries = memoryBook.entries.filter(entry => memoryImages[entry.photoId]);
  const coverCards = cards('memory-cover', t("표지 사진을 골라요"), coverEntries.map((entry, index) => ({
    id: entry.photoId,
    name: tr`${index + 1}. ${entry.author}님의 사진`,
    image: memoryImages[entry.photoId]
  })), memoryCoverPhotoId || coverEntries[0]?.photoId, 'photos');
  const designCards = cards('memory-template', t("어떤 느낌으로 간직할까요?"), memoryTemplates.map(x => ({
    ...x,
    description: {
      photobook: t("사진과 이야기가 함께"),
      polaroid: t("즉석 사진처럼 정겹게"),
      album: t("깔끔하게 사진 중심")
    }[x.id]
  })), memoryTemplate, 'templates') + cards('memory-cover-style', t("표지 모양"), [{
    id: 'photo',
    name: t("사진 가득"),
    description: t("좋아하는 사진이 주인공")
  }, {
    id: 'type',
    name: t("글로 담기"),
    description: t("제목과 문구로 담백하게")
  }, {
    id: 'frame',
    name: t("액자처럼"),
    description: t("사진 둘레에 여유롭게")
  }], memoryCoverStyle, 'covers') + cards('memory-layout', t("페이지 배치"), [{
    id: 'editorial',
    name: t("사진 + 이야기"),
    description: t("사진 아래 우리의 이야기")
  }, {
    id: 'gallery',
    name: t("작은 갤러리"),
    description: t("액자와 넉넉한 여백")
  }, {
    id: 'minimal',
    name: t("심플하게"),
    description: t("장식 없이 담백하게")
  }], memoryLayout, 'layouts') + cards('memory-density', t("한 페이지에 담을 추억"), [{
    id: 'auto',
    name: t("알아서 담기")
  }, {
    id: 'one',
    name: t("한 개씩 크게")
  }, {
    id: 'two',
    name: t("두 개씩 함께")
  }], memoryDensity, 'density') + cards('memory-palette', t("마음에 드는 색"), memoryPalettes, memoryPalette, 'colors') + cards('memory-font', t("글씨 느낌"), [{
    id: 'sans',
    name: t("또렷하고 모던하게")
  }, {
    id: 'serif',
    name: t("차분하고 클래식하게")
  }], memoryFont, 'fonts');
  showModal(t("우리의 작은 추억집"), tr`<style>${memoryStyleCSS}</style><p class="pack-disclosure">출시 예정 가격 ${memoryProduct.price} · 한 게임 · 구독 없음<br><strong>현재는 무료 저장 체험이며 돈이 결제되지 않아요.</strong></p><details id="memory-customize" class="memory-customize" ${memoryDesignOpen ? 'open' : ''}><summary>나만의 포토북 꾸미기 · 표지·배치·글꼴·색상</summary><div class="field"><label for="memory-title">추억집 제목</label><input id="memory-title" type="text" maxlength="40" value="${esc(memoryTitle || memoryBook.title)}"><button class="button quiet" type="button" data-action="memory-title-apply">제목 적용</button></div><div class="book-category-tabs" role="group" aria-label="꾸미기 항목">${[['memory-template', t("느낌")], ['memory-cover', t("사진")], ['memory-cover-style', t("표지")], ['memory-layout', t("배치")], ['memory-palette', t("색상")], ['memory-font', t("글씨")]].map(([id, label]) => `<button type="button" data-action="book-category" data-group="${id}" aria-pressed="${memoryCategory === id}">${label}</button>`).join('')}</div>${coverCards}${designCards}<p class="microcopy">누르면 바로 미리보기에 반영돼요. 언제든 다시 바꿀 수 있어요.</p><label class="field"><span>표지에 남길 한 줄 · 선택</span><input id="memory-message" maxlength="80" value="${esc(memoryMessage)}" placeholder="예: 우리, 이 순간을 오래 기억하자."><button class="button quiet" type="button" data-action="memory-message-apply">문구 적용</button></label><label class="check-field"><input type="checkbox" id="memory-quiz" ${memoryIncludeQuiz ? 'checked' : ''}>게임 기록도 포함하기 · 질문·정답·최종 점수</label><label class="check-field" ${memoryIncludeQuiz ? '' : 'hidden'}><input type="checkbox" id="memory-choices" ${memoryIncludeChoices ? 'checked' : ''}>퀴즈 선택지도 포함하기 · 친구들이 고른 답도 담아요</label><p class="microcopy">기본은 사진과 이야기만 담아요. 게임 기록은 원할 때만 추가할 수 있어요. 사진 전체가 보이도록 담고, 선택한 디자인 그대로 저장해요.</p></details>${memoryMissing.length ? t("<p class=\"notice warning\">불러오지 못한 사진은 빼고 내용만 담았어요.</p>") : ''}${button(t("PDF로 간직하기 · 무료"), 'memory-pdf', 'primary')}<button type="button" class="button quiet" data-action="memory-pdf-cancel" ${pdfController ? '' : 'hidden'}>PDF 저장 중단</button>${button(t("앨범 HTML 파일 저장"), 'memory-save', 'quiet')}<p class="microcopy">저장을 허용한 추억만 포함해요. 내려받은 파일은 기기에 남아요.</p><div id="book-reader" class="book-preview" tabindex="0" aria-label="추억집 페이지 넘기기">${pages}</div><p class="microcopy">좌우로 밀거나 화살표로 넘겨 보세요. PDF는 기기에서 만들어 저장해요. 홈 이동·새로고침·탭 종료 시 앱 안의 추억집은 사라져요. 실제 결제와 장기 클라우드 보관은 아직 연결되지 않았어요.</p>`, 'memory');
  mountBook(document.querySelector('#book-reader'));
}
async function downloadMemory() {
  if (!memoryBook?.entries.length || !memoryHTML) {
    toast(t("게임을 마친 뒤 미리보기를 먼저 열어 주세요."));
    return;
  }
  try {
    await saveFile(new Blob([memoryHTML], {
      type: 'text/html;charset=utf-8'
    }), 'Us-Back-Then-Memory-Book.html');
    toast(window.__NATIVE__ ? t("앨범 파일을 저장했어요.") : t("앨범 파일 저장을 요청했어요. 다운로드 목록을 확인해 주세요."));
  } catch (e) {
    if (e.code !== 'CANCELLED') toast(t("저장하지 못했어요. 다시 시도해 주세요."));
  }
}
function resultMarkup(v) {
  const complete = v.endReason === 'completed',
    sorted = [...v.players].sort((a, b) => b.score - a.score);
  const winners = v.players.filter(p => v.result.winners?.includes(p.id));
  const names = v.scoring === false ? t("함께한 우리") : winners.map(p => p.name).join(' · ');
  const mediaText = ui.demo ? t("체험에서 선택한 사진은 서버로 보내지 않았어요.") : ui.data.mediaStatus === 'done' ? t("서버의 임시 사진을 삭제했어요. 휴대폰 원본은 그대로예요.") : t("사진 접근을 차단했어요. 서버에서 삭제를 다시 시도하고 있어요.");
  return tr`<section class="fade-in">${screenTop()}<div class="result-hero"><div class="trophy">${icon(complete ? 'trophy' : 'heart')}</div><div class="result-kicker">${v.scoring === false ? t("우리의 사진 이야기를 마쳤어요") : complete ? winners.length > 1 ? t("함께 기억한, 오늘의 공동 기억왕") : t("함께 기억한, 오늘의 기억왕") : t("오늘의 모임을 마쳤어요")}</div><h1 class="winner">${complete ? `<em>${esc(names)}</em>${winners.length === 1 ? t("님!") : ''}` : v.endReason === 'reported' ? t("사진을 숨기고<br>모임을 종료했어요.") : t("다음 추억에서<br>또 만나요.")}</h1><p class="result-sub">${complete ? t("같은 순간을, 이렇게 함께 기억하고 있었네요.") : v.endReason === 'not-enough-players' ? t("참가자가 두 명 미만이어서 게임을 마쳤어요. 남은 참가자의 기존 점수는 아래에 남겼어요.") : v.endReason === 'reported' ? t("신고 정보는 이 방에 기록됐어요.<br>이번 버전에는 상시 검토 담당자가 연결되어 있지 않아요.") : t("진행하던 게임의 점수를 아래에 남겼어요.")}</p></div>
 <div class="card no-shadow" ${v.scoring === false ? 'hidden' : ''}><div class="card-heading"><span>${complete ? t("오늘의 기억 순위") : t("마지막 점수")}</span><small>${v.players.length}명 함께한 시간</small></div><div class="ranking">${sorted.map((p, i) => {
    const rank = sorted.findIndex(x => x.score === p.score) + 1;
    return tr`<div class="rank-row ${rank === 1 && complete ? 'first' : ''}"><span class="rank-num">${rank}</span>${avatar(p, i)}<span class="person-name">${esc(p.name)}${p.id === v.you && p.name !== t("나") ? t("<span class=\"badge-me\">나</span>") : ''}</span><span class="score">${p.score}<small>점</small></span></div>`;
  }).join('')}</div></div>
 ${complete ? memoryOfferMarkup() + button(t("선택 상품 안내"), 'plans', 'quiet') : ''}<div class="notice ${ui.data.mediaStatus === 'pending' ? 'warning' : ''}">${mediaText}</div><p class="closing-quote">사진은 달라도,<br>좋았던 마음은 같으니까.</p>
 ${complete && !ui.demo && ui.data.rematchSupported ? v.you === v.hostId ? button(t("같은 멤버로 한 판 더"), 'rematch', 'primary', ui.busy || !ui.connected || ui.data.mediaStatus !== 'done') : t("<p class=\"notice\">추억집을 저장한 뒤 방장이 다음 게임을 시작할 수 있어요.</p>") : ''}
 ${button(ui.demo ? t("다른 모임도 만들어 볼까요?") : t("새로운 모임 만들기"), 'new', 'primary')}${button(t("홈으로 돌아가기"), 'home', 'quiet')}</section>`;
}
function showPlans() {
  const book = productFor('memory_book');
  const adNotice = window.__ADS_STATUS__?.enabled
    ? window.__ADS_STATUS__.testMode
      ? t('Google 테스트 광고가 연결돼 있어요. 계정과 구매·복원은 설정에서 확인해 주세요.')
      : t('무료 게임 사이에 광고가 표시될 수 있어요. 계정과 구매·복원은 설정에서 확인해 주세요.')
    : t('현재 광고 표시는 비활성화되어 있어요. 추억집 저장은 무료 체험이에요.');
  showModal(t("무료로 함께, 우리답게 간직해요"), tr`<p>사진으로 직접 문제를 만들고, 친구를 초대하고, 기억 대결을 즐기는 건 무료예요. 일반 게임은 로그인 없이 이용해요.</p>
 <div class="notice plan-notice"><strong>광고와 결제를 준비하고 있어요.</strong><br>${adNotice}</div>
 <section class="plan-card"><div class="plan-heading"><h3>무료 게임</h3></div><p>게임을 마친 뒤 자연스러운 쉬는 시간에 광고를 보여주는 방식으로 준비해요. 문제를 풀거나 답을 확인하는 동안에는 광고로 가리지 않아요.</p></section>
 <section class="plan-card"><div class="plan-heading"><h3>개인 광고 제거</h3><span class="plan-badge">출시 예정</span></div><p>로그인한 뒤 한 번 구매하면 내 계정의 광고를 없애는 옵션이에요. 다른 참가자의 광고에는 영향을 주지 않아요.</p><p class="microcopy">Android 앱 설정의 계정에서 구매·복원을 확인해 주세요. 가격은 판매 가능한 경우에만 Google Play에서 불러와요.</p></section>
 <section class="plan-card"><div class="plan-heading"><h3>모임 추억집</h3><span class="plan-badge">출시 예정</span></div><p class="plan-price">${esc(book.price)} <small>예정 가격 · 한 게임 · 일회 구매</small></p><p>저장을 허용한 사진과 이야기를 한 권에 담고 PDF나 HTML 파일로 간직해요. 미리보기는 무료예요.</p><p class="microcopy">현재는 무료 저장 체험이에요. 판매할 때는 Google Play에 표시되는 현지 통화 가격을 결제 전에 안내해요.</p></section>
 ${button(t("무료 게임 계속하기"), 'close-modal', 'primary')}`);
}
function showModal(title, body, variant = '') {
  const keepPosition = modal.open && variant === 'memory' && modal.classList.contains('memory-modal');
  const previousScroll = modal.scrollTop;
  modal.classList.toggle('memory-modal', variant === 'memory');
  modal.classList.toggle('photo-modal', variant === 'photo');
  if (!modal.open) previousFocus = document.activeElement;
  modal.innerHTML = tr`<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="modal-close" data-action="close-modal" aria-label="닫기">×</button></div><div class="modal-body">${body}</div>`;
  if (!modal.open) modal.showModal();
  modal.scrollTop = keepPosition ? previousScroll : 0;
  document.body.classList.add('modal-open');
  const autofocus = modal.querySelector('[autofocus]');
  if (autofocus) autofocus.focus();
}
function clearDraft() {
  if (draft?.preview?.startsWith('blob:')) URL.revokeObjectURL(draft.preview);
  draft = null;
}
function closeModal() {
  pdfController?.abort();
  modal.close();
  document.body.classList.remove('modal-open');
  clearDraft();
  confirmation = null;
  if (previousFocus?.isConnected) previousFocus.focus();
}
modal.addEventListener('cancel', () => {
  document.body.classList.remove('modal-open');
  clearDraft();
  confirmation = null;
});
modal.addEventListener('click', e => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal();
  }
});
function confirmDialog(title, message, label, callback) {
  showModal(title, `<p>${message}</p><div class="confirm-actions">${button(t("취소"), 'close-modal', 'outline')}${button(label, 'confirm', 'primary')}</div>`);
  confirmation = callback;
}
function offlineInfo() {
  showModal(t("친구 초대는 준비 중이에요"), t("<p>지금은 가상 친구 2명과 사진 퀴즈를 체험할 수 있어요. 직접 사진을 고르고 질문을 바꾸는 것도 가능해요.</p><p>이 페이지는 화면 체험판이에요. 실제 친구와 연결되는 서버와 AI 자동 출제는 아직 연결되지 않았어요.</p>") + button(t("먼저 체험하기"), 'demo', 'secondary'));
}
const roomModes = [{
  id: 'memory',
  get name() {
    return t("기억 대결");
  },
  image: 'mode-memory-v1.png',
  get description() {
    return t("돌아가며 내 추억을 출제하고, 친구들이 맞혀요.");
  },
  get authors() {
    return t("모두 출제 가능 · 출제는 선택 · 1인 최대 5장");
  }
}, {
  id: 'battle',
  get name() {
    return t("추억 배틀");
  },
  image: 'mode-battle-v2.png',
  get description() {
    return t("사진 퀴즈를 빠르게 맞히며 기억력을 겨뤄요.");
  },
  get authors() {
    return t("방장만 문제를 출제해요 · 사진 수 제한 없음");
  }
}, {
  id: 'party',
  get name() {
    return t("파티 모드");
  },
  image: 'mode-party-v2.png',
  get description() {
    return t("사진 퀴즈에 가벼운 미션을 더해 함께 웃어요.");
  },
  get authors() {
    return t("모두 출제 가능 · 출제는 선택 · 1인 최대 5장");
  }
}, {
  id: 'family',
  get name() {
    return t("가족 모드");
  },
  image: 'mode-family-v1.png',
  get description() {
    return t("시간제한 없이 사진을 보고 이야기를 나눠요.");
  },
  get authors() {
    return t("모두 출제 가능 · 출제는 선택 · 1인 최대 5장");
  }
}];
function setEntryStep(step) {
  const form = $('#entry-form');
  if (!form || form.dataset.kind !== 'new') return;
  const modes = step === 'modes';
  form.dataset.step = step;
  $('#entry-details').hidden = modes;
  $('#entry-modes').hidden = !modes;
  $('#entry-modes').disabled = !modes;
  $('#entry-back').hidden = !modes;
  form.querySelector('[type=submit]').textContent = modes ? t("모임 만들기") : t("다음 · 모드 선택");
  $('#entry-progress').textContent = modes ? t("2 / 2 · 우리에게 맞는 모드") : t("1 / 2 · 모임 소개");
  $('#modal-title').textContent = modes ? t("어떻게 함께 놀까요?") : t("새로운 모임 만들기");
  form.querySelector('.form-error').textContent = '';
  (modes ? form.querySelector('[name="mode"]:checked') : form.querySelector('[name="nickname"]')).focus();
}
function openEntry(kind, code = '') {
  if (offline) {
    offlineInfo();
    return;
  }
  const details = tr`<label class="field"><span>나를 부를 닉네임</span><input name="nickname" placeholder="친구들이 알아볼 이름" maxlength="16" value="${esc(ui.nickname)}" required ${kind === 'new' || code ? 'autofocus' : ''} autocomplete="off"></label>`;
  const consent = t("<label class=\"check-field\"><input type=\"checkbox\" name=\"consent\" required><span>이용규칙과 개인정보 안내를 읽고 동의합니다.</span></label>");
  const rules = tr`<details class="entry-rules"><summary>이용규칙 보기</summary><p>공유 동의가 있는 일반 사진만 사용합니다. 성적 콘텐츠, 아동 착취, 혐오·폭력·괴롭힘, 불법 콘텐츠와 타인의 개인정보를 올리지 않습니다.</p><p>사진 숨기기는 내 화면에만 적용돼요. 신고는 확인 후 기록되며 게임을 종료하거나 참가자를 자동 강퇴하지 않아요. 방장은 참가자 관리에서 강퇴할 수 있어요.</p></details>`;
  const safetyReminder = getLanguage() === 'en'
    ? '<div class="notice warning" role="note"><strong>Stay safe when sharing photos.</strong> Invite people you know, ask permission from people in each photo, and do not share addresses, phone numbers or school details. Hide or report harmful content.</div>'
    : '<div class="notice warning" role="note"><strong>사진을 나누기 전에 확인해 주세요.</strong> 아는 사람만 초대하고, 사진 속 사람의 동의를 받아요. 주소·전화번호·학교 등 개인정보를 올리지 말고 부적절한 콘텐츠는 숨기거나 신고해 주세요.</div>';
  const modes = roomModes.map((m, i) => `<label class="room-mode-card"><input type="radio" name="mode" value="${m.id}" ${i === 0 ? 'checked' : ''}><img src="${esc(asset(m.image))}" alt="" width="88" height="88"><span class="room-mode-copy"><strong>${m.name}</strong><span>${m.description}</span><small class="mode-authors">${m.authors}</small></span><span class="mode-check" aria-hidden="true">✓</span></label>`).join('');
  showModal(kind === 'new' ? t("새로운 모임 만들기") : t("친구들의 모임에 참여하기"), `${kind === 'new' ? t("<p id=\"entry-progress\" class=\"entry-progress\" aria-live=\"polite\">1 / 2 · 모임 소개</p>") : t("<p>방 코드로 입장 요청을 보내면 방장이 확인해 줘요.</p>")}<form id="entry-form" data-kind="${kind}" data-step="details">${kind === 'new' ? tr`<fieldset id="entry-details"><legend class="sr-only">모임 소개</legend><p>먼저 나와 우리 모임을 소개해 주세요.</p>${details}<label class="field"><span>모임 이름 <small class="muted">선택</small></span><input name="title" placeholder="예: 오랜만이야, 우리" maxlength="40"></label></fieldset><fieldset id="entry-modes" hidden disabled><legend class="sr-only">게임 모드 선택</legend><p>오늘의 모임에 어울리는 모드를 골라 주세요.</p><div class="room-mode-list" role="radiogroup" aria-label="게임 모드">${modes}</div><label class="check-field" id="party-missions" hidden><input type="checkbox" name="partyMissions"><span>가벼운 파티 미션 켜기 · 언제든 건너뛸 수 있어요</span></label><label class="field" id="room-time"><span>문제당 제한 시간</span><select name="timeLimitSeconds"><option value="10">10초</option><option value="20" selected>20초</option><option value="30">30초</option></select></label><label class="check-field" id="family-scoring" hidden><input type="checkbox" name="familyScoring"><span>가족 모드에서도 점수 계산하기 · 시간제한은 없어요</span></label>${rules}${safetyReminder}${consent}<p class="microcopy">축소 사본은 종료 시 삭제하고, 방은 생성 후 24시간에 만료돼요.</p></fieldset>` : tr`<label class="field"><span>방 코드</span><input name="code" class="code-input" placeholder="ABCD EFGH" value="${esc(code)}" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" required ${!code ? 'autofocus' : ''}></label>${details}${rules}${safetyReminder}${consent}`}<div class="form-error" role="alert"></div><div class="entry-actions">${kind === 'new' ? t("<button id=\"entry-back\" class=\"button outline\" type=\"button\" data-action=\"entry-back\" hidden>이전</button>") : ''}<button class="button primary" type="submit">${kind === 'new' ? t("다음 · 모드 선택") : t("입장 요청하기")}</button></div></form>`);
}
async function submitEntry(form) {
  if (!form.reportValidity()) return;
  const fd = new FormData(form),
    kind = form.dataset.kind;
  const nickname = fd.get('nickname').trim();
  if (kind === 'new' && form.dataset.step === 'details') {
    if (!nickname) {
      form.querySelector('.form-error').textContent = t("닉네임을 입력해 주세요.");
      return;
    }
    setEntryStep('modes');
    return;
  }
  const code = String(fd.get('code') || '').replace(/[\s-]/g, '').toUpperCase();
  if (kind === 'join' && !/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
    form.querySelector('.form-error').textContent = t("영문·숫자 8자리 방 코드를 확인해 주세요.");
    return;
  }
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  submit.classList.add('busy');
  try {
    if (kind === 'new') {
      const health = await request('/api/health');
      if (fd.has('partyMissions') && fd.get('mode') === 'party' && !health.partyMissionsSupported) throw new Error(t("파티 미션 서버 업데이트를 준비 중이에요. 미션을 끄면 먼저 플레이할 수 있어요."));
      if (!health.timedModesSupported) throw new Error(t("새 게임 모드 업데이트를 준비 중이에요. 잠시 후 다시 만들어 주세요."));
    }
    clearMemory();
    ui.nickname = nickname;
    ui.demo = false;
    const data = await request(kind === 'new' ? '/api/rooms' : `/api/rooms/${code}/join`, {
      nickname,
      title: fd.get('title') || t('우리의 작은 추억 모임'),
      consent: fd.has('consent'),
      termsVersion: '2026-10-15',
      ...(kind === 'new' ? {
        mode: fd.get('mode'),
        timeLimitSeconds: Number(fd.get('timeLimitSeconds')),
        partyMissions: fd.get('mode') === 'party' && fd.has('partyMissions'),
        familyScoring: fd.has('familyScoring')
      } : {})
    });
    history.pushState({}, '', `?room=${data.code}`);
    closeModal();
    connect(data.code);
    window.scrollTo(0, 0);
  } catch (e) {
    form.querySelector('.form-error').textContent = appError(e);
  } finally {
    submit.disabled = false;
    submit.classList.remove('busy');
  }
}
function openComposer(slot = 0) {
  const q = (ui.data?.view?.myQuestions || [ui.data?.view?.myQuestion].filter(Boolean)).find(q => (q.slot || 0) === slot);
  clearDraft();
  draft = {
    slot,
    media: 'photo',
    photoId: q?.photoId || '',
    blob: null,
    preview: q?.photoId ? photoSrc(q.photoId) : '',
    ticket: 0,
    aiBusy: false,
    aiResult: null,
    aiRequest: null
  };
  showModal(q ? t("내 추억 문제 수정하기") : t("사진으로 문제 만들기"), tr`<div class="mode-switch composer-modes" aria-label="문제 만드는 방법"><button class="mode-option selected" data-action="composer-mode" data-mode="manual" aria-pressed="true">직접 출제<small>내가 기억하는 그날의 정답</small></button><button class="mode-option" data-action="composer-mode" data-mode="ai" aria-pressed="false">AI 초안 도움<small>출시 예정</small></button></div>
 <form id="question-form" novalidate>
 <div id="composer-progress" class="composer-progress" role="status"></div><h3 class="composer-step">1. 사진 한 장 고르기</h3>
 <label class="upload-pick" id="photo-pick" ${draft.media === 'photo' ? '' : 'hidden'} for="photo-file" tabindex="0" role="button">${draft.preview ? tr`<img src="${esc(draft.preview)}" alt="선택한 추억 사진">사진 바꾸기` : icon('photo') + t("사진 한 장 고르기")}<small>사진을 고르는 동안에는 이 기기 안에만 있어요.</small></label><input class="file-hidden" type="file" id="photo-file" accept="image/jpeg,image/png,image/webp">
 <section id="ai-compose" class="ai-compose" aria-label="AI 초안 도움 · 출시 예정" hidden><span class="plan-badge">출시 예정</span><h3>내 기억을 문제로 다듬어 드릴게요</h3><p class="small-text">질문과 보기를 추천하는 AI 도움 기능을 준비하고 있어요. 지금은 사진을 고르고 직접 문제를 만들어 주세요.</p><p class="microcopy">현재 AI 요청이나 이용료는 발생하지 않아요.</p><button type="button" class="button secondary" data-action="ai-manual">직접 문제 만들기</button></section>
 <h3 class="composer-step">2. 질문 적기</h3><div id="manual-starters"><p class="microcopy">질문이 떠오르지 않으면 여기서 시작해 보세요.</p><div class="starter-chips" aria-label="질문 시작하기">${questionStarters.map(x => `<button type="button" data-action="question-starter" data-focus="${x.id}">${t(x.label)}</button>`).join('')}</div></div>
 <label class="field"><span>친구들에게 물어볼 질문</span><textarea name="prompt" maxlength="160" required placeholder="예: 이날 우리가 가장 먼저 한 일은?">${esc(q?.prompt || '')}</textarea></label><h3 class="composer-step">3. 보기와 정답 고르기</h3><div class="answer-edit-label">보기 네 개와 정답 하나</div><p id="correct-feedback" class="composer-feedback" aria-live="polite"></p><div class="answer-hint">정답인 보기 왼쪽의 동그라미를 눌러 주세요.</div>${[0, 1, 2, 3].map(i => tr`<label class="answer-editor"><input type="radio" name="correct" value="${i}" required ${q?.correctIndex === i ? 'checked' : ''} aria-label="${i + 1}번을 정답으로 선택"><input type="text" name="option${i}" placeholder="${i + 1}번 보기" maxlength="60" value="${esc(q?.options[i] || '')}" required aria-label="${i + 1}번 보기"></label>`).join('')}<label class="field" style="margin-top:17px"><span>정답을 공개한 뒤 들려줄 이야기 <small class="muted">선택</small></span><textarea name="story" maxlength="240" placeholder="그날의 짧은 뒷이야기를 적어 주세요.">${esc(q?.story || '')}</textarea></label>
 <h3 class="composer-step">4. 확인하고 공유하기</h3><label class="check-field"><input type="checkbox" name="confirmed" required><span>질문·보기·정답을 확인했고, 사진 속 사람들의 동의를 포함해 이 사진을 방 참가자에게 공유할 권한이 있습니다.</span></label>
 <label class="check-field export-permission"><input type="checkbox" name="allowKeepsake" ${(ui.demo ? memoryConsent.get(q?.photoId) === true : q?.allowKeepsake === true) ? 'checked' : ''}><span><strong>추억집에 담아도 괜찮아요 <small>선택</small></strong><br>이 사진과 내 문제·이야기를 참가자가 파일로 저장·공유하는 데 필요한 동의를 받았어요. 체크하지 않아도 게임은 그대로 즐길 수 있어요.</span></label><div id="composer-error" class="form-error" role="alert"></div><button type="submit" class="button primary">문제 준비 완료</button><p class="microcopy" style="margin-bottom:0;margin-top:12px">${ui.demo ? t("체험 모드에서는 서버로 사진을 보내지 않아요.") : t("완료를 누르면 위치 정보 등을 제거한 축소 JPG 사본을 서버에 보내요. 휴대폰 원본은 변경하지 않아요.")}</p></form>`);
  composerFeedback();
}
function composerFeedback(force = false) {
  const form = $('#question-form');
  if (!form || !draft) return [];
  const fields = form.elements,
    options = [0, 1, 2, 3].map(i => fields['option' + i].value.trim().normalize('NFC')),
    issues = [];
  const add = (name, message) => issues.push({
    name,
    message
  });
  if (draft.media === 'photo' && !draft.photoId && !draft.blob) add('photo-file', t("사진 한 장을 먼저 골라 주세요."));
  if (!fields.prompt.value.trim()) add('prompt', t("친구들에게 물어볼 질문을 적어 주세요."));
  options.forEach((value, i) => {
    if (!value) add('option' + i, tr`${i + 1}번 보기를 적어 주세요.`);else if (options.some((other, j) => j !== i && other === value)) add('option' + i, t("같은 보기가 있어요. 서로 다르게 적어 주세요."));
  });
  if (!fields.correct.value) add('correct', t("정답인 보기의 동그라미를 눌러 주세요."));
  if (!fields.confirmed.checked) add('confirmed', t("질문·정답과 사진 공유 권한을 확인해 주세요."));
  for (const name of ['prompt', 'option0', 'option1', 'option2', 'option3', 'confirmed']) {
    const input = fields[name],
      issue = issues.find(x => x.name === name),
      show = issue && (force || input.dataset.touched === 'true');
    input.setAttribute('aria-invalid', String(!!show));
    let note = form.querySelector(`[data-composer-error="${name}"]`);
    if (!note) {
      note = document.createElement('small');
      note.className = 'composer-feedback';
      note.dataset.composerError = name;
      note.id = 'composer-error-' + name;
      input.closest('label').after(note);
      input.setAttribute('aria-describedby', note.id);
    }
    note.textContent = show ? issue.message : '';
  }
  const correct = fields.correct.value,
    answer = correct ? options[Number(correct)] : '';
  $('#correct-feedback').textContent = correct ? tr`선택한 정답: ${answer || t("이 보기를 적어 주세요.")}` : force ? t("정답인 보기의 동그라미를 눌러 주세요.") : t("아직 정답을 고르지 않았어요.");
  $('#composer-progress').textContent = tr`${draft.media !== 'photo' || draft.photoId || draft.blob ? '✓' : '○'} ${draft.media === 'photo' ? t("사진") : t("글 문제")} · ${fields.prompt.value.trim() ? '✓' : '○'} 질문 · ${options.every(Boolean) && new Set(options).size === 4 ? '✓' : '○'} 보기 · ${correct ? '✓' : '○'} 정답`;
  return issues;
}
function focusComposerIssue(issue) {
  const form = $('#question-form');
  const el = issue.name === 'photo-file' ? $('#photo-pick') : issue.name === 'correct' ? form.querySelector('[name="correct"]') : form.elements[issue.name];
  el.focus();
  el.scrollIntoView({
    block: 'center',
    behavior: 'auto'
  });
}
function composerMode(mode) {
  if (!draft) return;
  $('#ai-compose').hidden = mode !== 'ai';
  $('#manual-starters').hidden = mode === 'ai';
  for (const el of modal.querySelectorAll('[data-action="composer-mode"]')) {
    const selected = el.dataset.mode === mode;
    el.setAttribute('aria-pressed', String(selected));
    el.classList.toggle('selected', selected);
  }
}
async function pickPhoto(file) {
  if (!file || !draft) return;
  const current = draft,
    ticket = ++draft.ticket;
  const form = $('#question-form'),
    error = form.querySelector('#composer-error');
  error.textContent = '';
  const save = form.querySelector('[type=submit]');
  save.disabled = true;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(t("JPG, PNG, WebP 사진을 골라 주세요. HEIC는 JPG로 바꿔 주세요."));
    if (file.size > 20_000_000) throw new Error(t("20MB 이하의 사진을 골라 주세요."));
    const image = await createImageBitmap(file);
    const scale = Math.min(1, 1440 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    let quality = .84,
      blob;
    do {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      quality -= .12;
    } while (blob && blob.size > 850_000 && quality >= .35);
    if (!blob || blob.size > 900_000) throw new Error(t("사진을 줄이지 못했어요. 다른 사진을 골라 주세요."));
    if (draft !== current || draft.ticket !== ticket) return;
    if (draft.preview?.startsWith('blob:')) URL.revokeObjectURL(draft.preview);
    draft.blob = blob;
    draft.preview = URL.createObjectURL(blob);
    draft.photoId = '';
    form.elements.allowKeepsake.checked = false;
    form.elements.confirmed.checked = false;
    $('#photo-pick').innerHTML = tr`<img src="${draft.preview}" alt="선택한 추억 사진">사진 바꾸기<small>축소 사진 ${Math.round(blob.size / 1024)}KB · 아직 서버로 보내지 않았어요.</small>`;
  } catch (e) {
    if (form.isConnected) error.textContent = appError(e);
  } finally {
    if (form.isConnected && draft === current && draft.ticket === ticket) {
      save.disabled = false;
      composerFeedback();
    }
  }
}
async function submitQuestion(form) {
  if (!draft) return;
  const error = form.querySelector('#composer-error');
  error.textContent = '';
  const issues = composerFeedback(true);
  if (issues.length) {
    error.textContent = issues[0].message;
    focusComposerIssue(issues[0]);
    return;
  }
  if (draft.media === 'photo' && !draft.photoId && !draft.blob) {
    error.textContent = t("먼저 사진 한 장을 골라 주세요.");
    return;
  }
  const fd = new FormData(form),
    options = [0, 1, 2, 3].map(i => String(fd.get('option' + i)).trim());
  if (new Set(options.map(s => s.normalize('NFC'))).size !== 4) {
    error.textContent = t("보기는 서로 다르게 적어 주세요.");
    return;
  }
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  submit.classList.add('busy');
  try {
    let photoId = draft.media === 'photo' ? draft.photoId : '';
    if (draft.media === 'photo' && draft.blob) {
      if (ui.demo) {
        photoId = 'local-' + [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
        ui.demoPhotos[photoId] = URL.createObjectURL(draft.blob);
      } else {
        const uploaded = await request(`/api/rooms/${ui.code}/upload`, null, {
          headers: {
            'Content-Type': 'image/jpeg',
            'X-Photo-Consent': 'yes'
          },
          body: draft.blob
        });
        photoId = uploaded.photoId;
        draft.photoId = photoId;
        draft.blob = null;
      }
    }
    const action = {
      type: 'submitQuestion',
      slot: draft.slot,
      media: draft.media,
      gameNumber: ui.data.gameNumber || 0,
      photoId,
      prompt: String(fd.get('prompt')).trim(),
      options,
      correctIndex: Number(fd.get('correct')),
      story: String(fd.get('story') || '').trim(),
      confirmed: fd.has('confirmed'),
      allowKeepsake: fd.has('allowKeepsake')
    };
    if (ui.demo) {
      memoryConsent.set(photoId || (draft.slot ? ui.data.view.you + ':' + draft.slot : ui.data.view.you), fd.has('allowKeepsake'));
      demoAction(action);
    } else await request(`/api/rooms/${ui.code}/action`, action);
    closeModal();
    toast(t("내 추억 문제가 준비됐어요."));
  } catch (e) {
    error.textContent = appError(e);
  } finally {
    if (submit.isConnected) {
      submit.disabled = false;
      submit.classList.remove('busy');
    }
  }
}
function demoView() {
  const s = ui.demoState;
  return {
    access: 'active',
    code: 'DEMO2026',
    title: t("우리의 작은 추억 모임"),
    expiresAt: null,
    timeLimitSeconds: s.demoSeconds || 0,
    roundDeadlineAt: s.demoDeadlineAt || null,
    serverNow: Date.now(),
    mediaStatus: s.phase === 'finished' ? 'demo-deleted' : 'local-only',
    view: viewFor(s, 'd-me'),
    connectedIds: s.players.map(p => p.id),
    pending: []
  };
}
function startDemo() {
  clearPhotos();
  closeModal();
  clearMemory();
  ui.source?.close();
  ui.source = null;
  ui.demo = true;
  ui.connected = true;
  ui.selected = null;
  ui.busy = false;
  for (const url of Object.values(ui.demoPhotos)) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  ui.demoPhotos = {};
  const players = [{
    id: 'd-yuna',
    name: t("유나")
  }, {
    id: 'd-minho',
    name: t("민호")
  }, {
    id: 'd-me',
    name: ui.nickname || (getLanguage()==='en'?'Alex':t('나'))
  }];
  let s = setup(players);
  s.hostId = 'd-me';
  const questions = [{
    photoId: 'seaside',
    prompt: t("이날 우리가 가장 먼저 한 일은?"),
    options: [t("바다 보러 가기"), t("점심부터 먹기"), t("숙소에서 낮잠 자기"), t("기념품 고르기")],
    correctIndex: 0,
    story: t("바다가 너무 보고 싶어서 짐도 풀기 전에 달려갔어. 결국 신발은 모래투성이가 됐지.")
  }, {
    photoId: 'picnic',
    prompt: t("돗자리를 펴자마자 생긴 일은?"),
    options: [t("소나기가 내렸어"), t("김밥이 굴러갔어"), t("친구가 잠들었어"), t("사진기가 꺼졌어")],
    correctIndex: 1,
    story: t("도시락을 열다가 김밥 하나가 데굴데굴. 그걸 보고 한참을 웃었어.")
  }, {
    photoId: 'cafe',
    prompt: t("이날 내가 주문한 메뉴는?"),
    options: [t("아이스 아메리카노"), t("따뜻한 녹차"), t("딸기라테"), t("초코 케이크")],
    correctIndex: 2,
    story: t("평소엔 커피만 마셨는데, 그날은 친구를 따라 달콤한 걸 골랐어.")
  }];
  questions.forEach((q, i) => {
    s = applyAction(s, players[i].id, {
      type: 'submitQuestion',
      ...q,
      confirmed: true
    });
    memoryConsent.set(q.photoId, true);
  });
  for(const q of Object.values(s.questions))q._appSample=true;
  ui.demoState = {
    ...s,
    demoSeconds: 20,
    demoDeadlineAt: null
  };
  stateAccept(demoView());
  window.scrollTo(0, 0);
}
function simulatedAnswers() {
  let s = ui.demoState;
  const q = s.questions[s.order[s.round]];
  for (const p of s.players) {
    if (s.phase !== 'question') break;
    if (p.id === 'd-me' || p.id === q.authorId || Object.hasOwn(s.answers, p.id)) continue;
    const choice = p.id === 'd-minho' ? (q.correctIndex + 1) % 4 : q.correctIndex;
    s = applyAction(s, p.id, {
      type: 'answer',
      choice,
      round: s.round,
      serverPoints: pointsForTime(s.demoDeadlineAt, s.demoSeconds)
    });
  }
  ui.demoState = s.phase === 'question' ? s : {
    ...s,
    demoDeadlineAt: null
  };
}
function demoAction(action) {
  const allowed = validateAction(ui.demoState, 'd-me', action);
  if (!allowed.ok) throw new Error(allowed.error);
  if (action.type === 'answer' && ui.demoState.demoDeadlineAt && Date.now() >= ui.demoState.demoDeadlineAt) throw new Error(t("시간이 끝났어요."));
  ui.demoState = applyAction(ui.demoState, 'd-me', {
    ...action,
    serverPoints: pointsForTime(ui.demoState.demoDeadlineAt, ui.demoState.demoSeconds)
  });
  if (['start', 'next'].includes(action.type)) ui.demoState.demoDeadlineAt = ui.demoState.phase === 'question' && ui.demoState.mode !== 'family' ? Date.now() + ui.demoState.demoSeconds * 1000 : null;
  if (action.type === 'answer') simulatedAnswers();
  if (ui.demoState.phase !== 'question') ui.demoState.demoDeadlineAt = null;
  if (ui.demoState.phase === 'finished') {
    if (ui.demoState.endReason === 'completed') memoryBook = buildMemoryBook({
      title: ui.data.title,
      date: new Date().toLocaleDateString(dateLocale()),
      view: viewFor(ui.demoState, 'd-me'),
      entries: memoryEntries.values()
    });else {
      memoryEntries.clear();
      memoryBook = null;
      memoryHTML = '';
    }
    const keep = new Set(memoryBook?.entries.map(e => e.photoId) || []);
    for (const [id, u] of Object.entries(ui.demoPhotos)) if (!keep.has(id)) {
      if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      delete ui.demoPhotos[id];
    }
  }
  stateAccept(demoView());
}
async function act(type, extra = {}) {
  if (ui.busy) return;
  const prior = ui.data?.view;
  ui.busy = true;
  render();
  try {
    const action = {
      type,
      round: ui.data.view.round,
      questionId: ui.data.view.current?.questionId,
      gameNumber: ui.data.gameNumber || 0,
      ...extra
    };
    if (ui.demo) demoAction(action);else await request(`/api/rooms/${ui.code}/action`, action);
    if (type === 'report') toast(t('신고를 기록하고 내 화면에서 사진을 숨겼어요. 게임은 계속돼요.'));
    if (prior?.round !== ui.data.view.round || prior?.phase !== ui.data.view.phase) window.scrollTo({
      top: 0,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
  } catch (e) {
    toast(appError(e));
  } finally {
    ui.busy = false;
    render();
    if (ui.demo && ui.data?.view?.endReason === 'completed' && !adShown && !window.__NATIVE__) {
      adShown = true;
      showModal(t("오늘의 모임을 마쳤어요"), tr`<div class="interstitial-demo"><span>광고 위치 체험</span><strong>한 판이 끝난 뒤,<br>잠깐 쉬어가는 자리예요.</strong><p>출시 앱에서는 이 위치에 전면 광고가 최대 한 번 표시돼요. 지금은 실제 광고가 없어요.</p></div>${button(t("오늘의 기억왕 만나기"), 'close-modal', 'primary')}`);
    }
  }
}
function goHomeNow() {
  clearMemory();
  clearPhotos();
  ui.source?.close();
  ui.source = null;
  ui.data = null;
  ui.code = '';
  ui.demo = false;
  ui.selected = null;
  ui.busy = false;
  for (const url of Object.values(ui.demoPhotos)) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  ui.demoPhotos = {};
  ui.demoState = null;
  if (!offline) history.replaceState({}, '', location.pathname);
  closeModal();
  render();
  window.scrollTo(0, 0);
}
function goHome() {
  if (memoryBook?.entries.length) {
    confirmDialog(t("홈으로 돌아갈까요?"), t("저장하지 않은 추억집은 사라져요. 이미 내려받은 파일은 기기에 남아요."), t("홈으로"), goHomeNow);
    return;
  }
  if (ui.data?.access === 'active' && ui.data.view?.phase !== 'finished' && !ui.demo) {
    confirmDialog(t("홈으로 돌아갈까요?"), t("방과 임시 사진은 계속 유지돼요. 완전히 끝내려면 방장이 <strong>모임 종료</strong>를 눌러 주세요."), t("홈으로"), goHomeNow);
  } else goHomeNow();
}
async function manage(kind, id, gameNumber = ui.data.gameNumber || 0) {
  if (ui.busy) return;
  ui.busy = true;
  render();
  try {
    await request(`/api/rooms/${ui.code}/${kind}`, {
      playerId: id, confirmed: true, gameNumber
    });
  } catch (e) {
    toast(appError(e));
  } finally {
    ui.busy = false;
    render();
  }
}
async function share() {
  const url = inviteURL(ui.code);
  if (window.__NATIVE__) {
    try {
      await window.__NATIVE__.share({
        title: t("그때 우리 — 같이 기억해 볼까요?"),
        text: tr`우리의 사진으로 노는 시간. 방 코드 ${ui.code}`,
        url
      });
    } catch {/* Closing the share sheet leaves the room unchanged. */}
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({
        title: t("그때 우리 — 같이 기억해 볼까요?"),
        text: tr`우리의 사진으로 노는 시간. 방 코드 ${ui.code}`,
        url
      });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(t("초대 링크를 복사했어요. 친구에게 보내 주세요."));
  } catch {
    showModal(t("친구에게 이 링크를 보내 주세요"), tr`<p>방 코드 <strong>${esc(ui.code)}</strong></p><div class="share-link">${esc(url)}</div><p style="margin-top:15px">링크를 길게 눌러 복사하거나, 방 코드를 직접 알려 주세요.</p>`);
  }
}
function showHelp() {
  showModal(t("우리, 이렇게 놀아요"), tr`<div class="help-step"><span>1</span><div><strong>아는 친구를 초대해요.</strong><p>방 코드나 링크를 보내고, 방장이 입장 요청을 승인해요.</p></div></div><div class="help-step"><span>2</span><div><strong>원하는 사람만 사진 문제를 준비해요.</strong><p>질문과 보기 4개, 정답을 직접 입력해요. 사진은 한 사람당 최대 5장이고, 출제하지 않아도 함께 풀 수 있어요.</p></div></div><div class="help-step"><span>3</span><div><strong>돌아가며 기억을 맞혀요.</strong><p>출제자는 자신의 문제에 답하지 않아요. 정답은 최대 100점이며 남은 시간 비율로 줄어요. 가족 모드는 시간제한과 속도 감점이 없어요.</p></div></div><div class="help-step"><span>4</span><div><strong>정답보다 그날의 이야기를 나눠요.</strong><p>모두 답하면 정답을 공개해요. 이야기를 나눈 뒤 방장이 모두 함께 다음 문제를 시작해요.</p></div></div><div class="notice warm">친구와 직접 출제하는 사진 퀴즈와 가상 친구 체험을 사용할 수 있어요.</div>`);
}
function showPrivacy() {
  const adRuntimeNotice = t(window.__ADS_STATUS__?.enabled
    ? window.__ADS_STATUS__.testMode
      ? 'Google 테스트 광고가 연결돼 있어요. 계정과 구매·복원은 설정에서 확인해 주세요.'
      : '무료 게임 사이에 광고가 표시될 수 있어요. 계정과 구매·복원은 설정에서 확인해 주세요.'
    : '정식 광고는 아직 활성화하지 않았어요.');
  const nativeAdNotice = window.__NATIVE__?.ads ? tr`<h3>Android 광고와 개인정보</h3><p>Google AdMob과 UMP를 사용해요. 만 18세 이상이라고 선택하고 필요한 동의 절차를 마친 경우에만 광고를 준비해요. 연령 선택은 생년월일 없이 이 기기에만 저장해요. 광고 요청 시 IP 주소, 기기·광고 식별자, 광고 상호작용과 진단 정보가 Google에 전송될 수 있어요. 퀴즈 사진·이름·질문·답변은 광고 SDK에 전달하지 않아요. 설정에서 광고 개인정보와 연령 선택을 바꿀 수 있어요.</p><p>${adRuntimeNotice}</p>` : '';

  if (offline) {
    showModal(t("체험판의 사진 보호"), t("<div class=\"privacy-section\"><h3>선택한 사진은 이 기기에만</h3><p>체험판에서는 사진을 서버로 업로드하지 않아요. 브라우저 메모리에서만 사용하며, 원본은 수정하지 않아요.</p><h3>저장하거나 AI에 보내지 않아요</h3><p>체험 사진은 서버로 보내지 않아요. 저장을 허용한 추억만 탭 메모리에서 모으며, 직접 파일 저장을 눌러야 기기에 저장돼요. 홈 이동·새로고침·탭 종료 시 탭 안의 추억집은 사라져요. 내려받은 파일은 기기에 남아요.</p><h3>공유할 때는 사진 속 사람의 동의를 먼저</h3><p>민감한 사진은 테스트에 사용하지 마세요. 화면 캡처까지 막는 기능은 없어요.</p><h3>이 링크와 코드는 공개되어 있어요</h3><p>누구나 체험 링크를 열 수 있지만, 다른 방문자가 여러분이 선택한 사진을 볼 수는 없어요. 사진 전송이나 실시간 방 기능이 없는 화면 체험판이에요.</p></div>"));
    return;
  }
  showModal(t("우리 사진, 이렇게 다뤄요"), tr`<div class="privacy-section">${nativeAdNotice}<p><a href="https://bumblev95.github.io/geuttae-uri/privacy.html" target="_blank" rel="noopener noreferrer">개인정보처리방침 전문</a> · <a href="https://bumblev95.github.io/geuttae-uri/account-deletion.html" target="_blank" rel="noopener noreferrer">계정 삭제 안내</a></p><h3>언어 설정</h3><p>선택한 언어만 이 기기에 저장해요. 사진과 문제는 저장하지 않아요.</p><h3>원본은 내 휴대폰에 그대로</h3><p>공유 완료를 누르면 축소한 JPG 사본만 서버에 보내요. 사진의 위치 정보 등 메타데이터는 제거해요.</p><h3>방장이 승인한 참가자만</h3><p>공개 사진 주소나 방 목록은 없어요. 내 사진은 내가 확인할 수 있고, 다른 참가자의 사진은 그 문제가 나왔을 때 볼 수 있어요. 정답은 공개 전까지 서버가 숨겨요.</p><h3>게임 종료 시 임시 사진 삭제</h3><p>게임을 끝내면 사본을 삭제해요. 버려진 방도 생성 후 최대 24시간에 만료돼요. 항상 실행되는 서버가 30초마다 정리해요. 서버가 꺼져 있으면 다시 시작할 때 삭제하며, 만료된 방의 접근은 먼저 차단해요. 삭제에 실패하면 접근을 먼저 막고 재시도해요.</p><h3>함께 찍은 사람의 동의를 먼저</h3><p>사진 속 사람들이 공유에 동의했는지 확인해 주세요. 신분증, 의료 정보 등 민감한 사진과 성적 이미지는 이번 테스트에 사용하지 마세요. 참가자의 화면 캡처까지 막을 수는 없어요.</p><h3>불편한 사진은 즉시 숨겨요</h3><p>사진 숨기기는 내 화면과 내가 받는 추억집에서만 가리며 다시 표시할 수 있어요. 신고는 사유와 최종 확인 후 방의 임시 기록에 남아요. 신고만으로 게임 종료나 자동 강퇴는 하지 않아요. 운영자 검토·삭제 문의는 방 코드와 발생 시각을 keetojt@gmail.com으로 보내 주세요. 신고 이메일은 자동 발송되지 않아요. 방장만 참가자를 강퇴할 수 있고 강퇴된 참가자의 문제와 임시 사진은 삭제해요.</p><h3>추억집 저장은 별도 동의</h3><p>사진별로 출제자가 저장·공유 동의를 선택해요. 끝까지 마친 게임에서 허용된 사진과 문제·이야기·답변만 종료 때 연결된 참가자 탭에 전달하고 서버 사본을 삭제해요. 전달된 추억집은 탭 메모리에만 남으며, 홈 이동·새로고침·탭 종료 후 다시 받을 수 없어요. 직접 내려받은 파일은 기기에 남고 앱에서 회수할 수 없어요. 중도 종료 시에는 추억집을 만들지 않아요. 현재 저장은 무료 체험이며 실제 결제는 없어요.</p><h3>재접속과 세션</h3><p>이 탭에는 방의 접근 키만 세션 저장소에 보관해요. 사진과 문제는 저장하지 않아요. 같은 탭을 새로고침하면 승인과 점수가 복원돼요. 탭을 닫거나 다른 브라우저를 쓰면 다시 입장 승인이 필요해요.</p><h3>현재 버전의 범위</h3><p>AI 초안 도움은 출시 예정이며 현재 AI에 사진이나 글을 보내지 않아요. 성인 모드와 앱 스토어 배포는 포함되어 있지 않아요.</p></div>`);
}
document.addEventListener('keydown', e => {
  if (e.target.id === 'photo-pick' && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    $('#photo-file').click();
  }
});
app.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-action="zoom"]')) {
    e.preventDefault();
    e.target.click();
  }
});
document.addEventListener('click', async e => {
  const target = e.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (action === 'close-modal') return closeModal();
  if (action === 'confirm') {
    const task = confirmation;
    closeModal();
    if (task) await task();
    return;
  }
  if (action === 'home') return goHome();
  if (action === 'entry-back') return setEntryStep('details');
  if (action === 'new') return atGameBreak({...ui.data, demo: ui.demo}, () => openEntry('new'));
  if (action === 'join') return openEntry('join');
  if (action === 'demo') return startDemo();
  if (action === 'help') return showHelp();
  if (action === 'rules') return showModal(t('이용규칙'),tr`<p>성적 콘텐츠, 아동 착취, 혐오·폭력·괴롭힘, 불법 콘텐츠, 개인정보 침해를 금지해요. 사진 속 사람의 공유 동의를 먼저 받고, 저장·공유는 별도로 동의한 사진만 허용돼요.</p><p>사진 숨기기는 내 화면에만 적용돼요. 신고는 확인 후 기록되며 게임을 종료하거나 참가자를 자동 강퇴하지 않아요. 방장은 참가자 관리에서 강퇴할 수 있어요.</p>`);
  if (action === 'plans') return showPlans();
  if (action === 'privacy') return showPrivacy();
  if (action === 'compose') return openComposer(Number(target.dataset.slot || 0));
  if (action === 'memory-preview') return openMemoryPreview();
  if (action === 'memory-message-apply') {
    memoryMessage = $('#memory-message').value.trim().slice(0, 80);
    renderMemoryPreview();
    return;
  }
  if (action === 'memory-title-apply') {
    memoryTitle = $('#memory-title').value.trim().slice(0, 40);
    renderMemoryPreview();
    $('#memory-title').focus({
      preventScroll: true
    });
    return;
  }
  if (action === 'memory-save') return downloadMemory();
  if (action === 'memory-pdf-cancel') {
    pdfController?.abort();
    return;
  }
  if (action === 'memory-pdf') {
    if (pdfController) return;
    const controller = new AbortController();
    pdfController = controller;
    const cancel = modal.querySelector('[data-action="memory-pdf-cancel"]');
    cancel.hidden = false;
    target.disabled = true;
    try {
      await downloadBookPDF(memoryHTML, message => {
        const current = modal.querySelector('[data-action="memory-pdf"]');
        if (current) {
          current.textContent = message;
          current.disabled = true;
        }
      }, {
        signal: controller.signal
      });
      toast(window.__NATIVE__ ? t("PDF를 저장했어요.") : t("PDF 저장을 요청했어요. 다운로드 목록을 확인해 주세요."));
    } catch (error) {
      toast(error.name === 'AbortError' || error.code === 'CANCELLED' ? t("PDF 저장을 중단했어요.") : t("PDF를 만들지 못했어요. 다시 시도하거나 HTML 파일을 저장해 주세요."));
    } finally {
      if (pdfController === controller) pdfController = null;
      cancel.hidden = true;
      const current = modal.querySelector('[data-action="memory-pdf"]');
      const currentCancel = modal.querySelector('[data-action="memory-pdf-cancel"]');
      if (current) {
        current.disabled = false;
        current.textContent = t("PDF로 간직하기 · 무료");
      }
      if (currentCancel) currentCancel.hidden = true;
    }
    return;
  }
  if (action === 'composer-mode') return composerMode(target.dataset.mode);
  if (action === 'ai-manual') return composerMode('manual');
  if (action === 'question-starter') {
    const item = questionStarters.find(x => x.id === target.dataset.focus);
    if (item && draft) {
      const form = $('#question-form');
      form.elements.prompt.value = t(item.prompt);
      form.elements.confirmed.checked = false;
      composerFeedback();
      form.elements.prompt.focus();
    }
    return;
  }
  if (action === 'choose') {
    ui.selected = Number(target.dataset.choice);
    render();
    app.querySelector(`[data-choice="${ui.selected}"]`)?.focus({
      preventScroll: true
    });
    return;
  }
  if (action === 'answer' && ui.data.roundDeadlineAt && Date.now() + serverClockOffset >= ui.data.roundDeadlineAt) {
    toast(t("시간이 끝났어요. 서버의 정답 공개를 기다려 주세요."));
    return;
  }
  if (action === 'answer') return act('answer', {
    choice: ui.selected
  });
  if (action === 'book-category') {
    memoryCategory = target.dataset.group;
    for (const el of modal.querySelectorAll('.book-choice-group')) el.hidden = el.id !== memoryCategory && !(el.id === 'memory-density' && memoryCategory === 'memory-layout');
    for (const el of modal.querySelectorAll('[data-action="book-category"]')) el.setAttribute('aria-pressed', String(el.dataset.group === memoryCategory));
    return;
  }
  if (action === 'start') return act('start');
  if (action === 'rematch') return confirmDialog(t("같은 멤버로 한 판 더 할까요?"), t("모두 추억집을 저장했는지 확인해 주세요. 저장하지 않은 이전 추억집은 사라져요. 방 코드와 참가자는 유지하고 점수·문제는 새로 시작해요."), t("다음 게임 시작"), () => atGameBreak({...ui.data, demo: ui.demo}, () => act('rematch', {
    confirmed: true
  })));
  if (['missionDone', 'missionSkip'].includes(action)) return act(action);
  if (action === 'next') return act('next');
  if (action === 'demo-answers') {
    simulatedAnswers();
    stateAccept(demoView());
    window.scrollTo(0, 0);
    return;
  }
  if (action === 'share') return share();
  if (action === 'copy-code') {
    try {
      await navigator.clipboard.writeText(ui.code);
      toast(t("방 코드를 복사했어요."));
    } catch {
      toast(t("방 코드: ") + ui.code);
    }
    return;
  }
  if (action === 'approve' || action === 'deny') return manage(action, target.dataset.id);
  if (action === 'block-player' || action === 'unblock-player') {
    const playerId = target.dataset.id;
    const blocked = action === 'block-player';
    return confirmDialog(
      blocked ? (getLanguage()==='en'?'Block this player?':'이 참가자를 차단할까요?') : (getLanguage()==='en'?'Unblock this player?':'차단을 해제할까요?'),
      getLanguage()==='en'?'Their photos and questions will be hidden from your view in this room.':'이 방에서 해당 참가자의 사진과 문제를 내 화면에서 숨겨요.',
      blocked?(getLanguage()==='en'?'Block':'차단하기'):(getLanguage()==='en'?'Unblock':'차단 해제'),
      async()=>{
        try {await request(`/api/rooms/${ui.code}/action`, {type:blocked?'blockPlayer':'unblockPlayer',playerId,confirmed:true,gameNumber:ui.data.gameNumber||0});}
        catch(error){toast(appError(error));}
      });
  }
  if (action === 'report-player') {
    const playerId=target.dataset.id;
    const name=ui.data.view.players.find(p=>p.id===playerId)?.name||'';
    showModal(getLanguage()==='en'?'Report player':'참가자 신고',
      `<form id="report-player-form" data-player-id="${esc(playerId)}">
       <p>${esc(name)} ${getLanguage()==='en'?'— Choose a reason. The player will also be blocked for you.':'— 신고 사유를 선택해 주세요. 내 화면에서 해당 참가자도 차단돼요.'}</p>
       <label for="player-report-reason">${getLanguage()==='en'?'Reason':'신고 사유'}</label>
       <select id="player-report-reason" name="reason" required><option value="">${getLanguage()==='en'?'Select a reason':'사유 선택'}</option>
       <option value="harassment">${getLanguage()==='en'?'Harassment':'괴롭힘'}</option>
       <option value="privacy">${getLanguage()==='en'?'Privacy':'개인정보 침해'}</option>
       <option value="inappropriate">${getLanguage()==='en'?'Inappropriate content':'부적절한 콘텐츠'}</option>
       <option value="other">${getLanguage()==='en'?'Other':'기타'}</option></select>
       <p class="small-text">${getLanguage()==='en'?'Reports are stored temporarily with the room; for operator review contact keetojt@gmail.com.':'신고는 현재 방의 임시 기록에 저장돼요. 운영자 검토는 keetojt@gmail.com으로 문의해 주세요.'}</p>
       <div class="confirm-actions">${button(t('취소'),'close-modal','outline')}<button class="button primary" type="submit">${getLanguage()==='en'?'Continue':'다음'}</button></div></form>`);
    return;
  }
  if (action === 'kick') {
    const id = target.dataset.id,
      name = ui.data.view.players.find(p => p.id === id)?.name;
    const gameNumber = ui.data.gameNumber || 0;
    return confirmDialog(t("이 참가자를 강퇴할까요?"), tr`${esc(name)}님의 문제와 임시 사진도 삭제해요.` + t(" 남은 참가자가 두 명 미만이면 게임이 종료돼요. 다른 참가자의 기존 점수는 유지돼요."), t("강퇴하기"), () => manage('kick', id, gameNumber));
  }
  if (action === 'remove-question') return confirmDialog(t("내 문제를 삭제할까요?"), t("문제와 서버의 해당 임시 사진을 삭제해요. 다시 사진을 골라 출제할 수 있어요."), t("삭제하기"), () => act('removeQuestion', {
    slot: Number(target.dataset.slot || 0)
  }));
  if (action === 'reveal') return confirmDialog(t("지금 정답을 공개할까요?"), t("취소를 누르면 계속 기다려요. 정답을 공개하면 아직 답하지 않은 친구만 이번 문제에서 0점이며, 기존 점수는 유지돼요."), t("정답 공개"), () => act('reveal', {
    confirmed: true
  }));
  if (action === 'end') return confirmDialog(t("모임을 끝낼까요?"), t("진행 중인 게임을 종료하고 서버의 모든 임시 사진을 삭제해요. 다시 시작하려면 새 모임을 만들어 주세요."), t("종료하기"), () => act('end'));
  if (action === 'manage-players') return showModal(t('참가자 관리'), playerList(ui.data.view, true, true));
  if (action === 'hide-photo' || action === 'show-photo') return act('hidePhoto', {hidden: action === 'hide-photo'});
  if (action === 'report') {
    const v = ui.data.view;
    showModal(t('사진 신고'), tr`<form id="report-form" data-question-id="${esc(v.current.questionId)}" data-round="${v.round}" data-game="${ui.data.gameNumber || 0}"><p>신고 사유를 선택해 주세요. 게임은 계속되고 참가자를 자동 강퇴하지 않아요.</p><label for="report-reason">신고 사유</label><select id="report-reason" name="reason" required><option value="">사유 선택</option><option value="privacy">개인정보·공유 동의 문제</option><option value="inappropriate">부적절한 콘텐츠</option><option value="other">기타</option></select><p class="small-text">신고는 방의 임시 기록에 남아요. 운영자 검토가 필요하면 방 코드와 발생 시각을 keetojt@gmail.com으로 보내 주세요. 이메일은 자동 발송되지 않아요.</p><div class="confirm-actions">${button(t('취소'), 'close-modal', 'outline')}<button class="button primary" type="submit">다음 · 신고 확인</button></div></form>`);
    return;
  }
  if (action === 'leave') return confirmDialog(t("대기방에서 나갈까요?"), t("내 문제와 임시 사진을 삭제하고 이 방에서 나가요."), t("나가기"), async () => {
    try {
      await request(`/api/rooms/${ui.code}/leave`, {});
      goHomeNow();
    } catch (e) {
      toast(appError(e));
    }
  });
  if (action === 'zoom') {
    if (ui.data.hiddenPhotoIds?.includes(ui.data.view.current?.photoId)) return;
    const src = photoSrc(ui.data.view.current.photoId);
    return showModal(t("그날의 사진"), tr`<img class="zoom-photo" src="${esc(src)}" alt="크게 보는 추억 사진">`, 'photo');
  }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'report-player-form') {
    e.preventDefault();
    const form=e.target;
    if(!form.reportValidity())return;
    const playerId=form.dataset.playerId,reason=new FormData(form).get('reason');
    confirmDialog(getLanguage()==='en'?'Submit player report?':'참가자를 신고할까요?',
      getLanguage()==='en'?'This saves a temporary report and blocks the player in this room.':'임시 신고 기록을 저장하고 이 방에서 해당 참가자를 차단해요.',
      getLanguage()==='en'?'Report':'신고 접수',async()=>{
        try {await request(`/api/rooms/${ui.code}/action`,{type:'reportPlayer',playerId,reason,confirmed:true,gameNumber:ui.data.gameNumber||0}); toast(getLanguage()==='en'?'Report recorded.':'참가자 신고를 기록했어요.');}
        catch(error){toast(appError(error));}
      });
    return;
  }
  if (e.target.id === 'report-form') {
    e.preventDefault();
    const form = e.target;
    if (!form.reportValidity()) return;
    const reason = new FormData(form).get('reason');
    const target = {round: Number(form.dataset.round), questionId: form.dataset.questionId, gameNumber: Number(form.dataset.game), reason, confirmed: true};
    confirmDialog(t('이 사진을 신고할까요?'), t('신고를 기록하고 내 화면에서 사진을 숨겨요. 모임 종료나 자동 강퇴는 하지 않아요.'), t('신고 접수'), () => act('report', target));
  }
  if (e.target.id === 'entry-form') {
    e.preventDefault();
    submitEntry(e.target);
  }
  if (e.target.id === 'question-form') {
    e.preventDefault();
    submitQuestion(e.target);
  }
});
document.addEventListener('input', e => {
  if (!draft || !e.target.closest('#question-form')) return;
  if (['prompt', 'story', 'correct', 'option0', 'option1', 'option2', 'option3'].includes(e.target.name)) $('#question-form').elements.confirmed.checked = false;
  e.target.dataset.touched = 'true';
  $('#composer-error').textContent = '';
  composerFeedback();
});
document.addEventListener('change', e => {
  if (e.target.name === 'mode' && e.target.closest('#entry-form')) {
    const family = e.target.value === 'family';
    $('#party-missions').hidden = e.target.value !== 'party';
    $('#room-time').hidden = family;
    $('#family-scoring').hidden = !family;
  }
  if (e.target.closest('#question-form') && e.target.id !== 'photo-file') {
    e.target.dataset.touched = 'true';
    $('#composer-error').textContent = '';
    composerFeedback();
  }
  if (e.target.id === 'photo-file') pickPhoto(e.target.files[0]);
  if (!memoryBook || !memoryHTML) return;
  const id = e.target.name?.startsWith('memory-') ? e.target.name : e.target.id;
  if (id === 'memory-template' && memoryTemplates.some(x => x.id === e.target.value)) memoryTemplate = e.target.value;else if (id === 'memory-palette' && memoryPalettes.some(x => x.id === e.target.value)) memoryPalette = e.target.value;else if (id === 'memory-cover') memoryCoverPhotoId = e.target.value;else if (id === 'memory-quiz') memoryIncludeQuiz = e.target.checked;else if (id === 'memory-density') memoryDensity = e.target.value;else if (id === 'memory-layout') memoryLayout = e.target.value;else if (id === 'memory-font') memoryFont = e.target.value;else if (id === 'memory-cover-style') memoryCoverStyle = e.target.value;else if (id === 'memory-choices') memoryIncludeChoices = e.target.checked;else return;
  updateMemoryReader();
});
document.addEventListener('toggle', e => {
  if (e.target.id === 'memory-customize' && e.target.isConnected) memoryDesignOpen = e.target.open;
}, true);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ui.code && !ui.demo) connect(ui.code);
});
window.addEventListener('online', () => {
  if (ui.code && !ui.demo) connect(ui.code);
});
window.addEventListener('offline', () => {
  if (!ui.demo) {
    ui.connected = false;
    render();
  }
});
window.addEventListener('popstate', () => location.reload());
window.addEventListener('thenus-back', () => {
  const release = $('#release-dialog');
  if (release?.open) {
    release.close();
    return;
  }
  const settings = $('#settings-dialog');
  if (settings?.open) {
    settings.close();
    return;
  }
  if (modal.open) {
    closeModal();
    return;
  }
  if (ui.data) {
    goHome();
    return;
  }
  window.__NATIVE__?.exit();
});
window.addEventListener('thenus-invite', event => {
  if (ui.data) return toast(t("현재 모임을 마친 뒤 새 초대에 참여해 주세요."));
  openEntry('join', event.detail);
});
const banner = document.createElement('aside');
banner.className = 'banner-demo';
banner.setAttribute('aria-label', t("하단 광고 위치 체험"));
banner.innerHTML = t("<span>광고 영역</span><small>테스트에는 실제 광고가 표시되지 않아요.</small>");
if (!window.__NATIVE__) app.after(banner);
render();
if (!offline) {
  const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
    request(`/api/rooms/${code}/state`).then(data => {
      if (['active', 'pending'].includes(data.access)) connect(code);
    }).catch(() => openEntry('join', code));
  }
}
setInterval(() => {
  if (ui.demo && ui.demoState?.phase === 'question' && ui.demoState.demoDeadlineAt && Date.now() >= ui.demoState.demoDeadlineAt) {
    simulatedAnswers();
    if (ui.demoState.phase === 'question') ui.demoState = applyAction(ui.demoState, 'd-me', {
      type: 'reveal',
      confirmed: true
    });
    ui.demoState.demoDeadlineAt = null;
    stateAccept(demoView());
    return;
  }
  const node = $('#round-clock'),
    deadline = ui.data?.roundDeadlineAt;
  if (!node || !deadline) return;
  const remaining = Math.max(0, Math.ceil((deadline - Date.now() - serverClockOffset) / 1000));
  node.textContent = remaining ? tr`남은 시간 ${remaining}초${ui.data.view.current?.authorId !== ui.data.view.you ? t(" · 지금 맞히면 ") + pointsForTime(deadline, ui.data.timeLimitSeconds, Date.now() + serverClockOffset) + t("점") : ''}` : t("시간 종료 · 정답 공개를 기다려 주세요");
  if (!remaining) {
    for (const button of app.querySelectorAll('[data-action="answer"],[data-action="choose"]')) button.disabled = true;
  }
}, 200);

function localizeShell(){
 installLanguagePicker();
 document.title=t('그때 우리')+' · '+t('사진 한 장, 다시 만나는 우리');
 const brand=document.querySelector('.brand');brand.setAttribute('aria-label',t('그때 우리 홈'));
 const name=brand.querySelector('span');if(name?.firstChild)name.firstChild.textContent=t('그때 우리');
 const tag=brand.querySelector('small');if(tag)tag.textContent=t('사진 한 장, 다시 만나는 우리');
 document.querySelector('.settings-button').setAttribute('aria-label',t('설정'));
 for(const node of document.querySelectorAll('[data-shell-text]'))node.textContent=t(node.dataset.shellText);
 document.querySelector('.app-footer [data-action="privacy"]').textContent=t('사진은 어떻게 보관되나요?');
 for(const [id,label] of [['release-notes','변경 내용'],['check-update','업데이트 확인'],['apply-update','새 버전 적용'],['close-release','닫기']]){
  const node=document.getElementById(id);if(node)node.textContent=t(window.__NATIVE__&&id==='check-update'?'앱 버전':label);
 }
 const releaseInfo=document.querySelector('.release-modal-body>p:not([id])');if(releaseInfo)releaseInfo.textContent=t('사진과 문제는 이 기기의 저장소에 기록하지 않아요. 멀티플레이에서는 임시 서버 사본과 재접속용 접근 키를 사용해요.');
 const footer=document.getElementById('footer-build');if(footer)footer.textContent=t('그때 우리')+' · '+(window.__NATIVE__?'Android TEST':'Web TEST')+' v1.0.0';
}
window.addEventListener('thenus-language',()=>{
 localizeShell();
 if(ui.demo&&ui.demoState){
  for(const q of Object.values(ui.demoState.questions))if(q._appSample){q.prompt=sampleText(q.prompt);q.options=q.options.map(sampleText);q.story=sampleText(q.story);}
  for(const player of ui.demoState.players){if(player.id==='d-yuna')player.name=t('유나');if(player.id==='d-minho')player.name=t('민호');if(player.id==='d-me'&&!ui.nickname)player.name=getLanguage()==='en'?'Alex':t('나');}
  stateAccept(demoView());
 }else render();
});
localizeShell();

// Keep settings outside the game modal so changing language preserves open games.
const settingsDialog = document.getElementById('settings-dialog');
document.getElementById('settings-toggle').addEventListener('click', () => settingsDialog.showModal());
document.getElementById('close-settings').addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('click', event => {
 if (event.target === settingsDialog) {
  const rect = settingsDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) settingsDialog.close();
 }
}, true);
settingsDialog.addEventListener('click', event => {
 if (event.target.closest('[data-action],#release-notes,#check-update')) settingsDialog.close();
}, true);
