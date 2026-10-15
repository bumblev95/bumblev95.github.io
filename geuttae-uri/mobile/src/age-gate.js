import {getLanguage} from '../../releases/1.0.0/locale.js';

// We never retain the birth date; only the coarse eligibility band stays on this device.
export const AUDIENCE_KEY = 'thenus-audience-13plus-v1';
export function classifyBirthDate(date, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day);
  if (year < 1900 || value.getFullYear() !== year || value.getMonth() !== month - 1 ||
      value.getDate() !== day || value > today) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return age < 13 ? 'under13' : age < 18 ? 'teen' : 'adult';
}

export async function require13PlusAudience(nativeAds) {
  let band;
  try {band = localStorage.getItem(AUDIENCE_KEY);} catch {band = null;}
  if (!['under13','teen','adult'].includes(band)) band = null;
  const ko = getLanguage() === 'ko';
  const copy = (a,b) => ko?a:b;
  function screen() {
    const node = document.createElement('div');
    node.id = 'thenus-age-screen';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal','true');
    node.setAttribute('aria-labelledby','thenus-age-heading');
    node.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fbf8f1;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto;color:#30372f;font-family:system-ui,sans-serif;';
    document.body.appendChild(node);
    return node;
  }
  if (!band) {
    const root = screen();
    root.innerHTML = `<form id="thenus-age-form" style="width:100%;max-width:430px;background:#fff;border:1px solid #ebe8de;border-radius:24px;padding:26px;box-shadow:0 6px 28px #2221;">
      <p style="font-size:14px;color:#527059">${copy('그때 우리 · 가족·친구 사진 퀴즈','Us Back Then · Photo Quiz')}</p>
      <h1 id="thenus-age-heading" style="font-size:26px;margin:12px 0">${copy('생년월일을 알려 주세요','Please enter your date of birth')}</h1>
      <p style="line-height:1.65">${copy('13세 이상을 위한 앱이에요. 나이에 맞는 이용 환경을 제공하기 위해 확인해요. 생년월일은 저장하거나 서버에 보내지 않고 연령 구간만 기기에 보관해요.','This app is for ages 13+. We use your birth date to determine age-appropriate features. Your birth date is not stored or sent to our server; only an age band is kept on this device.')}</p>
      <label for="thenus-birth-date" style="display:block;margin:20px 0 8px;font-weight:600">${copy('생년월일','Date of birth')}</label>
      <input type="date" id="thenus-birth-date" name="dob" required autocomplete="bday" max="${new Date().toISOString().slice(0,10)}" style="display:block;width:100%;font-size:17px;padding:12px;border:1px solid #bbb;border-radius:12px;box-sizing:border-box">
      <p id="thenus-age-error" role="alert" style="color:#a23e32;min-height:1.4em"></p>
      <button type="submit" style="width:100%;border:0;border-radius:12px;padding:14px;background:#365d47;color:white;font-size:17px;font-weight:700">${copy('계속','Continue')}</button>
      <p style="font-size:12px;color:#777">${copy('나이를 속여 입력하지 마세요. 연령 확인은 본인 진술을 기반으로 합니다.','Please enter your actual date of birth. This is a self-declared age check.')}</p>
    </form>`;
    band = await new Promise(resolve => {
      root.querySelector('form').addEventListener('submit',event => {
        event.preventDefault();
        const choice = classifyBirthDate(root.querySelector('input').value);
        if (!choice) {root.querySelector('#thenus-age-error').textContent = copy('올바른 날짜를 선택해 주세요.','Select a valid date.');return;}
        try {localStorage.setItem(AUDIENCE_KEY,choice);} catch {}
        resolve(choice);
      });
    });
    root.remove();
  }
  // Unknown, underage or missing native acknowledgement must never initialize ad SDKs.
  try {await nativeAds?.setAudience?.({group:band});} catch {
    // Fail closed for ads; the native plugin independently requires a verified band.
  }
  window.__THENUS_AGE_BAND__ = band;
  if (band !== 'under13') return band;
  const blocked = screen();
  blocked.innerHTML = `<section style="max-width:420px;background:white;border:1px solid #ebe8de;border-radius:24px;padding:28px;text-align:center">
    <h1 id="thenus-age-heading">${copy('13세 이상부터 이용할 수 있어요','This app is for ages 13+')}</h1>
    <p style="line-height:1.7">${copy('그때 우리는 13세 이상 이용자를 위해 만들어졌어요. 앱에서 사진을 공유하거나 게임에 참여할 수 없어요. 입력 오류가 있었다면 보호자와 함께 앱 데이터 초기화 후 다시 설정해 주세요.','Us Back Then is intended for ages 13 and older. Photo sharing and gameplay are unavailable. If you entered an incorrect date, ask a parent or guardian to help reset the app data.')}</p>
    <a href="mailto:keetojt@gmail.com" style="color:#365d47">keetojt@gmail.com</a>
  </section>`;
  return new Promise(() => {}); // Leave the app shell unloaded for ineligible users.
}
