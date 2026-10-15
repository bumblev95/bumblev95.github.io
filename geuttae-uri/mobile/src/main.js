import { t, tr, getLanguage } from "../../releases/1.0.0/locale.js";
import {Capacitor} from '@capacitor/core';
import {require13PlusAudience} from './age-gate.js';
import { installNative } from './native.js';
import version from '../release.json';
import {installAccountSettings} from './account.js';
await installNative();
if (Capacitor.isNativePlatform()) await require13PlusAudience(window.__NATIVE__?.ads);
window.__API_BASE__ = 'https://geuttae-api-test-production.up.railway.app';
window.__OFFLINE__ = false;
window.__ASSET_BASE__ = new URL('./assets/', location.href).href;
await import('../../releases/1.0.0/client.js');
installAccountSettings();
document.getElementById('build-label').textContent = t('그때 우리')+' v' + version.version;
document.getElementById('footer-build').textContent = t('그때 우리')+' v' + version.version;
const notes = document.getElementById('release-notes');
notes.disabled = false;
notes.onclick = () => {
  document.getElementById('release-heading').textContent = 'v' + version.version + t(" 업데이트");
  document.getElementById('release-date').textContent = version.date;
  const changes=getLanguage()==='en'?(version.changesEn||version.changes):version.changes;
  document.getElementById('release-items').replaceChildren(...changes.map(text => {
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

window.addEventListener('thenus-language',()=>{document.getElementById('build-label').textContent=t('그때 우리')+' v'+version.version;document.getElementById('footer-build').textContent=t('그때 우리')+' v'+version.version;update.textContent=t('앱 버전');});

// Privacy controls stay in settings, keeping the first screen unchanged.
async function adSetting(method, button) {
  if (!window.__NATIVE__?.ads) return;
  button.disabled = true;
  try {
    const result = await (method === 'test'
      ? window.__NATIVE__.ads.showAtBreak({placement:'test'})
      : window.__NATIVE__.ads[method]());
    const messages = {
      disabled: '정식 광고는 아직 활성화하지 않았어요.',
      'use-app-age': '앱을 시작할 때 확인한 연령대가 적용되고 있어요.',
      updated: '광고 개인정보 설정을 확인했어요.',
      'not-required': '이 지역에서는 별도의 광고 개인정보 선택창이 필요하지 않아요.',
      'age-ineligible': '연령 선택을 저장했어요. 광고는 요청하지 않아요.',
      busy: '다른 광고 설정을 마친 뒤 다시 눌러 주세요.',
      preparing: '테스트 광고를 준비하고 있어요. 잠시 뒤 다시 눌러 주세요.',
      'not-ready': '광고가 아직 준비되지 않았어요. 잠시 뒤 다시 눌러 주세요.',
      unavailable: '광고 설정을 불러오지 못했어요. 게임은 계속할 수 있어요.'
    };
    if (messages[result?.status]) {
      const toast = document.getElementById('toast');
      toast.textContent = t(messages[result.status]);toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 5000);
    }
  } catch {
    const toast = document.getElementById('toast');
    toast.textContent = t('광고 설정을 불러오지 못했어요. 게임은 계속할 수 있어요.');
    toast.classList.add('show');setTimeout(() => toast.classList.remove('show'), 5000);
  } finally { button.disabled = false; }
}
for (const [id, method] of [['ads-privacy','privacy'],['ads-age','ageChoice'],['ads-test','test']]) {
  const control = document.getElementById(id);
  control.onclick = () => adSetting(method, control);
  if (method === 'test') control.hidden = !window.__ADS_STATUS__?.testMode;
}
