(()=>{'use strict';
const $=id=>document.getElementById(id);
const KEY='brieflab-progress-v1';
const WORK_KEY='brieflab-working-v1';
// Personal progress is device-local by default; ?guest=1 opts into stateless sharing.
const GUEST=new URLSearchParams(window.location.search).get('guest')==='1'||window.location.hash==='#guest';
const E=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const norm=value=>String(value||'').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[.,!?;:]+$/,'').replace(/\s+/g,' ');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(str,n)=>{const date=new Date(str+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);};
let edition=null,items=[],passages=[],progress={records:{},read:{}},session=[],idx=0,feedback=null,hints={},answers={},tab='quiz';
let work={day:today(),session:[],idx:0,entries:{}};
if(!GUEST){
 try{
  const saved=JSON.parse(localStorage.getItem(WORK_KEY)||'null');
  if(saved&&Array.isArray(saved.session)&&saved.entries&&typeof saved.entries==='object'){
   work=saved;
   if(work.day!==today()){
    // Preserve every checked answer and hint; begin a fresh due-session for the new day.
    work.day=today();work.session=[];work.idx=0;
   }
  }
 }catch{}
}
const saveWork=()=>{
 if(GUEST)return;
 try{localStorage.setItem(WORK_KEY,JSON.stringify(work))}catch{notice('本次练习进度无法保存，请检查浏览器存储权限。');}
};
function activatePassage(id){
 const current=work.entries[id]||{};
 const entry={answers:current.answers||{},hints:current.hints||{},feedback:current.feedback||{}};
 work.entries[id]=entry;
 answers=entry.answers;hints=entry.hints;feedback=entry.feedback;
}
function moveTo(position){
 idx=Math.max(0,Math.min(position,session.length));
 work.idx=idx;saveWork();renderQuiz();window.scrollTo(0,0);
}
if(!GUEST){
 try{
  const old=JSON.parse(localStorage.getItem(KEY)||'{}');
  if(old&&typeof old==='object')progress={records:old.records||{},read:old.read||{}};
 }catch{}
}
const save=()=>{if(GUEST)return;try{localStorage.setItem(KEY,JSON.stringify(progress))}catch{notice('学习记录无法保存在本浏览器中，请检查存储权限。');}};
const itemById=id=>items.find(x=>x.id===id);
const passageById=id=>passages.find(x=>x.id===id);
const idsInPassage=p=>[...p.body.matchAll(/\{\{([^}]+)\}\}/g)].map(m=>m[1]);
const record=id=>progress.records[id]||{attempts:0,correct:0,wrongCount:0,streak:0,nextDue:null,history:[]};
const notice=msg=>{$('notice').hidden=false;$('notice').textContent=msg;};
function isDue(item){
 if(item.date>=today())return false;
 const r=record(item.id);
 return !r.attempts||(r.nextDue&&r.nextDue<=today());
}
function orderedGroups(ids){
 const selected=new Set(ids);
 return passages.filter(p=>idsInPassage(p).some(id=>selected.has(id))).sort((a,b)=>{
  function rank(p){
   const rr=idsInPassage(p).map(id=>({id,r:record(id)}));
   if(rr.some(x=>!x.r.attempts&&p.date===addDays(today(),-1)))return 0;
   if(rr.some(x=>x.r.wrongCount&&x.r.nextDue<=today()))return 1;
   return 2;
  }
  return rank(a)-rank(b)||b.date.localeCompare(a.date)||a.id.localeCompare(b.id);
 }).map(p=>p.id);
}
function dueGroups(){
 if(GUEST)return passages.filter(p=>p.date===edition?.date).map(p=>p.id);
 return orderedGroups(items.filter(isDue).map(x=>x.id));
}
function labelDue(){
 const count=dueGroups().length;
 $('due-count').textContent=count?'('+count+'组)':'';
}
function nav(next){
 tab=next;
 document.querySelectorAll('[data-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tab===next));
 document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!=='panel-'+next);
 if(next==='quiz')renderQuiz();
 if(next==='mistakes')renderMistakes();
 if(next==='stats')renderStats();
 window.scrollTo(0,0);
}
function renderPassage(p){
 let n=0;
 return p.body.split(/\n\s*\n/).map(par=>{
  const parts=par.split(/(\{\{[^}]+\}\})/g);
  const content=parts.map(part=>{
   if(!part.startsWith('{{')||!part.endsWith('}}'))return E(part);
   const id=part.slice(2,-2),item=itemById(id);
   if(!item)return '<strong>（题目数据缺失）</strong>';
   n++;
   const result=feedback?.[id];
   if(result){
    const cls=result.correct?'is-correct':'is-wrong';
    return '<span class="completed-answer '+cls+'"><sup>'+n+'</sup> '+E(item.answer)+'</span>';
   }
   const revealed=Math.min(hints[id]||0,item.answer.length);
   const hintText=revealed?'提示：'+item.answer.slice(0,revealed):'';
   return '<span class="answer-group" data-group="'+E(id)+'"><sup class="blank-tag">'+n+'</sup>'
    +'<input class="single-word-slot" data-item="'+E(id)+'" value="'+E(answers[id]||'')+'" type="text" aria-label="第'+n+'空，只填写一个单词" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">'
    +'<button type="button" class="gap-action gap-hint" data-item="'+E(id)+'">提示</button>'
    +'<small class="letter-reveal" data-hint="'+E(id)+'" aria-live="polite">'+E(hintText)+'</small>'
    +'<small class="gap-message" data-error="'+E(id)+'" role="status"></small></span>';
  }).join('');
  return '<p class="passage-text">'+content+'</p>';
 }).join('');
}
function attachNavigation(){
 const root=$('quiz');
 root.querySelectorAll('.gap-hint').forEach(btn=>btn.onclick=()=>giveHint(btn.dataset.item));
 root.querySelectorAll('.single-word-slot').forEach(field=>{
  field.addEventListener('input',()=>{answers[field.dataset.item]=field.value;saveWork();});
  field.addEventListener('keydown',event=>{
   if(event.key==='Enter'){event.preventDefault();checkAll();}
  });
 });
 if(window.matchMedia('(min-width:651px)').matches) root.querySelector('.single-word-slot')?.focus();
}
function giveHint(id){
 if(feedback?.[id])return;
 const item=itemById(id);
 if(!item)return;
 hints[id]=Math.min(item.answer.length,(hints[id]||0)+1);
 saveWork();
 const el=$('quiz').querySelector('[data-hint="'+id+'"]');
 if(el)el.textContent='提示：'+item.answer.slice(0,hints[id])+(hints[id]<item.answer.length?'…':'');
}
function showAnswers(p){
 const ids=idsInPassage(p),checked=ids.filter(id=>feedback?.[id]);
 if(!checked.length)return '';
 const independentlyCorrect=checked.filter(id=>feedback[id].correct&&feedback[id].hintCount<=2).length;
 return '<div class="feedback review-panel"><h3>已检查 '+checked.length+' / '+ids.length+' 空 · 计入正确 '+independentlyCorrect+' 处</h3>'
  +checked.map(id=>{
   const x=itemById(id),v=feedback[id],i=ids.indexOf(id)+1;
   const heading=!v.correct?'✕ 需要复习':v.hintCount<=2?'✓ 正确':'✓ 提示后答对，明天复习';
   return '<div class="answer-feedback '+(v.correct?'correct':'wrong')+'">'
    +'<b>第'+i+'空 · '+heading+'</b><div>你的填写：'+E(v.answer)+'</div>'
    +'<div>目标答案：<strong>'+E(x.answer)+'</strong></div>'
    +(v.hintCount>=3?'<div class="muted">使用了 '+v.hintCount+' 次字母提示，明天再练</div>':'')
    +'<p><strong>解析：</strong>'+E(x.analysis_zh||x.why_zh||x.meaning_zh||'暂无解析')+'</p></div>';
  }).join('')+'</div>';
}
function updateResults(){
 const p=passageById(session[idx]),el=$('review-results');
 if(p&&el)el.innerHTML=showAnswers(p);
 labelDue();
}
function checkAll(){
 const root=$('quiz');
 const fields=[...root.querySelectorAll('.single-word-slot')];
 let count=0;
 for(const field of fields){
  if(!field.value.trim())continue;
  if(/\s/.test(field.value.trim())){
   const error=field.closest('.answer-group')?.querySelector('.gap-message');
   if(error)error.textContent='每空只填写一个单词';
   continue;
  }
  if(checkBlank(field.dataset.item))count++;
 }
 const msg=$('check-summary');
 if(msg)msg.textContent=count?'已检查 '+count+' 空；未填写的空保持隐藏，可继续作答。':'没有可检查的填写内容。';
}
function checkBlank(id){
 if(feedback?.[id])return false;
 const item=itemById(id);
 const root=$('quiz'),group=root.querySelector('[data-group="'+id+'"]');
 const input=group?.querySelector('.single-word-slot');
 if(!item||!input)return;
 const answer=input.value.trim(),error=group.querySelector('.gap-message');
 if(!answer){error.textContent='请先填写此空';input.focus();return;}
 if(/\s/.test(answer)){error.textContent='每空只填写一个单词';input.focus();return;}
 const correct=[item.answer,...(item.accepted||[])].some(v=>norm(v)===norm(answer));
 const hintCount=hints[id]||0,independent=correct&&hintCount<=2,old=record(id);
 const streak=independent?old.streak+1:0,days=independent?([0,3,7,14,30,60][Math.min(streak,5)]||60):1;
 answers[id]=answer;
 feedback[id]={answer,correct,hintCount};
 saveWork();
 if(!GUEST)progress.records[id]={...old,attempts:old.attempts+1,correct:old.correct+(independent?1:0),
  wrongCount:old.wrongCount+(correct?0:1),hintAssisted:(old.hintAssisted||0)+(correct&&hintCount?1:0),
  streak,nextDue:addDays(today(),days),lastReviewed:today(),
  history:[...(old.history||[]).slice(-49),{date:today(),answer,correct,hintCount}]};
 save();
 const n=idsInPassage(passageById(session[idx])).indexOf(id)+1;
 group.outerHTML='<span class="completed-answer '+(correct?'is-correct':'is-wrong')+'"><sup>'+n+'</sup> '+E(item.answer)+'</span>';
 updateResults();
 return true;
}
function renderQuiz(){
 const el=$('quiz');
 if(edition&&$('edition-label'))$('edition-label').textContent='邮件日期：'+edition.date+' · 统一检查已填写的空，提示逐字增加';
 if(!session.length){
  el.innerHTML='<div class="box"><h3>今日暂无到期练习</h3><p>新一期内容会在次日出题，错题按复习计划再次出现。</p></div>';
  return;
 }
 if(idx>=session.length){
  el.innerHTML='<div class="box"><h3>本轮已浏览完成 ✓</h3><p>可以返回任何一篇查看已填写的内容、批改记录，也可以补答空白。</p>'
   +'<div class="quiz-toolbar"><button type="button" class="btn secondary" id="back-last">上一篇</button><button type="button" class="btn secondary" id="review-first">回到第一篇</button></div></div>';
  $('back-last').onclick=()=>moveTo(session.length-1);
  $('review-first').onclick=()=>moveTo(0);
  return;
 }
 const p=passageById(session[idx]);
 if(!p){idx++;renderQuiz();return;}
 activatePassage(p.id);
 const blanks=idsInPassage(p);
 el.innerHTML='<div class="box"><div class="row"><span class="eyebrow">SNIPPET '+(idx+1)+' / '+session.length+'</span><span class="muted">'+E(p.date)+' · '+blanks.length+' 处单词挖空</span></div>'
  +'<h3 class="snippet-title">'+E(p.title)+'</h3>'
  +'<div class="passage-wrap">'+renderPassage(p)+'</div>'
  +'<p class="word-count">每空填写一个单词，点击下方统一检查。未填写的空不会公布答案，也不会计错。</p>'
  +'<div class="quiz-toolbar"><button type="button" class="btn" id="check-all">检查对错</button><div class="quiz-pager"><button type="button" class="btn secondary" id="previous" '+(idx===0?'disabled':'')+'>上一篇</button><button type="button" class="btn secondary" id="next">'+(idx===session.length-1?'完成本轮':'下一篇')+'</button></div></div>'
  +'<p id="check-summary" class="muted" role="status" aria-live="polite"></p>'
  +'<div id="review-results">'+showAnswers(p)+'</div>'
  +'</div>';
 $('check-all').onclick=checkAll;
 $('previous').onclick=()=>moveTo(idx-1);
 $('next').onclick=()=>moveTo(idx+1);
 attachNavigation();
}

// One-time opt-in recovery from a user-supplied screenshot. Never overwrites existing answers.
// This restores the verdicts originally displayed, even though two synonyms are now accepted.
function offerScreenshotRecovery(){
 const qp=new URLSearchParams(window.location.search);
 if(GUEST||qp.get('recover')!=='nvidia-20261114')return;
 const passageId='2026-11-13-nvidia';
 const p=passageById(passageId);
 const samples=[
  {id:'2026-11-13-nvidia-stepped',answer:'resigned',correct:false,hintCount:0},
  {id:'2026-11-13-nvidia-pledged',answer:'committed',correct:false,hintCount:0},
  {id:'2026-11-13-nvidia-stand',answer:'stand',correct:true,hintCount:5}
 ];
 if(!p||!samples.every(x=>itemById(x.id)&&idsInPassage(p).includes(x.id))){
  notice('截图恢复失败：原题未在题库中找到，未修改已有学习记录。');
  return;
 }
 const pending=samples.filter(x=>!progress.records[x.id]?.attempts&&!work.entries[passageId]?.feedback?.[x.id]);
 if(!pending.length){
  notice('这3处答题已有本机记录，无需重复导入，原数据均未覆盖。');
  return;
 }
 const n=$('notice');
 n.hidden=false;
 n.innerHTML='可以把截图中的 '+pending.length+' 处答题结果补入此浏览器。已存在的记录不会覆盖。两处原判错继续安排复习，stand 作为提示后答对安排次日复习。 <button type="button" class="btn" id="restore-nvidia" style="margin:10px 0 2px">恢复截图中的答题记录</button>';
 $('restore-nvidia').onclick=()=>{
  const entry=work.entries[passageId]||{answers:{},hints:{},feedback:{}};
  entry.answers=entry.answers||{};entry.hints=entry.hints||{};entry.feedback=entry.feedback||{};
  let restored=0;
  for(const x of samples){
   if(progress.records[x.id]?.attempts||entry.feedback[x.id])continue;
   const date='2026-11-14';
   progress.records[x.id]={
    attempts:1,correct:0,wrongCount:x.correct?0:1,hintAssisted:x.hintCount>0?1:0,
    streak:0,nextDue:'2026-11-15',lastReviewed:date,
    history:[{date,answer:x.answer,correct:x.correct,hintCount:x.hintCount,recoveredFromScreenshot:true}]
   };
   entry.answers[x.id]=x.answer;
   entry.hints[x.id]=x.hintCount;
   entry.feedback[x.id]={answer:x.answer,correct:x.correct,hintCount:x.hintCount};
   restored++;
  }
  work.entries[passageId]=entry;
  if(!work.session.includes(passageId))work.session.unshift(passageId);
  work.idx=work.session.indexOf(passageId);
  work.day=today();
  save();saveWork();
  let persisted=false;
  try{
   const a=JSON.parse(localStorage.getItem(KEY)||'{}');
   const b=JSON.parse(localStorage.getItem(WORK_KEY)||'{}');
   persisted=samples.every(x=>a.records?.[x.id]&&b.entries?.[passageId]?.feedback?.[x.id]);
  }catch{}
  if(!persisted){notice('恢复未能保存：请检查此浏览器是否禁止网站数据存储。');return;}
  session=[...work.session];idx=work.idx;
  qp.delete('recover');
  const suffix=qp.toString();
  try{window.history.replaceState(null,'',window.location.pathname+(suffix?'?'+suffix:'')+window.location.hash)}catch{}
  nav('quiz');
  notice('已恢复 '+restored+' 道答题并验证本机存储成功。明日（11月15日）安排复习。你可以刷新页面确认记录仍在。');
 };
}
function startForGroups(groupIds){
 session=[...new Set(groupIds)];idx=0;
 for(const id of session)delete work.entries[id];
 work.session=[...session];work.idx=0;saveWork();nav('quiz');
}
function renderMistakes(){
 if(GUEST){$('mistakes').innerHTML='<div class="box">访客模式不保留错题。</div>';return;}
 const usable=new Set(passages.flatMap(idsInPassage));
 const archived=items.filter(x=>record(x.id).wrongCount>0&&!usable.has(x.id));
 const missed=items.filter(x=>record(x.id).wrongCount>0&&usable.has(x.id)).sort((a,b)=>(record(a.id).nextDue||'').localeCompare(record(b.id).nextDue||''));
 const holder=$('mistakes');
 if(!missed.length&&!archived.length){holder.innerHTML='<div class="box">错题本为空。每一处错误都会被独立记录。</div>';return;}
 const groups=orderedGroups(missed.map(x=>x.id));
 holder.innerHTML='<div class="box"><p class="muted">共 '+missed.length+' 处曾经填错的表达，涉及 '+groups.length+' 组新闻语境。复习时会重新呈现整段。</p>'
  +missed.map(x=>'<div class="mistake"><div><b>'+E(x.expression)+'</b><div class="muted">'+E(x.meaning_zh)+'</div><button class="reset-one" data-item="'+E(x.id)+'">撤销误判并重做</button></div><div class="muted">错 '+record(x.id).wrongCount+' 次<br>下次 '+E(record(x.id).nextDue||'待安排')+'</div></div>').join('')
  +(groups.length?'<div class="actions"><button class="btn" id="review-all">复习全部错题段落</button></div>':'')
  +(archived.length?'<div class="muted" style="margin-top:20px">旧版记录保留（原多词填空已停用）：'+archived.map(x=>E(x.expression)).join('、')+'</div>':'')+'</div>';
 const review=$('review-all');if(review)review.onclick=()=>startForGroups(groups);
 holder.querySelectorAll('.reset-one').forEach(btn=>btn.onclick=()=>{
  const id=btn.getAttribute('data-item');
  const p=passages.find(p=>idsInPassage(p).includes(id));
  if(!p)return;
  if(!confirm('撤销这处表达的判题记录，并重新练习该新闻段落？'))return;
  delete progress.records[id];save();labelDue();startForGroups([p.id]);
 });
}
function renderStats(){
 if(GUEST){$('stats').innerHTML='<div class="box">访客模式不保留学习记录。</div>';return;}
 const rs=Object.values(progress.records),total=rs.reduce((n,r)=>n+r.attempts,0),correct=rs.reduce((n,r)=>n+r.correct,0),wrong=rs.filter(r=>r.wrongCount>0).length;
 $('stats').innerHTML=(GUEST?'<p class="muted">访客练习结果仅在当前页面有效，刷新后从零开始。</p>':'')+'<div class="grid">'+[['累计填写',total+' 处'],['正确率',total?Math.round(correct/total*100)+'%':'—'],['历史错题',wrong+' 处'],['今日待复习',dueGroups().length+' 组']].map(x=>'<div class="box"><p class="number">'+E(x[1])+'</p><div class="muted">'+E(x[0])+'</div></div>').join('')+'</div>';
}
async function load(){
 try{
  const v='?v='+Date.now();
  const [a,b]=await Promise.all([fetch('./content/latest.json'+v,{cache:'no-store'}),fetch('./content/catalog.json'+v,{cache:'no-store'})]);
  if(!a.ok||!b.ok)throw Error('无法获取练习数据');
  const latest=await a.json(),all=await b.json();
  if(!latest.edition||!Array.isArray(latest.items)||!Array.isArray(all.items)||!Array.isArray(all.passages))throw Error('题库格式不完整');
  edition=latest.edition;
  items=[...new Map([...all.items,...latest.items].map(x=>[x.id,x])).values()];
  passages=[...new Map([...(all.passages||[]),...(latest.passages||[])].map(x=>[x.id,x])).values()];
  const ready=passages.filter(p=>{ const ids=idsInPassage(p); return ids.length>=3&&new Set(ids).size===ids.length&&ids.every(id=>{const item=itemById(id);return item&&/^[A-Za-z]+$/.test(item.answer);});});
  if(ready.length!==passages.length||!ready.length)throw Error('题库规则错误：每篇至少3个不同的单词空');
  passages=ready;
  const retained=work.session.filter(id=>passageById(id));
  session=retained.length?retained:dueGroups();
  idx=retained.length?Math.max(0,Math.min(Number(work.idx)||0,session.length)):0;
  work.session=[...session];work.idx=idx;saveWork();
  $('notice').hidden=true;labelDue();nav(tab);offerScreenshotRecovery();
 }catch(err){notice('课程加载失败：'+err.message+'。请刷新页面后重试。');}
}
$('today').textContent='SINGAPORE TIME / '+today();
if(GUEST){
 const statsTab=document.querySelector('[data-tab="stats"]');
 if(statsTab)statsTab.hidden=true;
 const mistakesTab=document.querySelector('[data-tab="mistakes"]');if(mistakesTab)mistakesTab.hidden=true;
 const backup=$('backup-tools');if(backup)backup.hidden=true;
 const guestNote=$('guest-note');if(guestNote){guestNote.hidden=false;guestNote.textContent='访客练习 · 每次刷新获取最新一期，不保存成绩或错题';}
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>nav(b.dataset.tab));

$('export').onclick=()=>{
 if(GUEST)return;
 const blob=new Blob([JSON.stringify({app:'BriefLab',progress,exported_at:new Date().toISOString()},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='brieflab-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('import').onchange=async e=>{
 if(GUEST)return;
 const file=e.target.files[0];if(!file)return;
 try{
  const obj=JSON.parse(await file.text());
  if(obj.app!=='BriefLab'||!obj.progress?.records)throw Error('文件格式不正确');
  if(!confirm('导入将覆盖此浏览器现有的学习记录，继续吗？'))return;
  progress={records:obj.progress.records,read:obj.progress.read||{}};
  save();work={day:today(),session:[],idx:0,entries:{}};session=dueGroups();idx=0;work.session=[...session];saveWork();labelDue();nav('stats');
 }catch(err){notice('导入失败：'+err.message);}
};
load();
})();