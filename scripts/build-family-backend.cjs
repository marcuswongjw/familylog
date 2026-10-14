// Standalone Apps Script package. No credentials or copied household records.
const fs=require('node:fs'),path=require('node:path');
function buildFamilyBackend(target) {
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/family-backend.json'),'utf8'));
 fs.mkdirSync(target,{recursive:true});
 const files=['Code.js',...fs.readdirSync(path.join(__dirname,'../gas')).filter(n=>n.endsWith('.js')).map(n=>'gas/'+n)];
 for(const file of files){
  let source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  source=source.replace(/SpreadsheetApp\.getActiveSpreadsheet\(\)/g,"SpreadsheetApp.openById('17TywVuHWmldWATzmarvkMYdInnatgX-jb46ipuCt0_I')");
  if(file==='gas/backend.js')source=source.replace('FAMILY_BACKEND_MODE_ = false','FAMILY_BACKEND_MODE_ = true').replace('FAMILY_SERVICE_FORWARDING_ = true','FAMILY_SERVICE_FORWARDING_ = false');
  fs.writeFileSync(path.join(target,path.basename(file)),source);
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../appsscript.json'),'utf8'));
 manifest.oauthScopes=['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/script.external_request'];
 fs.writeFileSync(path.join(target,'appsscript.json'),JSON.stringify(manifest,null,2));
 fs.writeFileSync(path.join(target,'.clasp.json'),JSON.stringify({scriptId:config.scriptId}));
 return config;
}
if(require.main===module)buildFamilyBackend(process.argv[2]||'/tmp/wongs-nest-family-gas');
module.exports={buildFamilyBackend};
