import {createServer} from 'node:http';
import {randomBytes,randomUUID,randomInt,createHash,timingSafeEqual} from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {networkInterfaces} from 'node:os';
import {meta,questionKey,questionLimitFor,pointsForTime,setup,validateAction,applyAction,viewFor,removeParticipant} from '../../releases/1.0.0/logic.js';
import {captureMemory,buildMemoryBook} from '../../releases/0.5.0/memory.js';
import {sanitizeJpeg} from './media.mjs';
import {createAiProvider,createAiBudget} from './ai.mjs';
import {validateDraftInput,assembleDraft} from '../../releases/0.3.3/draft.js';
import {openCommerceLedger,createCommerce,CommerceError} from './commerce.mjs';
import {catalog as releaseCatalog} from '../../releases/1.0.0/products.js';
import {openAccounts,AccountError} from './accounts.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const validCode=c=>/^[A-HJ-NP-Z2-9]{8}$/.test(c);
const hash=s=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const roomCode=()=>[...randomBytes(8)].map(n=>ALPHABET[n%32]).join('');
function safeInterfaces(){try{return networkInterfaces();}catch{return {};}}
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const check=(ok,status,message)=>{if(!ok)throw new ApiError(status,message);};
const nameValid=n=>typeof n==='string'&&n.trim().length>=1&&n.length<=16&&!/[\x00-\x1f\x7f]/.test(n);

/** Single-instance server with atomic disk persistence. Not a multi-instance deployment. */
export async function createApp(options={}){
 const dataDir=path.resolve(options.dataDir||process.env.DATA_DIR||path.join(ROOT,'data'));
 const roomsDir=path.join(dataDir,'rooms');
 const publicDir=path.resolve(ROOT,'..');
 const publicOrigin=(options.publicOrigin||process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||'').replace(/\/$/,'');
 if(publicOrigin){const u=new URL(publicOrigin);if(u.origin!==publicOrigin||u.protocol!=='https:')throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a path.');}
 const frontendOrigins=new Set((options.frontendOrigins||process.env.FRONTEND_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
 for(const origin of frontendOrigins){const u=new URL(origin);if(u.origin!==origin||u.protocol!=='https:')throw new Error('FRONTEND_ORIGINS must contain exact HTTPS origins.');}
 const healthcheckHost=options.healthcheckHost||'';
 if(healthcheckHost&&healthcheckHost!=='healthcheck.railway.app')throw new Error('Unsupported healthcheck host.');
 const gameNow=options.gameClock||Date.now;
 const ttl=options.roomTtlMs??24*60*60*1000;
 check(Number.isFinite(ttl)&&ttl>0&&ttl<=24*60*60*1000,500,'올바르지 않은 방 만료 설정');
 const streams=new Map(),locks=new Map(),rateBuckets=new Map();
 const localHosts=new Set(['localhost','127.0.0.1','[::1]','::1']);
 for(const list of Object.values(safeInterfaces()))for(const net of list||[])localHosts.add(net.address.toLowerCase());
 await fs.mkdir(roomsDir,{recursive:true,mode:0o700});
 const ai=options.aiProvider===undefined?await createAiProvider():options.aiProvider;
 if(ai)check(typeof ai.generate==='function'&&Number.isInteger(ai.roomLimit)&&ai.roomLimit>0&&ai.roomLimit<=20&&Number.isInteger(ai.dailyLimit)&&ai.dailyLimit>0&&ai.dailyLimit<=1000,500,'올바르지 않은 AI 제한 설정');
 const aiBudget=ai?await createAiBudget(dataDir,ai.dailyLimit):null;
 const ledger=await openCommerceLedger(path.join(dataDir,'commerce.sqlite'),{now:options.commerceClock||Date.now});
 let commerce;
 try{commerce=createCommerce({...options.commerceFixture,ledger,fixture:!!options.commerceFixture});ledger.recoverPending();}catch(error){ledger.close();throw error;}
 let accounts;try{accounts=await openAccounts(path.join(dataDir,'accounts.sqlite'),options.accounts);}catch(error){ledger.close();throw error;}
 const aiFlights=new Map(),aiCache=new Map();
 const aiKey=(code,id)=>code+'|'+id;
 function aiStatus(room){
  const used=room.aiUsage?.successes||0,pending=Object.values(room.aiUsage?.requests||{}).filter(x=>x.status==='pending').length;
  if(ai&&commerce.usesCredits)return {enabled:true,remaining:ledger.balance(commerce.hostFor(room)).total,mode:'fixture-credits',textOnly:true};
  return ai?{enabled:true,remaining:Math.max(0,ai.roomLimit-used-pending),limit:ai.roomLimit,mode:'room-test',textOnly:true}:{enabled:false,reason:'not-connected',textOnly:true};
 }
 function cancelAi(code,actorId){
  for(const [key,flight] of aiFlights)if(key.startsWith(code+'|')&&(!actorId||flight.actorId===actorId))flight.control.abort();
  for(const [key,entry] of aiCache)if(key.startsWith(code+'|')&&(!actorId||entry.actorId===actorId))aiCache.delete(key);
 }
 const fileOf=c=>path.join(roomsDir,c,'room.json');
 const mediaOf=(c,id)=>path.join(roomsDir,c,'media',id+'.jpg');
 const commonHeaders={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; font-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'
 };
 if(publicOrigin)commonHeaders['Strict-Transport-Security']='max-age=63072000; includeSubDomains';
 function respond(res,status,data,extra={}){
  if(res.writableEnded||res.destroyed)return;
  const bytes=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data));
  res.writeHead(status,{...commonHeaders,'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,...extra});res.end(bytes);
 }
 async function readBody(req,limit){
  check(Number(req.headers['content-length']||0)<=limit,413,'사진 또는 입력 크기가 너무 커요.');
  return new Promise((resolve,reject)=>{
   let size=0,failed=false;const parts=[];
   req.on('data',part=>{size+=part.length;if(size>limit){if(!failed){failed=true;reject(new ApiError(413,'사진 또는 입력 크기가 너무 커요.'));}return;}if(!failed)parts.push(part);});
   req.on('end',()=>{if(!failed)resolve(Buffer.concat(parts));});
   req.on('error',()=>reject(new ApiError(400,'전송이 중단됐어요.')));
  });
 }
 async function jsonBody(req){
  check((req.headers['content-type']||'').startsWith('application/json'),415,'올바른 요청 형식이 아니에요.');
  let value;try{value=JSON.parse((await readBody(req,8192)).toString('utf8'));}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(400,'입력 내용을 확인해 주세요.');}
  check(value&&typeof value==='object'&&!Array.isArray(value),400,'입력 내용을 확인해 주세요.');return value;
 }
 function originFor(req){
  let u;try{u=new URL('http://'+req.headers.host);}catch{throw new ApiError(400,'주소를 확인해 주세요.');}
  const platformProbe=healthcheckHost&&(req.headers.host===healthcheckHost||req.headers.host===healthcheckHost+':'+req.socket.localPort)&&req.method==='GET'&&req.url==='/api/health'&&req.headers.origin===undefined;
  check(platformProbe||localHosts.has(u.hostname.toLowerCase())||(publicOrigin&&u.host===new URL(publicOrigin).host),421,'허용되지 않은 서버 주소예요.');
  return publicOrigin||u.origin;
 }
 function limit(req,kind,max,period=60_000){
  const now=Date.now(),key=(req.socket.remoteAddress||'unknown')+'|'+kind;
  let entry=rateBuckets.get(key);if(!entry||entry.until<=now)entry={count:0,until:now+period};
  entry.count++;rateBuckets.set(key,entry);
  if(rateBuckets.size>10000)for(const [k,v] of rateBuckets)if(v.until<=now)rateBuckets.delete(k);
  check(entry.count<=max,429,'요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
 }
 async function save(room){
  const dir=path.join(roomsDir,room.code);await fs.mkdir(dir,{recursive:true,mode:0o700});
  const tmp=path.join(dir,'room-'+randomUUID()+'.tmp');
  room.revision=(room.revision||0)+1;
  await fs.writeFile(tmp,JSON.stringify(room),{mode:0o600});await fs.rename(tmp,fileOf(room.code));
 }
 function cookie(code,value){return `gu_${code}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.ceil(ttl/1000)}${publicOrigin?'; Secure':''}`;}
 function sessionFor(room,req){
  const prefix='gu_'+room.code+'=';
  const bearer=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const v=bearer||(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(prefix))?.slice(prefix.length);
  if(!v||!/^[0-9a-f]{64}$/.test(v))return null;
  const wanted=Buffer.from(hash(v),'hex');
  return room.sessions.find(s=>timingSafeEqual(Buffer.from(s.tokenHash,'hex'),wanted))||null;
 }
 function activeSession(room,req){const s=sessionFor(room,req);check(s&&s.status==='active',403,'참가 승인을 받은 뒤 이용할 수 있어요.');return s;}
 function safeState(room,s){
  const base={code:room.code,title:room.title,expiresAt:room.expiresAt,access:s.status,you:s.id,mediaStatus:room.deletion,version:'0.3.3',revision:room.revision,gameNumber:room.gameNumber||0,rematchSupported:true,multiQuestionsSupported:true,textQuestionsSupported:false,photoOnlyPolicy:true,partyMissionsSupported:true,timedModesSupported:true,mode:room.game.mode||'memory',timeLimitSeconds:room.timeLimitSeconds||0,roundDeadlineAt:room.roundDeadlineAt||null,serverNow:gameNow()};
  if(s.status!=='active')return {...base,nickname:s.name};
  base.moderationSupported=true;base.hiddenPhotoIds=[...(s.hiddenPhotoIds||[])];
  const connectedIds=[...new Set([...(streams.get(room.code)?.values()||[])])];
  return {...base,view:viewFor(room.game,s.id),connectedIds,ai:aiStatus(room),commerce:commerce.statusFor(room,s),pending:s.id===room.game.hostId?room.sessions.filter(p=>p.status==='pending').map(p=>({id:p.id,name:p.name})):[]};
 }
 function publish(room,memorySnapshot=null){
  for(const [res,id] of streams.get(room.code)||[]){
   const s=room.sessions.find(x=>x.id===id);if(!s)continue;
   try{res.write('data: '+JSON.stringify({...safeState(room,s),...(s.status==='active'&&memorySnapshot?{memorySnapshot:visibleSnapshot(memorySnapshot,s)}:{})})+'\n\n');if(!['active','pending'].includes(s.status)){res.end();streams.get(room.code)?.delete(res);}}catch{res.destroy();}
  }
 }
 function closeStreams(code){for(const [res] of streams.get(code)||[]){try{res.write('event: expired\ndata: {}\n\n');res.end();}catch{res.destroy();}}streams.delete(code);}
 function visibleSnapshot(snapshot,s){
  const hidden=new Set(s.hiddenPhotoIds||[]);
  return {...snapshot,book:{...snapshot.book,entries:snapshot.book.entries.filter(e=>!hidden.has(e.photoId))},images:Object.fromEntries(Object.entries(snapshot.images).filter(([id])=>!hidden.has(id))),missing:snapshot.missing.filter(id=>!hidden.has(id))};
 }
 async function memorySnapshotFor(room){
  const entries=(room.memories||[]).filter(e=>{
   if(e.media&&e.media!=='photo')return room.sessions.some(s=>s.id===e.authorId&&s.status==='active');
   const photo=room.photos[e.photoId];
   return photo?.allowKeepsake===true&&!photo.deleting&&room.sessions.some(s=>s.id===photo.ownerId&&s.status==='active');
  });
  if(!entries.length)return null;
  const images={},missing=[];
  for(const entry of entries){
   if(entry.media&&entry.media!=='photo')continue;
   try{const bytes=await fs.readFile(mediaOf(room.code,entry.photoId));images[entry.photoId]='data:image/jpeg;base64,'+bytes.toString('base64');}
   catch{missing.push(entry.photoId);}
  }
  return {createdAt:room.createdAt,book:buildMemoryBook({title:room.title,date:new Date(room.createdAt).toLocaleDateString('ko-KR',{timeZone:'UTC'}),view:viewFor(room.game,room.game.hostId),entries,sample:false}),images,missing};
 }
 async function deletePhotos(room){
  // Phase is saved before this function; a failed delete never restores access.
  await fs.rm(path.join(roomsDir,room.code,'media'),{recursive:true,force:true});
  room.photos={};room.memories=[];room.deletion='done';room.game.questions={};await save(room);
 }
 async function expire(room){
  cancelAi(room.code);
  closeStreams(room.code);
  room.game={...room.game,phase:'finished',questions:{},answers:{},endReason:'expired'};room.memories=[];room.deletion='pending';
  await save(room);
  try{await fs.rm(path.join(roomsDir,room.code),{recursive:true,force:true});}catch{/* Cleanup loop retries; reads remain denied by expiresAt. */}
 }
 async function load(code){
  let room;try{room=JSON.parse(await fs.readFile(fileOf(code),'utf8'));}catch(e){if(e.code==='ENOENT')throw new ApiError(404,'방을 찾을 수 없어요. 코드를 확인해 주세요.');throw e;}
  if(room.expiresAt<=Date.now()){await expire(room);throw new ApiError(410,'모임이 만료됐어요. 새 모임을 만들어 주세요.');}
  if(room.game.phase==='question'&&room.roundDeadlineAt&&gameNow()>=room.roundDeadlineAt){
   room.game=applyAction(room.game,room.game.hostId,{type:'reveal',confirmed:true,round:room.game.round});room.roundDeadlineAt=null;
   const entry=captureMemory(viewFor(room.game,room.game.hostId),room.game.questions[room.game.order[room.game.round]]?.allowKeepsake===true);if(entry)room.memories=[...(room.memories||[]).filter(e=>e.round!==entry.round),entry];
   await save(room);publish(room);
  }
  // A crashed request is never retried automatically; it may already have cost money.
  let repaired=false;
  for(const [id,entry] of Object.entries(room.aiUsage?.requests||{}))if(entry.status==='pending'&&!aiFlights.has(aiKey(code,id))){entry.status='interrupted';repaired=true;}
  if(repaired)await save(room);
  return room;
 }
 async function locked(code,fn){
  const previous=locks.get(code)||Promise.resolve();let release;
  const gate=new Promise(r=>{release=r;});const current=previous.catch(()=>{}).then(()=>gate);locks.set(code,current);
  await previous.catch(()=>{});
  try{return await fn();}finally{release();if(locks.get(code)===current)locks.delete(code);}
 }
 async function dropPhoto(room,id){
  if(!room.photos[id])return;
  room.photos[id].deleting=true;await save(room); // Deny reads before touching the filesystem.
  try{await fs.rm(mediaOf(room.code,id),{force:true});delete room.photos[id];await save(room);}catch{/* Sweep retries; reads stay denied. */}
 }
 async function removeMember(room,id,status){
  cancelAi(room.code,id);
  room.sessions.find(s=>s.id===id).status=status;
  const oldRound=room.game.round;
  room.game=removeParticipant(room.game,id);
  room.memories=(room.memories||[]).filter(e=>e.authorId!==id);
  if(room.game.round!==oldRound)room.roundDeadlineAt=room.timeLimitSeconds?gameNow()+room.timeLimitSeconds*1000:null;
  if(room.game.phase!=='question')room.roundDeadlineAt=null;
  if(room.game.phase==='reveal'){
   const q=room.game.questions[room.game.order[room.game.round]],entry=captureMemory(viewFor(room.game,room.game.hostId),q?.allowKeepsake===true);
   if(entry)room.memories=[...room.memories.filter(e=>e.round!==entry.round),entry];
  }
  for(const photo of Object.values(room.photos))if(photo.ownerId===id)photo.deleting=true;
  await save(room);
  for(const [photoId,photo] of Object.entries(room.photos))if(photo.ownerId===id)await dropPhoto(room,photoId);
 }
 async function sweep(){
  for(const item of await fs.readdir(roomsDir,{withFileTypes:true})){
   if(!item.isDirectory()||!validCode(item.name))continue;
   await locked(item.name,async()=>{
    try{const r=await load(item.name);for(const [id,p] of Object.entries(r.photos))if(p.deleting)await dropPhoto(r,id);if(r.game.phase==='finished'&&r.deletion==='pending'){await deletePhotos(r);publish(r);}}catch(e){if(!(e instanceof ApiError))console.error('Room cleanup will retry.');}
   });
  }
 }
 async function aiDraft(req,res,code){
  limit(req,'ai-draft',12);
  let input;try{input=validateDraftInput(await jsonBody(req));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,error.message);}
  const prepared=await locked(code,async()=>{
   const room=await load(code),s=activeSession(room,req);
   check(room.game.phase==='lobby',409,'대기방에서만 초안을 만들 수 있어요.');
   check(ai,503,'AI 연결 준비 중이에요. 직접 출제는 무료로 이용할 수 있어요.');
   const id=hash(s.id+'|'+input.requestId),key=aiKey(code,id),inputHash=hash(JSON.stringify(input));
   room.aiUsage||={successes:0,requests:{}};
   const old=room.aiUsage.requests[id];
   if(old){
    check(old.inputHash===inputHash,409,'같은 요청으로 다른 내용을 보낼 수 없어요. 새 초안 요청을 시작해 주세요.');
    const cached=aiCache.get(key);if(cached){check(!old.creditReservation||ledger.replayAllowed(old.creditReservation),409,'이 초안의 이용권 권한이 만료되거나 회수됐어요.');return {cached:{status:200,data:{draft:cached.draft,remaining:aiStatus(room).remaining,revision:room.revision,requestId:input.requestId}}};}
    const flight=aiFlights.get(key);if(flight)return {flight,leader:false};
    throw new ApiError(409,'이 요청은 이미 처리됐거나 중단됐어요. 다시 호출하지 않았어요. 직접 작성하거나 새 초안을 요청해 주세요.');
   }
   check(aiStatus(room).remaining>0,429,'이 모임의 AI 초안 허용 횟수를 다 썼어요. 직접 출제는 계속 이용할 수 있어요.');
   const creditReservation=commerce.usesCredits?commerce.reserveAi(room,s,id,inputHash):null;
   let reserved;try{reserved=await aiBudget.reserve();}catch{if(creditReservation)ledger.releaseAi(creditReservation);throw new ApiError(503,'AI 사용 한도를 확인하지 못했어요. 직접 출제를 이용해 주세요.');}
   if(!reserved&&creditReservation)ledger.releaseAi(creditReservation);
   check(reserved,429,'오늘의 AI 테스트 한도에 도달했어요. 직접 출제를 이용해 주세요.');
   let resolve;const promise=new Promise(r=>{resolve=r;}),control=new AbortController();
   const flight={promise,resolve,control,actorId:s.id,inputHash,creditReservation};aiFlights.set(key,flight);
   room.aiUsage.requests[id]={actorId:s.id,inputHash,status:'pending',...(creditReservation?{creditReservation}:{})};
   try{await save(room);}catch(error){aiFlights.delete(key);if(creditReservation)ledger.releaseAi(creditReservation);throw error;}
   publish(room);return {leader:true,flight,id,key};
  });
  if(prepared.cached)return respond(res,prepared.cached.status,prepared.cached.data);
  if(prepared.leader){
   const {flight,id,key}=prepared;
   // Keep game actions available while the external request is pending.
   const run=async()=>{
    let draft=null;
    const timeout=setTimeout(()=>flight.control.abort(),Math.min(ai.timeoutMs||18000,18000));
    try{
     const interrupted=new Promise((_,reject)=>{if(flight.control.signal.aborted)reject(new Error('Interrupted'));else flight.control.signal.addEventListener('abort',()=>reject(new Error('Interrupted')),{once:true});});
     const output=await Promise.race([Promise.resolve().then(()=>{if(flight.control.signal.aborted)throw new Error('Interrupted');return ai.generate(input,{signal:flight.control.signal});}),interrupted]);
     draft=assembleDraft(output,input,randomInt(4));
    }catch{/* Provider errors can contain private inputs: never log or forward them. */}
    finally{clearTimeout(timeout);}
    try{return await locked(code,async()=>{
     const room=await load(code),s=room.sessions.find(x=>x.id===flight.actorId);
     const eligible=s?.status==='active'&&room.game.phase==='lobby';let allowed=eligible&&!flight.control.signal.aborted;
     const entry=room.aiUsage?.requests[id];
     allowed=allowed&&entry?.status==='pending';
     if(entry){entry.status=draft&&allowed?'succeeded':'failed';if(draft&&allowed)room.aiUsage.successes++;await save(room);}
     if(draft&&allowed&&flight.creditReservation&&!ledger.commitAi(flight.creditReservation)){
      allowed=false;entry.status='failed';room.aiUsage.successes--;await save(room);
     }
     if((!draft||!allowed)&&flight.creditReservation)ledger.releaseAi(flight.creditReservation);
     if(draft&&allowed){aiCache.set(key,{draft,actorId:flight.actorId});publish(room);return {status:200,data:{draft,remaining:aiStatus(room).remaining,revision:room.revision,requestId:input.requestId}};}
     publish(room);return {status:eligible?502:409,data:{error:eligible?'초안을 만들지 못했어요. 허용 횟수는 차감하지 않았어요. 직접 작성하거나 새 초안을 요청해 주세요.':'모임 상태가 바뀌어 초안을 받지 않았어요. 허용 횟수는 차감하지 않았어요.'}};
    });}catch{if(flight.creditReservation)ledger.releaseAi(flight.creditReservation);return {status:410,data:{error:'이 모임의 초안을 더 이상 받을 수 없어요.'}};}
   };
   run().then(result=>{aiFlights.delete(key);flight.resolve(result);},()=>{aiFlights.delete(key);flight.resolve({status:503,data:{error:'AI 초안을 처리하지 못했어요. 직접 출제를 이용해 주세요.'}});});
  }
  const result=await prepared.flight.promise;return respond(res,result.status,result.data);
 }
 const server=createServer(async(req,res)=>{
  try{
   const expectedOrigin=originFor(req);const u=new URL(req.url,expectedOrigin);const method=req.method;
   const origin=req.headers.origin;
   const allowedOrigin=origin===expectedOrigin||frontendOrigins.has(origin);
   if(origin&&allowedOrigin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(origin&&!allowedOrigin)throw new ApiError(403,'허용되지 않은 사이트예요.');
   if(method==='OPTIONS'){
    check(allowedOrigin,403,'허용되지 않은 사이트예요.');
    const requested=(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
    check(requested.every(x=>['authorization','content-type','x-photo-consent'].includes(x)),403,'허용되지 않은 헤더예요.');
    return respond(res,204,Buffer.alloc(0),{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Photo-Consent','Access-Control-Max-Age':'600'});
   }
   if(!['GET','HEAD'].includes(method))check(allowedOrigin,403,'다른 사이트에서 보낸 요청은 처리할 수 없어요.');
   if(u.pathname==='/api/health'&&method==='GET')return respond(res,200,{ok:true,version:'0.3.3',multiQuestionsSupported:true,textQuestionsSupported:false,photoOnlyPolicy:true,partyMissionsSupported:true,timedModesSupported:true,aiEnabled:!!ai,paymentsEnabled:false,commerceMode:commerce.usesCredits?'fixture':'preview',storage:'private-server-files',deployment:'single-instance'});
   if(u.pathname==='/api/commerce/catalog'&&method==='GET')return respond(res,200,options.commerceFixture?commerce.catalog:releaseCatalog);
   if(u.pathname.startsWith('/api/account/')){
    const accountToken=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    limit(req,'account',40);
    if(u.pathname==='/api/account/config'&&method==='GET')return respond(res,200,accounts.config());
    if(u.pathname==='/api/account/challenge'&&method==='POST'){limit(req,'account-sign-in',10);return respond(res,200,accounts.challenge());}
    if(u.pathname==='/api/account/google'&&method==='POST'){limit(req,'account-verify',10);return respond(res,200,await accounts.signIn(await jsonBody(req)));}
    if(u.pathname==='/api/account/me'&&method==='GET')return respond(res,200,accounts.me(accountToken));
    if(u.pathname==='/api/account/logout'&&method==='POST')return respond(res,200,accounts.logout(accountToken));
    if(u.pathname==='/api/account/delete'&&method==='POST')return respond(res,200,accounts.delete(accountToken,await jsonBody(req)));
    throw new ApiError(404,'계정 요청 주소를 확인해 주세요.');
   }
   if(u.pathname==='/api/rooms'&&method==='POST'){
    limit(req,'create',10,3_600_000);const b=await jsonBody(req);
    check(nameValid(b.nickname),400,'닉네임을 1~16자로 적어 주세요.');
    check(b.consent===true,400,'사진 공유와 이용 안내를 확인해 주세요.');
    check(b.title===undefined||(typeof b.title==='string'&&b.title.length<=40),400,'모임 이름은 40자 이내로 적어 주세요.');
    check((await fs.readdir(roomsDir)).length<(options.maxRooms||100),503,'현재 모임이 가득 찼어요. 잠시 뒤 다시 시도해 주세요.');
    const mode=b.mode||'memory';check(['memory','battle','party','family'].includes(mode),400,'모드를 확인해 주세요.');
    const seconds=mode==='family'?0:(b.timeLimitSeconds??20);check(mode==='family'||[10,20,30].includes(seconds),400,'10초·20초·30초 중 골라 주세요.');
    if(b.familyScoring!==undefined)check(typeof b.familyScoring==='boolean',400,'점수 설정을 확인해 주세요.');
    if(b.partyMissions!==undefined)check(typeof b.partyMissions==='boolean',400,'파티 미션 설정을 확인해 주세요.');
    const code=roomCode(),secret=token(),id=randomUUID();
    const room={code,title:(b.title||'우리의 추억 모임').trim()||'우리의 추억 모임',timeLimitSeconds:seconds,createdAt:Date.now(),expiresAt:Date.now()+ttl,sessions:[{id,name:b.nickname.trim(),tokenHash:hash(secret),status:'active',termsVersion:b.termsVersion==='2026-10-15'?b.termsVersion:null}],photos:{},memories:[],deletion:'not-needed',reports:[],game:setup([{id,name:b.nickname.trim(),score:0}],{mode,partyMissions:b.partyMissions===true,scoring:mode!=='family'||b.familyScoring===true})};
    await fs.mkdir(path.join(roomsDir,code),{recursive:false,mode:0o700});await save(room);
    return respond(res,201,{...safeState(room,room.sessions[0]),sessionToken:secret},{'Set-Cookie':cookie(code,secret)});
   }
   const m=u.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})\/(join|state|events|action|upload|approve|deny|kick|leave|ai-draft|benefits|verify-purchase|photo\/([a-f0-9-]{36}))$/);
   if(m){
    const [,code,route,photoId]=m;
    if(route==='ai-draft'){check(method==='POST',405,'지원하지 않는 요청이에요.');return await aiDraft(req,res,code);}
    return await locked(code,async()=>{
     const room=await load(code);
     if(route==='join'&&method==='POST'){
      limit(req,'join',20);const b=await jsonBody(req);const old=sessionFor(room,req);
      if(old){check(!['blocked','kicked','left'].includes(old.status),403,'이 모임에 참여할 수 없어요.');return respond(res,200,safeState(room,old));}
      check(room.game.phase==='lobby',409,'이미 시작한 모임이에요. 다음 모임에 참여해 주세요.');
      check(nameValid(b.nickname)&&b.consent===true,400,'닉네임과 이용 동의를 확인해 주세요.');
      check(room.sessions.filter(s=>s.status==='pending').length<8,409,'입장 대기 인원이 가득 찼어요.');
      check(room.sessions.length<40,429,'입장 요청 한도에 도달했어요. 새 방을 만들어 주세요.');
      check(!room.sessions.some(s=>['active','pending'].includes(s.status)&&s.name.normalize('NFC')===b.nickname.trim().normalize('NFC')),409,'같은 닉네임이 있어요. 다른 이름을 적어 주세요.');
      const secret=token(),s={id:randomUUID(),name:b.nickname.trim(),tokenHash:hash(secret),status:'pending',termsVersion:b.termsVersion==='2026-10-15'?b.termsVersion:null};room.sessions.push(s);await save(room);publish(room);
      return respond(res,200,{...safeState(room,s),sessionToken:secret},{'Set-Cookie':cookie(code,secret)});
     }
     const sess=sessionFor(room,req);check(sess,401,'방 코드와 닉네임으로 먼저 입장해 주세요.');
     if(route==='state'&&method==='GET')return respond(res,200,safeState(room,sess));
     if(route==='events'&&method==='GET'){
      check(['active','pending'].includes(sess.status),403,'이 모임에 참여할 수 없어요.');
      const bucket=streams.get(code)||new Map();
      check([...bucket.values()].filter(id=>id===sess.id).length<5,429,'같은 방을 연 창이 너무 많아요.');
      res.writeHead(200,{...commonHeaders,'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 1500\n\n');
      bucket.set(res,sess.id);streams.set(code,bucket);publish(room);
      req.on('close',()=>{bucket.delete(res);if(!bucket.size)streams.delete(code);locked(code,async()=>{try{publish(await load(code));}catch{}}).catch(()=>{});});
      return;
     }
     const s=activeSession(room,req);
     if(route==='benefits'&&method==='GET')return respond(res,200,commerce.statusFor(room,s));
     if(route==='verify-purchase'&&method==='POST'){
      limit(req,'purchase-check',6);const body=await jsonBody(req);
      await commerce.verifyPurchase(room,s,body);await save(room);publish(room);
      return respond(res,200,{...safeState(room,s),testOnly:true});
     }
     if(route.startsWith('photo/')&&method==='GET'){
      check(room.game.phase!=='finished'&&room.deletion!=='pending',410,'이 사진은 더 이상 볼 수 없어요.');
      const photo=room.photos[photoId],q=room.game.questions[room.game.order[room.game.round]];
      check(photo&&!photo.deleting&&!(s.hiddenPhotoIds||[]).includes(photoId)&&(photo.ownerId===s.id||q?.photoId===photoId),403,'지금 볼 수 있는 사진이 아니에요.');
      const bytes=await fs.readFile(mediaOf(code,photoId));return respond(res,200,bytes,{'Content-Type':'image/jpeg','Content-Disposition':'inline'});
     }
     check(method==='POST',405,'지원하지 않는 요청이에요.');limit(req,'write',80);
     if(route==='upload'){
      check(room.game.phase==='lobby',409,'대기방에서 사진을 준비해 주세요.');
      check(questionLimitFor(room.game,s.id)!==0,403,'추억 배틀은 방장만 사진을 올릴 수 있어요.');
      check(req.headers['content-type']==='image/jpeg',415,'JPG 사진을 사용해 주세요.');
      check(req.headers['x-photo-consent']==='yes',400,'사진 속 사람들의 공유 동의를 확인해 주세요.');
      let photo;try{photo=sanitizeJpeg(await readBody(req,900_000));}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(400,e.message);}
      const inUse=new Set(Object.values(room.game.questions).filter(q=>q.authorId===s.id).map(q=>q.photoId));
      for(const [old,p] of Object.entries(room.photos))if(p.ownerId===s.id&&!inUse.has(old)){await dropPhoto(room,old);}
      const photoLimit=questionLimitFor(room.game,s.id);check(photoLimit===null||Object.values(room.photos).filter(p=>p.ownerId===s.id).length<photoLimit+1,409,'한 사람당 사진은 최대 5장이에요. 먼저 기존 문제를 수정하거나 삭제해 주세요.');
      const id=randomUUID();await fs.mkdir(path.join(roomsDir,code,'media'),{recursive:true,mode:0o700});await fs.writeFile(mediaOf(code,id),photo.bytes,{mode:0o600});
      room.photos[id]={ownerId:s.id,width:photo.width,height:photo.height};room.deletion='stored';await save(room);
      return respond(res,201,{photoId:id,width:photo.width,height:photo.height});
     }
     const b=await jsonBody(req);
     if(['approve','deny','kick'].includes(route)){
      check(s.id===room.game.hostId&&(route==='kick'?room.game.phase!=='finished':room.game.phase==='lobby'),403,'방장만 참가자를 관리할 수 있어요.');
      if(route==='kick')check(b.confirmed===true&&(b.gameNumber??0)===(room.gameNumber||0),409,'강퇴할 참가자와 최종 확인을 선택해 주세요.');
      const person=room.sessions.find(x=>x.id===b.playerId);
      check(person&&person.id!==s.id,400,'참가자를 확인해 주세요.');
      if(route==='approve'){
       check(person.status==='pending',409,'이미 처리한 요청이에요.');check(room.game.players.length<meta.maxPlayers,409,'최대 10명까지 참여할 수 있어요.');
       person.status='active';room.game={...room.game,players:[...room.game.players,{id:person.id,name:person.name,score:0}]};
      }else if(route==='deny'){check(person.status==='pending',409,'이미 처리한 요청이에요.');person.status='blocked';}
      else{check(person.status==='active',409,'참가자를 확인해 주세요.');await removeMember(room,person.id,'kicked');}
      const snapshot=room.game.phase==='finished'&&room.game.endReason==='completed'?await memorySnapshotFor(room):null;
      if(room.game.phase==='finished'){room.deletion='pending';room.memories=[];await save(room);try{await deletePhotos(room);}catch{/* Sweep retries with access already denied. */}}
      await save(room);publish(room,snapshot);return respond(res,200,{...safeState(room,s),...(snapshot?{memorySnapshot:visibleSnapshot(snapshot,s)}:{})});
     }
     if(route==='leave'){
      check(s.id!==room.game.hostId,400,'방장은 모임 종료 버튼을 이용해 주세요.');
      check(room.game.phase==='lobby',409,'게임 중에는 창을 닫았다가 같은 주소로 다시 연결할 수 있어요.');
      await removeMember(room,s.id,'left');await save(room);publish(room);return respond(res,200,{left:true});
     }
     check(route==='action',404,'지원하지 않는 요청이에요.');
     check((b.gameNumber??0)===(room.gameNumber||0),409,'새 게임이 시작됐어요. 현재 화면에서 다시 시도해 주세요.');
     if(b.type==='rematch'){
      check(s.id===room.game.hostId&&room.game.phase==='finished'&&room.game.endReason==='completed'&&b.confirmed===true,409,'방장만 완료한 게임에서 다시 시작할 수 있어요.');
      check(room.deletion==='done',409,'사진 삭제가 끝나면 다시 시작할 수 있어요.');
      check(room.game.players.length>=2,409,'참가자 두 명 이상이 필요해요.');
      room.game=setup(room.game.players,{mode:room.game.mode,partyMissions:room.game.partyMissions,scoring:room.game.scoring});room.roundDeadlineAt=null;room.gameNumber=(room.gameNumber||0)+1;room.deletion='not-needed';room.memories=[];room.photos={};await save(room);publish(room);return respond(res,200,safeState(room,s));
     }
     check(!(b.type==='reveal'&&room.roundDeadlineAt),409,'모두 답하거나 제한 시간이 끝나면 정답을 공개해요.');
     const valid=validateAction(room.game,s.id,b);check(valid.ok,409,valid.error);
     if(b.type==='submitQuestion'&&b.photoId){check(room.photos[b.photoId]?.ownerId===s.id&&!room.photos[b.photoId]?.deleting,403,'본인이 올린 사진으로 출제해 주세요.');room.photos[b.photoId].allowKeepsake=b.allowKeepsake===true;}
     if(b.type==='start')check(!room.sessions.some(p=>p.status==='pending'),409,'입장 요청을 먼저 승인하거나 거절해 주세요.');
     if(['report','hidePhoto'].includes(b.type)){
      const q=room.game.questions[room.game.order[room.game.round]];
      if(b.type==='report'){
       room.reports||=[];
       if(!room.reports.some(r=>r.reporterId===s.id&&r.photoId===q.photoId))room.reports.push({id:randomUUID(),reporterId:s.id,authorId:q.authorId,questionId:q.questionId,photoId:q.photoId,reason:b.reason,at:Date.now()});
      }
      const hidden=new Set(s.hiddenPhotoIds||[]);if(b.type==='report'||b.hidden)hidden.add(q.photoId);else hidden.delete(q.photoId);s.hiddenPhotoIds=[...hidden];
      await save(room);publish(room);return respond(res,200,{...safeState(room,s),...(b.type==='report'?{reportReceived:true}:{})});
     }
     const editedKey=questionKey(s.id,b.slot||0),oldPhoto=room.game.questions[editedKey]?.photoId;
     const serverPoints=pointsForTime(room.roundDeadlineAt,room.timeLimitSeconds,gameNow());
     room.game=applyAction(room.game,s.id,{...b,serverPoints});
     if(['start','next'].includes(b.type))room.roundDeadlineAt=room.game.phase==='question'&&room.timeLimitSeconds?gameNow()+room.timeLimitSeconds*1000:null;
     if(room.game.phase!=='question')room.roundDeadlineAt=null;
     if(room.game.phase!=='lobby')cancelAi(room.code);
     if(room.game.phase==='reveal'&&room.game.questions[room.game.order[room.game.round]]?.allowKeepsake===true){
      const entry=captureMemory(viewFor(room.game,s.id),true);
      if(entry)room.memories=[...(room.memories||[]).filter(e=>e.round!==entry.round),entry];
     }
     // The final allowed snapshot is transient: never written to disk or replayed.
     const memorySnapshot=room.game.phase==='finished'&&room.game.endReason==='completed'?await memorySnapshotFor(room):null;
     if(room.game.phase==='finished'){room.deletion='pending';room.memories=[];}
     await save(room);
     if(['submitQuestion','removeQuestion'].includes(b.type)&&oldPhoto&&oldPhoto!==room.game.questions[editedKey]?.photoId&&!Object.values(room.game.questions).some(q=>q.photoId===oldPhoto)){await dropPhoto(room,oldPhoto);}
     if(room.game.phase==='finished'){try{await deletePhotos(room);}catch{room.deletion='pending';await save(room);}}
     publish(room,memorySnapshot);return respond(res,200,{...safeState(room,s),...(memorySnapshot?{memorySnapshot:visibleSnapshot(memorySnapshot,s)}:{})});
    });
   }
   if(u.pathname.startsWith('/api/'))throw new ApiError(404,'방 주소를 확인해 주세요.');
   check(method==='GET'||method==='HEAD',405,'지원하지 않는 요청이에요.');
   if(u.pathname==='/')return respond(res,302,Buffer.alloc(0),{Location:'/geuttae-uri/'});
   check(u.pathname.startsWith('/geuttae-uri/'),404,'찾을 수 없는 파일이에요.');
   let filename=u.pathname==='/geuttae-uri/'?'index.html':decodeURIComponent(u.pathname.slice('/geuttae-uri/'.length));
   check(filename==='index.html'||['boot-v1.js','boot-v2.js','boot-v3.js','shell-v1.css','version.json','runtime-config.json','manifest.webmanifest'].includes(filename)||/^assets\/[a-z0-9.-]+$/.test(filename)||/^releases\/[0-9a-z.-]+\/(client.js|logic.js|memory.js|draft.js|products.js|ads.js|platform.js|locale.js|en.js|book-viewer.js|vendor\/html2canvas.js|style.css)$/.test(filename),404,'찾을 수 없는 파일이에요.');
   let file=path.resolve(publicDir,filename);
   check(file.startsWith(publicDir+path.sep),404,'찾을 수 없는 파일이에요.');
   const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
   const contentType=types[path.extname(file)];check(contentType,404,'찾을 수 없는 파일이에요.');
   let bytes;try{bytes=await fs.readFile(file);}catch{throw new ApiError(404,'찾을 수 없는 파일이에요.');}
   if(filename==='runtime-config.json')bytes=Buffer.from(JSON.stringify({apiBase:expectedOrigin}));
   if(method==='HEAD'){res.writeHead(200,{...commonHeaders,'Content-Type':contentType,'Content-Length':bytes.length});res.end();return;}
   return respond(res,200,bytes,{'Content-Type':contentType});
  }catch(e){
   if(!(e instanceof ApiError)&&!(e instanceof CommerceError)&&!(e instanceof AccountError))console.error('Request failed safely; no photo or request content logged.');
   if(res.headersSent){res.end();return;}
   respond(res,e instanceof ApiError||e instanceof CommerceError||e instanceof AccountError?e.status:500,{error:e instanceof ApiError||e instanceof CommerceError||e instanceof AccountError?e.message:'처리 중 문제가 생겼어요. 다시 시도해 주세요.'});
  }
 });
 server.requestTimeout=30_000;server.headersTimeout=15_000;server.keepAliveTimeout=5_000;
 const cleanup=setInterval(()=>sweep().catch(()=>console.error('Cleanup will retry.')),options.cleanupEveryMs??30_000);cleanup.unref();
 const roundClock=setInterval(()=>{for(const code of streams.keys())locked(code,()=>load(code)).catch(()=>{});},1000);roundClock.unref();
 const heartbeat=setInterval(()=>{for(const bucket of streams.values())for(const [res] of bucket){try{res.write(': connected\n\n');}catch{res.destroy();}}},15_000);heartbeat.unref();
 await sweep();
 return {server,dataDir,sweep,commerce,async close(){clearInterval(roundClock);clearInterval(cleanup);clearInterval(heartbeat);const pending=[...aiFlights.values()];for(const flight of pending)flight.control.abort();await Promise.all(pending.map(x=>x.promise));aiCache.clear();for(const code of streams.keys())closeStreams(code);server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));accounts.close();ledger.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const app=await createApp();const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 app.server.listen(port,host,()=>{
  console.log(`\n그때 우리 v0.3.3 — http://localhost:${port}/geuttae-uri/`);
  if(host==='0.0.0.0')for(const addresses of Object.values(safeInterfaces()))for(const a of addresses||[])if(a.family==='IPv4'&&!a.internal)console.log(`같은 Wi-Fi 휴대폰: http://${a.address}:${port}/geuttae-uri/`);
  if(!process.env.PUBLIC_ORIGIN)console.log('로컬 테스트용 HTTP입니다. 민감한 사진은 사용하지 마세요.');
  console.log('종료: Ctrl+C\n');
 });
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
