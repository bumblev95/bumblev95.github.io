import { t, tr } from "../../releases/0.5.1/locale.js";
import { installNative } from './native.js';
import version from '../../version.json';
await installNative();
window.__API_BASE__ = 'https://geuttae-api-test-production.up.railway.app';
window.__OFFLINE__ = false;
window.__ASSET_BASE__ = new URL('./assets/', location.href).href;
await import('../../releases/0.5.1/client.js');
document.getElementById('build-label').textContent = 'ANDROID TEST v' + version.version;
document.getElementById('footer-build').textContent = t("그때 우리 · 안드로이드 테스트 v") + version.version;
const notes = document.getElementById('release-notes');
notes.disabled = false;
notes.onclick = () => {
  document.getElementById('release-heading').textContent = 'v' + version.version + t(" 업데이트");
  document.getElementById('release-date').textContent = version.date;
  document.getElementById('release-items').replaceChildren(...version.changes.map(text => {
    const li = document.createElement('li');
    li.textContent = t(text);
    return li;
  }));
  document.getElementById('release-dialog').showModal();
};
document.getElementById('close-release').onclick = () => document.getElementById('release-dialog').close();
const update = document.getElementById('check-update');
update.disabled = false;
update.textContent = t("앱 버전");
update.onclick = () => notes.click();

window.addEventListener('thenus-language',()=>{document.getElementById('footer-build').textContent=t('그때 우리 · 안드로이드 테스트 v')+version.version;update.textContent=t('앱 버전');});
