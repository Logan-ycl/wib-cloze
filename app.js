(()=>{'use strict';
const $=id=>document.getElementById(id);
const KEY='brieflab-progress-v1';
const GUEST=window.location.hash!=='#mine';
let drafts={};if(window.location.hash==='#mine')try{drafts=JSON.parse(sessionStorage.getItem('brieflab-drafts-v2')||'{}')}catch{}
const saveDrafts=()=>{if(window.location.hash!=='#mine')return;try{sessionStorage.setItem('brieflab-drafts-v2',JSON.stringify(drafts))}catch{}};
const E=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const norm=value=>String(value||'').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[.,!?;:]+$/,'').replace(/\s+/g,' ');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(str,n)=>{const date=new Date(str+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);};
let edition=null,items=[],passages=[],progress={records:{},read:{}},session=[],idx=0,feedback=null,hints={},tab='quiz';
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
   const result=feedback?.[id]||drafts[id]?.result;
   if(result){
    const cls=result.correct?'is-correct':'is-wrong';
    return '<span class="completed-answer '+cls+'"><sup>'+n+'</sup> '+E(item.answer)+'</span>';
   }
   const revealed=Math.min(hints[id]||drafts[id]?.hints||0,item.answer.length);
   const hintText=revealed?'提示：'+item.answer.slice(0,revealed):'';
   return '<span class="answer-group" data-group="'+E(id)+'"><sup class="blank-tag">'+n+'</sup>'
    +'<input class="single-word-slot" data-item="'+E(id)+'" value="'+E(drafts[id]?.value||'')+'" type="text" aria-label="第'+n+'空，只填写一个单词" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">'
    +'<button type="button" class="gap-action gap-check" data-item="'+E(id)+'">检查</button>'
    +'<button type="button" class="gap-action gap-hint" data-item="'+E(id)+'">提示</button>'
    +'<small class="letter-reveal" data-hint="'+E(id)+'" aria-live="polite">'+E(hintText)+'</small>'
    +'<small class="gap-message" data-error="'+E(id)+'" role="status"></small></span>';
  }).join('');
  return '<p class="passage-text">'+content+'</p>';
 }).join('');
}
function attachNavigation(){
 const root=$('quiz');
 root.querySelectorAll('.gap-check').forEach(btn=>btn.onclick=()=>checkBlank(btn.dataset.item));
 root.querySelectorAll('.gap-hint').forEach(btn=>btn.onclick=()=>giveHint(btn.dataset.item));
 root.querySelectorAll('.single-word-slot').forEach(field=>{field.addEventListener('input',()=>{drafts[field.dataset.item]={...(drafts[field.dataset.item]||{}),value:field.value};saveDrafts();});
  field.addEventListener('keydown',event=>{
   if(event.key==='Enter'){event.preventDefault();checkBlank(field.dataset.item);}
  });
 });
 if(window.matchMedia('(min-width:651px)').matches) root.querySelector('.single-word-slot')?.focus();
}
function giveHint(id){
 if(feedback?.[id])return;
 const item=itemById(id);
 if(!item)return;
 hints[id]=Math.min(item.answer.length,(hints[id]||drafts[id]?.hints||0)+1);drafts[id]={...(drafts[id]||{}),hints:hints[id]};saveDrafts();
 const el=$('quiz').querySelector('[data-hint="'+id+'"]');
 if(el)el.textContent='提示：'+item.answer.slice(0,hints[id])+(hints[id]<item.answer.length?'…':'');
}
function showAnswers(p){
 const ids=idsInPassage(p),checked=ids.filter(id=>feedback?.[id]||drafts[id]?.result);
 if(!checked.length)return '';
 return '<div class="feedback review-panel"><h3>已检查 '+checked.length+' / '+ids.length+' 空</h3>'+checked.map(id=>{
  const x=itemById(id),v=feedback?.[id]||drafts[id].result,i=ids.indexOf(id)+1;
  return '<div class="answer-feedback '+(v.correct?'correct':'wrong')+'"><b>第'+i+'空 · '+(!v.correct?'需要复习':v.hintCount>=3?'提示较多，次日复习':'正确')+'</b>'
  +'<div>你的填写：'+E(v.answer)+' · 正确答案：<strong>'+E(x.answer)+'</strong></div>'
  +'<p>'+E(x.meaning_zh||'')+(x.analysis_zh?' · '+E(x.analysis_zh):'')+'</p></div>';
 }).join('')+'</div>';
}
function updateResults(){const p=passageById(session[idx]),el=$('review-results');if(p&&el)el.innerHTML=showAnswers(p);labelDue();}
function checkBlank(id){
 if(feedback?.[id]||drafts[id]?.result)return;
 const item=itemById(id),group=$('quiz').querySelector('[data-group="'+id+'"]'),input=group?.querySelector('input');
 if(!item||!input)return;
 const answer=input.value.trim(),error=group.querySelector('.gap-message');
 if(!/^[A-Za-z]+$/.test(answer)){error.textContent='请填写一个英文单词';return;}
 const accepted=[item.answer,...(Array.isArray(item.accepted)?item.accepted:[])].map(norm);
 const correct=accepted.includes(norm(answer)),hintCount=hints[id]||drafts[id]?.hints||0,needsReview=!correct||hintCount>=3;
 const old=record(id),streak=needsReview?0:old.streak+1,days=needsReview?1:([0,3,7,14,30,60][Math.min(streak,5)]||60);
 const result={answer,correct,hintCount,needsReview};
 if(!feedback)feedback={};feedback[id]=result;drafts[id]={...(drafts[id]||{}),value:answer,result};saveDrafts();
 if(!GUEST){progress.records[id]={...old,attempts:old.attempts+1,correct:old.correct+(correct?1:0),
  wrongCount:old.wrongCount+(correct?0:1),reviewCount:(old.reviewCount||0)+(needsReview?1:0),
  hintAssisted:(old.hintAssisted||0)+(correct&&hintCount?1:0),streak,nextDue:addDays(today(),days),
  lastReviewed:today(),history:[...(old.history||[]).slice(-49),{date:today(),answer,correct,hintCount,needsReview}]};save();}
 const p=passageById(session[idx]);
 const n=p?idsInPassage(p).indexOf(id)+1:1;
 group.outerHTML='<span class="completed-answer '+(correct?'is-correct':'is-wrong')+'"><sup>'+n+'</sup> '+E(item.answer)+'</span>';
 updateResults();
}
function renderQuiz(){
 const el=$('quiz');
 if(edition&&$('edition-label'))$('edition-label').textContent='邮件日期：'+edition.date+' · 每个空独立检查，提示逐字增加';
 if(!session.length){
  el.innerHTML='<div class="box"><h3>今日暂无到期练习</h3><p>新一期内容会在次日出题，错题按复习计划再次出现。</p></div>';
  return;
 }
 if(idx>=session.length){
  el.innerHTML='<div class="box"><h3>本轮练习完成 ✓</h3><p>未检查的空白不会计错，下次仍可练习。</p><div class="actions"><button class="btn secondary" id="mistakes-go">查看错题本</button></div></div>';
  $('mistakes-go').onclick=()=>nav('mistakes');
  return;
 }
 const p=passageById(session[idx]);
 if(!p){idx++;renderQuiz();return;}
 if(!feedback)feedback={};
 const blanks=idsInPassage(p);
 el.innerHTML='<div class="box"><div class="row"><span class="eyebrow">SNIPPET '+(idx+1)+' / '+session.length+'</span><span class="muted">'+E(p.date)+' · '+blanks.length+' 处单词挖空</span></div>'
  +'<h3 class="snippet-title">'+E(p.title)+'</h3>'
  +'<div class="passage-wrap">'+renderPassage(p)+'</div>'
  +'<p class="word-count">每空填写一个单词，单独检查；提示每次多显示一个首字母位置的字母。</p>'
  +'<div id="review-results">'+showAnswers(p)+'</div>'
  +'<div class="actions"><button type="button" class="btn" id="next">下一篇</button></div>'
  +'</div>';
 $('next').onclick=()=>{feedback=null;hints={};idx++;renderQuiz();};
 attachNavigation();
}
function startForGroups(groupIds){
 session=[...new Set(groupIds)];idx=0;feedback=null;hints={};nav('quiz');
}
function renderMistakes(){
 if(GUEST){$('mistakes').innerHTML='<div class="box">访客模式不保留错题。</div>';return;}
 const usable=new Set(passages.flatMap(idsInPassage));
 const archived=items.filter(x=>(record(x.id).wrongCount>0||record(x.id).reviewCount>0)&&!usable.has(x.id));
 const missed=items.filter(x=>(record(x.id).wrongCount>0||record(x.id).reviewCount>0)&&usable.has(x.id)).sort((a,b)=>(record(a.id).nextDue||'').localeCompare(record(b.id).nextDue||''));
 const holder=$('mistakes');
 if(!missed.length&&!archived.length){holder.innerHTML='<div class="box">错题本为空。每一处错误都会被独立记录。</div>';return;}
 const groups=orderedGroups(missed.map(x=>x.id));
 holder.innerHTML='<div class="box"><p class="muted">共 '+missed.length+' 处需要巩固的表达，涉及 '+groups.length+' 组新闻语境。复习时会重新呈现整段。</p>'
  +missed.map(x=>'<div class="mistake"><div><b>'+E(x.expression)+'</b><div class="muted">'+E(x.meaning_zh)+'</div><button class="reset-one" data-item="'+E(x.id)+'">撤销误判并重做</button></div><div class="muted">错 '+record(x.id).wrongCount+' 次<br>下次 '+E(record(x.id).nextDue||'待安排')+'</div></div>').join('')
  +(groups.length?'<div class="actions"><button class="btn" id="review-all">复习全部错题段落</button></div>':'')
  +(archived.length?'<div class="muted" style="margin-top:20px">旧版记录保留（原多词填空已停用）：'+archived.map(x=>E(x.expression)).join('、')+'</div>':'')+'</div>';
 const review=$('review-all');if(review)review.onclick=()=>startForGroups(groups);
 holder.querySelectorAll('.reset-one').forEach(btn=>btn.onclick=()=>{
  const id=btn.getAttribute('data-item');
  const p=passages.find(p=>idsInPassage(p).includes(id));
  if(!p)return;
  if(!confirm('撤销这处表达的判题记录，并重新练习该新闻段落？'))return;
  delete progress.records[id];delete drafts[id];saveDrafts();save();labelDue();startForGroups([p.id]);
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
  passages=ready;session=dueGroups();idx=0;feedback=null;hints={};
  $('notice').hidden=true;labelDue();nav(tab);
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
  save();session=dueGroups();idx=0;feedback=null;hints={};labelDue();nav('stats');
 }catch(err){notice('导入失败：'+err.message);}
};
load();
})();