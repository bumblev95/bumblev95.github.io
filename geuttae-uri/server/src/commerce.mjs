import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {catalog,productFor} from '../../releases/0.3.3/products.js';

const digest=s=>createHash('sha256').update(s).digest('hex');
const certified=new WeakSet();
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(s);
const scope=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const identifier=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/.test(s);
const time=n=>Number.isSafeInteger(n)&&n>=0;
export class CommerceError extends Error{
  constructor(code,message,status=409){super(message);this.code=code;this.status=status;}
}
const require=(ok,code,message,status)=>{if(!ok)throw new CommerceError(code,message,status);};
const providerValid=p=>['apple','google','fixture'].includes(p);
function canonicalPurchase(value){
  require(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_RECEIPT','구매 확인 결과가 올바르지 않아요.',400);
  require(Object.keys(value).every(k=>['provider','transactionId','accountId','productId','purchasedAt','periodStart','periodEnd','subscriptionId','roomScope'].includes(k)),'INVALID_RECEIPT','구매 확인 결과에 허용되지 않은 값이 있어요.',400);
  const product=productFor(value.productId);
  require(product&&providerValid(value.provider)&&identifier(value.transactionId)&&uuid(value.accountId)&&time(value.purchasedAt),'INVALID_RECEIPT','구매 내역과 구매자를 확인하지 못했어요.',400);
  const periodStart=value.periodStart??null,periodEnd=value.periodEnd??null,subscriptionId=value.subscriptionId??null,roomScope=value.roomScope??null;
  if(product.kind==='subscription')require(time(periodStart)&&time(periodEnd)&&periodEnd>periodStart&&identifier(subscriptionId),'INVALID_PERIOD','구독 기간을 확인하지 못했어요.',400);
  else require(periodStart===null&&periodEnd===null&&subscriptionId===null,'INVALID_PERIOD','낱개 이용권에는 구독 기간을 지정할 수 없어요.',400);
  require(product.kind==='book'?scope(roomScope):roomScope===null,'INVALID_SCOPE','추억집 구매는 확인된 모임에만 연결할 수 있어요.',400);
  return {provider:value.provider,transactionId:value.transactionId,accountId:value.accountId,productId:product.id,purchasedAt:value.purchasedAt,periodStart,periodEnd,subscriptionId,roomScope};
}
function canonicalRevocation(value){
  require(value&&Object.keys(value).every(k=>['provider','transactionId','eventId','revokedAt'].includes(k))&&providerValid(value.provider)&&identifier(value.transactionId)&&identifier(value.eventId)&&time(value.revokedAt),'INVALID_REVOCATION','환불 확인 결과가 올바르지 않아요.',400);
  return {provider:value.provider,transactionId:value.transactionId,eventId:value.eventId,revokedAt:value.revokedAt};
}

// Only an injected server adapter can certify a result. A JSON flag cannot do so.
// Real Apple/Google network verification and authenticated accounts are not installed.
export function createReceiptVerifier(adapter){
  require(adapter&&typeof adapter.purchase==='function'&&typeof adapter.revocation==='function','NO_VERIFIER','구매 확인 연결이 필요해요.',503);
  return {
    async purchase(receipt,context){const value=canonicalPurchase(await adapter.purchase(receipt,context));certified.add(value);return value;},
    async revocation(notification){const value=canonicalRevocation(await adapter.revocation(notification));certified.add(value);return value;}
  };
}
function certification(value){require(certified.has(value),'UNVERIFIED','서버에서 확인되지 않은 구매는 반영할 수 없어요.',403);require(value.provider!=='fixture'||process.env.NODE_ENV!=='production','FIXTURE_PRODUCTION','실제 서버에서 모의 구매를 반영할 수 없어요.',503);}
export function roomScopeFor(room){return digest(room.code+'|'+room.createdAt);}

export async function openCommerceLedger(filename,{now=()=>Date.now()}={}){
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  await fs.writeFile(filename,'',{flag:'wx',mode:0o600}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const info=await fs.lstat(filename);require(info.isFile()&&!info.isSymbolicLink(),'INVALID_STORAGE','이용권 저장소를 확인하지 못했어요.',503);
  await fs.chmod(filename,0o600);
  const db=new DatabaseSync(filename,{enableForeignKeyConstraints:true,enableDoubleQuotedStringLiterals:false,allowExtension:false});
  try{
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    require(version===0||version===1,'SCHEMA_VERSION','지원하지 않는 이용권 기록 버전이에요.',503);
    if(version===0){db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE purchases (
        id TEXT PRIMARY KEY, provider TEXT NOT NULL, transaction_id TEXT NOT NULL,
        account_id TEXT NOT NULL, product_id TEXT NOT NULL, purchased_at INTEGER NOT NULL,
        period_start INTEGER, period_end INTEGER, subscription_id TEXT, room_scope TEXT,
        payload_hash TEXT NOT NULL, revoked_at INTEGER,
        UNIQUE(provider,transaction_id)
      ) STRICT;
      CREATE UNIQUE INDEX subscription_period ON purchases(provider,subscription_id,period_start) WHERE product_id='ultimate_monthly';
      CREATE INDEX purchases_owner ON purchases(account_id,product_id);
      CREATE INDEX purchases_room ON purchases(room_scope,product_id);
      CREATE TABLE subscription_owners (
        provider TEXT NOT NULL, subscription_id TEXT NOT NULL, account_id TEXT NOT NULL,
        PRIMARY KEY(provider,subscription_id)
      ) STRICT;
      CREATE TABLE credit_lots (
        id TEXT PRIMARY KEY REFERENCES purchases(id), account_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('subscription','pack')),
        quantity INTEGER NOT NULL CHECK(quantity>0), starts_at INTEGER NOT NULL,
        expires_at INTEGER
      ) STRICT;
      CREATE INDEX credit_owner ON credit_lots(account_id,starts_at,expires_at);
      CREATE TABLE ai_uses (
        request_id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, account_id TEXT NOT NULL,
        room_scope TEXT NOT NULL, lot_id TEXT NOT NULL REFERENCES credit_lots(id),
        state TEXT NOT NULL CHECK(state IN ('pending','committed','cancelled')),
        created_at INTEGER NOT NULL, settled_at INTEGER
      ) STRICT;
      CREATE INDEX uses_lot_state ON ai_uses(lot_id,state);
      CREATE TABLE revocations (
        provider TEXT NOT NULL, transaction_id TEXT NOT NULL, revoked_at INTEGER NOT NULL,
        PRIMARY KEY(provider,transaction_id)
      ) STRICT;
      CREATE TABLE refund_events (
        id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL
      ) STRICT;
      PRAGMA user_version=1;
      COMMIT;`);}
    for(const suffix of ['','-wal','-shm'])await fs.chmod(filename+suffix,0o600).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }catch(error){db.close();throw error;}
  let closed=false;
  const all=(sql,...args)=>db.prepare(sql).all(...args),get=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
  function eligibleLots(accountId){
    if(!uuid(accountId))return [];
    const at=now();
    const current=get(`SELECT l.id FROM credit_lots l JOIN purchases p ON p.id=l.id
      WHERE l.account_id=? AND l.source='subscription' AND l.starts_at<=? AND l.expires_at>?
      ORDER BY l.starts_at DESC,p.purchased_at DESC,l.id LIMIT 1`,accountId,at,at);
    const lots=all(`SELECT l.*,p.purchased_at, l.quantity-(SELECT COUNT(*) FROM ai_uses u WHERE u.lot_id=l.id AND u.state IN ('pending','committed')) AS remaining
      FROM credit_lots l JOIN purchases p ON p.id=l.id
      WHERE l.account_id=? AND p.revoked_at IS NULL AND l.starts_at<=? AND (l.expires_at IS NULL OR l.expires_at>?)
      ORDER BY CASE WHEN l.source='subscription' THEN 0 ELSE 1 END,l.starts_at DESC,p.purchased_at DESC,l.id`,accountId,at,at);
    // One current subscription cycle: overlapping or early renewals never add rollover.
    return lots.filter(l=>l.source!=='subscription'||l.id===current?.id);
  }
  function balance(accountId){
    const lots=eligibleLots(accountId),subscription=lots.filter(l=>l.source==='subscription').reduce((n,l)=>n+Math.max(0,l.remaining),0),pack=lots.filter(l=>l.source==='pack').reduce((n,l)=>n+Math.max(0,l.remaining),0);
    return {subscription,pack,total:subscription+pack};
  }
  function activeUltimate(accountId){return eligibleLots(accountId).some(l=>l.source==='subscription');}
  function entitledToBook(roomScope,hostAccountId){
    return !!get("SELECT 1 FROM purchases WHERE product_id='memory_book' AND room_scope=? AND revoked_at IS NULL",roomScope)||activeUltimate(hostAccountId);
  }
  function adFree(accountId){return activeUltimate(accountId)||!!get("SELECT 1 FROM purchases WHERE account_id=? AND product_id='ad_free' AND revoked_at IS NULL",accountId||'');}
  function replayAllowed(requestId){
    const use=get('SELECT * FROM ai_uses WHERE request_id=?',requestId);
    return !!use&&use.state==='committed'&&eligibleLots(use.account_id).some(l=>l.id===use.lot_id);
  }
  const ledger={
    filename,balance,activeUltimate,entitledToBook,adFree,replayAllowed,
    applyPurchase(value){certification(value);return transaction(()=>{
      const key=digest(value.provider+'|'+value.transactionId),payloadHash=digest(JSON.stringify(value)),old=get('SELECT * FROM purchases WHERE id=?',key);
      if(old){require(old.payload_hash===payloadHash,'DUPLICATE_CONFLICT','이미 확인한 구매의 구매자나 내용이 달라요.');return {duplicate:true,revoked:old.revoked_at!==null};}
      if(value.subscriptionId){
        const owner=get('SELECT account_id FROM subscription_owners WHERE provider=? AND subscription_id=?',value.provider,value.subscriptionId);
        require(!owner||owner.account_id===value.accountId,'OWNER_MISMATCH','이 구독의 구매자가 달라요.',403);
        run('INSERT OR IGNORE INTO subscription_owners(provider,subscription_id,account_id) VALUES (?,?,?)',value.provider,value.subscriptionId,value.accountId);
        require(!get('SELECT 1 FROM purchases WHERE provider=? AND subscription_id=? AND period_start=?',value.provider,value.subscriptionId,value.periodStart),'DUPLICATE_PERIOD','이 구독 기간의 이용권은 이미 반영했어요.');
      }
      const revoked=get('SELECT revoked_at FROM revocations WHERE provider=? AND transaction_id=?',value.provider,value.transactionId)?.revoked_at??null;
      run('INSERT INTO purchases VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',key,value.provider,value.transactionId,value.accountId,value.productId,value.purchasedAt,value.periodStart,value.periodEnd,value.subscriptionId,value.roomScope,payloadHash,revoked);
      const product=productFor(value.productId);
      if(product.credits)run('INSERT INTO credit_lots VALUES (?,?,?,?,?,?)',key,value.accountId,product.kind==='subscription'?'subscription':'pack',product.credits,value.periodStart??value.purchasedAt,value.periodEnd);
      return {duplicate:false,revoked:revoked!==null};
    });},
    applyRevocation(value){certification(value);return transaction(()=>{
      const id=digest(value.provider+'|'+value.eventId),payloadHash=digest(JSON.stringify(value)),old=get('SELECT payload_hash FROM refund_events WHERE id=?',id);
      if(old){require(old.payload_hash===payloadHash,'DUPLICATE_CONFLICT','이미 처리한 환불 확인 내용이 달라요.');return {duplicate:true};}
      run('INSERT INTO refund_events VALUES (?,?)',id,payloadHash);
      run('INSERT INTO revocations VALUES (?,?,?) ON CONFLICT(provider,transaction_id) DO UPDATE SET revoked_at=MIN(revoked_at,excluded.revoked_at)',value.provider,value.transactionId,value.revokedAt);
      run('UPDATE purchases SET revoked_at=? WHERE provider=? AND transaction_id=?',value.revokedAt,value.provider,value.transactionId);
      run("UPDATE ai_uses SET state='cancelled',settled_at=? WHERE state='pending' AND lot_id IN (SELECT id FROM purchases WHERE provider=? AND transaction_id=?)",now(),value.provider,value.transactionId);
      return {duplicate:false};
    });},
    reserveAi({requestId,inputHash,accountId,roomScope}){
      require(scope(requestId)&&scope(inputHash)&&uuid(accountId)&&scope(roomScope),'INVALID_USE','이용권 요청을 확인하지 못했어요.',400);
      return transaction(()=>{
        const old=get('SELECT * FROM ai_uses WHERE request_id=?',requestId);
        if(old){require(old.input_hash===inputHash&&old.account_id===accountId&&old.room_scope===roomScope,'DUPLICATE_CONFLICT','같은 요청의 내용이나 모임이 달라요.');return {duplicate:true,state:old.state};}
        const lot=eligibleLots(accountId).find(l=>l.remaining>0);require(lot,'NO_CREDITS','방장의 AI 이용 횟수가 없어요. 직접 출제는 계속 무료예요.',429);
        run("INSERT INTO ai_uses VALUES (?,?,?,?,?,'pending',?,NULL)",requestId,inputHash,accountId,roomScope,lot.id,now());
        return {duplicate:false,state:'pending'};
      });
    },
    commitAi(requestId){return transaction(()=>{
      const use=get('SELECT * FROM ai_uses WHERE request_id=?',requestId);if(!use||use.state==='cancelled')return false;
      if(use.state==='committed')return replayAllowed(requestId);
      const allowed=eligibleLots(use.account_id).some(l=>l.id===use.lot_id);
      run('UPDATE ai_uses SET state=?,settled_at=? WHERE request_id=?',allowed?'committed':'cancelled',now(),requestId);return allowed;
    });},
    releaseAi(requestId){return transaction(()=>{run("UPDATE ai_uses SET state='cancelled',settled_at=? WHERE request_id=? AND state='pending'",now(),requestId);});},
    recoverPending(){return transaction(()=>Number(run("UPDATE ai_uses SET state='cancelled',settled_at=? WHERE state='pending'",now()).changes));},
    stats(){return {purchases:Number(get('SELECT COUNT(*) AS n FROM purchases').n),pending:Number(get("SELECT COUNT(*) AS n FROM ai_uses WHERE state='pending'").n),committed:Number(get("SELECT COUNT(*) AS n FROM ai_uses WHERE state='committed'").n)};},
    close(){if(!closed){db.close();closed=true;}}
  };
  return ledger;
}

export function createCommerce({ledger,verifier=null,resolveAccount=null,fixture=false}={}){
  require(ledger,'NO_LEDGER','이용권 기록 연결이 필요해요.',503);
  // An environment flag cannot turn on a test adapter or a real checkout.
  require(!fixture||process.env.NODE_ENV!=='production','FIXTURE_PRODUCTION','실제 서버에서 모의 구매를 켤 수 없어요.',503);
  require(fixture?verifier&&typeof resolveAccount==='function':!verifier&&!resolveAccount,'LIVE_NOT_IMPLEMENTED','실제 구매 확인과 계정 연결은 아직 준비 중이에요.',503);
  const accountFor=(room,session)=>{if(!fixture||!session)return null;const id=resolveAccount({room,session});require(id===null||uuid(id),'INVALID_ACCOUNT','연결된 구매 계정을 확인하지 못했어요.',403);return id;};
  const hostFor=room=>accountFor(room,room.sessions.find(s=>s.id===room.game.hostId));
  function statusFor(room,session){
    if(!fixture)return {mode:'preview',paymentEnabled:false,accountLinked:false,ownAi:{subscription:0,pack:0,total:0},roomAiRemaining:0,hasBookRight:false,personalAdFree:false,roomAdFree:false,freeExportTrial:true,benefitsConnected:false};
    const owner=accountFor(room,session),host=hostFor(room);
    return {mode:fixture?'fixture':'preview',paymentEnabled:false,accountLinked:!!owner,ownAi:ledger.balance(owner),roomAiRemaining:ledger.balance(host).total,hasBookRight:ledger.entitledToBook(roomScopeFor(room),host),personalAdFree:ledger.adFree(owner),roomAdFree:ledger.activeUltimate(host),freeExportTrial:true,benefitsConnected:false};
  }
  return {catalog,statusFor,usesCredits:fixture,hostFor,ledger,
    async verifyPurchase(room,session,body){
      require(fixture,'PAYMENTS_DISABLED','구매 연결 준비 중이에요. 지금은 결제되지 않아요.',503);
      const accountId=accountFor(room,session);require(accountId,'ACCOUNT_REQUIRED','확인된 구매 계정 연결이 필요해요.',403);
      require(body&&Object.keys(body).length===1&&typeof body.receipt==='string'&&body.receipt.length>0&&body.receipt.length<=6000,'INVALID_REQUEST','구매 확인 요청에는 영수증만 보낼 수 있어요.',400);
      const value=await verifier.purchase(body.receipt,{accountId,roomScope:roomScopeFor(room)});
      require(value.provider==='fixture','FIXTURE_ONLY','이 테스트에서는 실제 구매를 반영하지 않아요.',403);
      require(value.accountId===accountId,'OWNER_MISMATCH','이 영수증의 구매자가 달라요.',403);
      require(value.productId!=='memory_book'||value.roomScope===roomScopeFor(room),'SCOPE_MISMATCH','이 영수증은 다른 모임의 추억집이에요.',403);
      ledger.applyPurchase(value);return statusFor(room,session);
    },
    reserveAi(room,session,id,inputHash){
      const reservationId=digest(roomScopeFor(room)+'|'+session.id+'|'+id);
      const result=ledger.reserveAi({requestId:reservationId,inputHash,accountId:hostFor(room),roomScope:roomScopeFor(room)});
      require(!result.duplicate,'ALREADY_USED','이 이용권 요청은 이미 처리됐거나 중단됐어요. 다시 호출하지 않았어요.');return reservationId;
    },
    async verifiedRefund(notification){require(fixture,'PAYMENTS_DISABLED','환불 확인 연결이 준비 중이에요.',503);const value=await verifier.revocation(notification);require(value.provider==='fixture','FIXTURE_ONLY','실제 구매는 반영하지 않아요.',403);return ledger.applyRevocation(value);}
  };
}
