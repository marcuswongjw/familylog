'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const elements=new Map(), calls={closed:[],cleared:[],messages:[],renders:0};
 const values={'ev-title':'Class','ev-date':'2026-10-06','tk-title':'Pack','tk-id':'','tk-due':'','bd-name':'Birthday','bd-month':'10','bd-day':'6','bud-grp':'School','bud-amt':'10','fert-date':'2026-10-06','rc-name':'Fees','rc-amt':'10','rc-day':'5','ex-desc':'Lunch','ex-amt':'10','ex-date':'2026-10-06','tr-city':'Singapore','tr-country':'Singapore','tr-lat':'1','tr-lng':'103','tr-date':'2026-10-06','sch-child':'Mikaela','sch-act':'Ballet','sch-date':'2026-10-06'};
 const el=id=>{if(!elements.has(id))elements.set(id,{id,value:values[id]||'',innerHTML:'private',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},checked:id==='sch-add-checklist'});return elements.get(id);};
 const timers=new Map();let timerId=0;
 const authUser={email:'marcuswongjw@gmail.com',getIdToken:async()=> 'test-token'};
 const c=vm.createContext({console,Map,Set,Date,Promise,Blob,pendingHabitLogs:new Set(),sessionGeneration:1,dashboardGeneration:0,currentUserEmail:authUser.email,user:'Marcus',isAdultUser:true,data:{events:[]},GROUPS:{},bucketList:[],memImageBase64:null,lastIdToken:'',schoolDay:'',timelineInterval:null,section:'home',toastT:null,selectedMember:null,selectedCheckinBattery:3,
  ADULT_EMAILS:['marcuswongjw@gmail.com','eleanor.jiamin@gmail.com'],GAS_URL:'mock',firebase:{auth:()=>({currentUser:authUser,signOut:async()=>{}})},
  window:{addEventListener(){}},navigator:{},document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},body:{classList:{add(){},toggle(){}}}},
  setTimeout:f=>{timers.set(++timerId,f);return timerId},clearTimeout:id=>timers.delete(id),clearInterval(){},resetRewards(){},schoolReset(){},stopMemoriesListener(){},setAdultAccess:v=>{c.isAdultUser=v},nestFilterChildData(){},buildDynamicSelectors(){},render(){calls.renders++},renderHome(){},renderCal(){},toast:(...a)=>calls.messages.push(a),showError:m=>calls.messages.push([m,true]),startProgressBar(){},finishProgressBar(){},escapeHtml:s=>s,
  v:id=>el(id).value,gc:()=> 'Mikaela',fmtDate:s=>s,fmtTime:s=>s,closeM:id=>calls.closed.push(id),clr:(...ids)=>calls.cleared.push(...ids),confirm:()=>true,alert(){},schoolDayOffset:()=> '2026-10-05',ACTIVITY_TEMPLATES:{ballet:{tasks:[{title:'Pack shoes'},{title:'Pack bottle'}]}},fetch:async()=>({ok:true,json:async()=>({status:'ok'})})});
 vm.runInContext(source.slice(source.indexOf('    // ─── UNDO'),source.indexOf('    // ─── LOGIN')),c);
 vm.runInContext(source.slice(source.indexOf('    function clearSessionState'),source.indexOf('    /** Show/hide Us')),c);
 vm.runInContext(source.slice(source.indexOf('    async function gasRequest'),source.indexOf('    // ─── BUILD DYNAMIC SELECTORS')),c);
 vm.runInContext(source.slice(source.indexOf('    function delEvent'),source.indexOf('    // ─── TRAVEL')),c);
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
 const d=defer();h.c.gasRequest=body=>body.action==='get_all'?d.promise:Promise.resolve({status:'ok'});
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
for(const fn of ['submitEvent','submitTask','submitBirthday','submitBudget','submitFert','submitRecurring','submitExpense','submitTrip','submitSchedule']){
 test(fn+' preserves form and never reports success on a rejected or lost save',async()=>{
  for(const result of [null,{status:'error',message:'Rejected'}]){const h=fixture();h.c.gasRequest=async()=>result;const btn={};await h.c[fn](btn);assert.deepEqual(h.calls.closed,[]);assert.deepEqual(h.calls.cleared,[]);assert.equal(btn.disabled,false);assert.equal(h.calls.messages.length,0);}
 });
}
test('schedule reports partial checklist failure without retrying the saved event',async()=>{
 const h=fixture(),notes=[];h.c.gasRequest=async body=>{notes.push(body.note || body.action);return notes.length===1?{status:'ok'}:{status:'error'};};
 await h.c.submitSchedule({});assert.deepEqual(notes,['add_event','add_todo','get_all']);assert.ok(h.calls.messages[0][0].includes('incomplete'));assert.equal(h.calls.messages[0][1],true);assert.ok(h.calls.closed.includes('m-timetable-add'));
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
