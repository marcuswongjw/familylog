const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {harness}=require('./helpers/gas-harness.cjs'),{appHTML}=require('../scripts/build-apps.cjs');
const privateReads=['getExpensesData','getBudgets','getRecurring','getFertilityData','getAppreciationsData','getLoveCheckinsData','getIntimacyLogData','getBucketList'];
test('family dashboard never reads private-parent domains or exposes private activity',()=>{
 const h=harness();for(const fn of privateReads)h.c[fn]=()=>{throw Error('Private read '+fn)};
 h.c.recordActivity_(h.ss,'Marcus','expense_add','Expenses','Private spending','Private note');
 h.write({note:'add_todo',todo_task:'Family task',todo_assignee:'Meaghan'});
 const r=h.c.getAllDashboardData('marcuswongjw@gmail.com','family');assert.equal(r.isAdult,true);assert.equal(r.expenses.total,0);assert.equal(r.budgets.length,0);assert.equal(r.intimacyLog.length,0);assert.ok(r.activityLog.every(e=>['Tasks','Calendar','Habits'].includes(e.category)));assert.ok(!JSON.stringify(r).includes('Private note'));
});
test('parent dashboard denies children and outsiders before reading any data',()=>{
 const h=harness();h.c.SpreadsheetApp.getActiveSpreadsheet=()=>{throw Error('Unexpected read')};
 for(const email of ['mikaelawonght@gmail.com','meaghanwongzx@gmail.com','outside@example.com',''])assert.equal(h.c.getParentDashboardData(email).status,'error');
});
test('parent dashboard has no Calendar/reconciliation or family-record dependency',()=>{
 const h=harness();for(const fn of ['getEvents','syncCalendarEventTasks_','getTodos','getHabits','getHabitLogs','getRewards_','schoolReadPlans_'])h.c[fn]=()=>{throw Error('Family read '+fn)};
 const r=h.c.getParentDashboardData('marcuswongjw@gmail.com');assert.equal(r.status,'ok');assert.equal(r.isAdult,true);assert.ok(r.expenses);assert.equal(r.events,undefined);assert.equal(r.rewards,undefined);
});
test('separate builds exclude the other app screens and parent excludes unused Firebase SDKs',()=>{
 const source=fs.readFileSync('index.html','utf8'),family=appHTML(source,'family'),parents=appHTML(source,'parents');
 assert.ok(!family.includes('id="s-expenses"'));assert.ok(!family.includes('id="s-us"'));assert.ok(family.includes('id="s-habits"'));
 assert.ok(parents.includes('id="s-expenses"'));assert.ok(!parents.includes('id="s-habits"'));assert.ok(!parents.includes('firebase-firestore-compat.js'));assert.ok(parents.includes('firebase-auth-compat.js'));assert.ok(parents.includes('data-app="parents"'));
});
test('old URLs redirect only to a reachable new domain and preserve deep links without sending credentials',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync('index.html','utf8');
 for(const mode of ['family','parents'])for(const ready of [true,false,'dns-error']){
  let target=null,call=null;const script=appHTML(source,mode).match(/<script>(if\(location\.hostname[^<]*)<\/script>/)[1];
  vm.runInNewContext(script,{location:{hostname:'marcuswongjw.github.io',search:'?open=habits',hash:'#habits',replace:url=>target=url},fetch:async(url,options)=>{call={url,options};if(ready==='dns-error')throw Error('DNS');return {ok:ready}}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(call.options.credentials,'omit');assert.equal(call.url,'https://'+mode+'.marcusw.xyz/');assert.equal(target,ready===true?'https://'+mode+'.marcusw.xyz/?open=habits#habits':null);
 }
});

test('family core never waits for Calendar and excludes private data',()=>{
 const h=harness();for(const fn of [...privateReads,'getEvents','syncCalendarEventTasks_'])h.c[fn]=()=>{throw Error('Unexpected slow read '+fn)};
 const r=h.c.getAllDashboardData('marcuswongjw@gmail.com','family-core');assert.equal(r.events,undefined);assert.ok(r.rewards);assert.equal(r.expenses.total,0);
});
test('normal task reads do not acquire a write lock; legacy IDs still migrate',()=>{
 const h=harness();h.c.getTodos(h.ss,'marcuswongjw@gmail.com',true);
 h.c.LockService.getScriptLock=()=>{throw Error('Unexpected lock')};
 assert.equal(h.c.getTodos(h.ss,'marcuswongjw@gmail.com',true).length,0);
});
