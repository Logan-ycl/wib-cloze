(()=>{'use strict';
const GUEST=new URLSearchParams(location.search).get('guest')==='1';
const STORAGE='brieflab-progress-v1', WORK='brieflab-working-v1', TOKEN='brieflab-cloud-key-v1';
const API=String(window.BRIEFLAB_CLOUD_API||'').replace(/\/$/,'');
const panel=document.getElementById('cloud-backup');
if(!panel||GUEST){if(panel)panel.hidden=true;return;}
const status=document.getElementById('cloud-status');
const controls=document.getElementById('cloud-controls');
const quickStatus=document.getElementById('cloud-quick-status');
const setStatus=(s)=>{
 status.textContent=s;
 if(quickStatus)quickStatus.textContent=s.startsWith('云端已同步')?'云端已同步 ✓':
  s.startsWith('正在')||s.includes('准备同步')?'云端同步中…':
  s.includes('同步暂不可用')?'云同步失败，已保存在本机':
  s.includes('未关联')||s.includes('首次使用')?'仅本机保存':
  s.startsWith('本机已保存')?'本机已保存，等待上传':s;
};
let token=localStorage.getItem(TOKEN)||'';
let busy=false, queued=false, timer=null, lastMistakeSignature='';
const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch{return fallback;}};
const clone=(v)=>JSON.parse(JSON.stringify(v));
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
function mergeRecord(a,b){
 if(!a)return clone(b);if(!b)return clone(a);
 const h=new Map();
 for(const x of [...(a.history||[]),...(b.history||[])]){
  const id=x.attemptId||('old:'+JSON.stringify([x.date,x.answer,x.correct,x.hintCount]));
  if(!h.has(id)||(!h.get(id).at&&x.at))h.set(id,x);
 }
 const history=[...h.values()].sort((x,y)=>String(x.at||x.date).localeCompare(String(y.at||y.date))).slice(-50);
 const recent=String(a.lastReviewedAt||a.lastReviewed||'')>=String(b.lastReviewedAt||b.lastReviewed||'')?a:b;
 const earlier=recent===a?b:a;
 const due=Object.prototype.hasOwnProperty.call(recent,'nextDue')?recent.nextDue:(earlier.nextDue||null);
 const correctFromHistory=history.filter(x=>x.correct&&(x.hintCount||0)<=2).length;
 return {...earlier,...recent,history,
  attempts:Math.max(a.attempts||0,b.attempts||0,history.length),
  correct:Math.max(a.correct||0,b.correct||0,correctFromHistory),
  wrongCount:Math.max(a.wrongCount||0,b.wrongCount||0,history.filter(x=>!x.correct).length),
  hintAssisted:Math.max(a.hintAssisted||0,b.hintAssisted||0,history.filter(x=>x.correct&&x.hintCount>0).length),
  nextDue:due};
}
// A passage may be opened on both devices. Merge each blank independently:
// a later navigation event must never overwrite an answer typed elsewhere.
function mergeStudyEntry(x,y){
 const left=x||{},right=y||{};
 const answers={},hints={},feedback={},fieldUpdatedAt={};
 const ids=new Set([
  ...Object.keys(left.answers||{}),...Object.keys(right.answers||{}),
  ...Object.keys(left.feedback||{}),...Object.keys(right.feedback||{}),
  ...Object.keys(left.hints||{}),...Object.keys(right.hints||{}),
  ...Object.keys(left.fieldUpdatedAt||{}),...Object.keys(right.fieldUpdatedAt||{})
 ]);
 const owns=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key);
 const stamp=(obj,id)=>String(obj.fieldUpdatedAt?.[id]||obj.updatedAt||'');
 for(const id of ids){
  const hasLeft=owns(left.answers,id)||owns(left.feedback,id);
  const hasRight=owns(right.answers,id)||owns(right.feedback,id);
  const checkedLeft=owns(left.feedback,id),checkedRight=owns(right.feedback,id);
  let chosen;
  if(checkedLeft!==checkedRight)chosen=checkedLeft?left:right;
  else if(!hasLeft)chosen=right;
  else if(!hasRight)chosen=left;
  else {
   const t1=stamp(left,id),t2=stamp(right,id);
   if(t1!==t2)chosen=t1>t2?left:right;
   else {
    // Deterministic tie-breaker so both devices converge.
    const p1=stable([left.feedback?.[id]||null,left.answers?.[id]??null]);
    const p2=stable([right.feedback?.[id]||null,right.answers?.[id]??null]);
    chosen=p1>=p2?left:right;
   }
  }
  if(owns(chosen.answers,id))answers[id]=chosen.answers[id];
  else if(owns(chosen.feedback,id))answers[id]=chosen.feedback[id].answer;
  if(checkedLeft||checkedRight)feedback[id]=clone(chosen.feedback[id]);
  if(owns(left.hints,id)||owns(right.hints,id)){
   hints[id]=Math.max(0,Number(left.hints?.[id])||0,Number(right.hints?.[id])||0);
  }
  const ts=[stamp(left,id),stamp(right,id)].filter(Boolean).sort();
  if(ts.length)fieldUpdatedAt[id]=ts[ts.length-1];
 }
 const updatedAt=[left.updatedAt||'',right.updatedAt||''].sort().at(-1)||'';
 return {answers,hints,feedback,fieldUpdatedAt,updatedAt};
}
function merge(a,b){
 const aa=a&&typeof a==='object'?a:{},bb=b&&typeof b==='object'?b:{};
 const pa=aa.progress||{},pb=bb.progress||{};
 const records={};
 for(const id of new Set([...Object.keys(pa.records||{}),...Object.keys(pb.records||{})]))
  records[id]=mergeRecord((pa.records||{})[id],(pb.records||{})[id]);
 const wa=aa.work||{},wb=bb.work||{},entries={};
 for(const id of new Set([...Object.keys(wa.entries||{}),...Object.keys(wb.entries||{})])){
  const x=(wa.entries||{})[id],y=(wb.entries||{})[id];
  if(!x)entries[id]=clone(y);
  else if(!y)entries[id]=clone(x);
  else entries[id]=mergeStudyEntry(x,y);
 }
 const drafts={};
 for(const date of new Set([...Object.keys(wa.drafts||{}),...Object.keys(wb.drafts||{})])){
  const x=wa.drafts?.[date],y=wb.drafts?.[date];
  drafts[date]=clone(!x?y:!y?x:String(x.updatedAt||'')>=String(y.updatedAt||'')?x:y);
 }
 const notes={};
 for(const id of new Set([...Object.keys(wa.notes||{}),...Object.keys(wb.notes||{})])){
  const x=wa.notes?.[id],y=wb.notes?.[id];
  notes[id]=clone(!x?y:!y?x:String(x.updatedAt||'')>=String(y.updatedAt||'')?x:y);
 }
 // Newer learning day wins, even when its fresh session has zero items.
 const preferred=String(wa.day||'')>String(wb.day||'')?wa:
  String(wb.day||'')>String(wa.day||'')?wb:
  wa.session?.length?wa:wb;
 return {v:1,progress:{records,read:{...(pb.read||{}),...(pa.read||{})}},
  work:{day:preferred.day||wa.day||wb.day||'',session:preferred.session||[],
   idx:Number(preferred.idx)||0,entries,drafts,notes,
   orderVersion:preferred.orderVersion||wa.orderVersion||wb.orderVersion||'',
   sessionEdition:preferred.sessionEdition||wa.sessionEdition||wb.sessionEdition||''}};
}
function localData(){return {v:1,progress:readJson(STORAGE,{records:{},read:{}}),
 work:readJson(WORK,{day:'',session:[],idx:0,entries:{}})};}
const utf=new TextEncoder(),decode=new TextDecoder();
function base64url(bytes){
 const a=new Uint8Array(bytes);let chunks=[];
 for(let i=0;i<a.length;i+=8192)chunks.push(String.fromCharCode(...a.subarray(i,i+8192)));
 return btoa(chunks.join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function from64(str){let b=atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4));return Uint8Array.from(b,ch=>ch.charCodeAt(0));}
async function aesKey(secret){
 const digest=await crypto.subtle.digest('SHA-256',utf.encode('brieflab-encryption-v1:'+secret));
 return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encrypt(obj,secret){
 const key=await aesKey(secret),iv=crypto.getRandomValues(new Uint8Array(12));
 let plain=utf.encode(JSON.stringify(obj)),zip='none';
 if(typeof CompressionStream!=='undefined'){
  const stream=new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'));
  plain=new Uint8Array(await new Response(stream).arrayBuffer());zip='gzip';
 }
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
 return {v:1,iv:base64url(iv),ct:base64url(bytes),zip};
}
async function decrypt(obj,secret){
 if(!obj||obj.v!==1)throw Error('云端数据格式不正确');
 try{
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(obj.iv)},await aesKey(secret),from64(obj.ct));
  let plain=new Uint8Array(bytes);
  if(obj.zip==='gzip'){
   if(typeof DecompressionStream==='undefined')throw Error('当前浏览器不支持解压云端记录');
   const stream=new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
   plain=new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return JSON.parse(decode.decode(plain));
 }catch{throw Error('无法解密云记录，请确认恢复密钥准确。');}
}
async function api(method,data){
 const response=await fetch(API+'/v1/state',{method,headers:{
  'Authorization':'Bearer '+token,
  ...(data?{'Content-Type':'application/json'}:{})
 },body:data?JSON.stringify(data):undefined,cache:'no-store'});
 let result;try{result=await response.json()}catch{throw Error('云端接口响应格式错误');}
 if(response.status===409)return {conflict:true};
 if(!response.ok)throw Error(result.error||('HTTP '+response.status));
 return result;
}
// Publish wrong answers only. Correct attempts remain in the encrypted progress backup.
async function mistakeReaderKey(){
 const digest=await crypto.subtle.digest('SHA-256',utf.encode('brieflab-mistake-reader-key-v1:'+token));
 return base64url(digest);
}
function collectMistakes(){
 const records=readJson(STORAGE,{records:{}}).records||{},list=[];
 for(const [id,rec] of Object.entries(records)){
  if(!/^[A-Za-z0-9_-]{3,140}$/.test(id))continue;
  (rec.history||[]).forEach((h,i)=>{
   if(h.correct!==false||typeof h.answer!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(h.date||''))return;
   list.push({attempt_key:String(h.attemptId||('legacy:'+id+':'+h.date+':'+i)).slice(0,200),
    id,date:h.date,entered:h.answer.slice(0,80),hints:Math.min(100,Math.max(0,Math.trunc(Number(h.hintCount)||0)))});
  });
 }
 return list;
}
async function sendMistakes(){
 if(!token||!API)return;
 const key=await mistakeReaderKey(),all=collectMistakes(),signature=stable(all);
 if(signature===lastMistakeSignature)return;
 // Include an empty batch so the read-only link works even when no errors exist yet.
 for(let i=0;i<Math.max(1,Math.ceil(all.length/100));i++){
  const events=all.slice(i*100,i*100+100);
  const response=await fetch(API+'/v1/mistakes',{method:'POST',headers:{
   Authorization:'Bearer '+token,'Content-Type':'application/json'
  },body:JSON.stringify({read_key:key,events}),cache:'no-store'});
  if(!response.ok)throw Error('错题上传失败（HTTP '+response.status+'）');
 }
 lastMistakeSignature=signature;
}
async function syncOnce(){
 for(let retry=0;retry<4;retry++){
  const remote=await api('GET'),server=remote.blob?await decrypt(remote.blob,token):null;
  const merged=merge(localData(),server);
  const previous=localData();
  if(stable(previous)!==stable(merged)){
   localStorage.setItem(STORAGE,JSON.stringify(merged.progress));
   localStorage.setItem(WORK,JSON.stringify(merged.work));
   window.dispatchEvent(new Event('brieflab:cloud-updated'));
  }
  if(server&&stable(server)===stable(merged))return;
  const result=await api('PUT',{revision:remote.revision,blob:await encrypt(merged,token)});
  if(!result.conflict)return;
 }
 throw Error('云端记录版本冲突，请再次同步');
}
async function sync(){
 if(!token||!API)return;
 if(busy){queued=true;return;}
 busy=true;
 let success=false;
 do{
  queued=false;
  try{
   setStatus('正在加密并同步学习记录…');
   // Save the full encrypted progress first. Mistake-summary uploads must not
   // block the next device from receiving normal answers and drafts.
   await syncOnce();
   success=true;
   setStatus('云端已同步 · '+new Date().toLocaleString('zh-CN'));
  }catch(error){
   setStatus('云端同步暂不可用：'+error.message+'；本机记录仍会保存');
   success=false;
   break;
  }
 }while(queued);
 busy=false;
 if(success)try{await sendMistakes();}
 catch(error){setStatus('云端已同步 · 错题汇总暂未更新：'+error.message);}
}
function schedule(){
 if(!token||!API)return;
 clearTimeout(timer);
 setStatus('本机已保存 · 准备同步');
 timer=setTimeout(sync,350);
}
function updateUI(){
 const connected=!!token;
 document.getElementById('cloud-create').hidden=connected;
 document.getElementById('cloud-copy').hidden=!connected;
 document.getElementById('cloud-now').hidden=!connected;
 const switchButton=document.getElementById('cloud-switch');
 switchButton.hidden=false;
 switchButton.textContent=connected?'更换恢复密钥':'输入已有恢复密钥';
 document.getElementById('cloud-share-mistakes').hidden=!connected;
 if(!API){
  setStatus('云同步服务尚未部署，当前仅保存于本机；部署后可以在这里启用跨设备同步。');
  controls.hidden=true;
  return;
 }
 controls.hidden=false;
 if(!API.startsWith('https://')){controls.hidden=true;setStatus('云端地址必须使用 HTTPS');return;}
 setStatus(connected?'已关联云端恢复密钥，准备同步':'首次使用新设备：点击“输入已有恢复密钥”；仅首台设备需要“建立云端备份”。');
 if(connected)schedule();
}
document.getElementById('cloud-create').onclick=()=>{
 if(token||!API)return;
 token=base64url(crypto.getRandomValues(new Uint8Array(32)));
 localStorage.setItem(TOKEN,token);updateUI();
 alert('已建立云端恢复密钥。请点击“复制恢复密钥”并将它保存到安全位置，丢失密钥无法恢复云数据。');
};
document.getElementById('cloud-copy').onclick=async()=>{
 if(!token)return;
 try{await navigator.clipboard.writeText(token);setStatus('恢复密钥已复制。请安全保存，勿公开分享。');}
 catch{prompt('复制这串恢复密钥并安全保存：',token);}
};
document.getElementById('cloud-now').onclick=sync;
document.getElementById('cloud-share-mistakes').onclick=async()=>{
 if(!token||!API)return;
 try{
  setStatus('正在核对错题保存状态…');
  await sendMistakes();
  const link=API+'/v1/mistakes/'+await mistakeReaderKey();
  try{await navigator.clipboard.writeText(link);setStatus('错题只读链接已复制。请仅在私人聊天中发送；持有链接的人能查看错题。');}
  catch{window.prompt('复制这条只读错题链接并私下发送给 ChatGPT：',link);setStatus('错题只读链接已生成。');}
 }catch(err){setStatus('错题链接暂不可用：'+err.message);}
};
document.getElementById('cloud-switch').onclick=async()=>{
 const input=prompt('粘贴原设备复制的43字符恢复密钥。输入正确后自动合并学习记录。');
 if(input===null)return;
 const t=input.trim();
 if(!/^[A-Za-z0-9_-]{43}$/.test(t)){setStatus('恢复密钥格式错误，应为43个字符。');return;}
 if(token&&t!==token&&!confirm('确认切换到另一套云记录，并将本机学习记录合并到该账户？'))return;
 const previous=token;
 token=t;setStatus('正在验证恢复密钥…');
 try{
  const remote=await api('GET');
  if(!remote.blob)throw Error('该密钥尚无云端备份。请检查是否正确，或先在原设备完成同步。');
  await decrypt(remote.blob,t);
  localStorage.setItem(TOKEN,t);updateUI();sync();
 }catch(error){token=previous;setStatus('恢复失败：'+error.message+'；原设备记录与密钥保持不变。');}
};
window.addEventListener('brieflab:local-write',schedule);
window.addEventListener('storage',e=>{
 if(e.key===STORAGE||e.key===WORK||e.key===TOKEN)schedule();
});
window.addEventListener('online',schedule);
window.addEventListener('focus',schedule);
window.addEventListener('pageshow',schedule);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  // Start the pending upload as soon as the phone moves to another app.
  // Browser termination can still interrupt any in-flight request.
  clearTimeout(timer);sync();
 }else schedule();
});
window.addEventListener('pagehide',()=>{clearTimeout(timer);sync();});
setInterval(()=>{if(!document.hidden&&token&&API)schedule();},20000);
updateUI();
})();
