// Explicit, read-only production probes. No tokens, fixture writes or response bodies in output.
const {readProjectConfig,serviceConfig}=require('./project-config.cjs');
function liveChecks(config=readProjectConfig()){
 const json=body=>JSON.stringify(body),post=action=>({method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:json({action})});
 const checks=[{name:'family_readiness',url:serviceConfig('family',config).url+'?action=health',accept:(status,body)=>status===200&&body.status==='ready'&&body.backend==='family'}];
 for(const [service,action] of [['family','get_family_core'],['parents','get_parent_dashboard']])checks.push({name:service+'_anonymous_denied',url:serviceConfig(service,config).url,options:post(action),accept:(status,body)=>status===200&&body.status==='error'&&/unauthorized/i.test(body.message||'')});
 for(const collection of ['memories','users','chat'])checks.push({name:'firestore_'+collection+'_anonymous_denied',url:'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(config.firebase.projectId)+'/databases/(default)/documents/'+collection+'/contract-probe-v1?key='+encodeURIComponent(config.firebase.apiKey),accept:(status,body)=>status===403&&body.error?.status==='PERMISSION_DENIED'&&/missing or insufficient permissions/i.test(body.error?.message||'')});
 for(const [name,path] of [['memories','memories/contract-probe-v1.jpg'],['school','school/contract-probe-v1/contract-probe-v1'],['chat','chat/contract-probe-v1.jpg']])checks.push({name:'storage_'+name+'_anonymous_denied',url:'https://firebasestorage.googleapis.com/v0/b/'+encodeURIComponent(config.firebase.storageBucket)+'/o/'+encodeURIComponent(path),accept:(status,body)=>status===403&&body.error?.code===403&&/permission denied|unauthorized/i.test(body.error?.message||'')});
 return checks;
}
async function runLiveChecks({fetchImpl=fetch,report=()=>{},timeoutMs=45000}={}){
 const results=[];
 for(const check of liveChecks()){
  let passed=false;
  try{const response=await fetchImpl(check.url,{...check.options,signal:AbortSignal.timeout(timeoutMs),redirect:'follow'});const body=await response.json();passed=!!check.accept(response.status,body);}catch(_){}
  const result={check:check.name,passed};results.push(result);report(result);
 }
 return results;
}
if(require.main===module)runLiveChecks({report:result=>console.log(JSON.stringify(result))}).then(results=>{if(results.some(result=>!result.passed))process.exitCode=1;}).catch(()=>{console.error('Live contract checks could not run.');process.exitCode=1;});
module.exports={liveChecks,runLiveChecks};
