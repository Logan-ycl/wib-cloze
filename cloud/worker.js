// BriefLab encrypted cloud sync API. The Worker never receives plaintext progress.
// Bind Cloudflare D1 as DB and apply schema.sql before deployment.
const ALLOWED_ORIGIN='https://logan-ycl.github.io';
const LIMIT=1000000;
function cors(origin){return {'Access-Control-Allow-Origin':origin===ALLOWED_ORIGIN?origin:ALLOWED_ORIGIN,'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Cache-Control':'no-store','Vary':'Origin'};}
function reply(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8'}});}
function bytesHex(bytes){return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(origin&&origin!==ALLOWED_ORIGIN)return reply({error:'origin_not_allowed'},403,origin);
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return reply({ok:true,storage:!!env.DB},200,origin);
  const readMatch=/^\/v1\/mistakes\/([A-Za-z0-9_-]{43})$/.exec(url.pathname);
  const isMistakeWrite=url.pathname==='/v1/mistakes'&&request.method==='POST';
  const isState=url.pathname==='/v1/state'&&['GET','PUT','DELETE'].includes(request.method);
  if(!readMatch&&!isMistakeWrite&&!isState)return reply({error:'not_found'},404,origin);
  if(!env.DB)return reply({error:'database_not_configured'},503,origin);
  if(readMatch){
   const readHash=bytesHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('brieflab-mistake-reader-v1:'+readMatch[1])));
   try{
    const reader=await env.DB.prepare('SELECT account_hash FROM mistake_readers WHERE read_hash=?').bind(readHash).first();
    if(!reader)return reply({error:'unknown_read_link'},404,origin);
    const summary=await env.DB.prepare('SELECT item_id AS id, COUNT(*) AS wrong_count, MAX(attempt_date) AS last_wrong FROM mistake_events WHERE account_hash=? GROUP BY item_id ORDER BY last_wrong DESC LIMIT 3000').bind(reader.account_hash).all();
    const events=await env.DB.prepare('SELECT item_id AS id, attempt_date AS date, entered_word AS entered, hint_count AS hints FROM mistake_events WHERE account_hash=? ORDER BY attempt_date DESC LIMIT 300').bind(reader.account_hash).all();
    return reply({schema_version:1,unique_mistakes:(summary.results||[]).length,items:summary.results||[],recent_events:events.results||[]},200,origin);
   }catch(e){console.error('Mistakes read unavailable',e?.name||'unknown');return reply({error:'storage_unavailable'},503,origin)}
  }
  const auth=request.headers.get('Authorization')||'';
  const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(auth);
  if(!match)return reply({error:'invalid_recovery_key'},401,origin);
  const hash=bytesHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('brieflab-account-v1:'+match[1])));
  try {
   if(isMistakeWrite){
    const raw=await request.text();
    if(raw.length>200000)return reply({error:'payload_too_large'},413,origin);
    let body;try{body=JSON.parse(raw)}catch{return reply({error:'invalid_json'},400,origin)}
    const validKey=typeof body?.read_key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(body.read_key);
    const list=body?.events;
    if(!validKey||!Array.isArray(list)||list.length>100)return reply({error:'invalid_payload'},400,origin);
    for(const x of list){
     if(!x||typeof x.attempt_key!=='string'||x.attempt_key.length>200||!x.attempt_key
       ||typeof x.id!=='string'||!/^[A-Za-z0-9_-]{3,140}$/.test(x.id)
       ||typeof x.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)
       ||typeof x.entered!=='string'||x.entered.length>80
       ||!Number.isInteger(x.hints)||x.hints<0||x.hints>100)return reply({error:'invalid_event'},400,origin);
    }
    const readHash=bytesHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('brieflab-mistake-reader-v1:'+body.read_key)));
    await env.DB.prepare('INSERT INTO mistake_readers (account_hash,read_hash) VALUES (?,?) ON CONFLICT(account_hash) DO UPDATE SET read_hash=excluded.read_hash').bind(hash,readHash).run();
    if(list.length){
     const statements=list.map(x=>env.DB.prepare('INSERT OR IGNORE INTO mistake_events (account_hash,attempt_key,item_id,attempt_date,entered_word,hint_count) VALUES (?,?,?,?,?,?)').bind(hash,x.attempt_key,x.id,x.date,x.entered,x.hints));
     await env.DB.batch(statements);
    }
    return reply({ok:true,received:list.length},200,origin);
   }
   if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT revision,blob,updated_at FROM progress WHERE account_hash=?').bind(hash).first();
    return reply(row?{revision:row.revision,blob:JSON.parse(row.blob),updated_at:row.updated_at}:{revision:0,blob:null},200,origin);
   }
   if(request.method==='DELETE'){
    await env.DB.prepare('DELETE FROM progress WHERE account_hash=?').bind(hash).run();
    return reply({deleted:true},200,origin);
   }
   const raw=await request.text();
   if(raw.length>LIMIT)return reply({error:'payload_too_large'},413,origin);
   let body;try{body=JSON.parse(raw)}catch{return reply({error:'invalid_json'},400,origin)}
   if(!body||!Number.isSafeInteger(body.revision)||body.revision<0||typeof body.blob!=='object'||!body.blob
       ||body.blob.v!==1||!(/^[A-Za-z0-9_-]{16}$/.test(body.blob.iv||''))
       ||typeof body.blob.ct!=='string'||!(/^[A-Za-z0-9_-]+$/.test(body.blob.ct))
       ||body.blob.ct.length>LIMIT-100)return reply({error:'invalid_payload'},400,origin);
   const blob=JSON.stringify(body.blob);
   let change;
   if(body.revision===0){
    change=await env.DB.prepare("INSERT OR IGNORE INTO progress (account_hash,revision,blob,updated_at) VALUES (?,1,?,datetime('now'))").bind(hash,blob).run();
   }else{
    change=await env.DB.prepare("UPDATE progress SET revision=revision+1,blob=?,updated_at=datetime('now') WHERE account_hash=? AND revision=?").bind(blob,hash,body.revision).run();
   }
   if((change.meta?.changes||0)!==1)return reply({error:'revision_conflict'},409,origin);
   return reply({revision:body.revision+1,saved:true},200,origin);
  }catch(error){
   console.error('BriefLab storage error:',error?.name||'unknown');
   return reply({error:'storage_unavailable'},503,origin);
  }
 }
};
