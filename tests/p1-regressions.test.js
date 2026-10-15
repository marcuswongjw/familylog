const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers/gas-harness.cjs');
const parent='marcuswongjw@gmail.com';
function fixture(){const h=harness();h.c.Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-15T04:00:00Z']))}};return h;}
function expense(h,name,amount=10){return h.write({note:'add_expense',ex_desc:name,ex_amount:amount,ex_date:'2026-10-15',ex_account:'Family',ex_category:'Household - Groceries'}).id;}
function readExpenses(h){return h.c.getExpensesData(h.ss)}
test('expense IDs survive stale parent deletions, retries and physical row changes',()=>{
 const h=fixture(),a=expense(h,'A'),b=expense(h,'B'),c=expense(h,'C');assert.ok(a&&b&&c);
 assert.equal(h.write({note:'delete_expense',expense_id:a}).status,'ok');assert.equal(h.write({note:'delete_expense',expense_id:b}).status,'ok');assert.equal(h.write({note:'delete_expense',expense_id:b}).status,'ok');
 assert.deepEqual(Array.from(readExpenses(h).rows,r=>r.desc),['C']);assert.equal(readExpenses(h).total,10);
 h.sheets.Expenses.deleteRow(2);assert.equal(h.write({note:'delete_expense',expense_id:c}).status,'ok');assert.equal(readExpenses(h).total,0);
});
test('row-number deletes and header IDs are rejected; legacy IDs migrate once without changing operation IDs',()=>{
 const h=fixture();h.sheets.Expenses=new h.Sheet([['Timestamp','Date','Account','Category','Amount','Note'],[new Date(),new Date('2026-10-15'),'Family','Other',1,'Legacy'],[new Date(),new Date('2026-10-15'),'Family','Other',2,'Retry','op-existing','fingerprint']]);
 const first=readExpenses(h);assert.ok(first.rows.every(r=>r.id));assert.equal(readExpenses(h).rows.find(r=>r.desc==='Legacy').id,first.rows.find(r=>r.desc==='Legacy').id);assert.ok(first.rows.some(r=>r.id==='op-existing'));
 for(const p of [{row_id:1},{row_id:2},{expense_id:'ID'},{expense_id:'missing'}])assert.equal(h.write({note:'delete_expense',...p}).status,'error');assert.equal(h.sheets.Expenses.rows.length,3);
});
test('deleted expenses do not count in budgets or scheduled spending reports',()=>{
 const h=fixture(),id=expense(h,'Deleted groceries',40);const group=Object.keys(h.c.EXPENSE_GROUPS).find(g=>h.c.EXPENSE_GROUPS[g].includes('Household - Groceries'));assert.ok(group);h.write({note:'set_budget',group,budget:100,account:'Family'});assert.equal(h.c.getBudgets(h.ss)[0].spent,40);h.write({note:'delete_expense',expense_id:id});assert.equal(h.c.getBudgets(h.ss)[0].spent,0);
 let mail='';h.c.sendFamilyEmail=(subject,body)=>mail=body;h.c.sendExpenseSummary(new Date('2026-10-15'));assert.ok(mail.includes('$0.00'));assert.ok(!mail.includes('$40.00'));
});
function pending(){const h=fixture();h.c.verifyApprovalToken_=()=>true;h.sheets.PendingExpenses=new h.Sheet([['ID','Date','Account','Category','Amount','Note'],['bank-1','2026-10-15','Family','Other',12.5,'One bank transaction']]);h.sheets.Expenses=new h.Sheet([['Timestamp','Date','Account','Category','Amount','Note']]);return h;}
const approve={id:'bank-1',status:'approve'};
for(const failure of ['append','pending-before-delete','pending-after-delete'])test('bank approval retry recovers exactly once after '+failure,()=>{
 const h=pending();if(failure==='append')h.sheets.Expenses.failAppendAfter=true;else{const remove=h.sheets.PendingExpenses.deleteRow.bind(h.sheets.PendingExpenses);let once=true;h.sheets.PendingExpenses.deleteRow=n=>{if(!once)return remove(n);once=false;if(failure==='pending-after-delete')remove(n);throw Error('Lost delete response')};}
 assert.throws(()=>h.c.handleSubmitConfirmedExpenseInner_(approve));assert.equal(h.c.handleSubmitConfirmedExpenseInner_(approve).status,'ok');assert.equal(h.c.handleSubmitConfirmedExpenseInner_(approve).status,'ok');assert.equal(h.sheets.Expenses.rows.length,2);assert.equal(h.sheets.PendingExpenses.rows.length,1);
});
test('retrying approval cannot resurrect an expense deleted after a partial approval',()=>{
 const h=pending();h.sheets.Expenses.failAppendAfter=true;assert.throws(()=>h.c.handleSubmitConfirmedExpenseInner_(approve));const id=h.sheets.Expenses.rows[1][6];assert.equal(h.write({note:'delete_expense',expense_id:id}).status,'ok');assert.equal(h.c.handleSubmitConfirmedExpenseInner_(approve).status,'ok');assert.equal(h.sheets.Expenses.rows.length,2);assert.equal(readExpenses(h).total,0);
});
function occurrence(h,id,date,start='16:00',end='18:00'){
 const e={id:'series@google.com',seriesId:'series@google.com',restId:id,recurring:true,title:'Nat B Training',start:new Date(date+'T'+start+':00+08:00'),end:new Date(date+'T'+end+':00+08:00'),originalStartTime:{dateTime:date+'T'+start+':00+08:00'}};h.calendarEvents.push(e);return e;
}
test('recurring occurrences list and reconcile independently; last distant occurrence cannot suppress next training',()=>{
 const h=fixture();occurrence(h,'series_20261016T080000Z','2026-10-16');occurrence(h,'series_20261023T080000Z','2026-10-23');occurrence(h,'series_20261216T080000Z','2026-12-16');const events=h.c.getEvents();assert.equal(new Set(events.map(e=>e.id)).size,3);assert.ok(events.every(e=>e.seriesId==='series@google.com'));
 h.c.syncCalendarEventTasks_(h.ss,events);const tasks=h.c.getTodos(h.ss,parent);assert.equal(tasks.length,2);assert.ok(tasks.every(t=>t.dueRaw==='2026-10-15'));
});
test('moving or deleting a later occurrence affects only that occurrence and retains its preparation IDs',()=>{
 const h=fixture(),first=occurrence(h,'first_20261016','2026-10-16'),second=occurrence(h,'second_20261018','2026-10-18');h.c.syncCalendarEventTasks_(h.ss,h.c.getEvents());const before=h.c.getTodos(h.ss,parent);assert.equal(before.length,4);
 assert.equal(h.write({note:'update_event_date',event_id:'instance:second_20261018',new_date:'2026-10-19'}).status,'ok');assert.equal(first.start.toISOString(),'2026-10-16T08:00:00.000Z');assert.equal(second.start.toISOString(),'2026-10-19T08:00:00.000Z');h.c.syncCalendarEventTasks_(h.ss,h.c.getEvents());const after=h.c.getTodos(h.ss,parent);assert.deepEqual(Array.from(after,r=>r.id).sort(),Array.from(before,r=>r.id).sort());assert.equal(after.filter(t=>t.dueRaw==='2026-10-18').length,2);
 assert.equal(h.write({note:'delete_event',event_id:'instance:second_20261018'}).status,'ok');assert.equal(h.write({note:'delete_event',event_id:'instance:second_20261018'}).status,'ok');assert.equal(first.status,undefined);assert.equal(second.status,'cancelled');h.c.syncCalendarEventTasks_(h.ss,h.c.getEvents());assert.equal(h.c.getTodos(h.ss,parent).length,2);
});
test('legacy recurring prep migrates to the matching occurrence without changing completed history or task IDs',()=>{
 const h=fixture();h.c.syncCalendarEventTasks_(h.ss,[{id:'series@google.com',title:'Nat B Training',dateRaw:'2026-10-16'}]);const legacy=h.c.getTodos(h.ss,parent);h.write({note:'complete_todo',todo_id:legacy[0].id},'mikaelawonght@gmail.com');occurrence(h,'first','2026-10-16');occurrence(h,'next','2026-10-20');h.c.syncCalendarEventTasks_(h.ss,h.c.getEvents());const tasks=h.c.getTodos(h.ss,parent,true);assert.equal(tasks.length,4);assert.equal(tasks.find(t=>t.id===legacy[0].id).status,'Done');assert.equal(tasks.find(t=>t.id===legacy[0].id).dueRaw,'2026-10-15');assert.ok(tasks.find(t=>t.id===legacy[0].id).sourceId!==legacy[0].sourceId);
});
for(const allDay of [true,false])test('native '+(allDay?'all-day span':'overnight/multi-day duration')+' survives moving dates',()=>{
 const h=fixture();let result;const start=new Date('2026-10-16T'+(allDay?'00:00:00':'23:15:37')+'+08:00'),end=new Date('2026-10-19T'+(allDay?'00:00:00':'01:15:37')+'+08:00');
 h.c.CalendarApp.getCalendarById=()=>({getEventById:()=>({getTitle:()=> 'Trip',isRecurringEvent:()=>false,isAllDayEvent:()=>allDay,getStartTime:()=>start,getEndTime:()=>end,setAllDayDates:(s,e)=>result=[s,e],setTime:(s,e)=>result=[s,e]})});
 assert.equal(h.write({note:'update_event_date',event_id:'native@google.com',new_date:'2026-10-20'}).status,'ok');assert.equal(result[1]-result[0],end-start);assert.equal(h.c.Utilities.formatDate(result[0],'Asia/Singapore','yyyy-MM-dd'),'2026-10-20');assert.equal(result[0].getSeconds(),start.getSeconds());
});
test('REST all-day occurrences retain the exclusive multi-day end date',()=>{
 const h=fixture(),e=occurrence(h,'all_day_instance','2026-10-16','00:00','00:00');e.allDay=true;e.end=new Date('2026-10-19T00:00:00+08:00');assert.equal(h.write({note:'update_event_date',event_id:'instance:all_day_instance',new_date:'2026-10-20'}).status,'ok');assert.deepEqual(h.calendar.get('all_day_instance').end,{date:'2026-10-23'});
});
test('old clients cannot mutate a series using its shared ID, and source-linked instances stay protected',()=>{
 const h=fixture();let mutated=false;h.c.CalendarApp.getCalendarById=()=>({getEventById:()=>({isRecurringEvent:()=>true,deleteEvent(){mutated=true}})});
 for(const note of ['delete_event','update_event_date'])assert.equal(h.write({note,event_id:'series@google.com',new_date:'2026-10-20'}).status,'error');assert.equal(mutated,false);
 occurrence(h,'protected','2026-10-16');h.c.schoolEventLinks_=()=>({'series@google.com':{sourceId:'school'}});assert.equal(h.write({note:'delete_event',event_id:'instance:protected'}).status,'error');
});
test('calendar pagination is complete, and a failed page never becomes an empty calendar',()=>{
 const h=fixture(),fetch=h.c.UrlFetchApp.fetch;let calls=0;h.c.UrlFetchApp.fetch=(url,options)=>{calls++;if(url.includes('pageToken=next'))return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({items:[]})};return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({items:[],nextPageToken:'next'})};};assert.equal(h.c.getEvents().length,0);assert.equal(calls,2);
 h.c.UrlFetchApp.fetch=(url,options)=>url.includes('pageToken=next')?{getResponseCode:()=>503,getContentText:()=>''}:{getResponseCode:()=>200,getContentText:()=>JSON.stringify({items:[],nextPageToken:'next'})};assert.throws(()=>h.c.getEvents(),/calendar/);
});
test('REST overnight/multi-day occurrences retain duration and reject concurrent edits without mutation',()=>{
 const h=fixture(),e=occurrence(h,'overnight','2026-10-16','23:15','01:15');e.end=new Date('2026-10-19T01:15:00+08:00');const duration=e.end-e.start;
 assert.equal(h.write({note:'update_event_date',event_id:'instance:overnight',new_date:'2026-10-20'}).status,'ok');assert.equal(e.end-e.start,duration);assert.equal(h.c.Utilities.formatDate(e.start,'Asia/Singapore','HH:mm'),'23:15');
 const previous=e.start.toISOString(),fetch=h.c.UrlFetchApp.fetch;h.c.UrlFetchApp.fetch=(url,options)=>options.method==='patch'?{getResponseCode:()=>412,getContentText:()=>''}:fetch(url,options);
 assert.equal(h.write({note:'update_event_date',event_id:'instance:overnight',new_date:'2026-10-22'}).status,'error');assert.equal(e.start.toISOString(),previous);
});
test('expense deletion preserves parent-only access and invalid approval links cannot retire pending transactions',()=>{
 const h=pending(),id=expense(h,'Parent expense');assert.equal(h.write({note:'delete_expense',expense_id:id},'mikaelawonght@gmail.com').status,'error');assert.equal(readExpenses(h).rows.length,1);h.c.verifyApprovalToken_=()=>false;assert.equal(h.c.handleSubmitConfirmedExpenseInner_(approve).status,'error');assert.equal(h.sheets.PendingExpenses.rows.length,2);
});
