const test=require('node:test'),assert=require('node:assert/strict');
const {liveChecks,runLiveChecks}=require('../scripts/check-live-contracts.cjs');
function good(check){
 if(check.name==='family_readiness')return {status:200,body:{status:'ready',backend:'family'}};
 if(check.name.startsWith('firestore_'))return {status:403,body:{error:{status:'PERMISSION_DENIED',message:'Missing or insufficient permissions.'}}};
 if(check.name.startsWith('storage_'))return {status:403,body:{error:{code:403,message:'Permission denied.'}}};
 return {status:200,body:{status:'error',message:'Unauthorized'}};
}
test('live probes are fixed read-only checks with no credentials or mutation actions',()=>{
 const checks=liveChecks();assert.equal(checks.length,9);
 for(const check of checks){assert.ok(check.url.startsWith('https://'));assert.ok(!check.url.includes('idToken'));assert.ok(['GET','POST'].includes(check.options?.method||'GET'));if(check.options?.method==='POST')assert.deepEqual(Object.keys(JSON.parse(check.options.body)),['action']);assert.ok(!/write|prepare_family_tasks|get_family_calendar/.test(check.options?.body||''));}
});
test('live checks report only fixed labels and pass/fail, never server content or errors',async()=>{
 const checks=liveChecks(),reported=[];let index=0;
 const results=await runLiveChecks({report:r=>reported.push(r),fetchImpl:async(_url,options)=>{assert.ok(options.signal);const result=good(checks[index++]);return {status:result.status,json:async()=>({...result.body,privateText:'never print me'})};}});
 assert.ok(results.every(r=>r.passed));assert.deepEqual(results,reported);assert.ok(!JSON.stringify(results).includes('never print me'));
});
test('login HTML, expired auth, API misconfiguration and unrelated denials do not pass as rules checks',async()=>{
 for(const check of liveChecks()){
  assert.equal(check.accept(200,{}),false);assert.equal(check.accept(404,{error:{code:404}}),false);assert.equal(check.accept(403,{error:{code:403,status:'PERMISSION_DENIED',message:'API is disabled'}}),false);
 }
 const results=await runLiveChecks({fetchImpl:async()=>{throw Error('private URL or token details')}});assert.ok(results.every(r=>!r.passed));assert.ok(!JSON.stringify(results).includes('private'));
});
