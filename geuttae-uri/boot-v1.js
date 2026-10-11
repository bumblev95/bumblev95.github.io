// Stable loader. Versioned releases are immutable; only version.json moves forward.
const base = new URL('./', import.meta.url);
const $ = id => document.getElementById(id);
let current = null;
let candidate = null;
let checking = false;
let active = false;
function validRelease(value) {
  if (!value || !/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(value.version) || !Array.isArray(value.changes)) throw new Error('Invalid release');
  return {version:value.version, channel:String(value.channel || '화면 체험판').slice(0,40), date:String(value.date || '').slice(0,20), changes:value.changes.slice(0,12).map(x=>String(x).slice(0,240))};
}
async function fetchRelease() {
  const url = new URL('version.json', base);
  url.searchParams.set('_', Date.now().toString());
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 12000);
  try {
    const response = await fetch(url, {cache:'no-store', credentials:'omit', signal:controller.signal});
    if (!response.ok) throw new Error('Release unavailable');
    return validRelease(await response.json());
  } finally { clearTimeout(timer); }
}
function safeToApply() {
  return active && ['home','finished'].includes(document.body.dataset.screen) && !document.querySelector('dialog[open]');
}
function notice(message) {
  $('update-message').textContent = message;
  $('update-notice').hidden = false;
}
function syncUpdate() {
  if (!candidate) return;
  const safe = safeToApply();
  notice(safe ? `새 버전 v${candidate.version}이 있어요.` : `새 버전 v${candidate.version}이 있어요. 체험을 마치고 창을 닫으면 적용할 수 있어요.`);
  $('apply-update').hidden = false;
  $('apply-update').disabled = !safe;
}
async function checkUpdate(manual=false) {
  if (!current || checking || document.hidden && !manual) return;
  checking = true;
  $('check-update').disabled = true;
  try {
    const next = await fetchRelease();
    if (next.version !== current.version) { candidate = next; syncUpdate(); }
    else { candidate = null; $('apply-update').hidden = true; if(manual) notice(`최신 버전 v${current.version}을 사용하고 있어요.`); else $('update-notice').hidden = true; }
  } catch {
    if (manual) notice('업데이트를 확인하지 못했어요. 인터넷 연결을 확인한 뒤 다시 눌러 주세요. 현재 체험은 계속할 수 있어요.');
  } finally { checking = false; $('check-update').disabled = false; }
}
$('check-update').addEventListener('click',()=>checkUpdate(true));
$('apply-update').addEventListener('click',()=>{
  if (!candidate || !safeToApply()) { syncUpdate(); return; }
  const url = new URL(base);
  url.searchParams.set('v', candidate.version);
  location.replace(url);
});
$('release-notes').addEventListener('click',()=>{
  if (!current) return;
  $('release-heading').textContent = `v${current.version} 업데이트`;
  $('release-date').textContent = `${current.date} · ${current.channel}`;
  $('release-items').replaceChildren(...current.changes.map(text=>{const item=document.createElement('li');item.textContent=text;return item;}));
  $('release-dialog').showModal();
});
$('close-release').addEventListener('click',()=>$('release-dialog').close());
const observer = new MutationObserver(syncUpdate);
observer.observe(document.body,{attributes:true,attributeFilter:['data-screen']});
for (const dialog of document.querySelectorAll('dialog')) observer.observe(dialog,{attributes:true,attributeFilter:['open']});
async function boot() {
  try {
    current = await fetchRelease();
    const folder = new URL(`releases/${current.version}/`,base);
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = new URL('style.css',folder);
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Styles unavailable')),12000);
      css.onload=()=>{clearTimeout(timeout);resolve();};css.onerror=()=>{clearTimeout(timeout);reject(new Error('Styles unavailable'));};document.head.append(css);
    });
    window.__OFFLINE__ = true;
    window.__ASSET_BASE__ = new URL('assets/',base).href;
    await import(new URL('client.js',folder).href);
    active = true;
    $('build-label').textContent = `TEST v${current.version}`;
    $('footer-build').textContent = `그때 우리 · ${current.channel} v${current.version}`;
    $('release-notes').disabled = false;
    $('check-update').disabled = false;
    // Nothing is cached in a service worker, IndexedDB, or localStorage.
    setInterval(()=>checkUpdate(),60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate();});
    window.addEventListener('online',()=>checkUpdate());
    window.addEventListener('beforeunload',event=>{
      if(active && !['home','finished'].includes(document.body.dataset.screen)) { event.preventDefault(); event.returnValue=''; }
    });
  } catch {
    $('build-label').textContent = '연결 확인이 필요해요';
    const text=document.createElement('p');text.textContent='체험판을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.';
    const retry=document.createElement('button');retry.type='button';retry.className='button primary';retry.textContent='다시 연결하기';retry.addEventListener('click',()=>location.reload());
    $('app').replaceChildren(text,retry);
  }
}
boot();
