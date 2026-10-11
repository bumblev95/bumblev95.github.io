import {createServer} from 'node:http';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {networkInterfaces} from 'node:os';
import {meta,setup,validateAction,applyAction,viewFor} from '../../releases/0.3.0/logic.js';
import {sanitizeJpeg} from './media.mjs';

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
 const ttl=options.roomTtlMs??24*60*60*1000;
 check(Number.isFinite(ttl)&&ttl>0&&ttl<=24*60*60*1000,500,'올바르지 않은 방 만료 설정');
 const streams=new Map(),locks=new Map(),rateBuckets=new Map();
 const localHosts=new Set(['localhost','127.0.0.1','[::1]','::1']);
 for(const list of Object.values(safeInterfaces()))for(const net of list||[])localHosts.add(net.address.toLowerCase());
 await fs.mkdir(roomsDir,{recursive:true,mode:0o700});
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
  const base={code:room.code,title:room.title,expiresAt:room.expiresAt,access:s.status,you:s.id,mediaStatus:room.deletion,version:'0.3.0',revision:room.revision};
  if(s.status!=='active')return {...base,nickname:s.name};
  const connectedIds=[...new Set([...(streams.get(room.code)?.values()||[])])];
  return {...base,view:viewFor(room.game,s.id),connectedIds,pending:s.id===room.game.hostId?room.sessions.filter(p=>p.status==='pending').map(p=>({id:p.id,name:p.name})):[]};
 }
 function publish(room){
  for(const [res,id] of streams.get(room.code)||[]){
   const s=room.sessions.find(x=>x.id===id);if(!s)continue;
   try{res.write('data: '+JSON.stringify(safeState(room,s))+'\n\n');if(!['active','pending'].includes(s.status)){res.end();streams.get(room.code)?.delete(res);}}catch{res.destroy();}
  }
 }
 function closeStreams(code){for(const [res] of streams.get(code)||[]){try{res.write('event: expired\ndata: {}\n\n');res.end();}catch{res.destroy();}}streams.delete(code);}
 async function deletePhotos(room){
  // Phase is saved before this function; a failed delete never restores access.
  await fs.rm(path.join(roomsDir,room.code,'media'),{recursive:true,force:true});
  room.photos={};room.deletion='done';room.game.questions={};await save(room);
 }
 async function expire(room){
  closeStreams(room.code);
  room.game={...room.game,phase:'finished',questions:{},answers:{},endReason:'expired'};room.deletion='pending';
  await save(room);
  try{await fs.rm(path.join(roomsDir,room.code),{recursive:true,force:true});}catch{/* Cleanup loop retries; reads remain denied by expiresAt. */}
 }
 async function load(code){
  let room;try{room=JSON.parse(await fs.readFile(fileOf(code),'utf8'));}catch(e){if(e.code==='ENOENT')throw new ApiError(404,'방을 찾을 수 없어요. 코드를 확인해 주세요.');throw e;}
  if(room.expiresAt<=Date.now()){await expire(room);throw new ApiError(410,'모임이 만료됐어요. 새 모임을 만들어 주세요.');}
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
  room.sessions.find(s=>s.id===id).status=status;
  room.game={...room.game,players:room.game.players.filter(p=>p.id!==id),questions:{...room.game.questions}};delete room.game.questions[id];
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
   if(u.pathname==='/api/health'&&method==='GET')return respond(res,200,{ok:true,version:'0.3.0',aiEnabled:false,storage:'private-server-files',deployment:'single-instance'});
   if(u.pathname==='/api/rooms'&&method==='POST'){
    limit(req,'create',10,3_600_000);const b=await jsonBody(req);
    check(nameValid(b.nickname),400,'닉네임을 1~16자로 적어 주세요.');
    check(b.consent===true,400,'사진 공유와 이용 안내를 확인해 주세요.');
    check(b.title===undefined||(typeof b.title==='string'&&b.title.length<=40),400,'모임 이름은 40자 이내로 적어 주세요.');
    check((await fs.readdir(roomsDir)).length<(options.maxRooms||100),503,'현재 모임이 가득 찼어요. 잠시 뒤 다시 시도해 주세요.');
    const code=roomCode(),secret=token(),id=randomUUID();
    const room={code,title:(b.title||'우리의 추억 모임').trim()||'우리의 추억 모임',createdAt:Date.now(),expiresAt:Date.now()+ttl,sessions:[{id,name:b.nickname.trim(),tokenHash:hash(secret),status:'active'}],photos:{},deletion:'not-needed',reports:[],game:setup([{id,name:b.nickname.trim(),score:0}])};
    await fs.mkdir(path.join(roomsDir,code),{recursive:false,mode:0o700});await save(room);
    return respond(res,201,{...safeState(room,room.sessions[0]),sessionToken:secret},{'Set-Cookie':cookie(code,secret)});
   }
   const m=u.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})\/(join|state|events|action|upload|approve|deny|kick|leave|photo\/([a-f0-9-]{36}))$/);
   if(m){
    const [,code,route,photoId]=m;
    return await locked(code,async()=>{
     const room=await load(code);
     if(route==='join'&&method==='POST'){
      limit(req,'join',20);const b=await jsonBody(req);const old=sessionFor(room,req);
      if(old){check(old.status!=='blocked'&&old.status!=='left',403,'이 모임에 참여할 수 없어요.');return respond(res,200,safeState(room,old));}
      check(room.game.phase==='lobby',409,'이미 시작한 모임이에요. 다음 모임에 참여해 주세요.');
      check(nameValid(b.nickname)&&b.consent===true,400,'닉네임과 이용 동의를 확인해 주세요.');
      check(room.sessions.filter(s=>s.status==='pending').length<8,409,'입장 대기 인원이 가득 찼어요.');
      check(room.sessions.length<40,429,'입장 요청 한도에 도달했어요. 새 방을 만들어 주세요.');
      check(!room.sessions.some(s=>['active','pending'].includes(s.status)&&s.name.normalize('NFC')===b.nickname.trim().normalize('NFC')),409,'같은 닉네임이 있어요. 다른 이름을 적어 주세요.');
      const secret=token(),s={id:randomUUID(),name:b.nickname.trim(),tokenHash:hash(secret),status:'pending'};room.sessions.push(s);await save(room);publish(room);
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
     if(route.startsWith('photo/')&&method==='GET'){
      check(room.game.phase!=='finished'&&room.deletion!=='pending',410,'이 사진은 더 이상 볼 수 없어요.');
      const photo=room.photos[photoId],q=room.game.questions[room.game.order[room.game.round]];
      check(photo&&!photo.deleting&&(photo.ownerId===s.id||q?.photoId===photoId),403,'지금 볼 수 있는 사진이 아니에요.');
      const bytes=await fs.readFile(mediaOf(code,photoId));return respond(res,200,bytes,{'Content-Type':'image/jpeg','Content-Disposition':'inline'});
     }
     check(method==='POST',405,'지원하지 않는 요청이에요.');limit(req,'write',80);
     if(route==='upload'){
      check(room.game.phase==='lobby',409,'대기방에서 사진을 준비해 주세요.');
      check(req.headers['content-type']==='image/jpeg',415,'JPG 사진을 사용해 주세요.');
      check(req.headers['x-photo-consent']==='yes',400,'사진 속 사람들의 공유 동의를 확인해 주세요.');
      let photo;try{photo=sanitizeJpeg(await readBody(req,900_000));}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(400,e.message);}
      const current=room.game.questions[s.id]?.photoId;
      for(const [old,p] of Object.entries(room.photos))if(p.ownerId===s.id&&old!==current){await dropPhoto(room,old);}
      const id=randomUUID();await fs.mkdir(path.join(roomsDir,code,'media'),{recursive:true,mode:0o700});await fs.writeFile(mediaOf(code,id),photo.bytes,{mode:0o600});
      room.photos[id]={ownerId:s.id,width:photo.width,height:photo.height};room.deletion='stored';await save(room);
      return respond(res,201,{photoId:id,width:photo.width,height:photo.height});
     }
     const b=await jsonBody(req);
     if(['approve','deny','kick'].includes(route)){
      check(s.id===room.game.hostId&&room.game.phase==='lobby',403,'방장만 대기방에서 참가자를 관리할 수 있어요.');
      const person=room.sessions.find(x=>x.id===b.playerId);
      check(person&&person.id!==s.id,400,'참가자를 확인해 주세요.');
      if(route==='approve'){
       check(person.status==='pending',409,'이미 처리한 요청이에요.');check(room.game.players.length<meta.maxPlayers,409,'최대 8명까지 참여할 수 있어요.');
       person.status='active';room.game={...room.game,players:[...room.game.players,{id:person.id,name:person.name,score:0}]};
      }else if(route==='deny'){check(person.status==='pending',409,'이미 처리한 요청이에요.');person.status='blocked';}
      else{check(person.status==='active',409,'참가자를 확인해 주세요.');await removeMember(room,person.id,'blocked');}
      await save(room);publish(room);return respond(res,200,safeState(room,s));
     }
     if(route==='leave'){
      check(s.id!==room.game.hostId,400,'방장은 모임 종료 버튼을 이용해 주세요.');
      check(room.game.phase==='lobby',409,'게임 중에는 창을 닫았다가 같은 주소로 다시 연결할 수 있어요.');
      await removeMember(room,s.id,'left');await save(room);publish(room);return respond(res,200,{left:true});
     }
     check(route==='action',404,'지원하지 않는 요청이에요.');
     const valid=validateAction(room.game,s.id,b);check(valid.ok,409,valid.error);
     if(b.type==='submitQuestion')check(room.photos[b.photoId]?.ownerId===s.id&&!room.photos[b.photoId]?.deleting,403,'본인이 올린 사진으로 출제해 주세요.');
     if(b.type==='start')check(!room.sessions.some(p=>p.status==='pending'),409,'입장 요청을 먼저 승인하거나 거절해 주세요.');
     if(b.type==='report')room.reports.push({id:randomUUID(),reporterId:s.id,authorId:room.game.order[room.game.round],reason:['privacy','inappropriate','other'].includes(b.reason)?b.reason:'other',at:Date.now()});
     const oldPhoto=room.game.questions[s.id]?.photoId;
     room.game=applyAction(room.game,s.id,b);
     if(room.game.phase==='finished')room.deletion='pending';
     await save(room);
     if(['submitQuestion','removeQuestion'].includes(b.type)&&oldPhoto&&oldPhoto!==room.game.questions[s.id]?.photoId){await dropPhoto(room,oldPhoto);}
     if(room.game.phase==='finished'){try{await deletePhotos(room);}catch{room.deletion='pending';await save(room);}}
     publish(room);return respond(res,200,safeState(room,s));
    });
   }
   if(u.pathname.startsWith('/api/'))throw new ApiError(404,'방 주소를 확인해 주세요.');
   check(method==='GET'||method==='HEAD',405,'지원하지 않는 요청이에요.');
   if(u.pathname==='/')return respond(res,302,Buffer.alloc(0),{Location:'/geuttae-uri/'});
   check(u.pathname.startsWith('/geuttae-uri/'),404,'찾을 수 없는 파일이에요.');
   let filename=u.pathname==='/geuttae-uri/'?'index.html':decodeURIComponent(u.pathname.slice('/geuttae-uri/'.length));
   check(filename==='index.html'||['boot-v1.js','boot-v2.js','shell-v1.css','version.json','runtime-config.json','manifest.webmanifest'].includes(filename)||/^assets\/[a-z0-9.-]+$/.test(filename)||/^releases\/[0-9a-z.-]+\/(client.js|logic.js|style.css)$/.test(filename),404,'찾을 수 없는 파일이에요.');
   let file=path.resolve(publicDir,filename);
   check(file.startsWith(publicDir+path.sep),404,'찾을 수 없는 파일이에요.');
   const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
   const contentType=types[path.extname(file)];check(contentType,404,'찾을 수 없는 파일이에요.');
   let bytes;try{bytes=await fs.readFile(file);}catch{throw new ApiError(404,'찾을 수 없는 파일이에요.');}
   if(filename==='runtime-config.json')bytes=Buffer.from(JSON.stringify({apiBase:expectedOrigin}));
   if(method==='HEAD'){res.writeHead(200,{...commonHeaders,'Content-Type':contentType,'Content-Length':bytes.length});res.end();return;}
   return respond(res,200,bytes,{'Content-Type':contentType});
  }catch(e){
   if(!(e instanceof ApiError))console.error('Request failed safely; no photo or request content logged.');
   if(res.headersSent){res.end();return;}
   respond(res,e instanceof ApiError?e.status:500,{error:e instanceof ApiError?e.message:'처리 중 문제가 생겼어요. 다시 시도해 주세요.'});
  }
 });
 server.requestTimeout=30_000;server.headersTimeout=15_000;server.keepAliveTimeout=5_000;
 const cleanup=setInterval(()=>sweep().catch(()=>console.error('Cleanup will retry.')),options.cleanupEveryMs??30_000);cleanup.unref();
 const heartbeat=setInterval(()=>{for(const bucket of streams.values())for(const [res] of bucket){try{res.write(': connected\n\n');}catch{res.destroy();}}},15_000);heartbeat.unref();
 await sweep();
 return {server,dataDir,sweep,async close(){clearInterval(cleanup);clearInterval(heartbeat);for(const code of streams.keys())closeStreams(code);server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const app=await createApp();const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 app.server.listen(port,host,()=>{
  console.log(`\n그때 우리 v0.3.0 — http://localhost:${port}/geuttae-uri/`);
  if(host==='0.0.0.0')for(const addresses of Object.values(safeInterfaces()))for(const a of addresses||[])if(a.family==='IPv4'&&!a.internal)console.log(`같은 Wi-Fi 휴대폰: http://${a.address}:${port}/geuttae-uri/`);
  if(!process.env.PUBLIC_ORIGIN)console.log('로컬 테스트용 HTTP입니다. 민감한 사진은 사용하지 마세요.');
  console.log('종료: Ctrl+C\n');
 });
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
