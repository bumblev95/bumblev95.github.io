import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {openPlayBilling} from './play-billing.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('hex');
export class AccountError extends Error {
  constructor(code,status=401){super(code);this.code=code;this.status=status;}
}
const demand=(ok,code,status)=>{if(!ok)throw new AccountError(code,status);};

// Account identity and sessions are separate from anonymous room sessions and purchases.
export async function openAccounts(filename,{clientId=process.env.GOOGLE_WEB_CLIENT_ID||'',now=Date.now,verifyToken,testing=false,billing}={}) {
  demand(!verifyToken||(testing&&process.env.NODE_ENV!=='production'),'TEST_VERIFIER_FORBIDDEN',503);
  demand(!clientId||/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId),'INVALID_GOOGLE_CLIENT',503);
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  await fs.writeFile(filename,'',{flag:'wx',mode:0o600}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  const stat=await fs.lstat(filename);demand(stat.isFile()&&!stat.isSymbolicLink(),'INVALID_ACCOUNT_STORAGE',503);
  await fs.chmod(filename,0o600);
  const db=new DatabaseSync(filename,{enableForeignKeyConstraints:true,allowExtension:false});
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,subject_hash TEXT UNIQUE NOT NULL,email TEXT NOT NULL,created_at INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS account_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS account_challenges(id TEXT PRIMARY KEY,nonce TEXT NOT NULL,expires_at INTEGER NOT NULL) STRICT;`);
  for(const suffix of ['','-wal','-shm'])await fs.chmod(filename+suffix,0o600).catch(e=>{if(e.code!=='ENOENT')throw e;});
  // Anonymous/static preview checks do not install optional server-provider packages.
  const google=clientId&&!verifyToken?new (await import('google-auth-library')).OAuth2Client({clientId,transporterOptions:{timeout:10_000,retry:false}}):null;
  const verify=verifyToken|| (async idToken=>(await google.verifyIdToken({idToken,audience:clientId})).getPayload());
  function cleanup(){db.prepare('DELETE FROM account_challenges WHERE expires_at<=?').run(now());db.prepare('DELETE FROM account_sessions WHERE expires_at<=?').run(now());}
  function current(token){
    demand(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'SIGN_IN_REQUIRED');
    cleanup();const row=db.prepare('SELECT a.id,a.email,a.subject_hash,s.created_at FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token),now());
    demand(row,'SIGN_IN_REQUIRED');return row;
  }
  const publicAccount=row=>({id:row.id,email:row.email});
  let play;try{play=await openPlayBilling(db,current,{now,...billing});}catch(error){db.close();throw error;}
  return {
    billing:play,
    config(){return {enabled:!!clientId,provider:'google',clientId:clientId||null,paymentsEnabled:false};},
    challenge(){
      demand(clientId,'SIGN_IN_NOT_CONFIGURED',503);cleanup();
      demand(db.prepare('SELECT COUNT(*) AS n FROM account_challenges').get().n<1000,'TRY_LATER',429);
      const id=secret(),nonce=secret(),expiresAt=now()+5*60_000;
      db.prepare('INSERT INTO account_challenges VALUES (?,?,?)').run(hash(id),nonce,expiresAt);
      return {challenge:id,nonce,clientId,expiresAt};
    },
    async signIn({challenge,idToken}={}){
      demand(clientId,'SIGN_IN_NOT_CONFIGURED',503);
      demand(typeof challenge==='string'&&/^[a-f0-9]{64}$/.test(challenge)&&typeof idToken==='string'&&idToken.length>0&&idToken.length<=7000,'INVALID_SIGN_IN',400);
      const pending=db.prepare('DELETE FROM account_challenges WHERE id=? AND expires_at>? RETURNING nonce').get(hash(challenge),now());
      demand(pending,'SIGN_IN_EXPIRED');
      let claims;try{claims=await verify(idToken);}catch{throw new AccountError('GOOGLE_VERIFICATION_FAILED');}
      // The Google library checks signature/issuer/audience/expiry; repeat claim guards for test adapters.
      demand(claims&&claims.aud===clientId&&['accounts.google.com','https://accounts.google.com'].includes(claims.iss)&&Number.isFinite(claims.exp)&&claims.exp*1000>now()&&claims.nonce===pending.nonce,'GOOGLE_VERIFICATION_FAILED');
      demand(typeof claims.sub==='string'&&claims.sub.length>0&&claims.sub.length<=255&&claims.email_verified===true&&typeof claims.email==='string'&&claims.email.length<=254,'GOOGLE_VERIFICATION_FAILED');
      const subject=hash('google|'+claims.sub),token=secret(),createdAt=now(),expiresAt=createdAt+30*24*60*60_000;
      db.exec('BEGIN IMMEDIATE');
      try{
        let account=db.prepare('SELECT id,email FROM accounts WHERE subject_hash=?').get(subject);
        if(!account){account={id:randomUUID(),email:claims.email};db.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run(account.id,subject,account.email,createdAt);}
        else {account.email=claims.email;db.prepare('UPDATE accounts SET email=? WHERE id=?').run(account.email,account.id);}
        db.prepare('INSERT INTO account_sessions VALUES (?,?,?,?)').run(hash(token),account.id,createdAt,expiresAt);
        // Bound persistent sessions even when a user repeatedly signs in on many devices.
        db.prepare('DELETE FROM account_sessions WHERE account_id=? AND token_hash NOT IN (SELECT token_hash FROM account_sessions WHERE account_id=? ORDER BY created_at DESC,rowid DESC LIMIT 10)').run(account.id,account.id);
        db.exec('COMMIT');return {account:publicAccount(account),token,expiresAt,paymentsEnabled:false};
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    me(token){return {account:publicAccount(current(token)),paymentsEnabled:false};},
    logout(token){current(token);db.prepare('DELETE FROM account_sessions WHERE token_hash=?').run(hash(token));return {signedOut:true};},
    delete(token,{confirmed}={}){
      const account=current(token);demand(confirmed===true,'DELETE_CONFIRMATION_REQUIRED',400);
      demand(now()-account.created_at<5*60_000,'REAUTHENTICATE_TO_DELETE',403);
      db.prepare('DELETE FROM accounts WHERE id=?').run(account.id);
      // Checkpoint removes obsolete WAL frames from the live DB; provider backups have separate retention.
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');return {deleted:true};
    },
    close(){db.close();}
  };
}
