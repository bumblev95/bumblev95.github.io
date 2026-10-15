import {getLanguage} from '../../releases/1.0.0/locale.js';

const copy={
  title:['계정','Account'], signIn:['Google로 로그인','Sign in with Google'], again:['Google 계정 다시 확인','Verify Google account again'],
  signOut:['로그아웃','Sign out'], remove:['계정 삭제','Delete account'], checking:['계정을 확인하고 있어요…','Checking your account…'],
  anonymous:['로그인은 선택이에요.','Sign-in is optional.'],
  purchases:['게임은 로그인 없이 즐길 수 있어요. 광고 제거를 구매하거나 복원할 때만 Google 계정이 필요해요.','Play without signing in. A Google account is only needed to buy or restore ad removal.'],
  homeAccount:['Google로 로그인 · 선택','Sign in with Google · Optional'], homeSignedIn:['내 계정','My account'],
  homeBilling:['한 번 구매 · 내 계정에만 적용','One-time purchase · Your account only'], preparing:['구매 준비 중','Coming soon'], active:['적용 중','Active'],
  billingDescription:['게임 사이 광고 없이 추억에 집중하세요. 로그인한 내 계정에만 적용되며, 다른 참가자의 광고는 그대로예요.','Enjoy your memories without between-game ads. Applies to your signed-in account only; other participants keep their own ads.'],
  signedIn:['로그인했어요.','Signed in.'], signedOut:['로그아웃했어요.','Signed out.'], deleted:['계정을 삭제했어요.','Account deleted.'],
  SIGN_IN_NOT_CONFIGURED:['Google 로그인 연결을 준비하고 있어요. 아직 계정은 생성되지 않아요.','Google sign-in is being configured. No account has been created.'],
  SIGN_IN_REQUIRED:['로그인 세션이 만료됐어요. 다시 로그인해 주세요.','Your session has expired. Please sign in again.'],
  REAUTHENTICATE_TO_DELETE:['계정 삭제 전에 Google 계정을 다시 확인한 뒤 계정 삭제를 눌러 주세요.','Verify your Google account again, then select Delete account.'],
  GOOGLE_SIGN_IN_FAILED:['Google 계정 선택을 완료하지 못했어요. 연결 설정과 Google Play 서비스를 확인해 주세요.','Google sign-in could not finish. Check sign-in configuration and Google Play services.'],
  GOOGLE_VERIFICATION_FAILED:['Google 계정을 확인하지 못했어요. 다시 시도해 주세요.','We could not verify your Google account. Please try again.'],
  SIGN_IN_EXPIRED:['로그인 요청 시간이 지났어요. 다시 시도해 주세요.','The sign-in request expired. Please try again.'],
  UNAVAILABLE:['계정 서버에 연결하지 못했어요. 게임은 로그인 없이 계속할 수 있어요.','We could not reach the account service. You can keep playing without signing in.'],
  deleteTitle:['계정을 삭제할까요?','Delete your account?'],
  deleteBody:['이 앱의 계정 정보와 모든 로그인 세션을 삭제해요. Google 계정 자체와 기기에 저장한 추억집은 삭제되지 않아요. 현재 게임의 임시 사진은 기존 모임 삭제 규칙에 따라 처리돼요.','This deletes your app account and all sign-in sessions. Your Google account and books saved on your device are not deleted. Temporary game photos follow the existing gathering deletion rules.'],
  billingTitle:['개인 광고 제거','Personal ad removal'], buy:['광고 제거 구매','Buy ad removal'], restore:['구매 복원','Restore purchases'], billingLogin:['구매·복원하려면 Google로 로그인해 주세요.','Sign in with Google to buy or restore purchases.'],
  available:['내 계정에만 적용 · 한 번 구매 · 구독 없음','Applies to your account only · One-time purchase · No subscription'],
  'ad-free':['이 계정은 광고 제거가 적용됐어요.','Ad removal is active for this account.'],
  'nothing-to-restore':['이 Google Play 계정에서 복원할 광고 제거 구매가 없어요.','No ad-removal purchase was found for this Google Play account.'],
  BILLING_NOT_CONFIGURED:['Google Play 결제를 준비 중이에요. 아직 결제되지 않아요.','Google Play billing is being configured. No payment will be taken.'],
  BILLING_PACKAGE_MISMATCH:['이 TEST 앱에서는 아직 결제 테스트를 할 수 없어요. 결제 테스트용 앱이 필요해요.','This TEST app is not configured for billing tests. Use the matching billing test app.'],
  PURCHASE_PENDING:['결제 승인 대기 중이에요. 승인 전에는 광고 제거가 적용되지 않아요. 복원으로 다시 확인할 수 있어요.','Payment is pending. Ad removal starts after approval. Use Restore purchases to check again.'],
  PURCHASE_VERIFY_RETRY:['구매 확인을 완료하지 못했어요. 다시 구매하지 말고 구매 복원을 눌러 주세요.','Purchase verification could not finish. Use Restore purchases instead of buying again.'],
  PURCHASE_ACCOUNT_MISMATCH:['구매할 때 로그인했던 앱 계정으로 다시 로그인해 주세요. Play 스토어의 결제 계정도 확인해 주세요.','Sign in to the app account used for this purchase. Also check your payment account in Google Play.'],
  PURCHASE_REVOKED:['구매가 취소되었거나 환불되어 광고 제거가 적용되지 않아요.','This purchase was cancelled or refunded. Ad removal is not active.'],
  PRODUCT_UNAVAILABLE:['이 Google Play 계정이나 지역에서는 상품을 불러오지 못했어요.','This product is unavailable for this Google Play account or region.'],
  BILLING_UNAVAILABLE:['Google Play 결제에 연결하지 못했어요. 구매한 적이 있다면 구매 복원으로 다시 확인해 주세요.','Google Play billing is unavailable. If you previously purchased, try Restore purchases.'],
  PRICE_CHANGED:['현재 가격을 다시 확인했어요. 가격을 확인한 뒤 구매 버튼을 눌러 주세요.','The current price has been refreshed. Review it before selecting Buy again.'],
  cancelled:['결제를 취소했어요.','Purchase cancelled.'],
  cancel:['취소','Cancel'], confirm:['계정 삭제 확인','Confirm account deletion']
};
const text=key=>(copy[key]||copy.UNAVAILABLE)[getLanguage()==='ko'?0:1];

export function installAccountSettings(){
  const $=id=>document.getElementById(id),native=()=>window.__NATIVE__?.account;
  // Unmodified Google pre-approved light square icon: developers.google.com/identity/branding-guidelines
  const logo=document.createElement('span');logo.className='google-logo';logo.setAttribute('aria-hidden','true');
  const image=document.createElement('img');image.alt='';image.width=40;image.height=40;image.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAABF1JREFUeAHtmX9sU1UUx7/3vf5km6vLNsYG22Rkwx8hNcMIrKsozBjBhf0BwRAjxh//ilGT+afKHxMRExWNJAYNwWiiBlimSIyZZGqMnVaJIq4DWhgbjLHSdrSlffd67tsqIYPwXsvSkuybnPdeXs5tP+/ce885fWUgdXZ21qeFtpsu3WQu5FkMbJ/KlBe6urpOsim439tWt7m8nlY4HA7kU4lEAr/2+3Cg+0DYwtR71eUty3e3r213P7TyQVgsFuRbkqGutlZeOgLHA25FAOuWLm1GoanV45EntyKPTocThaYpJpeCAtcsYK6aBcxVuSW+iRjEoW+BP/8ABgPA2REqAwyonAssagJWeMBWr0IuyhpQ9PYAH74PEY4DHDoYk3BSo2NgF/yA7xjweTewcR2waiWyUVaA4ss3gP1fAEkbLRIrmLh6pTBmpYOdHKkMnAkC27fRQ1wG2h6GWZkH/P5VsP69EMWUSDUC01QITpEjFiYkHd0TGgFNkKXpmqzhDpruFchG5gCDe4HQe0CFQ19qQqNptd1GkdkEdj+VpoZFk36Dg8C+r4BDB+leA7BtB1BUjGxkDnD4NdoAtObsHEIV4GV1UDfsBBY0Xu0noV58map8B1BVlTWcOcCxPeQd1LtFYRdIWB2wPfAORbPx+mMyEc1BxgGjtGsttL6o/+F01qofh1pxJ2ZaxgETf+s7VgJqzAZ7zfprunXsTOu7l0mT65QOGm0cIftkuqcIjme8KtYsMVYjjAOmTiFTeBh9oWqvuaZbMHLlI2VWFNM8VBw9B6yBMRkHlDkNk6awTE65wRDkLuO12FpN+S4FTqbxBHjyBExr6hmL7caHGI4gt9+FVHwASYpkjEyc/xg1Jd5pfr+9Mn3ss58K9Icmr2U5XDwXhmU4gqmiVoxzDSOc4yTV3p/PfYLTkcM3HHc6oqFveAJpNQmuaBRAgcaZALSWP4kRxYUTNEUBAhzgFnzw7/M4mxi67phQLIH2ngHEnKO4ZIsgaYnDXZ9GdSkMyzCgorpQVrsDIaq7QaHiFHfir/hFPPbLerx09F0ciQb/9w3GL2DrsZ9w33c9+Cc9hJh9HBO2i5TcI3jOw2BGpkpdbflmLIgdgX9oF86LYoyLUkRFCfYM/4iPzvTrXRfVQHBtDrRUOTRRBWGTyVDR98fTS0qxbL656mq6o36k/i0sm7cFYV6CKC/GJUEw9Jw840DphykpinicLEZpL4q0NYYNi4uwtaUSZpVVy//EwtexpfFN3O5YiMvCBk5RY8hMnawg1G4pSQKNk08a25ubsKulCdko64760aq1un02fBjdo35agyGEEmP6Lq1zluHuogZ4Su/BpvnNcFlNJL6bBZjRxnle3WZKsz87c9UsYK66JQDD8UQchaYMkwT09/X1odDk8/nkab/qbfX+MHA8sHmOw+moqKyA1WJFPiUj19vbi68PfiNfonfo9Um+6deE9rZ8X438K0xV02+B+pT8G+I/GQh/7Ve+elUAAAAASUVORK5CYII=';logo.append(image);
  const label=document.createElement('span');$('account-sign-in').replaceChildren(logo,label);
  let account=null,busy=false,note='anonymous',billingBusy=false,billing={status:'BILLING_NOT_CONFIGURED'};
  const teen = window.__THENUS_AGE_BAND__ === 'teen';
  async function loadBilling(method='billingStatus'){
    if(teen||billingBusy||busy)return;
    if(!account){billing={status:'billingLogin'};render();return;}
    billingBusy=true;render();
    try{const next=await native()?.[method]?.()||{status:'BILLING_NOT_CONFIGURED'};billing={...next,price:next.price||billing.price};}catch{billing={status:'BILLING_UNAVAILABLE'};}
    finally{billingBusy=false;render();}
  }
  function render(){
    $('account-heading').textContent=text('title');
    $('account-status').textContent=account?account.email:text('anonymous');
    $('account-note').textContent=text(note);$('account-purchases').textContent=teen?(getLanguage()==='ko'?'13~17세는 광고와 유료 구매가 제공되지 않아요.':'Ads and purchases are unavailable for ages 13–17.'):text('purchases');
    $('home-ad-removal').hidden = teen;
    $('billing-settings').hidden = teen;
    label.textContent=text(account?'again':'signIn');
    $('billing-heading').textContent=text('billingTitle');
    $('billing-description').textContent=text('billingDescription');
    $('home-billing-title').textContent=text('billingTitle');
    $('home-billing-detail').textContent=text(billing.adFree?'ad-free':'homeBilling');
    $('home-billing-badge').textContent=billing.adFree?text('active'):billing.enabled&&billing.price?billing.price:account&&billing.status==='BILLING_NOT_CONFIGURED'?text('preparing'):'';
    $('home-account-label').textContent=text(account?'homeSignedIn':'homeAccount');
    $('home-account').disabled=busy||billingBusy;
    $('billing-login').textContent=text('signIn');$('billing-login').hidden=!!account;
    $('billing-login').disabled=busy||billingBusy;
    $('billing-status').textContent=text(!account?'billingLogin':billingBusy?'checking':billing.status);
    $('billing-buy').textContent=text('buy')+(billing.price?' · '+billing.price:'');
    $('billing-restore').textContent=text('restore');
    $('billing-buy').hidden=!account||!!billing.adFree;
    $('billing-buy').disabled=teen||busy||billingBusy||!account||!billing.enabled||!billing.price||!['available','PRICE_CHANGED','cancelled','nothing-to-restore'].includes(billing.status);
    $('billing-restore').disabled=busy||billingBusy||!account;
    $('billing-price').textContent=billing.adFree?'':text('available');
    $('account-sign-out').textContent=text('signOut');$('account-delete').textContent=text('remove');
    for(const id of ['account-sign-in','account-sign-out','account-delete'])$(id).disabled=busy||billingBusy;
    $('account-sign-out').hidden=!account;$('account-delete').hidden=!account;
    for(const [id,key] of [['account-delete-title','deleteTitle'],['account-delete-body','deleteBody'],['account-delete-cancel','cancel'],['account-delete-confirm','confirm']])$(id).textContent=text(key);
  }
  async function run(method,options){
    if(busy||billingBusy)return;busy=true;note='checking';render();
    try{
      const result=await native()?.[method]?.(options)||{status:'SIGN_IN_NOT_CONFIGURED'};
      if(result.status==='cancelled'||result.status==='busy'){note='anonymous';return;}
      if(result.status==='signed-in') {account=result.account;note='signedIn';}
      else if(['signed-out','deleted','SIGN_IN_REQUIRED'].includes(result.status)){
        account=null;note=result.status==='deleted'?'deleted':result.status==='SIGN_IN_REQUIRED'?'SIGN_IN_REQUIRED':'signedOut';
      } else note=copy[result.status]?result.status:'UNAVAILABLE';
      window.__ACCOUNT_STATUS__={signedIn:!!account};
    }catch{note='UNAVAILABLE';}
    finally{busy=false;render();if(account)loadBilling();else{billing={status:'billingLogin'};render();}}
  }
  $('billing-buy').onclick=()=>{if(!teen)loadBilling('billingBuy');};
  $('billing-restore').onclick=()=>loadBilling('billingRestore');
  $('account-sign-in').onclick=()=>run('signIn');
  $('account-sign-out').onclick=()=>run('signOut');
  $('account-delete').onclick=()=>{render();$('account-delete-dialog').showModal();};
  $('account-delete-cancel').onclick=()=>$('account-delete-dialog').close();
  $('account-delete-confirm').onclick=()=>{$('account-delete-dialog').close();run('deleteAccount',{confirmed:true});};
  function openSettings(section){
    const settings=$('settings-dialog');if(!settings.open)settings.showModal();
    if(section==='billing-settings')settings.scrollTop=0;else $(section).scrollIntoView({block:'start'});
    run('status');
  }
  $('home-ad-removal').onclick=()=>openSettings('billing-settings');
  $('home-account').onclick=()=>openSettings('account-settings');
  $('billing-login').onclick=()=>openSettings('account-settings');
  $('settings-toggle').addEventListener('click',()=>{$('settings-dialog').scrollTop=0;run('status');});
  window.addEventListener('thenus-purchases',()=>loadBilling());
  window.addEventListener('thenus-language',render);render();run('status');
}
