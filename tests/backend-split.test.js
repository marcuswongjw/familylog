const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {harness}=require('./helpers/gas-harness.cjs');
function post(h,data){h.c.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType(){return JSON.parse(text)}})};h.c.verifyFirebaseToken=token=>token==='valid'?'marcuswongjw@gmail.com':null;return h.c.doPost({postData:{contents:JSON.stringify(data)}});}
test('family service denies finance, reminder snapshots, unknown actions and unsigned requests',()=>{
 const h=harness();h.c.FAMILY_BACKEND_MODE_=true;h.c.getParentDashboardData=()=>{throw Error('Private read')};
 for(const action of ['get_parent_dashboard','reminder_snapshot','unknown'])assert.equal(post(h,{action,idToken:'valid'}).status,'error');
 for(const note of ['add_expense','delete_expense','add_intimacy','configure_reminder_bridge'])assert.equal(post(h,{action:'write',note,idToken:'valid'}).status,'error');
 assert.equal(post(h,{action:'get_family_core'}).status,'error');
 const r=post(h,{action:'get_all',idToken:'valid'});assert.equal(r.expenses.total,0);assert.equal(r.isAdult,true);
});
test('legacy forwarding bypasses original write lock and never falls back after a lost response',()=>{
 const h=harness();h.c.FAMILY_SERVICE_FORWARDING_=true;h.c.LockService.getScriptLock=()=>{throw Error('Original lock')};let received;
 h.c.UrlFetchApp.fetch=(url,options)=>{received=JSON.parse(options.payload);return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({status:'ok'})}};
 assert.equal(h.c.handleWrite({note:'log_habit',idToken:'valid',_verifiedEmail:'marcuswongjw@gmail.com'}).status,'ok');assert.equal(received.idToken,'valid');assert.equal(received.action,'write');assert.equal(h.ss.getSheetByName('HabitLogs'),null);
 h.c.UrlFetchApp.fetch=()=>{throw Error('Lost response')};assert.throws(()=>h.c.handleWrite({note:'add_todo',idToken:'valid'}),/Lost response/);assert.equal(h.ss.getSheetByName('ToDo'),null);
});
test('family activity and operation writes use separate tabs and preserve legacy retry history',()=>{
 const h=harness(),payload={note:'add_todo',todo_task:'One task',todo_assignee:'Marcus',operation_id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};
 const first=h.write(payload);assert.equal(first.status,'ok');const n=h.sheets.ToDo.rows.length;
 h.c.FAMILY_BACKEND_MODE_=true;assert.equal(h.write(payload).status,'ok');assert.equal(h.sheets.ToDo.rows.length,n);
 const next=h.write({...payload,operation_id:'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'});assert.equal(next.status,'ok');assert.ok(h.sheets.FamilyOperations);assert.ok(h.sheets.FamilyActivityLog);assert.equal(h.sheets.Operations.rows.length,2);
 const log=h.c.getActivityLog(h.ss,h.c.getTodos(h.ss,'marcuswongjw@gmail.com',true),[],'family');assert.ok(log.some(r=>r.description.includes('One task')));
});
test('standalone family package binds the authoritative spreadsheet and excludes Gmail scopes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-backend-test-'));try{
 require('../scripts/build-family-backend.cjs').buildFamilyBackend(dir);
 const config=fs.readFileSync(path.join(dir,'deployment.js'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'appsscript.json'),'utf8'));
 assert.ok(config.includes('"service":"family"'));assert.ok(config.includes(require('../config/project.json').spreadsheetId));assert.ok(manifest.oauthScopes.every(scope=>!scope.includes('gmail')&&!scope.includes('send_mail')));
 for(const name of ['money.js','private-parent.js','bank-import.js','notifications.js'])assert.ok(!fs.existsSync(path.join(dir,name)));
 for(const name of fs.readdirSync(dir).filter(name=>name.endsWith('.js')))assert.ok(!fs.readFileSync(path.join(dir,name),'utf8').includes('SpreadsheetApp.getActiveSpreadsheet()'));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('actual family package serves core/calendar/archives and habits without any parent implementation',()=>{
 const h=harness({service:'family'});
 for(const fn of ['parsePayLah','scanInboxForTransactions','sendFamilyEmail','getExpensesData','getParentDashboardData','getFertilityData','parentHandleWrite_','handleSubmitConfirmedExpense'])assert.equal(typeof h.c[fn],'undefined',fn);
 const before=Object.keys(h.sheets);
 for(const action of ['get_parent_dashboard','get_expenses','get_fertility','get_unknown'])assert.equal(post(h,{action,idToken:'valid'}).status,'error');
 for(const note of ['add_expense','add_intimacy','add_fertility','configure_reminder_bridge'])assert.equal(post(h,{action:'write',note,idToken:'valid'}).status,'error');
 assert.deepEqual(Object.keys(h.sheets),before);
 const created=post(h,{action:'write',note:'add_habit',habit:'Package reading',members:['Mikaela','Meaghan'],idToken:'valid'});assert.equal(created.status,'ok');
 const date=h.c.Utilities.formatDate(new Date(),'Asia/Singapore','yyyy-MM-dd');
 assert.equal(post(h,{action:'write',note:'log_habit',habit_id:created.id,log_member:'Meaghan',date,idToken:'valid'}).status,'ok');
 const core=post(h,{action:'get_family_core',archive_version:1,idToken:'valid'});assert.ok(core.habits.some(x=>x.id===created.id));assert.ok(core.habitLogs.some(x=>x.habitId===created.id&&x.member==='Meaghan'));assert.equal(core.expenses.total,0);assert.equal(core.events,undefined);
 for(const payload of [{action:'get_family_calendar'},{action:'get_completed_tasks'},{action:'get_habit_week',date},{action:'get_family_archive',kind:'habits',habit_id:created.id}])assert.equal(post(h,{...payload,idToken:'valid'}).status,'ok');
 assert.equal(post(h,{action:'get_all',idToken:'valid'}).expenses.total,0);
});

test('actual family package enforces child assignment and rejects private reads before opening the spreadsheet',()=>{
 const h=harness({service:'family'}),created=h.write({note:'add_habit',habit:'Only Mikaela',members:['Mikaela']});
 assert.equal(h.write({note:'log_habit',habit_id:created.id},'meaghanwongzx@gmail.com').status,'error');
 assert.equal(h.write({note:'edit_habit',habit_id:created.id,habit:'Hijack',members:['Meaghan']},'meaghanwongzx@gmail.com').status,'error');
 h.c.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})};h.c.verifyFirebaseToken=()=> 'meaghanwongzx@gmail.com';
 const core=h.c.doPost({postData:{contents:JSON.stringify({action:'get_family_core',idToken:'valid',archive_version:1})}});assert.ok(!core.habits.some(x=>x.id===created.id));assert.equal(core.isAdult,false);
 h.c.SpreadsheetApp.openById=()=>{throw Error('Unexpected private read')};
 assert.equal(post(h,{action:'get_parent_dashboard',idToken:'valid'}).message,'Unavailable in family service');
});

test('family reminder bridge still verifies with the parent runtime after private modules are excluded',()=>{
 const h=harness({service:'family'}),parent=harness();
 parent.c.PropertiesService.getScriptProperties().setProperty('REMINDER_BRIDGE_SECRET','test-only-bridge');
 const signed=parent.c.signedReminderRequest_(),original=h.c.UrlFetchApp.fetch;
 h.c.UrlFetchApp.fetch=(url,options)=>url===h.c.REMINDER_VERIFIER_URL_?{getResponseCode:()=>200,getContentText:()=>JSON.stringify({status:parent.c.reminderAuthorized_(JSON.parse(options.payload))?'ok':'error'})}:original(url,options);
 assert.equal(h.c.reminderSnapshot_(signed).status,'ok');assert.equal(h.c.reminderSnapshot_({...signed,action:'prepare_family_tasks'}).status,'ok');
 assert.throws(()=>h.c.reminderSnapshot_({...signed,signature:'f'.repeat(64)}),/unavailable/);
});

test('actual parent package saves finance locally and forwards legacy family work to the sole family writer',()=>{
 const parent=harness({service:'parents'}),family=harness({service:'family',sheets:parent.sheets,calendar:parent.calendar,calendarEvents:parent.calendarEvents});
 const expense=post(parent,{action:'write',note:'add_expense',ex_desc:'Package expense',ex_amount:5,ex_date:'2026-10-16',ex_account:'Family',ex_category:'Other',idToken:'valid'});assert.equal(expense.status,'ok');
 assert.equal(post(parent,{action:'get_parent_dashboard',idToken:'valid'}).expenses.total,5);
 const original=parent.c.UrlFetchApp.fetch;
 parent.c.UrlFetchApp.fetch=(url,options)=>url===parent.c.FAMILY_SERVICE_URL_?{getResponseCode:()=>200,getContentText:()=>JSON.stringify(post(family,JSON.parse(options.payload)))}:original(url,options);
 parent.c.LockService.getScriptLock=()=>{throw Error('Original runtime must not lock family writes')};
 const task=post(parent,{action:'write',note:'add_todo',todo_task:'Forwarded package task',todo_assignee:'Meaghan',idToken:'valid'});assert.equal(task.status,'ok');
 assert.ok(family.c.getTodos(family.ss).some(t=>t.id===task.id));assert.ok(parent.sheets.FamilyActivityLog);
 const legacy=post(parent,{action:'get_all',idToken:'valid'});assert.equal(legacy.expenses.total,5);assert.ok(legacy.todos.some(t=>t.id===task.id));
});
