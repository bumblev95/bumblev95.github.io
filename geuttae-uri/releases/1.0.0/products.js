// One-time products only. Prices and ownership come from Google Play, never this file.
export const products = Object.freeze([
  {id:'memory_book',name:'모임 추억집',price:'US$0.99',credits:0,billing:'per-room',kind:'book'},
  {id:'ad_free',name:'개인 광고 제거',price:null,credits:0,billing:'one-off',kind:'ad-free'}
].map(Object.freeze));
export const catalog = Object.freeze({paymentEnabled:false,aiEnabled:false,adsEnabled:false,trialExportsFree:true,products});
export const productFor = id => products.find(p=>p.id===id);
