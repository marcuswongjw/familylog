'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./helpers/gas-harness.cjs');
const {cleanNestSample,nestPerformanceSummary}=require('../js/performance');
const {readSamples}=require('../scripts/performance-report.cjs');
function post(h,p,email='marcuswongjw@gmail.com'){
 h.c.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})};h.c.verifyFirebaseToken=()=>h.c.perfStage_('auth',()=>email);
 return h.c.doPost({postData:{contents:JSON.stringify(p)}});
}
test('server diagnostics count existing reads, retain ownership gates and never log household fields',()=>{
 const h=harness(),logs=[];h.c.console.log=value=>logs.push(String(value));h.c.FAMILY_BACKEND_MODE_=true;
 const result=post(h,{action:'get_family_core',idToken:'secret-token',message:'Private message'});assert.ok(result.habits.length);assert.ok(result._performance.counts.sheet_reads>0);assert.ok(result._performance.counts.rows_scanned>0);assert.ok(result._performance.stages.habits);assert.ok(result._performance.stages.auth);assert.equal(result._performance.endpoint,'get_family_core');assert.equal(result._performance.service,'family');
 const metrics=logs.map(line=>{try{return JSON.parse(line)}catch(_){}}).filter(r=>r?.event==='nest.performance');assert.equal(metrics.length,1);assert.doesNotMatch(JSON.stringify(metrics),/marcus|Mikaela|Violin|secret-token|Private message/i);assert.equal(h.c.perfContext_,null);
 const child=post(h,{action:'get_family_core'},'mikaelawonght@gmail.com');assert.equal(child._performance,undefined);assert.equal(child.expenses.total,0);
 assert.equal(post(h,{action:'write',note:'add_expense'} ,'mikaelawonght@gmail.com').status,'error');assert.equal(h.c.perfContext_,null);
});
test('instrumentation adds no sheet reads and nested stage rows are inclusive',()=>{
 const h=harness();h.c.getAllDashboardData('marcuswongjw@gmail.com','family-core');let reads=0,rows=0;
 for(const sheet of Object.values(h.sheets)){const get=sheet.getDataRange.bind(sheet);sheet.getDataRange=()=>{reads++;const range=get(),values=range.getValues();rows+=values.length;return {getValues:()=>values};};}
 h.c.perfContext_={start:Date.now(),endpoint:'get_family_core',stages:{},counts:{}};h.c.getAllDashboardData('marcuswongjw@gmail.com','family-core');const m=h.c.perfSnapshot_();assert.equal(m.counts.sheet_reads,reads);assert.equal(m.counts.rows_scanned,rows);assert.equal(m.stages.core.rowsScanned,rows);h.c.perfContext_=null;
 const before=reads;h.c.getAllDashboardData('marcuswongjw@gmail.com','family-core');assert.equal(reads-before,reads/2);
});
test('calendar samples count pages/events and include read and lock stages',()=>{
 const h=harness();h.c.FAMILY_BACKEND_MODE_=true;const response=post(h,{action:'get_family_calendar'});assert.equal(response.status,'ok');assert.equal(response._performance.counts.calendar_pages,1);assert.equal(response._performance.counts.calendar_events,0);assert.equal(response._performance.stages.calendar_read.calls,1);assert.equal(response._performance.stages.lock_wait.calls,1);
});
test('percentiles use successful requests and strip unknown labels, payloads and identities',()=>{
 const raw={service:'family',endpoint:'get_family_core',totalMs:20,stages:{habits:{ms:3,calls:1,rowsScanned:10,secret:'private'},private_message:{ms:2,calls:1}},counts:{rows_scanned:10,errors:0,email:'private'},email:'private',payload:{idToken:'token'}};
 const sample=cleanNestSample(raw,'server');assert.doesNotMatch(JSON.stringify(sample),/private|token|email|payload/);const samples=Array.from({length:20},(_,i)=>({...sample,totalMs:(i+1)*10}));samples.push({...sample,totalMs:9999,counts:{errors:1}});const report=nestPerformanceSummary(samples)[0];assert.equal(report.p50Ms,100);assert.equal(report.p95Ms,190);assert.equal(report.samples,20);assert.equal(report.failures,1);assert.equal(report.stages.find(s=>s.name==='habits').p50RowsScanned,10);
});
test('client samples are bounded and session reset removes earlier samples',()=>{
 const c=vm.createContext({console,Date,Map});vm.runInContext(fs.readFileSync('js/performance.js','utf8'),c);for(let i=0;i<220;i++)c.recordNestPerformance({endpoint:'write',totalMs:i,counts:{},stages:{}});assert.equal(c.exportNestPerformance().samples.length,200);assert.equal(c.exportNestPerformance().samples[0].totalMs,20);c.resetNestPerformance();assert.equal(c.exportNestPerformance().samples.length,0);
});
test('report accepts browser exports and Cloud Logging lines but ignores unrelated logs',()=>{
 const sample={schema:1,event:'nest.performance',service:'family',endpoint:'get_family_core',totalMs:100,stages:{},counts:{rows_scanned:50}};
 const input=[JSON.stringify({textPayload:JSON.stringify(sample)}),JSON.stringify({message:'PRIVATE HOUSEHOLD LOG'}),JSON.stringify({jsonPayload:sample})].join('\n');const records=readSamples(input);assert.equal(records.length,2);assert.doesNotMatch(JSON.stringify(records),/PRIVATE/);assert.equal(readSamples(JSON.stringify({samples:[{...sample,source:'server'}]})).length,1);
});

test('browser transport separates token, round-trip and parsing time without retaining tokens',async()=>{
 let clock=0;const c=vm.createContext({Date,Map,console,AbortSignal,performance:{now:()=>clock,getEntriesByType:()=>[]},navigator:{onLine:true},currentUserEmail:'private@example.com',sessionGeneration:1,user:'Private name',FAMILY_GAS_URL:'family',GAS_URL:'parents',lastIdToken:'',firebase:{auth:()=>({currentUser:{getIdToken:async()=>{clock=5;return 'secret-token'}}})},startProgressBar(){},finishProgressBar(){},showError(){},fetch:async()=>{clock=45;return {ok:true,json:async()=>{clock=47;return {status:'ok',_performance:{endpoint:'get_family_core',service:'family',totalMs:30,stages:{auth:{ms:5,calls:1}},counts:{sheet_reads:4}}}}}}});
 vm.runInContext(fs.readFileSync('js/performance.js','utf8'),c);vm.runInContext(fs.readFileSync('js/api.js','utf8'),c);const response=await c.gasRequest({action:'get_family_core'});assert.equal(response._performance,undefined);const result=c.exportNestPerformance(),sample=result.samples.find(s=>s.source==='browser');assert.equal(sample.totalMs,47);assert.equal(sample.stages.token.ms,5);assert.equal(sample.stages.network.ms,40);assert.equal(sample.stages.parse.ms,2);assert.equal(sample.stages.server.ms,30);assert.doesNotMatch(JSON.stringify(result),/private@example|Private name|secret-token/);
});
