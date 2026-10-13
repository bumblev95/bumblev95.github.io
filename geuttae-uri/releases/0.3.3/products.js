// Proposed catalog, shared with the server. No client value grants a benefit.
export const products = Object.freeze([
  {id:'ultimate_monthly',name:'Ultimate',price:'US$7.99 / 월',credits:300,billing:'monthly',kind:'subscription'},
  {id:'memory_book',name:'모임 추억집',price:'US$0.99',credits:0,billing:'per-room',kind:'book'},
  {id:'ai_100',name:'AI 100회 이용권',price:null,credits:100,billing:'one-off',kind:'credits'},
  {id:'ai_300',name:'AI 300회 이용권',price:null,credits:300,billing:'one-off',kind:'credits'},
  {id:'ad_free',name:'개인 광고 제거',price:null,credits:0,billing:'one-off',kind:'ad-free'}
].map(Object.freeze));
export const catalog = Object.freeze({paymentEnabled:false,aiEnabled:false,adsEnabled:false,trialExportsFree:true,products});
export const productFor = id => products.find(p=>p.id===id);
