// Explicit domain lists: adding a file never silently adds it to a deployment.
const fs=require('node:fs'),path=require('node:path');
const {checkGenerated,readProjectConfig,serviceConfig,gasConfigSource}=require('./project-config.cjs');
const root=path.resolve(__dirname,'..');
const shared=['Code.js','gas/config.js','gas/common.js','gas/auth.js','gas/backend.js','gas/performance.js','gas/router.js','gas/rewards.js','gas/calendar.js','gas/tasks.js','gas/archives.js','gas/habits.js','gas/school.js'];
const parentsOnly=['gas/private-parent.js','gas/money.js','gas/bank-import.js','gas/notifications.js'];
function backendSources(service,config=readProjectConfig()){
 serviceConfig(service,config); // Reject an unknown target before building anything.
 const files=service==='family'?shared:[...shared,...parentsOnly];
 return [{'name':'deployment.js',source:gasConfigSource(service,config)},...files.map(file=>({name:path.basename(file),source:fs.readFileSync(path.join(root,file),'utf8')}))];
}
function buildBackend(service,target){
 const config=checkGenerated(),identity=serviceConfig(service,config);
 if(!target||fs.existsSync(target)&&fs.readdirSync(target).length)throw Error('Use a new empty backend staging directory');
 fs.mkdirSync(target,{recursive:true});
 for(const {name,source} of backendSources(service,config))fs.writeFileSync(path.join(target,name),source);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'appsscript.json'),'utf8'));
 if(service==='family')manifest.oauthScopes=['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/script.external_request'];
 fs.writeFileSync(path.join(target,'appsscript.json'),JSON.stringify(manifest,null,2));
 fs.writeFileSync(path.join(target,'.clasp.json'),JSON.stringify({scriptId:identity.scriptId}));
 return identity;
}
if(require.main===module)buildBackend(process.argv[2],process.argv[3]);
module.exports={backendSources,buildBackend,shared,parentsOnly};
