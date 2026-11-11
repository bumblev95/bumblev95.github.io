// Shared bounds. AI supplies wording and decoys; the author owns the true answer.
export const questionStarters = [
  {id:'place',label:'장소',prompt:'이 사진을 찍은 곳은 어디였을까요?'},
  {id:'activity',label:'함께 한 일',prompt:'이날 우리가 함께 한 일은 무엇이었을까요?'},
  {id:'detail',label:'작은 디테일',prompt:'이날 가장 기억에 남는 것은 무엇이었을까요?'}
];
export const sampleDraft = Object.freeze({
  prompt:'바다에 도착하자마자 우리가 가장 먼저 한 일은?',
  options:['짐부터 풀기','바다 보러 가기','점심 먹기','기념품 고르기'],
  correctIndex:1,
  story:'바다가 보고 싶어서 짐을 풀기 전에 바다로 달려갔어요.'
});
const plain=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
export function validateDraftInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('기억과 정답을 확인해 주세요.');
  if(Object.keys(input).some(k=>!['requestId','memory','answer','focus','consent'].includes(k)))throw new Error('AI에는 기억과 정답만 보낼 수 있어요.');
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.requestId||''))throw new Error('초안 요청을 다시 시작해 주세요.');
  if(input.consent!==true)throw new Error('적은 내용을 AI에 보내는 데 동의해 주세요.');
  if(!plain(input.memory,240))throw new Error('기억을 1~240자로 적어 주세요. 줄바꿈은 띄어쓰기로 바꿔 주세요.');
  if(!plain(input.answer,60))throw new Error('정답을 1~60자로 적어 주세요.');
  if(!questionStarters.some(x=>x.id===input.focus))throw new Error('질문의 주제를 골라 주세요.');
  return {requestId:input.requestId,memory:input.memory.trim().normalize('NFC'),answer:input.answer.trim().normalize('NFC'),focus:input.focus,consent:true};
}
export const draftOutputSchema={type:'object',additionalProperties:false,required:['prompt','distractors'],properties:{
  prompt:{type:'string'},distractors:{type:'array',items:{type:'string'}}
}};
export function validateDraftOutput(output,answer){
  if(!output||typeof output!=='object'||Array.isArray(output)||Object.keys(output).sort().join(',')!=='distractors,prompt'||!plain(output.prompt,160)||!Array.isArray(output.distractors)||output.distractors.length!==3||!output.distractors.every(x=>plain(x,60)))throw new Error('초안을 확인하지 못했어요. 직접 출제를 이용하거나 다시 시도해 주세요.');
  const distractors=output.distractors.map(x=>x.trim().normalize('NFC'));
  if(new Set([answer,...distractors].map(x=>x.toLocaleLowerCase('ko-KR'))).size!==4)throw new Error('서로 다른 보기 네 개를 만들지 못했어요. 다시 시도해 주세요.');
  return {prompt:output.prompt.trim().normalize('NFC'),distractors};
}
export function assembleDraft(output,input,correctIndex){
  if(!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>3)throw new Error('올바르지 않은 정답 위치');
  const checked=validateDraftOutput(output,input.answer),options=[...checked.distractors];options.splice(correctIndex,0,input.answer);
  return {prompt:checked.prompt,options,correctIndex,story:input.memory};
}
