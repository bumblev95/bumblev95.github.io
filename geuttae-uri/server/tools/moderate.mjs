import {pathToFileURL} from 'node:url';
import path from 'node:path';

// Operator-only machine client. Credentials are read from the process environment,
// never from command arguments, URL parameters, browser storage or repo files.
export async function moderate(args,env=process.env,request=fetch){
 const origin=env.MODERATION_API_ORIGIN||'';
 let url;try{url=new URL(origin);}catch{throw new Error('Set MODERATION_API_ORIGIN to the exact HTTPS API origin.');}
 if(url.origin!==origin||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('HTTPS is required except for a loopback fixture.');
 const key=env.MODERATION_TOKEN;
 if(!/^[a-f0-9]{64}$/.test(key||''))throw new Error('Set MODERATION_TOKEN using the operator secret manager.');
 const [command,id,value]=args;
 let route,body;
 if(command==='list'&&args.length<=3){route='/api/moderation/reports';body={status:id||'open',offset:value===undefined?0:Number(value)};}
 else if(command==='show'&&args.length===2)route='/api/moderation/reports/'+id;
 else if(['review','dismiss','resolve','remove_photo','remove_player','close_room'].includes(command)&&args.length===4&&args[3]==='--confirm'){
  route='/api/moderation/reports/'+id+'/review';body={action:command,expectedVersion:Number(value),confirmed:true};
 }else throw new Error('Usage: list [open|all|status] [offset] | show REPORT_ID | review|dismiss|resolve|remove_photo|remove_player|close_room REPORT_ID VERSION --confirm');
 if(id&&command!=='list'&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id))throw new Error('Invalid report ID.');
 const res=await request(origin+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15_000)});
 if(!res.ok)throw new Error(`Moderation request failed (${res.status}). Re-read the report before retrying.`);
 return res.json();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await moderate(process.argv.slice(2)),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
