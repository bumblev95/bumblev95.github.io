import {getLanguage} from '../../releases/1.0.0/locale.js';

const copy={
  title:['계정','Account'], signIn:['Google로 로그인','Sign in with Google'], again:['Google 계정 다시 확인','Verify Google account again'],
  signOut:['로그아웃','Sign out'], remove:['계정 삭제','Delete account'], checking:['계정을 확인하고 있어요…','Checking your account…'],
  anonymous:['로그인하지 않아도 게임을 즐길 수 있어요.','You can play without signing in.'],
  purchases:['로그인만으로 광고가 제거되지는 않아요. 광고 제거 구매와 추억집 결제는 아직 준비 중이에요.','Signing in alone does not remove ads. Ad-removal purchases and paid memory books are still being prepared.'],
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
  cancel:['취소','Cancel'], confirm:['계정 삭제 확인','Confirm account deletion']
};
const text=key=>(copy[key]||copy.UNAVAILABLE)[getLanguage()==='ko'?0:1];

export function installAccountSettings(){
  const $=id=>document.getElementById(id),native=()=>window.__NATIVE__?.account;
  // Unmodified Google pre-approved light square icon: developers.google.com/identity/branding-guidelines
  const logo=document.createElement('span');logo.className='google-logo';logo.setAttribute('aria-hidden','true');
  const image=document.createElement('img');image.alt='';image.width=40;image.height=40;image.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAABF1JREFUeAHtmX9sU1UUx7/3vf5km6vLNsYG22Rkwx8hNcMIrKsozBjBhf0BwRAjxh//ilGT+afKHxMRExWNJAYNwWiiBlimSIyZZGqMnVaJIq4DWhgbjLHSdrSlffd67tsqIYPwXsvSkuybnPdeXs5tP+/ce885fWUgdXZ21qeFtpsu3WQu5FkMbJ/KlBe6urpOsim439tWt7m8nlY4HA7kU4lEAr/2+3Cg+0DYwtR71eUty3e3r213P7TyQVgsFuRbkqGutlZeOgLHA25FAOuWLm1GoanV45EntyKPTocThaYpJpeCAtcsYK6aBcxVuSW+iRjEoW+BP/8ABgPA2REqAwyonAssagJWeMBWr0IuyhpQ9PYAH74PEY4DHDoYk3BSo2NgF/yA7xjweTewcR2waiWyUVaA4ss3gP1fAEkbLRIrmLh6pTBmpYOdHKkMnAkC27fRQ1wG2h6GWZkH/P5VsP69EMWUSDUC01QITpEjFiYkHd0TGgFNkKXpmqzhDpruFchG5gCDe4HQe0CFQ19qQqNptd1GkdkEdj+VpoZFk36Dg8C+r4BDB+leA7BtB1BUjGxkDnD4NdoAtObsHEIV4GV1UDfsBBY0Xu0noV58map8B1BVlTWcOcCxPeQd1LtFYRdIWB2wPfAORbPx+mMyEc1BxgGjtGsttL6o/+F01qofh1pxJ2ZaxgETf+s7VgJqzAZ7zfprunXsTOu7l0mT65QOGm0cIftkuqcIjme8KtYsMVYjjAOmTiFTeBh9oWqvuaZbMHLlI2VWFNM8VBw9B6yBMRkHlDkNk6awTE65wRDkLuO12FpN+S4FTqbxBHjyBExr6hmL7caHGI4gt9+FVHwASYpkjEyc/xg1Jd5pfr+9Mn3ss58K9Icmr2U5XDwXhmU4gqmiVoxzDSOc4yTV3p/PfYLTkcM3HHc6oqFveAJpNQmuaBRAgcaZALSWP4kRxYUTNEUBAhzgFnzw7/M4mxi67phQLIH2ngHEnKO4ZIsgaYnDXZ9GdSkMyzCgorpQVrsDIaq7QaHiFHfir/hFPPbLerx09F0ciQb/9w3GL2DrsZ9w33c9+Cc9hJh9HBO2i5TcI3jOw2BGpkpdbflmLIgdgX9oF86LYoyLUkRFCfYM/4iPzvTrXRfVQHBtDrRUOTRRBWGTyVDR98fTS0qxbL656mq6o36k/i0sm7cFYV6CKC/GJUEw9Jw840DphykpinicLEZpL4q0NYYNi4uwtaUSZpVVy//EwtexpfFN3O5YiMvCBk5RY8hMnawg1G4pSQKNk08a25ubsKulCdko64760aq1un02fBjdo35agyGEEmP6Lq1zluHuogZ4Su/BpvnNcFlNJL6bBZjRxnle3WZKsz87c9UsYK66JQDD8UQchaYMkwT09/X1odDk8/nkab/qbfX+MHA8sHmOw+moqKyA1WJFPiUj19vbi68PfiNfonfo9Um+6deE9rZ8X438K0xV02+B+pT8G+I/GQh/7Ve+elUAAAAASUVORK5CYII=';logo.append(image);
  const label=document.createElement('span');$('account-sign-in').replaceChildren(logo,label);
  let account=null,busy=false,note='anonymous';
  function render(){
    $('account-heading').textContent=text('title');
    $('account-status').textContent=account?account.email:text('anonymous');
    $('account-note').textContent=text(note);$('account-purchases').textContent=text('purchases');
    label.textContent=text(account?'again':'signIn');
    $('account-sign-out').textContent=text('signOut');$('account-delete').textContent=text('remove');
    for(const id of ['account-sign-in','account-sign-out','account-delete'])$(id).disabled=busy;
    $('account-sign-out').hidden=!account;$('account-delete').hidden=!account;
    for(const [id,key] of [['account-delete-title','deleteTitle'],['account-delete-body','deleteBody'],['account-delete-cancel','cancel'],['account-delete-confirm','confirm']])$(id).textContent=text(key);
  }
  async function run(method,options){
    if(busy)return;busy=true;note='checking';render();
    try{
      const result=await native()?.[method]?.(options)||{status:'SIGN_IN_NOT_CONFIGURED'};
      if(result.status==='cancelled'||result.status==='busy'){note='anonymous';return;}
      if(result.status==='signed-in') {account=result.account;note='signedIn';}
      else if(['signed-out','deleted','SIGN_IN_REQUIRED'].includes(result.status)){
        account=null;note=result.status==='deleted'?'deleted':result.status==='SIGN_IN_REQUIRED'?'SIGN_IN_REQUIRED':'signedOut';
      } else note=copy[result.status]?result.status:'UNAVAILABLE';
      window.__ACCOUNT_STATUS__={signedIn:!!account};
    }catch{note='UNAVAILABLE';}
    finally{busy=false;render();}
  }
  $('account-sign-in').onclick=()=>run('signIn');
  $('account-sign-out').onclick=()=>run('signOut');
  $('account-delete').onclick=()=>{render();$('account-delete-dialog').showModal();};
  $('account-delete-cancel').onclick=()=>$('account-delete-dialog').close();
  $('account-delete-confirm').onclick=()=>{$('account-delete-dialog').close();run('deleteAccount',{confirmed:true});};
  $('settings-toggle').addEventListener('click',()=>run('status'));
  window.addEventListener('thenus-language',render);render();
}
