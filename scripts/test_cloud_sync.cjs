#!/usr/bin/env node
// Test the actual production cloud merge functions with simulated phone and PC.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('cloud-sync.js','utf8');
const start=code.indexOf('const clone=(v)=>');
const end=code.indexOf('function localData()',start);
assert(start>=0&&end>start,'Missing production merge functions');
const sandbox=vm.createContext({});
vm.runInContext(code.slice(start,end)+'\nthis._sync={merge,mergeStudyEntry,stable};',sandbox);
const {merge,mergeStudyEntry,stable}=sandbox._sync;
const simplify=v=>JSON.parse(JSON.stringify(v));
const day='2026-11-18',key=day+'|2026-11-17-tech';
const oldPC={
 v:1,progress:{records:{},read:{}},
 work:{day,session:['2026-11-17-tech'],idx:0,notes:{},
  entries:{[key]:{
   answers:{alpha:'old computer answer',gamma:'computer-only answer'},
   hints:{alpha:0},feedback:{},
   updatedAt:'2026-11-18T11:55:00.000Z',
   fieldUpdatedAt:{alpha:'2026-11-18T09:00:00.000Z',gamma:'2026-11-18T11:55:00.000Z'}
  }}
 }
};
const phone={
 v:1,progress:{records:{alpha:{attempts:1,correct:1,wrongCount:0,streak:1,
  lastReviewed:'2026-11-18',nextDue:'2026-11-21',
  lastReviewedAt:'2026-11-18T11:35:00.000Z',
  history:[{attemptId:'phone-1',date:day,answer:'phone checked',correct:true,hintCount:1,at:'2026-11-18T11:35:00.000Z'}]}},read:{}},
 work:{day,session:['2026-11-17-tech'],idx:1,
  entries:{[key]:{
   answers:{alpha:'phone checked',beta:'phone draft'},
   hints:{alpha:1},feedback:{alpha:{answer:'phone checked',correct:true,hintCount:1}},
   fieldUpdatedAt:{alpha:'2026-11-18T11:35:00.000Z',beta:'2026-11-18T11:36:00.000Z'},
   updatedAt:'2026-11-18T11:36:00.000Z'
  }}
 }
};
const combined=merge(oldPC,phone),combinedBack=merge(phone,oldPC);
const entry=combined.work.entries[key];
assert.equal(entry.answers.alpha,'phone checked','A phone checked answer must win over stale desktop draft');
assert.equal(entry.answers.beta,'phone draft','A phone unsubmitted answer must transfer to PC');
assert.equal(entry.answers.gamma,'computer-only answer','Desktop independent blank must be retained');
assert.equal(entry.feedback.alpha.correct,true,'Correct verdict must transfer');
assert.equal(entry.hints.alpha,1,'Letter hints must transfer');
assert.equal(combined.progress.records.alpha.history[0].attemptId,'phone-1');
assert.equal(combined.progress.records.alpha.nextDue,'2026-11-21','Review plan must transfer');
assert.equal(stable(combined.work.entries[key]),stable(combinedBack.work.entries[key]),
 'Per-word merge must converge in both directions');

const phoneReedit=structuredClone(phone);
phoneReedit.work.entries[key].answers.beta='new phone draft';
phoneReedit.work.entries[key].fieldUpdatedAt.beta='2026-11-18T12:00:00.000Z';
phoneReedit.work.entries[key].updatedAt='2026-11-18T12:00:00.000Z';
const again=merge(combined,phoneReedit);
assert.equal(again.work.entries[key].answers.beta,'new phone draft');
assert.equal(again.work.entries[key].answers.gamma,'computer-only answer');

// Browser navigation may update a legacy passage timestamp without changing the answer.
// Per-field timestamps must still decide which content is newer.
const pcNavigate=structuredClone(oldPC);
pcNavigate.work.entries[key].updatedAt='2026-11-18T13:00:00.000Z';
assert.equal(merge(pcNavigate,phone).work.entries[key].answers.alpha,'phone checked');
assert.equal(merge(pcNavigate,phone).work.entries[key].answers.beta,'phone draft');

const left={answers:{delta:'old'},fieldUpdatedAt:{delta:'2026-11-18T09:00:00.000Z'},updatedAt:'2026-11-18T14:00:00.000Z'};
const right={answers:{delta:'new'},fieldUpdatedAt:{delta:'2026-11-18T10:00:00.000Z'},updatedAt:'2026-11-18T10:00:00.000Z'};
assert.equal(mergeStudyEntry(left,right).answers.delta,'new','Entry navigation timestamp may not override recent field');
assert.equal(mergeStudyEntry({answers:{epsilon:''},fieldUpdatedAt:{epsilon:'2026-11-18T13:00:00.000Z'}},
 {answers:{epsilon:'previous'},fieldUpdatedAt:{epsilon:'2026-11-18T12:00:00.000Z'}}).answers.epsilon,'',
 'An intentional newer cleared draft must be preserved');

// Confirm the production synchronization hooks are installed.
const app=fs.readFileSync('app.js','utf8');
assert(app.includes('saveWork(field.dataset.item)'),'Each typed answer must be timestamped');
assert(app.includes('saveWork(id);'),'Each graded answer or hint must be timestamped');
assert(code.includes('setTimeout(sync,350)'),'Upload must start promptly after input');
assert(code.includes("window.addEventListener('focus',schedule)"),'PC focus must pull cloud state');
assert(code.includes("window.addEventListener('pagehide'"),'Phone app switch must trigger upload');
assert(code.includes("if(document.hidden){"),'Background transition must trigger upload');
console.log('Cloud sync regression OK: phone -> PC drafts, checked answers, conflict resolution, timestamps and retry triggers.');
