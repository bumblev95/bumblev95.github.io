export function roomFromURL(value){
 try{const u=new URL(value);if(u.protocol==='thenus:'&&u.hostname==='room'){const code=u.searchParams.get('code')||'';return /^[A-HJ-NP-Z2-9]{8}$/.test(code)?code:null;}return null;}catch{return null;}
}
