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
 const core=fs.readFileSync(path.join(dir,'Code.js'),'utf8'),mode=fs.readFileSync(path.join(dir,'backend.js'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'appsscript.json'),'utf8'));
 assert.ok(!core.includes('SpreadsheetApp.getActiveSpreadsheet()'));assert.ok(mode.includes('FAMILY_BACKEND_MODE_ = true'));assert.ok(mode.includes('FAMILY_SERVICE_FORWARDING_ = false'));assert.ok(manifest.oauthScopes.every(scope=>!scope.includes('gmail')&&!scope.includes('send_mail')));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
