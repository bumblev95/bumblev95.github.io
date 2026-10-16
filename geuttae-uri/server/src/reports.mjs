import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import * as fs from 'node:fs/promises';

export const REPORT_RETENTION_MS=30*24*60*60_000;
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(x);
const hash=x=>createHash('sha256').update(x).digest('hex');
const states=['received','reviewing','resolved','dismissed'];
export class ReportError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const require=(ok,message,status)=>{if(!ok)throw new ReportError(message,status);};

// Each human has a separate revocable high-entropy bearer key. Only SHA-256 digests
// belong in server configuration; room/account credentials can never grant this role.
export function reportOperators(raw=process.env.MODERATION_OPERATORS_JSON||'[]'){
 let values;try{values=JSON.parse(raw);}catch{throw new ReportError('INVALID_MODERATION_CONFIGURATION',503);}
 require(Array.isArray(values)&&values.length<=10,'INVALID_MODERATION_CONFIGURATION',503);
 const ids=new Set(),digests=new Set();
 for(const v of values){
  require(v&&Object.keys(v).every(k=>['id','tokenSha256'].includes(k))&&typeof v.id==='string'&&/^[a-z0-9_-]{1,32}$/.test(v.id)&&/^[a-f0-9]{64}$/.test(v.tokenSha256)&&!ids.has(v.id)&&!digests.has(v.tokenSha256),'INVALID_MODERATION_CONFIGURATION',503);
  ids.add(v.id);digests.add(v.tokenSha256);
 }
 return authorization=>{
  require(values.length,'MODERATION_NOT_CONFIGURED',503);
  const key=authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const digest=Buffer.from(hash(key||''),'hex');let actor=null;
  for(const v of values)if(timingSafeEqual(digest,Buffer.from(v.tokenSha256,'hex')))actor=v.id;
  require(key&&actor,'MODERATOR_AUTH_REQUIRED',401);return actor;
 };
}

export async function openReports(filename,{now=Date.now}={}){
 await fs.writeFile(filename,'',{flag:'wx',mode:0o600}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const info=await fs.lstat(filename);require(info.isFile()&&!info.isSymbolicLink(),'INVALID_REPORT_STORAGE',503);
 await fs.chmod(filename,0o600);
 const db=new DatabaseSync(filename,{enableForeignKeyConstraints:true,enableDoubleQuotedStringLiterals:false,allowExtension:false});
 try{
  // DELETE journal avoids long-lived WAL evidence. secure_delete overwrites freed
  // cells in this live DB (not provider snapshots); no photo evidence is ever copied.
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS reports(
    id TEXT PRIMARY KEY,room_code TEXT NOT NULL,room_created INTEGER NOT NULL,
    reporter_id TEXT NOT NULL,author_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('player','photo')),
    target TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','reviewing','resolved','dismissed')),
    version INTEGER NOT NULL DEFAULT 1,UNIQUE(room_code,room_created,reporter_id,kind,target)) STRICT;
   CREATE INDEX IF NOT EXISTS reports_expiry ON reports(expires_at);
   CREATE INDEX IF NOT EXISTS reports_queue ON reports(status,created_at,id);
   CREATE TABLE IF NOT EXISTS report_events(
    report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,version INTEGER NOT NULL,
    actor TEXT NOT NULL,action TEXT NOT NULL,result TEXT NOT NULL,at INTEGER NOT NULL,
    PRIMARY KEY(report_id,version)) STRICT;`);
 }catch(e){db.close();throw e;}
 const publicRow=r=>r&&({id:r.id,roomCode:r.room_code,roomCreatedAt:r.room_created,reporterId:r.reporter_id,authorId:r.author_id,kind:r.kind,targetId:r.target,reason:r.reason,createdAt:r.created_at,expiresAt:r.expires_at,status:r.status,version:r.version});
 function purge(){
  // Foreign-key cascade also removes operator history; review never extends TTL.
  return db.prepare('DELETE FROM reports WHERE expires_at<=?').run(now()).changes;
 }
 function get(id){require(uuid(id),'INVALID_REPORT_ID');const r=db.prepare('SELECT * FROM reports WHERE id=? AND expires_at>?').get(id,now());require(r,'REPORT_NOT_FOUND',404);return publicRow(r);}
 function receive({room,reporterId,authorId,kind,photoId,reason,at=now(),legacy=false}){
  require(/^[A-HJ-NP-Z2-9]{8}$/.test(room.code)&&Number.isSafeInteger(room.createdAt)&&uuid(reporterId)&&uuid(authorId)&&['player','photo'].includes(kind),'INVALID_REPORT');
  require((kind==='player'?['harassment','privacy','inappropriate','other']:['privacy','inappropriate','other']).includes(reason)&&(kind!=='photo'||uuid(photoId)),'INVALID_REPORT');
  require(Number.isSafeInteger(at)&&at>=room.createdAt&&at<=now(),'INVALID_REPORT_TIME');
  if(at+REPORT_RETENTION_MS<=now())return null;
  const target=kind==='photo'?photoId:authorId;
  purge();
  const old=db.prepare('SELECT * FROM reports WHERE room_code=? AND room_created=? AND reporter_id=? AND kind=? AND target=?').get(room.code,room.createdAt,reporterId,kind,target);
  if(old)return publicRow(old);
  if(!legacy){
   require(reporterId!==authorId,'SELF_REPORT_FORBIDDEN');
   require(db.prepare('SELECT COUNT(*) n FROM reports WHERE room_code=? AND room_created=? AND reporter_id=? AND created_at>?').get(room.code,room.createdAt,reporterId,now()-3_600_000).n<10,'REPORT_RATE_LIMIT',429);
   require(db.prepare('SELECT COUNT(*) n FROM reports WHERE room_code=? AND room_created=?').get(room.code,room.createdAt).n<100,'ROOM_REPORT_LIMIT',429);
  }
  require(db.prepare('SELECT COUNT(*) n FROM reports').get().n<10_000,'REPORT_QUEUE_FULL',503);
  const id=randomUUID();
  db.prepare('INSERT INTO reports(id,room_code,room_created,reporter_id,author_id,kind,target,reason,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,room.code,room.createdAt,reporterId,authorId,kind,target,reason,at,at+REPORT_RETENTION_MS);
  return get(id);
 }
 return {
  purge,receive,get,
  list({status='open',offset=0}={}){
   require(status==='open'||status==='all'||states.includes(status),'INVALID_REPORT_STATUS');
   require(Number.isSafeInteger(offset)&&offset>=0&&offset<=10000,'INVALID_OFFSET');
   const rows=db.prepare(`SELECT * FROM reports WHERE expires_at>? ${status==='open'?"AND status IN ('received','reviewing')":status==='all'?'':'AND status=?'} ORDER BY created_at,id LIMIT 50 OFFSET ?`).all(...(status==='open'||status==='all'?[now(),offset]:[now(),status,offset]));
   return {reports:rows.map(publicRow),nextOffset:rows.length===50?offset+50:null,retentionDays:30};
  },
  events(id){get(id);return db.prepare('SELECT version,actor,action,result,at FROM report_events WHERE report_id=? ORDER BY version').all(id);},
  // Called under the same room lock as the associated enforcement. Optimistic
  // versions reject stale approvals and concurrent reviewers, including replays.
  validateReview(id,b){
   require(b&&Object.keys(b).every(k=>['action','expectedVersion','confirmed'].includes(k))&&b.confirmed===true&&Number.isSafeInteger(b.expectedVersion),'CONFIRMED_REVIEW_REQUIRED');
   const r=get(id);require(r.version===b.expectedVersion,'REPORT_VERSION_CONFLICT',409);
   require(!['resolved','dismissed'].includes(r.status),'REPORT_ALREADY_CLOSED',409);
   require(r.status==='received'?b.action==='review':['dismiss','resolve','remove_photo','remove_player','close_room'].includes(b.action),'INVALID_REVIEW_TRANSITION',409);
   require(b.action!=='remove_photo'||r.kind==='photo','PHOTO_REPORT_REQUIRED',409);return r;
  },
  finishReview(id,b,actor,result){
   const r=this.validateReview(id,b),status=result==='pending'||b.action==='review'?'reviewing':b.action==='dismiss'?'dismissed':'resolved';
   require(r.version<100,'REPORT_REVIEW_LIMIT',429);
   db.exec('BEGIN IMMEDIATE');
   try{
    db.prepare('UPDATE reports SET status=?,version=version+1 WHERE id=? AND version=?').run(status,id,r.version);
    db.prepare('INSERT INTO report_events VALUES (?,?,?,?,?,?)').run(id,r.version+1,actor,b.action,result,now());
    db.exec('COMMIT');return get(id);
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  beginEnforcement(id,b,actor){
   const r=this.finishReview(id,b,actor,'pending');
   return r;
  },
  completeEnforcement(id,version,result){
   const r=get(id);require(r.version===version&&r.status==='reviewing','REPORT_VERSION_CONFLICT',409);
   db.exec('BEGIN IMMEDIATE');
   try{
    db.prepare("UPDATE reports SET status='resolved' WHERE id=?").run(id);
    db.prepare('UPDATE report_events SET result=? WHERE report_id=? AND version=?').run(result,id,version);
    db.exec('COMMIT');return get(id);
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  close(){db.close();}
 };
}
