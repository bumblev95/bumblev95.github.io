import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';

export const AD_FREE_PRODUCT='thenus_remove_ads';
export class BillingError extends Error {
  constructor(code,status=503){super(code);this.status=status;}
}
const demand=(value,code,status)=>{if(!value)throw new BillingError(code,status);};
const hash=value=>createHash('sha256').update(value).digest('hex');

/** Non-consumable only. No client price, order ID or entitlement flag is trusted. */
export async function openPlayBilling(db,identity,{now=Date.now,enabled=process.env.GOOGLE_PLAY_BILLING_ENABLED==='true',packageName=process.env.GOOGLE_PLAY_PACKAGE_NAME||'com.bumblevai.thenus',keyHex=process.env.GOOGLE_PLAY_TOKEN_KEY||'',credentialsJSON=process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON||'',provider,testing=false}={}) {
  demand(!provider||(testing&&process.env.NODE_ENV!=='production'),'TEST_BILLING_PROVIDER_FORBIDDEN');
  demand(['com.bumblevai.thenus','com.bumblevai.thenus.test'].includes(packageName),'INVALID_PLAY_PACKAGE');
  // Partial configuration stays disabled and cannot start a checkout.
  const configured=enabled&&/^[a-f0-9]{64}$/.test(keyHex)&&!!(provider||credentialsJSON);
  const key=configured?Buffer.from(keyHex,'hex'):null;
  db.exec(`CREATE TABLE IF NOT EXISTS play_purchases(
    token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    encrypted_token TEXT NOT NULL,package_name TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('verifying','active','revoked')),
    checked_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS play_account ON play_purchases(account_id);`);
  if(configured&&!provider){
    let credentials;try{credentials=JSON.parse(credentialsJSON);}catch{throw new BillingError('INVALID_PLAY_CREDENTIALS');}
    demand(credentials.type==='service_account'&&typeof credentials.client_email==='string'&&typeof credentials.private_key==='string','INVALID_PLAY_CREDENTIALS');
    const {GoogleAuth}=await import('google-auth-library');
    const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/androidpublisher']});
    const base='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+encodeURIComponent(packageName)+'/purchases/products/'+AD_FREE_PRODUCT+'/tokens/';
    const request=async(token,ack=false)=>{
      try{return (await (await auth.getClient()).request({url:base+encodeURIComponent(token)+(ack?':acknowledge':''),method:ack?'POST':'GET',...(ack?{data:{}}:{}),timeout:10_000,retry:false})).data;}
      catch(error){const status=error.response?.status;throw new BillingError([400,404,410].includes(status)?'PURCHASE_NOT_FOUND':'BILLING_UNAVAILABLE',[400,404,410].includes(status)?400:503);}
    };
    provider={get:token=>request(token),acknowledge:token=>request(token,true)};
  }
  const seal=token=>{
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
    return Buffer.concat([iv,cipher.update(token,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
  };
  const unseal=value=>{const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('utf8');};
  const accountKey=account=>hash('thenus-play-v1|'+account.subject_hash);
  const flights=new Map();
  async function verify(session,purchaseToken){
    const account=identity(session);demand(configured,'BILLING_NOT_CONFIGURED');
    demand(typeof purchaseToken==='string'&&purchaseToken.length>0&&purchaseToken.length<=2048&&!/[\s\x00-\x1f]/.test(purchaseToken),'INVALID_PURCHASE',400);
    const tokenHash=hash(purchaseToken),flightKey=account.id+'|'+tokenHash;
    const existing=db.prepare('SELECT account_id,package_name FROM play_purchases WHERE token_hash=?').get(tokenHash);
    demand(!existing||(existing.account_id===account.id&&existing.package_name===packageName),'PURCHASE_ACCOUNT_MISMATCH',409);
    demand(existing||db.prepare('SELECT COUNT(*) AS n FROM play_purchases WHERE account_id=?').get(account.id).n<10,'PURCHASE_LIMIT',429);
    if(flights.has(flightKey))return flights.get(flightKey);
    const work=(async()=>{
      let purchase;
      try{purchase=await provider.get(purchaseToken);}catch(error){
        if(error instanceof BillingError&&error.message==='PURCHASE_NOT_FOUND')db.prepare("UPDATE play_purchases SET state='revoked',checked_at=? WHERE token_hash=? AND account_id=?").run(now(),tokenHash,account.id);
        throw new BillingError(error instanceof BillingError?error.message:'BILLING_UNAVAILABLE',error instanceof BillingError?error.status:503);
      }
      identity(session); // Sign-out/deletion during Google I/O cannot grant access.
      demand(purchase.obfuscatedExternalAccountId===accountKey(account),'PURCHASE_ACCOUNT_MISMATCH',409);
      demand(!purchase.productId||purchase.productId===AD_FREE_PRODUCT,'INVALID_PURCHASE',400);
      if(purchase.purchaseState!==0||purchase.consumptionState!==0||(purchase.quantity??1)!==1||purchase.refundableQuantity===0){
        db.prepare("UPDATE play_purchases SET state='revoked',checked_at=? WHERE token_hash=? AND account_id=?").run(now(),tokenHash,account.id);
        throw new BillingError(purchase.purchaseState===2?'PURCHASE_PENDING':'PURCHASE_REVOKED',409);
      }
      demand([0,1].includes(purchase.acknowledgementState),'INVALID_PURCHASE',400);
      demand(existing||db.prepare('SELECT COUNT(*) AS n FROM play_purchases WHERE account_id=?').get(account.id).n<10,'PURCHASE_LIMIT',429);
      // Persist a recoverable verification intent before acknowledgement; never consume ad removal.
      db.prepare(`INSERT INTO play_purchases VALUES (?,?,?,?,'verifying',?) ON CONFLICT(token_hash) DO UPDATE SET encrypted_token=excluded.encrypted_token,state='verifying',checked_at=excluded.checked_at WHERE account_id=excluded.account_id`).run(tokenHash,account.id,seal(purchaseToken),packageName,now());
      if(purchase.acknowledgementState===0){try{await provider.acknowledge(purchaseToken);}catch{throw new BillingError('PURCHASE_VERIFY_RETRY');}}
      identity(session);
      db.prepare("UPDATE play_purchases SET state='active',checked_at=? WHERE token_hash=? AND account_id=?").run(now(),tokenHash,account.id);
      return {adFree:true};
    })();
    flights.set(flightKey,work);try{return await work;}finally{flights.delete(flightKey);}
  }
  async function status(session){
    const account=identity(session),base={enabled:configured,productId:AD_FREE_PRODUCT,packageName,adFree:false};
    if(!configured)return base;
    const rows=db.prepare("SELECT encrypted_token FROM play_purchases WHERE account_id=? AND package_name=? AND state!='revoked' LIMIT 10").all(account.id,packageName);
    // Revalidate on every entitlement check, including refund/revoke checks before advertising.
    for(const row of rows){
      let token;try{token=unseal(row.encrypted_token);}catch{throw new BillingError('BILLING_UNAVAILABLE');}
      try{await verify(session,token);base.adFree=true;}
      catch(error){if(!['PURCHASE_NOT_FOUND','PURCHASE_REVOKED','PURCHASE_PENDING'].includes(error.message))throw error;}
    }
    identity(session);return base;
  }
  return {
    status,verify,
    async context(session){const state=await status(session);demand(configured,'BILLING_NOT_CONFIGURED');return {...state,obfuscatedAccountId:accountKey(identity(session))};}
  };
}
