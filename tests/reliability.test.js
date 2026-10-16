'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=require('./helpers/app-source.cjs').readAppSource();
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const elements=new Map(), calls={closed:[],cleared:[],messages:[],renders:0};
 const values={'ev-title':'Class','ev-date':'2026-10-06','tk-title':'Pack','tk-id':'','tk-due':'','bd-name':'Birthday','bd-month':'10','bd-day':'6','bud-grp':'School','bud-amt':'10','fert-date':'2026-10-06','rc-name':'Fees','rc-amt':'10','rc-day':'5','ex-desc':'Lunch','ex-amt':'10','ex-date':'2026-10-06','tr-city':'Singapore','tr-country':'Singapore','tr-lat':'1','tr-lng':'103','tr-date':'2026-10-06','sch-child':'Mikaela','sch-act':'Ballet','sch-date':'2026-10-06'};
 const el=id=>{if(!elements.has(id))elements.set(id,{id,value:values[id]||'',innerHTML:'private',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},checked:id==='sch-add-checklist'});return elements.get(id);};
 const timers=new Map();let timerId=0;
 const authUser={email:'marcuswongjw@gmail.com',getIdToken:async()=> 'test-token'};
 const c=vm.createContext({console,Map,Set,Date,Promise,Blob,AbortSignal,pendingHabitLogs:new Set(),sessionGeneration:1,dashboardGeneration:0,currentUserEmail:authUser.email,user:'Marcus',isAdultUser:true,data:{events:[]},GROUPS:{},bucketList:[],memImageBase64:null,lastIdToken:'',schoolDay:'',timelineInterval:null,section:'home',toastT:null,selectedMember:null,selectedCheckinBattery:3,
  ADULT_EMAILS:['marcuswongjw@gmail.com','eleanor.jiamin@gmail.com'],GAS_URL:'mock',firebase:{auth:()=>({currentUser:authUser,signOut:async()=>{}})},
  window:{addEventListener(){}},navigator:{},document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},body:{classList:{add(){},toggle(){}}}},
  setTimeout:f=>{timers.set(++timerId,f);return timerId},clearTimeout:id=>timers.delete(id),clearInterval(){},retrySafePayload:async p=>p,confirmOperation(){},resetMemorySession(){},resetReminders(){},resetRewards(){},schoolReset(){},stopMemoriesListener(){},setAdultAccess:v=>{c.isAdultUser=v},nestFilterChildData(){},buildDynamicSelectors(){},render(){calls.renders++},renderHome(){},renderCal(){},toast:(...a)=>calls.messages.push(a),showError:m=>calls.messages.push([m,true]),startProgressBar(){},finishProgressBar(){},escapeHtml:s=>s,
  v:id=>el(id).value,gc:()=> 'Mikaela',fmtDate:s=>s,fmtTime:s=>s,closeM:id=>calls.closed.push(id),clr:(...ids)=>calls.cleared.push(...ids),confirm:()=>true,alert(){},schoolDayOffset:()=> '2026-10-05',ACTIVITY_TEMPLATES:{ballet:{tasks:[{title:'Pack shoes'},{title:'Pack bottle'}]}},fetch:async()=>({ok:true,json:async()=>({status:'ok'})})});
 vm.runInContext(source.slice(source.indexOf('    // ─── UNDO'),source.indexOf('    // ─── LOGIN')),c);
 vm.runInContext(source.slice(source.indexOf('    function clearSessionState'),source.indexOf('    /** Show/hide Us')),c);
 vm.runInContext(source.slice(source.indexOf('    async function gasRequest'),source.indexOf('    // ─── BUILD DYNAMIC SELECTORS')),c);
 vm.runInContext(source.slice(source.indexOf('    function delEvent'),source.indexOf('    // ─── US')),c);
 return {c,calls,el,timers,authUser};
}
test('late parent dashboard response is ignored after child login',async()=>{
 const h=fixture(), d=defer();h.c.gasRequest=()=>d.promise;const request=h.c.loadData();
 h.c.clearSessionState();h.c.currentUserEmail='mikaelawonght@gmail.com';h.c.user='Mikaela';
 d.resolve({isAdult:true,events:[],intimacyLog:[{id:'private'}]});assert.equal(await request,false);assert.equal(h.c.isAdultUser,false);assert.equal(h.c.data.intimacyLog,undefined);
});
test('latest refresh wins and writes invalidate earlier dashboard reads',async()=>{
 const h=fixture(), a=defer(),b=defer();let n=0;h.c.gasRequest=()=>++n===1?a.promise:b.promise;
 const first=h.c.loadData(), second=h.c.loadData();b.resolve({events:[{id:'new'}],isAdult:true});assert.equal(await second,true);
 a.resolve({events:[{id:'old'}],isAdult:true});assert.equal(await first,false);assert.equal(h.c.data.events[0].id,'new');
 const d=defer();h.c.gasRequest=body=>body.action==='get_family_core'?d.promise:Promise.resolve({status:'ok'});
 const stale=h.c.loadData();await h.c.gPost({note:'add_todo'});d.resolve({events:[{id:'stale'}]});assert.equal(await stale,false);
});
test('child payload discards retained private entries and cannot grant parent access',()=>{
 const h=fixture();h.c.currentUserEmail='mikaelawonght@gmail.com';h.c.data.intimacyLog=[{id:'private'}];
 h.c.applyDashboardPayload({events:[],isAdult:true,intimacyLog:[{id:'injected'}],fertility:[{}],expenses:{total:100}});
 assert.equal(h.c.isAdultUser,false);assert.equal(h.c.data.intimacyLog.length,0);assert.equal(h.c.data.fertility.length,0);assert.equal(h.c.data.expenses.total,0);
});
test('accepted parent dashboard replaces deleted private entries and keeps Firebase memories',()=>{
 const h=fixture();h.c.data={intimacyLog:[{id:'deleted'}],memories:[{id:'photo'}]};h.c.applyDashboardPayload({events:[],isAdult:true,intimacyLog:[]});
 assert.equal(h.c.data.intimacyLog.length,0);assert.equal(h.c.data.memories[0].id,'photo');
});
test('session reset clears identity, private DOM and pending deletions immediately',()=>{
 const h=fixture();h.c.lastIdToken='old';h.c.pushUndo(()=>{},'Removed',{note:'delete_event',event_id:'e'});h.c.clearSessionState();
 assert.equal(h.c.currentUserEmail,'');assert.equal(h.c.lastIdToken,'');assert.equal(h.el('us-container').innerHTML,'');assert.equal(vm.runInContext('_pendingUndo',h.c),null);
});
test('token awaited under an old session cannot start a request for the new session',async()=>{
 const h=fixture(),d=defer();let sent=0;h.authUser.getIdToken=()=>d.promise;h.c.fetch=async()=>{sent++;};
 const p=h.c.gasRequest({action:'get_all'});h.c.clearSessionState();d.resolve('old-token');assert.equal(await p,null);assert.equal(sent,0);assert.equal(h.c.lastIdToken,'');
});
test('failed refresh returns false without clearing the current dashboard',async()=>{
 const h=fixture();h.c.data={events:[{id:'keep'}]};h.c.gasRequest=async()=>null;assert.equal(await h.c.loadData(),false);assert.equal(h.c.data.events[0].id,'keep');
});
for(const fn of ['submitEvent','submitTask','submitBirthday','submitBudget','submitFert','submitRecurring','submitExpense','submitSchedule']){
 test(fn+' preserves form and never reports success on a rejected or lost save',async()=>{
  for(const result of [null,{status:'error',message:'Rejected'}]){const h=fixture();h.c.gasRequest=async()=>result;const btn={};await h.c[fn](btn);assert.deepEqual(h.calls.closed,[]);assert.deepEqual(h.calls.cleared,[]);assert.equal(btn.disabled,false);assert.equal(h.calls.messages.length,0);}
 });
}
test('schedule reports partial checklist failure without retrying the saved event',async()=>{
 const h=fixture(),notes=[];h.c.gasRequest=async body=>{notes.push(body.note || body.action);return notes.length===1?{status:'ok'}:{status:'error'};};
 await h.c.submitSchedule({});assert.deepEqual(notes,['add_event','add_todo','get_family_core','get_family_calendar']);assert.ok(h.calls.messages[0][0].includes('incomplete'));assert.equal(h.calls.messages[0][1],true);assert.ok(h.calls.closed.includes('m-timetable-add'));
});
test('calendar Undo cancels persistent deletion and survives dashboard reload',async()=>{
 const h=fixture();let removed=false;const event={id:'e'};h.c.data.events=[event];h.c.gasRequest=async body=>{if(body.note==='delete_event')removed=true;return {status:'ok',events:removed?[]:[event],isAdult:true};};
 h.c.delEvent('e');assert.equal(h.c.data.events.length,0);await h.c.loadData();assert.equal(h.c.data.events.length,0);h.c.undoLast();await h.c.loadData();assert.equal(removed,false);assert.equal(h.c.data.events.length,1);
});
test('calendar deletion commits after Undo expires and persists on reload',async()=>{
 const h=fixture();let removed=false;h.c.data.events=[{id:'e'}];h.c.gasRequest=async body=>{if(body.note==='delete_event')removed=true;return {status:'ok',events:removed?[]:[{id:'e'}],isAdult:true};};
 h.c.delEvent('e');assert.equal(removed,false);h.c._flushPendingUndo();await new Promise(r=>setImmediate(r));assert.equal(removed,true);await h.c.loadData();assert.equal(h.c.data.events.length,0);
});
test('failed calendar deletion restores event instead of pretending success',async()=>{
 const h=fixture();h.c.data.events=[{id:'e'}];h.c.gasRequest=async()=>({status:'error'});h.c.delEvent('e');h.c._flushPendingUndo();await new Promise(r=>setImmediate(r));assert.equal(h.c.data.events.length,1);assert.ok(h.calls.messages.at(-1)[0].includes('not confirmed'));
});

function loadSchool(h){vm.runInContext(fs.readFileSync(require.resolve('../js/school.js'),'utf8'),h.c);}
test('late extraction cannot repopulate a school review after session reset',async()=>{
 const h=fixture();loadSchool(h);const d=defer();h.c.schoolUpload=async()=>'';h.c.firebase.functions=()=>({httpsCallable:()=>()=>d.promise});
 h.el('school-text').value='Private parent notice';h.el('school-file').files=[];
 const p=h.c.extractSchool(false);await Promise.resolve();h.c.schoolReset();d.resolve({data:{title:'Private',event:{},tasks:[]}});await p;
 assert.equal(vm.runInContext('schoolDraft',h.c),null);assert.equal(h.el('school-review').innerHTML,'');assert.equal(vm.runInContext('schoolBusy',h.c),false);
});
test('late original-image response cannot reveal a source image after reset',async()=>{
 const h=fixture();loadSchool(h);vm.runInContext("schoolDraft={sourcePath:'private'}",h.c);const d=defer();h.c.firebase.functions=()=>({httpsCallable:()=>()=>d.promise});
 const p=h.c.schoolShowSource();h.c.schoolReset();d.resolve({data:{image:'private-image'}});await p;
 assert.equal(h.el('school-source-image').src,'');assert.equal(h.el('school-source-image').hidden,true);
});

test('parent notes and check-ins stay open after failed saves',async()=>{
 for(const fn of ['submitAppreciation','submitLoveCheckin']){const h=fixture();h.el('love-note-msg').value='Keep this note';h.c.gasRequest=async()=>({status:'error'});await h.c[fn]({});assert.deepEqual(h.calls.closed,[]);assert.equal(h.el('love-note-msg').value,'Keep this note');}
});

test('dashboard loading reports errors and provides a bounded timeout for a stuck request',async()=>{const h=fixture(),states=[];h.c.setRewardLoadState=(loading,error)=>states.push({loading,error});h.c.gasRequest=()=>new Promise(()=>{});const result=h.c.loadData();assert.equal(states[0].loading,true);[...h.timers.values()].forEach(f=>f());assert.equal(await result,false);assert.equal(states.at(-1).loading,false);assert.match(states.at(-1).error,/too long/);await new Promise(r=>setImmediate(r));assert.equal(h.timers.size,0);});
test('failed dashboard clears loading and retains the actual backend error',async()=>{const h=fixture(),states=[];h.c.setRewardLoadState=(loading,error)=>states.push({loading,error});h.c.gasRequest=async()=>({status:'error',message:'Permission expired'});assert.equal(await h.c.loadData(),false);assert.equal(states.at(-1).error,'Permission expired');});
test('stale session response cannot change the new account loading state',async()=>{const h=fixture(),states=[],pending=defer();h.c.setRewardLoadState=(loading,error)=>states.push({loading,error});h.c.gasRequest=()=>pending.promise;const result=h.c.loadData();h.c.clearSessionState();pending.resolve({status:'error',message:'Old account'});await result;assert.equal(states.length,1);});

test('transport bounds the fetch and reports a readable timeout instead of a network exception',async()=>{const h=fixture();let signal;h.c.fetch=async(_,options)=>{signal=options.signal;const err=new Error('aborted');err.name='TimeoutError';throw err;};const result=await h.c.gasRequest({action:'get_all'});assert.ok(signal);assert.equal(result.status,'error');assert.match(result.message,/too long/);assert.doesNotMatch(result.message,/save|aborted/);});

test('writes have a separate confirmation window while refresh requests remain bounded',async()=>{const h=fixture(),limits=[];h.c.AbortSignal={timeout:ms=>{limits.push(ms);return {};}};await h.c.gasRequest({action:'write',note:'set_habit_rewards'});await h.c.gasRequest({action:'get_all'});assert.deepEqual(limits,[120000,45000]);});

test('family core renders before calendar and calendar failure retains core data',async()=>{
 const h=fixture(),calendar=defer();h.c.gasRequest=body=>body.action==='get_family_core'?Promise.resolve({todos:[{id:'core'}],rewards:{},isAdult:true}):calendar.promise;
 assert.equal(await h.c.loadData(),true);assert.equal(h.c.data.todos[0].id,'core');assert.equal(h.c.data.calendarState,'loading');
 calendar.resolve({status:'error'});await new Promise(r=>setImmediate(r));assert.equal(h.c.data.calendarState,'error');assert.equal(h.c.data.todos[0].id,'core');
});
test('late calendar hydration cannot overwrite a successful write or switched account',async()=>{
 for(const switchAccount of [false,true]){
  const h=fixture(),calendar=defer(),replacement=defer();let reads=0;h.c.gasRequest=body=>body.action==='get_family_core'?Promise.resolve({todos:[],isAdult:true}):body.action==='get_family_calendar'?(++reads===1?calendar.promise:replacement.promise):Promise.resolve({status:'ok'});
  await h.c.loadData();if(switchAccount)h.c.clearSessionState();else {await h.c.gPost({note:'add_todo'});h.c.data.todos=[{id:'saved'}];}
  calendar.resolve({status:'ok',events:[{id:'stale'}],todos:[]});await new Promise(r=>setImmediate(r));
  assert.ok(!(h.c.data.events||[]).some(e=>e.id==='stale'));if(!switchAccount)assert.equal(h.c.data.todos[0].id,'saved');
 }
});
test('transport routes family reads and writes separately while parents and reminder setup stay original',async()=>{
 for(const [parent,body,expected] of [[false,{action:'get_family_core'},'family'],[false,{action:'write',note:'log_habit'},'family'],[true,{action:'get_parent_dashboard'},'mock'],[true,{action:'write',note:'add_expense'},'mock'],[false,{action:'write',note:'configure_reminder_bridge'},'mock']]){
  const h=fixture();h.c.FAMILY_GAS_URL='family';h.c.isParentApp=()=>parent;let endpoint;h.c.fetch=async url=>{endpoint=url;return {ok:true,json:async()=>({status:'ok'})}};
  await h.c.gasRequest(body);assert.equal(endpoint,expected);
 }
});

test('saves during calendar loading restart hydration and settle on ready or error',async()=>{
 for(const note of ['log_habit','buy_accessory'])for(const failed of [false,true]){
  const h=fixture(),old=defer(),fresh=defer();let reads=0;
  h.c.gasRequest=body=>body.action==='get_family_core'?Promise.resolve({todos:[],isAdult:true}):body.action==='get_family_calendar'?(++reads===1?old.promise:fresh.promise):Promise.resolve({status:failed?'error':'ok'});
  await h.c.loadData();await h.c.gPost({note});assert.equal(reads,2);
  old.resolve({events:[{id:'stale'}],todos:[]});await new Promise(r=>setImmediate(r));assert.equal(h.c.data.calendarState,'loading');assert.equal(h.c.data.events.length,0);
  fresh.resolve(failed?{status:'error'}:{events:[{id:'fresh'}],todos:[{id:'packing'}]});await new Promise(r=>setImmediate(r));assert.equal(h.c.data.calendarState,failed?'error':'ready');if(!failed)assert.equal(h.c.data.events[0].id,'fresh');
 }
});
test('only the newest hydration after overlapping saves may finish calendar loading',async()=>{
 const h=fixture(),reads=[];h.c.gasRequest=body=>{if(body.action==='get_family_core')return Promise.resolve({todos:[],isAdult:true});if(body.action==='write')return Promise.resolve({status:'ok'});const d=defer();reads.push(d);return d.promise;};
 await h.c.loadData();await h.c.gPost({note:'log_habit'});await h.c.gPost({note:'buy_accessory'});assert.equal(reads.length,3);
 reads[1].resolve({events:[{id:'older'}]});await new Promise(r=>setImmediate(r));assert.equal(h.c.data.calendarState,'loading');
 reads[2].resolve({events:[{id:'latest'}]});await new Promise(r=>setImmediate(r));assert.equal(h.c.data.calendarState,'ready');assert.equal(h.c.data.events[0].id,'latest');
 reads[0].resolve({status:'error'});await new Promise(r=>setImmediate(r));assert.equal(h.c.data.calendarState,'ready');
});
test('replacement calendar has a bounded timeout and cannot populate a switched account',async()=>{
 for(const switchAccount of [false,true]){
  const h=fixture();h.c.gasRequest=body=>body.action==='get_family_core'?Promise.resolve({todos:[],isAdult:true}):body.action==='write'?Promise.resolve({status:'ok'}):new Promise(()=>{});
  await h.c.loadData();await h.c.gPost({note:'log_habit'});if(switchAccount)h.c.clearSessionState();[...h.timers.values()].forEach(f=>f());await new Promise(r=>setImmediate(r));assert.equal(h.c.data.calendarState,switchAccount?undefined:'error');assert.equal(h.timers.size,0);
 }
});
test('failed overview preserves an independent Calendar refresh instead of reporting a Calendar failure',async()=>{
 const h=fixture(),calendar=defer();h.c.data={events:[{id:'saved'}],habits:[{id:'saved-habit'}]};
 h.c.gasRequest=body=>body.action==='get_family_core'?Promise.resolve({status:'error'}):calendar.promise;
 assert.equal(await h.c.loadData(),false);assert.equal(h.c.data.calendarState,'loading');
 calendar.resolve({events:[{id:'fresh'}],todos:[]});await new Promise(r=>setImmediate(r));
 assert.equal(h.c.data.calendarState,'ready');assert.equal(h.c.data.events[0].id,'fresh');assert.equal(h.c.data.habits[0].id,'saved-habit');
});

test('calendar-only retry preserves core and stale events until a valid response stamps freshness',async()=>{
 const h=fixture(),pending=defer(),calls=[];
 h.c.data={events:[{id:'saved'}],todos:[{id:'core-task'}],habits:[{id:'habit'}],calendarState:'error',calendarRefreshedAt:123};
 h.c.gasRequest=body=>{calls.push(body.action);return pending.promise;};
 const retry=h.c.retryFamilyCalendar();assert.equal(h.c.data.calendarState,'loading');assert.equal(await h.c.retryFamilyCalendar(),false);assert.equal(calls.length,1);
 assert.equal(h.c.data.events[0].id,'saved');assert.equal(h.c.data.calendarRefreshedAt,123);
 pending.resolve({events:[{id:'fresh'}],todos:[{id:'reconciled'}],preparationState:'ready'});assert.equal(await retry,true);
 assert.deepEqual(calls,['get_family_calendar']);assert.equal(h.c.data.calendarState,'ready');assert.ok(h.c.data.calendarRefreshedAt>123);assert.equal(h.c.data.habits[0].id,'habit');assert.equal(h.c.data.todos[0].id,'reconciled');
});
test('calendar retry errors, malformed replies and timeout retain the last successful freshness',async()=>{
 for(const result of [null,{status:'error'},{status:'ok'},'timeout']){
  const h=fixture();h.c.data={calendarState:'error',calendarRefreshedAt:123,events:[{id:'saved'}]};
  h.c.gasRequest=()=>result==='timeout'?new Promise(()=>{}):Promise.resolve(result);
  const retry=h.c.retryFamilyCalendar();if(result==='timeout')[...h.timers.values()].forEach(f=>f());
  assert.equal(await retry,false);assert.equal(h.c.data.calendarState,'error');assert.equal(h.c.data.calendarRefreshedAt,123);assert.equal(h.c.data.events[0].id,'saved');assert.equal(h.timers.size,0);
 }
});
test('a full refresh prevents duplicate retries and supersedes an earlier Calendar-only retry',async()=>{
 const h=fixture(),core=defer(),manual=defer(),newest=defer();let reads=0;
 h.c.data={events:[{id:'saved'}],calendarState:'error',calendarRefreshedAt:123};
 h.c.gasRequest=body=>body.action==='get_family_core'?core.promise:++reads===1?manual.promise:newest.promise;
 const retry=h.c.retryFamilyCalendar(),loading=h.c.loadData();assert.equal(await h.c.retryFamilyCalendar(),false);
 core.resolve({todos:[{id:'new-core'}],habits:[{id:'habit'}]});await loading;
 newest.resolve({events:[{id:'latest'}],todos:[{id:'latest-task'}]});await new Promise(r=>setImmediate(r));const stamp=h.c.data.calendarRefreshedAt;
 manual.resolve({events:[{id:'stale'}],todos:[]});assert.equal(await retry,false);
 assert.equal(h.c.data.events[0].id,'latest');assert.equal(h.c.data.todos[0].id,'latest-task');assert.equal(h.c.data.calendarRefreshedAt,stamp);
});

test('calendar retry cannot mark another account fresh and offline retries send nothing',async()=>{
 const h=fixture(),pending=defer();let reads=0;h.c.data.calendarState='error';h.c.gasRequest=()=>{reads++;return pending.promise;};
 h.c.navigator.onLine=false;assert.equal(await h.c.retryFamilyCalendar(),false);assert.equal(reads,0);
 h.c.navigator.onLine=true;const retry=h.c.retryFamilyCalendar();h.c.clearSessionState();h.c.user='Mikaela';h.c.currentUserEmail='mikaelawonght@gmail.com';
 pending.resolve({events:[{id:'private'}]});assert.equal(await retry,false);assert.equal(h.c.data.calendarRefreshedAt,undefined);assert.equal(h.c.data.events,undefined);
});

test('background deletion never uses a beacon and retains an account-scoped unconfirmed retry',async()=>{
 for(const beacon of [()=>false,()=>{throw Error('No beacon')}]){
 const h=fixture();let calls=0;h.c.navigator.sendBeacon=()=>{calls++;return beacon()};h.c.data.events=[{id:'e'}];h.c.delEvent('e');h.c._flushPendingUndo(true);assert.equal(calls,0);assert.equal(h.c.pendingDeletionRecords().length,1);
 h.c.currentUserEmail='mikaelawonght@gmail.com';assert.equal(h.c.pendingDeletionRecords().length,0);h.c.currentUserEmail='marcuswongjw@gmail.com';h.c.gasRequest=async()=>({status:'error'});await h.c.retryPendingDeletions();assert.equal(h.c.pendingDeletionRecords().length,1);h.c.gasRequest=async()=>({status:'ok',events:[]});await h.c.retryPendingDeletions();assert.equal(h.c.pendingDeletionRecords().length,0);
 }
});

test('Family sends both reads before the overview resolves and buffers early reconciled tasks',async()=>{
 const h=fixture(),core=defer(),calendar=defer(),calls=[];
 h.c.data={events:[{id:'retained'}],todos:[{id:'retained-task'}],calendarRefreshedAt:123};
 h.c.gasRequest=body=>{calls.push(body.action);return body.action==='get_family_core'?core.promise:calendar.promise;};
 const loading=h.c.loadData();assert.deepEqual(calls,['get_family_core','get_family_calendar']);
 calendar.resolve({events:[{id:'new-calendar'}],todos:[{id:'reconciled-packing'}],completedTasks:[{id:'done'}],schoolTasks:[{id:'reconciled-packing'}]});
 await new Promise(r=>setImmediate(r));assert.equal(h.c.data.todos[0].id,'retained-task');assert.equal(h.c.data.calendarState,'loading');assert.equal(h.c.data.calendarRefreshedAt,123);
 core.resolve({todos:[{id:'older-task'}],habits:[{id:'habit'}],isAdult:true});assert.equal(await loading,true);await new Promise(r=>setImmediate(r));
 assert.equal(h.c.data.todos[0].id,'reconciled-packing');assert.equal(h.c.data.schoolTasks[0].id,'reconciled-packing');assert.equal(h.c.data.completedTasks[0].id,'done');assert.equal(h.c.data.habits[0].id,'habit');assert.equal(h.c.data.calendarState,'ready');
});
test('early Calendar errors wait for the overview and retain previous events and freshness',async()=>{
 const h=fixture(),core=defer();h.c.data={events:[{id:'retained'}],calendarRefreshedAt:123};
 h.c.gasRequest=body=>body.action==='get_family_core'?core.promise:Promise.reject(Error('Calendar offline'));
 const loading=h.c.loadData();await new Promise(r=>setImmediate(r));assert.equal(h.c.data.calendarState,'loading');
 core.resolve({todos:[{id:'core-task'}]});await loading;await new Promise(r=>setImmediate(r));
 assert.equal(h.c.data.calendarState,'error');assert.equal(h.c.data.todos[0].id,'core-task');assert.equal(h.c.data.events[0].id,'retained');assert.equal(h.c.data.calendarRefreshedAt,123);
});
test('an early buffered Calendar cannot populate another account after the overview resolves',async()=>{
 const h=fixture(),core=defer();h.c.gasRequest=body=>body.action==='get_family_core'?core.promise:Promise.resolve({events:[{id:'old-account'}],todos:[{id:'private'}]});
 const loading=h.c.loadData();await new Promise(r=>setImmediate(r));h.c.clearSessionState();h.c.currentUserEmail='mikaelawonght@gmail.com';
 core.resolve({todos:[{id:'old-core'}]});assert.equal(await loading,false);await new Promise(r=>setImmediate(r));assert.equal(h.c.data.events,undefined);assert.equal(h.c.data.todos,undefined);
});
test('overlapping full refreshes cannot consume each other’s buffered Calendar results',async()=>{
 const h=fixture(),reads=[];h.c.gasRequest=body=>{const pending=defer();reads.push({action:body.action,...pending});return pending.promise;};
 const old=h.c.loadData();reads[1].resolve({events:[{id:'old-calendar'}],todos:[{id:'old-packing'}]});await new Promise(r=>setImmediate(r));
 const fresh=h.c.loadData();reads[2].resolve({habits:[{id:'new-habit'}],todos:[]});await fresh;reads[3].resolve({events:[{id:'new-calendar'}],todos:[{id:'new-packing'}]});await new Promise(r=>setImmediate(r));
 reads[0].resolve({todos:[{id:'old-core'}]});assert.equal(await old,false);await new Promise(r=>setImmediate(r));
 assert.equal(h.c.data.events[0].id,'new-calendar');assert.equal(h.c.data.todos[0].id,'new-packing');assert.equal(h.c.data.habits[0].id,'new-habit');
});
test('a write during a pending overview invalidates both reads and restarts Calendar with fresh task data',async()=>{
 const h=fixture(),core=defer(),old=defer(),fresh=defer();let calendars=0;
 h.c.data={events:[],todos:[{id:'saved-task'}],habits:[{id:'saved-habit'}]};
 h.c.gasRequest=body=>body.action==='get_family_core'?core.promise:body.action==='write'?Promise.resolve({status:'ok'}):++calendars===1?old.promise:fresh.promise;
 const loading=h.c.loadData();await h.c.gPost({note:'log_habit'});assert.equal(calendars,2);
 old.resolve({events:[{id:'stale-calendar'}],todos:[]});core.resolve({todos:[{id:'stale-core'}]});assert.equal(await loading,false);
 fresh.resolve({events:[{id:'fresh-calendar'}],todos:[{id:'fresh-task'}]});await new Promise(r=>setImmediate(r));
 assert.equal(h.c.data.todos[0].id,'fresh-task');assert.equal(h.c.data.events[0].id,'fresh-calendar');assert.equal(h.c.data.habits[0].id,'saved-habit');
});
test('Parents overview sends only its own request and does not start Calendar',async()=>{
 const h=fixture(),calls=[];h.c.isParentApp=()=>true;h.c.gasRequest=async body=>{calls.push(body.action);return {isAdult:true,expenses:{total:7}};};
 assert.equal(await h.c.loadData(),true);assert.deepEqual(calls,['get_parent_dashboard']);assert.equal(h.c.data.calendarState,undefined);assert.equal(h.timers.size,0);
});
test('combined Family readiness is measured once across parallel work, without adding overlapping durations',async()=>{
 const h=fixture(),core=defer(),calendar=defer();let clock=100;h.c.performance={now:()=>clock,getEntriesByType:()=>[]};
 vm.runInContext(fs.readFileSync('js/performance.js','utf8'),h.c);h.c.gasRequest=body=>body.action==='get_family_core'?core.promise:calendar.promise;
 const loading=h.c.loadData();clock=160;calendar.resolve({events:[],todos:[]});await new Promise(r=>setImmediate(r));clock=200;core.resolve({todos:[]});await loading;await new Promise(r=>setImmediate(r));
 const samples=h.c.exportNestPerformance().samples.filter(s=>s.endpoint==='family_ready');assert.equal(samples.length,1);assert.equal(samples[0].totalMs,100);assert.equal(samples[0].counts.errors,0);
});

test('the progress bar stays visible until both requests finish and an old hide timer cannot hide a new request',()=>{
 const bar={style:{}},timers=[];
 const c=vm.createContext({document:{getElementById:()=>bar},setInterval:()=>1,clearInterval(){},setTimeout:fn=>timers.push(fn),Math});
 vm.runInContext(source.slice(source.indexOf('    // ─── PROGRESS BAR'),source.indexOf('    // ─── DATA FETCH / WRITE')),c);
 c.startProgressBar();c.startProgressBar();c.finishProgressBar();assert.equal(bar.style.opacity,'1');assert.notEqual(bar.style.width,'100%');
 c.finishProgressBar();assert.equal(bar.style.width,'100%');c.startProgressBar();timers[0]();assert.equal(bar.style.opacity,'1');assert.equal(bar.style.width,'0%');
 c.finishProgressBar();timers[1]();assert.equal(bar.style.opacity,'0');c.startProgressBar();timers[2]();assert.equal(bar.style.opacity,'1');
});
