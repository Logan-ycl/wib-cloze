#!/usr/bin/env node
// Regression tests for the real spaced-repetition functions in app.js.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const src = fs.readFileSync('app.js', 'utf8');
const from = src.indexOf('const REVIEW_INTERVALS=');
const to = src.indexOf('function orderedGroups(', from);
assert(from >= 0 && to > from, 'Spaced-review functions missing from app.js');

const todayValue = '2026-11-18';
const records = {};
const addDays = (str, n) => {
  const date = new Date(str + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};
const context = vm.createContext({
  today: () => todayValue,
  addDays,
  record: id => records[id] || {attempts:0,history:[]},
});
vm.runInContext(src.slice(from, to) +
  '\nthis.reviewFns = {isDue, nextReviewDate, reviewedToday, intervals:REVIEW_INTERVALS};', context);
const {isDue, nextReviewDate, reviewedToday, intervals} = context.reviewFns;
assert.deepEqual(Array.from(intervals), [3, 7, 14, 30, 60]);
const item = id => ({id,date:'2026-11-17'});
const asRecord = (id, lastDate, hints, correct, streak, dueDate = null) => {
  records[id] = {attempts:1, streak, lastReviewed:lastDate, nextDue:dueDate,
    history:[{date:lastDate,correct,hintCount:hints,answer:'tested'}]};
};

assert.equal(isDue(item('new')), true, 'Never attempted must be shown');
asRecord('correct-yesterday','2026-11-17',0,true,1,'2026-11-20');
assert.equal(isDue(item('correct-yesterday')),false,'Correct yesterday should not reappear today');
asRecord('correct-due','2026-11-15',0,true,1,'2026-11-18');
assert.equal(isDue(item('correct-due')),true,'First independently correct answer must return after 3 days');
asRecord('correct-not-yet','2026-11-16',0,true,1,'2026-11-19');
assert.equal(isDue(item('correct-not-yet')),false);
for(const [streak,days] of [[1,3],[2,7],[3,14],[4,30],[5,60],[6,60]]){
  const name = 'stage-'+streak;
  asRecord(name,addDays(todayValue,-days),0,true,streak);
  assert.equal(nextReviewDate(records[name]),todayValue,'Missing due date must recover stage '+streak);
  assert.equal(isDue(item(name)),true,'Stage '+streak+' must be due');
}
asRecord('wrong-yesterday','2026-11-17',0,false,0,'2026-11-18');
assert.equal(isDue(item('wrong-yesterday')),true,'Wrong answer returns next day');
asRecord('hinted-yesterday','2026-11-17',3,true,0,'2026-11-18');
assert.equal(isDue(item('hinted-yesterday')),true,'Three hints returns next day');
asRecord('already-checked-today',todayValue,0,true,1,todayValue);
assert.equal(reviewedToday('already-checked-today'),true);
assert.equal(isDue(item('already-checked-today')),false,'Never repeat a checked blank on the same day');
assert.equal(isDue({id:'new',date:todayValue}),false,'Do not show same-day issue');

assert(src.includes('nextDue:addDays(today(),days)'),'checkBlank must save scheduled nextDue');
assert(src.includes('||idsInPassage(p).some(reviewedToday)'),'Checked passages must remain visible on another device');
const fromStart=src.indexOf('function startForGroups(');
const toStart=src.indexOf('/* Personal learning notes.',fromStart);
assert(fromStart>=0 && toStart>fromStart);
assert(!src.slice(fromStart,toStart).includes('delete work.entries'),'Reopening must not erase saved answers');
assert(src.includes('const reviewed=(record(targetId).history||[])'),
  'Recover same-day verdicts from durable review history');

const cloud=fs.readFileSync('cloud-sync.js','utf8');
assert(cloud.includes("const GUEST=new URLSearchParams(location.search).get('guest')==='1';"),
  'Ordinary site visits must save progress, guest=1 must be stateless');
assert(cloud.includes('orderVersion:preferred.orderVersion'),
  'Cloud merge must preserve session ordering metadata');
console.log('Spaced review regression OK: 3/7/14/30/60 days, next-day retry, same-day restore, cloud merge.');
