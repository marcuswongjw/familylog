'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers/gas-harness.cjs');
const parent='marcuswongjw@gmail.com';
function post(h,p){h.c.ContentService={MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType:()=>JSON.parse(t)})};return h.c.doPost({postData:{contents:JSON.stringify(p)}});}
function bridge(){
 const original=harness(),family=harness();original.c.FAMILY_SERVICE_FORWARDING_=true;family.c.FAMILY_BACKEND_MODE_=true;
 original.write({note:'configure_reminder_bridge',bridge_secret:'a'.repeat(64)});
 const route=(h,other)=>{const fetch=h.c.UrlFetchApp.fetch;h.c.UrlFetchApp.fetch=(url,options)=>url.includes('/macros/s/')?{getResponseCode:()=>200,getContentText:()=>JSON.stringify(post(other,JSON.parse(options.payload)))}:fetch(url,options);};
 route(original,family);route(family,original);return {original,family};
}
test('scheduled signed snapshots create preparation through the family writer without dashboard reads',()=>{
 const {original,family}=bridge();family.c.getEvents=()=>[{id:'training',title:'Nat B Training',dateRaw:family.c.Utilities.formatDate(new Date(),'Asia/Singapore','yyyy-MM-dd')}];
 const request=original.c.signedReminderRequest_(),first=post(original,request);assert.equal(first.status,'ok');assert.equal(first.todos.length,2);assert.equal(original.sheets.ToDo,undefined);const ids=Array.from(first.todos,t=>t.id);
 const retry=post(original,request);assert.deepEqual(Array.from(retry.todos,t=>t.id),ids);assert.equal(family.sheets.ToDo.rows.length,3);
});
test('unsigned, altered and expired reminder requests cannot read or reconcile family data',()=>{
 const {original,family}=bridge();let reads=0;family.c.getEvents=()=>{reads++;return [];};const valid=original.c.signedReminderRequest_();
 for(const p of [{action:'reminder_snapshot'}, {...valid,signature:'0'.repeat(64)},{...valid,timestamp:Date.now()-600000}])assert.equal(post(family,p).status,'error');
 assert.equal(reads,0);assert.equal(post(family,{...valid,action:'verify_reminder_snapshot'}).status,'error');
});
test('failed authoritative calendar snapshot does not deliver incomplete reminders or retire tasks',()=>{
 const {original,family}=bridge();family.c.getEvents=()=>{throw Error('Unavailable')};assert.equal(post(original,original.c.signedReminderRequest_()).status,'error');assert.equal(family.sheets.ToDo,undefined);
});
test('calendar reads occur after the writer lock, so a move committed while waiting wins',()=>{
 const h=harness();h.c.Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-15T04:00:00Z']))}};let held=false,wait;const event={id:'training',title:'Nat B Training',dateRaw:'2026-10-18'};
 h.c.LockService.getScriptLock=()=>({waitLock(ms){wait=ms;event.dateRaw='2026-10-19';held=true;},releaseLock(){held=false;}});
 h.c.getEvents=()=>{assert.equal(held,true);return [event];};const result=h.c.calendarPreparation_(h.ss,true);assert.equal(result.preparationState,'ready');assert.equal(wait,30000);assert.equal(held,false);assert.equal(h.c.getTodos(h.ss,parent).length,2);assert.ok(h.c.getTodos(h.ss,parent).every(t=>t.dueRaw==='2026-10-18'));
});
test('lock contention retains readable events and tasks with recoverable preparation status',()=>{
 const h=harness(),events=[{id:'training',title:'Nat B Training',dateRaw:'2026-10-18'}];h.c.reconcileCalendarTasks_(h.ss,events);const before=JSON.stringify(h.sheets.ToDo.rows);h.c.getEvents=()=>events;
 h.c.LockService.getScriptLock=()=>({waitLock(ms){assert.ok(ms>1000);throw Error('Busy')},releaseLock(){throw Error('Not acquired')}});
 assert.equal(h.c.calendarPreparation_(h.ss,false).preparationState,'error');assert.equal(JSON.stringify(h.sheets.ToDo.rows),before);assert.throws(()=>h.c.calendarPreparation_(h.ss,true),/Busy/);
});
test('malformed school rows do not hide habits, companions, valid notices or calendar ownership',()=>{
 const h=harness(),plan={title:'Read notice',child:'Mikaela',sourceText:'Bring a book',tasks:[],event:{enabled:false},warnings:[]};const saved=h.write({note:'save_school_draft',plan,revision:0});assert.equal(saved.status,'ok');
 for(const [id,json,cal] of [['bad-draft','not json',''],['bad-published','null','linked@google.com'],['bad-shape','{}','']])h.sheets.SchoolAnnouncements.appendRow([id,cal?'published':'draft',1,json,cal]);
 const before=JSON.stringify(h.sheets.SchoolAnnouncements.rows),core=h.c.getAllDashboardData(parent,'family-core');assert.equal(core.schoolPlans.length,1);assert.ok(core.habits.length);assert.ok(core.rewards.members.length);assert.match(core.dataWarnings[0],/^3 school/);assert.equal(h.c.schoolEventLinks_()['linked@google.com'].sourceId,'bad-published');assert.equal(h.c.getEvents().length,0);assert.equal(JSON.stringify(h.sheets.SchoolAnnouncements.rows),before);
 const child=h.c.getAllDashboardData('mikaelawonght@gmail.com','family-core');assert.equal(child.dataWarnings.length,0);assert.equal(child.schoolPlans.length,0);
});

test('an event entering the seven-day window gains preparation on the next scheduled snapshot',()=>{
 const {original,family}=bridge();let today='2026-10-15';family.c.Date=class extends Date{constructor(...args){super(...(args.length?args:[today+'T04:00:00Z']))}};
 family.c.getEvents=()=>[{id:'next-week',title:'Nat B Training',dateRaw:'2026-10-23'}];
 assert.equal(post(original,original.c.signedReminderRequest_()).todos.length,0);today='2026-10-16';const ready=post(original,original.c.signedReminderRequest_());assert.equal(ready.status,'ok');assert.equal(ready.todos.length,2);assert.ok(ready.todos.every(t=>t.dueRaw==='2026-10-22'));
});
