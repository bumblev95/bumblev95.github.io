import {english} from './en.js';
export const languageKey='thenus-language';
const browser=typeof window!=='undefined'&&typeof document!=='undefined';
function initialLanguage(){
 if(!browser)return 'ko';
 try{const saved=localStorage.getItem(languageKey);if(saved==='ko'||saved==='en')return saved;}catch{}
 return (navigator.language||'en').toLowerCase().startsWith('ko')?'ko':'en';
}
let language=initialLanguage();
export const getLanguage=()=>language;
export const dateLocale=()=>language==='ko'?'ko-KR':'en-CA';
const escapeRE=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const keys=Object.keys(english).sort((a,b)=>b.length-a.length);
const pattern=new RegExp(keys.map(escapeRE).join('|'),'g');
// Only developer-owned source literals enter t/tr; interpolated player content is untouched.
export function t(value){const text=String(value??'');return language==='ko'?text:text.replace(pattern,key=>english[key]);}
export function tr(parts,...values){return parts.map((part,i)=>t(part)+(i<values.length?values[i]:'')).join('');}
export function appError(error){const value=String(error?.message??error??'');const translated=t(value);return language==='en'&&/[가-힣]/.test(translated)?'We could not complete that request. Please try again.':translated;}
const sources=new Map(Object.entries(english).map(([ko,en])=>[en,ko]));
export const sampleText=value=>t(sources.get(value)||value);
export function setLanguage(next){
 if(!['ko','en'].includes(next)||next===language)return;
 language=next;try{localStorage.setItem(languageKey,next);}catch{}
 if(browser){document.documentElement.lang=language;window.dispatchEvent(new CustomEvent('thenus-language',{detail:language}));}
}
export function installLanguagePicker(){
 if(!browser)return;
 document.documentElement.lang=language;
 let picker=document.querySelector('.language-switch');
 if(!picker){picker=document.createElement('div');picker.className='language-switch';picker.setAttribute('role','group');picker.innerHTML='<button type="button" data-language="ko" lang="ko">한국어</button><button type="button" data-language="en" lang="en">English</button>';document.getElementById('settings-language').append(picker);
 picker.addEventListener('click',event=>{const button=event.target.closest('[data-language]');if(button&&!document.querySelector('dialog[open]:not(#settings-dialog)'))setLanguage(button.dataset.language);});}
 picker.setAttribute('aria-label',language==='ko'?'앱 언어':'App language');
 for(const button of picker.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.language===language));
}
