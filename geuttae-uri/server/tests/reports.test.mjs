import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,access,stat,mkdir,symlink} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {openReports,reportOperators,REPORT_RETENTION_MS} from '../src/reports.mjs';
import {moderate} from '../tools/moderate.mjs';
const jpeg=await readFile(new URL('./fixtures/sample.jpg',import.meta.url));
const key=randomBytes(32).toString('hex');
const operators=JSON.stringify([{id:'safety-1',tokenSha256:createHash('sha256').update(key).digest('hex')}]);
async function harness(t,{enabled=true}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'thenus-reports-'));let clock=Date.now(),app,base;
 const options={dataDir:dir,gameClock:()=>100000,reportClock:()=>Math.max(clock,Date.now()),moderationOperators:enabled?operators:'[]',cleanupEveryMs:60_000};
 async function start(){app=await createApp(options);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
 await start();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 async function req(route,{body,secret,headers={},method,raw}={}){
  const r=await fetch(base+route,{method:method||(body!==undefined||raw?'POST':'GET'),headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(raw?{'Content-Type':'image/jpeg','X-Photo-Consent':'yes'}:{}),...(secret?{Authorization:'Bearer '+secret}:{}),...headers},body:raw||(body===undefined?undefined:JSON.stringify(body)),signal:AbortSignal.timeout(5000)});
  return {status:r.status,headers:r.headers,data:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};
 }
 async function create(){const r=await req('/api/rooms',{body:{nickname:'PRIVATE-HOST',consent:true},headers:{Origin:base}});assert.equal(r.status,201);return {code:r.data.code,id:r.data.you,secret:r.data.sessionToken};}
 const call=(p,route,body,extra={})=>req(`/api/rooms/${p.code}/${route}`,{secret:p.secret,...(body===undefined?{}:{body,headers:{Origin:base}}),...extra});
 async function join(host,name='PRIVATE-GUEST',approve=true){const r=await req(`/api/rooms/${host.code}/join`,{body:{nickname:name,consent:true},headers:{Origin:base}});assert.equal(r.status,200);const p={code:host.code,id:r.data.you,secret:r.data.sessionToken};if(approve)assert.equal((await call(host,'approve',{playerId:p.id})).status,200);return p;}
 async function question(p,slot=0){const photo=await call(p,'upload',undefined,{raw:jpeg,headers:{Origin:base}});assert.equal(photo.status,201);const photoId=photo.data.photoId;assert.equal((await call(p,'action',{type:'submitQuestion',slot,photoId,prompt:'PRIVATE-PROMPT',options:['a','b','c','d'],correctIndex:0,story:'PRIVATE-STORY',confirmed:true,allowKeepsake:true})).status,200);return photoId;}
 const admin=(route='',body,extra={})=>req('/api/moderation/reports'+route,{secret:key,...(body===undefined?{}:{body}),...extra});
 const report=(p,target,reason='harassment')=>call(p,'action',{type:'reportPlayer',playerId:target.id,confirmed:true,reason});
 const review=(id,action,expectedVersion=1)=>admin('/'+id+'/review',{action,expectedVersion,confirmed:true});
 return {dir,req,create,call,join,question,admin,report,review,get base(){return base;},get app(){return app;},setClock(n){clock=n;},async restart(){await app.close();await start();}};
}

test('separate operator keys fail closed, revoke and validate configuration',()=>{
 const auth=reportOperators(operators);assert.equal(auth('Bearer '+key),'safety-1');
 for(const value of [undefined,'Bearer abc','Bearer '+randomBytes(32).toString('hex')])assert.throws(()=>auth(value),/MODERATOR_AUTH_REQUIRED/);
 assert.throws(()=>reportOperators('[]')('Bearer '+key),/MODERATION_NOT_CONFIGURED/);
 for(const raw of ['null','{}','broken',JSON.stringify([{id:'bad',tokenSha256:'weak'}]),JSON.stringify(Array(2).fill(JSON.parse(operators)[0]))])assert.throws(()=>reportOperators(raw),/INVALID_MODERATION_CONFIGURATION/);
 for(const id of [undefined,null,1])assert.throws(()=>reportOperators(JSON.stringify([{id,tokenSha256:'a'.repeat(64)}])),/INVALID_MODERATION_CONFIGURATION/);
 const rotated=reportOperators(JSON.stringify([{id:'safety-1',tokenSha256:'a'.repeat(64)}]));assert.throws(()=>rotated('Bearer '+key),/MODERATOR_AUTH_REQUIRED/);
});
test('unauthenticated, room, account-shaped, cookie and browser requests cannot inspect or mutate reports',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),id=(await h.report(b,a)).data.reportId;
 for(const secret of [undefined,a.secret,b.secret,randomBytes(32).toString('hex')]){
  for(const route of ['', '/'+id, '/'+id+'/photo','/'+id+'/review'])assert.equal((await h.req('/api/moderation/reports'+route,{secret,...(route.endsWith('review')?{body:{action:'review',expectedVersion:1,confirmed:true}}:{})})).status,401);
 }
 for(const origin of [h.base,'https://bumblev95.github.io','https://evil.example']){
  const r=await h.admin('',{status:'all'},{headers:{Origin:origin}});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
 }
 assert.equal((await h.req('/api/moderation/reports',{headers:{Cookie:'moderator='+key}})).status,401);
 assert.equal((await h.req('/api/moderation/reports?token='+key,{secret:key})).status,403);
 assert.equal((await h.req('/api/moderation/reports',{method:'OPTIONS',headers:{Origin:h.base}})).status,403);
 assert.equal((await h.admin('/'+randomUUID())).status,404);
 assert.equal((await h.admin('/'+id,undefined,{method:'DELETE'})).status,405);
 for(const p of ['/geuttae-uri/server/data/reports.sqlite','/data/reports.sqlite','/geuttae-uri/server/tools/moderate.mjs'])assert.equal((await h.req(p)).status,404);
 for(const player of [a,b]){const state=JSON.stringify((await h.call(player,'state')).data);assert.ok(!state.includes(id));assert.ok(!state.includes('safety-1'));}
 const r=await h.admin('/'+id);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
});
test('disabled admin still persists reports without pretending a reviewer is configured',async t=>{
 const h=await harness(t,{enabled:false}),a=await h.create(),b=await h.join(a);
 assert.equal((await h.report(b,a)).status,200);assert.equal((await h.admin('',{})).status,503);
});
test('concurrent duplicate reasons and restart yield one receipt; no report copy in room JSON',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);
 const rs=await Promise.all(['harassment','other','privacy'].map(reason=>h.report(b,a,reason)));
 assert.ok(rs.every(r=>r.status===200));assert.equal(new Set(rs.map(r=>r.data.reportId)).size,1);
 const id=rs[0].data.reportId;
 assert.equal((await h.admin('',{})).data.reports.length,1);
 const disk=JSON.parse(await readFile(path.join(h.dir,'rooms',a.code,'room.json'),'utf8'));assert.deepEqual(disk.reports,[]);
 await h.restart();assert.equal((await h.report(b,a)).data.reportId,id);
 const detail=(await h.admin('/'+id)).data;assert.equal(detail.report.status,'received');assert.deepEqual(detail.history,[]);
 const file=await readFile(path.join(h.dir,'reports.sqlite'));
 for(const secret of [a.secret,b.secret,'PRIVATE-HOST','PRIVATE-GUEST','PRIVATE-STORY','PRIVATE-PROMPT',key])assert.ok(!file.includes(Buffer.from(secret)));
 assert.equal((await stat(path.join(h.dir,'reports.sqlite'))).mode&0o777,0o600);
});
test('pending, foreign, spoofed, self and invalid reports have no queue side effects; reports never auto sanction',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),pending=await h.join(a,'PENDING',false),other=await h.create();
 assert.equal((await h.report(pending,a)).status,403);assert.equal((await h.report(b,other)).status,400);
 assert.equal((await h.report(b,b)).status,400);assert.equal((await h.report(b,a,'<script>bad</script>')).status,400);
 assert.equal((await h.call(b,'action',{type:'reportPlayer',playerId:a.id,reason:'privacy',confirmed:false})).status,400);
 const received=await h.call(b,'action',{type:'reportPlayer',playerId:a.id,reason:'privacy',confirmed:true,reporterId:a.id,status:'resolved',at:0});assert.equal(received.status,200);
 const r=(await h.admin('',{})).data.reports[0];assert.equal(r.reporterId,b.id);assert.equal(r.status,'received');
 assert.equal((await h.call(a,'state')).data.access,'active');
});
test('bounded unique-report quota persists across restart; retries do not consume quota',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);let id;
 for(let n=0;n<10;n++){const target=await h.join(a,'TARGET'+n,false); // Trust fixture approval to avoid max active player cap.
  const file=path.join(h.dir,'rooms',a.code,'room.json'),room=JSON.parse(await readFile(file,'utf8'));room.sessions.find(s=>s.id===target.id).status='active';await writeFile(file,JSON.stringify(room));
  const r=await h.report(b,target);assert.equal(r.status,200);id=r.data.reportId;
 }
 await h.restart();assert.equal((await h.report(b,a)).status,429);
 const report=(await h.admin('/'+id)).data.report;const retry=await h.report(b,{id:report.authorId});assert.equal(retry.status,200);assert.equal(retry.data.reportId,id);
 assert.equal((await h.admin('',{})).data.reports.length,10);
});
test('operator workflow requires explicit review, confirmation and current version; audit persists',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),id=(await h.report(b,a)).data.reportId;
 assert.equal((await h.review(id,'remove_player')).status,409);
 assert.equal((await h.admin('/'+id+'/review',{action:'review',expectedVersion:1})).status,400);
 assert.equal((await h.admin('/'+id+'/review',{action:'review',expectedVersion:1,confirmed:true,note:'not retained'})).status,400);
 const pair=await Promise.all([h.review(id,'review'),h.review(id,'review')]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);
 await h.restart();let d=(await h.admin('/'+id)).data;assert.equal(d.report.status,'reviewing');assert.equal(d.history[0].actor,'safety-1');
 assert.equal((await h.review(id,'remove_photo',2)).status,409);
 assert.equal((await h.review(id,'dismiss',1)).status,409);
 assert.equal((await h.review(id,'dismiss',2)).data.report.status,'dismissed');
 assert.equal((await h.review(id,'resolve',3)).status,409);
 assert.equal((await h.admin('',{})).data.reports.length,0);assert.equal((await h.admin('',{status:'dismissed'})).data.reports.length,1);
 for(const filter of [{status:'unknown'},{offset:-1},{offset:0.5},{limit:100000}])assert.equal((await h.admin('',filter)).status,400);
 assert.equal((await h.call(a,'state')).data.access,'active');
});
test('live photo review is scoped, is never archived, and removal denies every participant without changing scores',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),photo=await h.question(a);await h.question(b);await h.call(a,'action',{type:'start'});
 const body={type:'report',round:0,questionId:a.id,reason:'privacy',confirmed:true};
 assert.equal((await h.call(a,'action',body)).status,400);
 const r=await h.call(b,'action',body);assert.equal(r.status,200);const id=r.data.reportId;
 assert.equal((await h.admin('/'+id+'/photo')).status,200);assert.equal((await h.admin('/'+id)).data.live.photoAvailable,true);
 const file=path.join(h.dir,'reports.sqlite');assert.ok(!(await readFile(file)).includes(jpeg));
 assert.equal((await h.review(id,'review')).status,200);assert.equal((await h.review(id,'remove_photo',2)).data.report.status,'resolved');
 await assert.rejects(access(path.join(h.dir,'rooms',a.code,'media',photo+'.jpg')));
 assert.equal((await h.call(a,'photo/'+photo)).status,403);assert.equal((await h.admin('/'+id+'/photo')).status,410);
 const disk=JSON.parse(await readFile(path.join(h.dir,'rooms',a.code,'room.json'),'utf8'));assert.equal(Object.values(disk.game.questions)[0].allowKeepsake,false);
 await h.call(b,'action',{type:'answer',round:0,choice:0});await h.call(a,'action',{type:'next',round:0});await h.call(a,'action',{type:'answer',round:1,choice:0});const end=await h.call(a,'action',{type:'next',round:1});assert.equal(end.data.memorySnapshot?.images[photo],undefined);
});
test('failed file deletion stays denied and auditable; retry can finish after repair',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),photo=await h.question(a);await h.call(a,'action',{type:'start'});
 const id=(await h.call(b,'action',{type:'report',round:0,questionId:a.id,reason:'privacy',confirmed:true})).data.reportId;
 const file=path.join(h.dir,'rooms',a.code,'media',photo+'.jpg');await rm(file);await mkdir(file);await writeFile(path.join(file,'blocked'),'fixture');
 await h.review(id,'review');assert.equal((await h.review(id,'remove_photo',2)).status,503);
 assert.equal((await h.call(a,'photo/'+photo)).status,403);let d=(await h.admin('/'+id)).data;assert.equal(d.report.status,'reviewing');assert.equal(d.history.at(-1).result,'pending');
 await rm(file,{recursive:true});await h.restart();assert.equal((await h.review(id,'remove_photo',3)).status,200);
});
test('operator removal revokes guest sessions and media; host removal closes room and cannot rematch',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),photo=await h.question(b);
 let id=(await h.report(a,b)).data.reportId;await h.review(id,'review');assert.equal((await h.review(id,'remove_player',2)).data.result,'applied');
 assert.equal((await h.call(b,'state')).data.access,'kicked');await assert.rejects(access(path.join(h.dir,'rooms',a.code,'media',photo+'.jpg')));
 const c=await h.join(a,'THIRD');id=(await h.report(c,a)).data.reportId;await h.review(id,'review');assert.equal((await h.review(id,'remove_player',2)).data.result,'host_room_closed');
 assert.equal((await h.call(a,'state')).status,404);await assert.rejects(access(path.join(h.dir,'rooms',a.code)));
});
test('expired rooms/photos still delete within 24h; reports survive then expire exactly 30 days from receipt with history',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),photo=await h.question(a),id=(await h.report(b,a)).data.reportId;
 await h.review(id,'review');const detail=(await h.admin('/'+id)).data,expires=detail.report.expiresAt;
 assert.equal(expires-detail.report.createdAt,REPORT_RETENTION_MS);
 const file=path.join(h.dir,'rooms',a.code,'room.json'),room=JSON.parse(await readFile(file,'utf8'));assert.ok(room.expiresAt-room.createdAt<=24*60*60_000);room.expiresAt=Date.now()-1;await writeFile(file,JSON.stringify(room));await h.app.sweep();
 await assert.rejects(access(path.join(h.dir,'rooms',a.code,'media',photo+'.jpg')));await h.restart();assert.equal((await h.admin('/'+id)).data.live.available,false);
 h.setClock(expires-1);assert.equal((await h.review(id,'close_room',2)).data.result,'room_unavailable');assert.equal((await h.admin('/'+id)).data.report.expiresAt,expires);
 h.setClock(expires);assert.equal((await h.admin('/'+id)).status,404);assert.equal((await h.admin('',{status:'all'})).data.reports.length,0);
 await h.app.sweep();const bytes=await readFile(path.join(h.dir,'reports.sqlite'));assert.ok(!bytes.includes(Buffer.from(id)));assert.ok(!bytes.includes(Buffer.from('safety-1')));
 await h.restart();assert.equal((await h.admin('/'+id)).status,404);
});
test('legacy temporary reports migrate idempotently before room expiry without retaining arbitrary fields',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),file=path.join(h.dir,'rooms',a.code,'room.json'),room=JSON.parse(await readFile(file,'utf8'));
 room.reports=[{id:randomUUID(),kind:'player',reporterId:b.id,authorId:a.id,reason:'privacy',at:room.createdAt,extra:'NEVER-COPY-LEGACY'}];
 room.expiresAt=Date.now()-1;await writeFile(file,JSON.stringify(room));await h.restart();await assert.rejects(access(file));
 const queue=(await h.admin('',{})).data.reports;assert.equal(queue.length,1);assert.equal(queue[0].createdAt,room.createdAt);assert.equal(queue[0].expiresAt,room.createdAt+REPORT_RETENTION_MS);
 assert.ok(!(await readFile(path.join(h.dir,'reports.sqlite'))).includes(Buffer.from('NEVER-COPY-LEGACY')));await h.restart();assert.equal((await h.admin('',{})).data.reports.length,1);
});
test('room code reuse never sanctions new occupants',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),id=(await h.report(b,a)).data.reportId;
 const file=path.join(h.dir,'rooms',a.code,'room.json'),room=JSON.parse(await readFile(file,'utf8'));room.createdAt++;await writeFile(file,JSON.stringify(room));
 await h.review(id,'review');assert.equal((await h.review(id,'close_room',2)).data.result,'room_unavailable');assert.equal((await h.call(a,'state')).status,200);
});
test('operator client exercises authenticated review without credentials in URL; refuses redirects and arbitrary commands',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a),id=(await h.report(b,a)).data.reportId,env={MODERATION_API_ORIGIN:h.base,MODERATION_TOKEN:key};
 assert.equal((await moderate(['list'],env)).reports.length,1);assert.equal((await moderate(['show',id],env)).report.id,id);
 assert.equal((await moderate(['review',id,'1','--confirm'],env)).report.status,'reviewing');assert.equal((await moderate(['resolve',id,'2','--confirm'],env)).report.status,'resolved');
 for(const args of [['remove_player',id,'1'],['show','../secret'],['export',id]])await assert.rejects(moderate(args,env));
 for(const origin of ['http://evil.example','https://example.com/path','https://user:pass@example.com'])await assert.rejects(moderate(['list'],{...env,MODERATION_API_ORIGIN:origin}));
 await moderate(['list'],env,async(url,options)=>{assert.ok(!url.includes(key));assert.equal(options.headers.Origin,undefined);assert.equal(options.redirect,'error');return new Response(JSON.stringify({reports:[]}));});
});
test('storage rejects symlinks; already expired legacy data is never resurrected',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'report-store-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const at=Date.now()-REPORT_RETENTION_MS,store=await openReports(path.join(dir,'reports.sqlite'));t.after(()=>store.close());
 assert.equal(store.receive({room:{code:'ABCDEFGH',createdAt:at},reporterId:randomUUID(),authorId:randomUUID(),kind:'player',reason:'privacy',at,legacy:true}),null);
 assert.equal(store.list({status:'all'}).reports.length,0);
 const target=path.join(dir,'target');await writeFile(target,'do-not-modify');const link=path.join(dir,'linked.sqlite');await symlink(target,link);
 await assert.rejects(openReports(link),/INVALID_REPORT_STORAGE/);assert.equal(await readFile(target,'utf8'),'do-not-modify');
});
test('queue insertion failure never returns a receipt or saves a block; purge failure cannot delay room/media expiry',async t=>{
 const h=await harness(t),a=await h.create(),b=await h.join(a);await h.question(a);
 const db=new DatabaseSync(path.join(h.dir,'reports.sqlite'));t.after(()=>db.close());
 db.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON reports BEGIN SELECT RAISE(ABORT,'fixture'); END;");
 const failed=await h.report(b,a);assert.equal(failed.status,500);assert.equal(failed.data.reportReceived,undefined);assert.deepEqual((await h.call(b,'state')).data.blockedPlayerIds,[]);
 db.exec('DROP TRIGGER fail_insert;');const id=(await h.report(b,a)).data.reportId;
 db.exec("CREATE TRIGGER fail_purge BEFORE DELETE ON reports BEGIN SELECT RAISE(ABORT,'fixture'); END;");
 const expires=(await h.admin('/'+id)).data.report.expiresAt;h.setClock(expires);
 const file=path.join(h.dir,'rooms',a.code,'room.json'),room=JSON.parse(await readFile(file,'utf8'));room.expiresAt=Date.now()-1;await writeFile(file,JSON.stringify(room));
 await h.app.sweep();await assert.rejects(access(path.join(h.dir,'rooms',a.code)));assert.equal((await h.admin('/'+id)).status,404);
 db.exec('DROP TRIGGER fail_purge;');await h.app.sweep();assert.equal(db.prepare('SELECT COUNT(*) n FROM reports').get().n,0);
});
test('bounded queue pagination and room/global capacity reject abuse; receipt TTL never extends on changed reasons',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'report-quota-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'reports.sqlite'),store=await openReports(filename);t.after(()=>store.close());
 const room={code:'ABCDEFGH',createdAt:Date.now()},authorId=randomUUID();
 for(let i=0;i<100;i++)store.receive({room,reporterId:randomUUID(),authorId,kind:'player',reason:'privacy'});
 assert.equal(store.list().reports.length,50);assert.equal(store.list().nextOffset,50);assert.equal(store.list({offset:50}).reports.length,50);assert.equal(store.list({offset:100}).reports.length,0);
 assert.throws(()=>store.receive({room,reporterId:randomUUID(),authorId,kind:'player',reason:'privacy'}),/ROOM_REPORT_LIMIT/);
 const db=new DatabaseSync(filename);t.after(()=>db.close());db.exec('BEGIN');
 const row=db.prepare('SELECT * FROM reports LIMIT 1').get();
 const insert=db.prepare('INSERT INTO reports SELECT ?,room_code,room_created,?,author_id,kind,target,reason,created_at,expires_at,status,version FROM reports WHERE id=?');
 for(let n=100;n<10000;n++)insert.run(randomUUID(),randomUUID(),row.id);db.exec('COMMIT');
 assert.throws(()=>store.receive({room:{code:'BCDEFGHJ',createdAt:room.createdAt},reporterId:randomUUID(),authorId,kind:'player',reason:'privacy'}),/REPORT_QUEUE_FULL/);
 const duplicate=store.receive({room,reporterId:row.reporter_id,authorId,kind:'player',reason:'other'});assert.equal(duplicate.id,row.id);assert.equal(duplicate.expiresAt,row.expires_at);
});
