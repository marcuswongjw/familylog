'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {readProjectConfig,serviceConfig,publicConfig,gasConfigSource,checkGenerated}=require('../scripts/project-config.cjs');
const {backendSources,buildBackend}=require('../scripts/backend-package.cjs');
test('generated browser, worker, GAS and deployment identities agree with canonical configuration',()=>{
 const config=checkGenerated(),browser=vm.createContext({});vm.runInContext(fs.readFileSync('js/project-config.js','utf8'),browser);
 const client=JSON.parse(vm.runInContext('JSON.stringify(NEST_PUBLIC_CONFIG)',browser));
 for(const name of ['family','parents']){
  const gas=vm.createContext({});vm.runInContext(gasConfigSource(name,config),gas);const settings=gas.deploymentSettings_();
  assert.equal(settings.service,name);assert.equal(settings.spreadsheetId,config.spreadsheetId);assert.equal(settings.calendarId,config.calendarId);assert.equal(settings.familyUrl,client.endpoints.family);assert.equal(settings.parentsUrl,client.endpoints.parents);assert.equal(settings.firebaseApiKey,client.firebase.apiKey);assert.equal(serviceConfig(name).url,client.endpoints[name]);
 }
 const html=fs.readFileSync('index.html','utf8');assert.ok(html.indexOf('src="js/project-config.js')<html.indexOf('src="js/app.js'));
 for(const name of ['parents-sw.js','firebase-messaging-sw.js'])assert.ok(fs.readFileSync(name,'utf8').includes("'./js/project-config.js'"));
});
test('public configuration excludes backend storage IDs and unexpected Firebase fields cannot leak secrets',()=>{
 const config=readProjectConfig(),json=JSON.stringify(publicConfig({...config,approvalSecret:'never-public',spreadsheetId:'private-id'}));
 for(const value of ['never-public','private-id',config.services.family.scriptId,config.services.parents.scriptId])assert.ok(!json.includes(value));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-config-test-'));
 try{
  const file=path.join(dir,'project.json');
  for(const change of [c=>{c.services.family.scriptId=c.services.parents.scriptId},c=>{c.firebase.authDomain='other.firebaseapp.com'},c=>{c.firebase.privateKey='never-public'},c=>{c.sites.family='http://example.com/'},c=>{c.spreadsheetId=''},c=>{c.services.family.deploymentId='https://example.com/'}]){
   const input=structuredClone(config);change(input);fs.writeFileSync(file,JSON.stringify(input));assert.throws(()=>readProjectConfig(file));
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('stale generated identifiers and nonempty backend staging fail closed',()=>{
 const config=readProjectConfig();config.services.family.deploymentId+='changed';assert.throws(()=>checkGenerated(config),/stale/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-staging-test-'));try{fs.writeFileSync(path.join(dir,'old-private.js'),'old');assert.throws(()=>buildBackend('family',dir),/empty/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 assert.throws(()=>backendSources('unknown'),/Unknown/);
});
