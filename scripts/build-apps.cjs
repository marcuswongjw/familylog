const fs=require('node:fs'),path=require('node:path'),html=require('parse5');
const privatePages=['expenses','budgets','recurring','us','fertility'];
const privateModals=['m-expense','m-budget','m-recurring','m-intimacy','m-love-note','m-love-checkin'];
function attr(n,key){return n.attrs?.find(a=>a.name===key)?.value||''}
function set(n,key,value){const a=n.attrs?.find(a=>a.name===key);if(a)a.value=value;else (n.attrs||=[]).push({name:key,value});}
function appHTML(source,mode){
 const parents=mode==='parents',tree=html.parse(source);
 function walk(node){
  if(node.tagName==='html')set(node,'data-app',mode);
  if(node.tagName==='title'&&parents)node.childNodes=html.parseFragment('Parents’ Corner — Money, together and wellbeing').childNodes;
  if(node.tagName==='meta'&&attr(node,'name')==='apple-mobile-web-app-title'&&parents)set(node,'content','Parents’ Corner');
  if(node.tagName==='script'&&parents&&/firebase-(firestore|storage|functions|messaging)-compat/.test(attr(node,'src')))return false;
  const id=attr(node,'id'),classes=attr(node,'class').split(' ');
  if(classes.includes('section')){
   const page=id.replace(/^s-/,'');
   if(parents&&!['home','more',...privatePages].includes(page))return false;
   if(!parents&&privatePages.includes(page))return false;
   if(parents&&page==='home')node.childNodes=html.parseFragment('<div class="sec-body"></div>').childNodes;
  }
  if(classes.includes('overlay')&&id!=='m-loading-check'&&(parents?!privateModals.includes(id):privateModals.includes(id)))return false;
  if(classes.includes('drawer-item')){
   const match=attr(node,'onclick').match(/navigateDrawer\('([^']+)'\)/);
   if(match&&(parents?!privatePages.includes(match[1]):privatePages.includes(match[1])))return false;
  }
  if(parents&&id==='notifBell')set(node,'hidden','');
  if(parents&&classes.includes('nest-mobile-wordmark'))node.childNodes=html.parseFragment('Parents’ Corner').childNodes;
  if(node.childNodes)node.childNodes=node.childNodes.filter(walk);
  return true;
 }
 walk(tree);
 let result=html.serialize(tree);
 result=result.replace('</head>',`<script>if(location.hostname==='marcuswongjw.github.io'){fetch('https://${parents?'parents':'family'}.marcusw.xyz/',{method:'HEAD',cache:'no-store',credentials:'omit'}).then(r=>{if(r.ok)location.replace('https://${parents?'parents':'family'}.marcusw.xyz/'+location.search+location.hash);}).catch(()=>{});}</script></head>`);
 if(parents){
  result=result.replace('Our family. Our little world.','Household money. A private corner for us.').replace('Who’s coming home?','Who’s signing in?').replace('<h1>Wong’s Nest</h1>','<h1>Parents’ Corner</h1>');
  result=result.replace('</body>','<div hidden><div id="reward-home"></div><div id="rewards-container"></div></div></body>');
 }
 return result;
}
function build(output='public-site'){
 require('./project-config.cjs').checkGenerated();
 fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
 for(const mode of ['family','parents']){
  const dest=mode==='family'?output:path.join(output,'parents');fs.mkdirSync(dest,{recursive:true});
  fs.writeFileSync(path.join(dest,'index.html'),appHTML(fs.readFileSync('index.html','utf8'),mode));
  for(const dir of ['js','css','assets'])fs.cpSync(dir,path.join(dest,dir),{recursive:true});
  for(const file of fs.readdirSync('.').filter(f=>/\.(png|svg)$/.test(f)))fs.copyFileSync(file,path.join(dest,file));
  if(mode==='family'){fs.copyFileSync('manifest.json',path.join(dest,'manifest.json'));fs.copyFileSync('firebase-messaging-sw.js',path.join(dest,'firebase-messaging-sw.js'));}
  else{const manifest=JSON.parse(fs.readFileSync('manifest.json'));manifest.name=manifest.short_name='Parents’ Corner';manifest.description='Household money, Just us and Wellbeing.';delete manifest.share_target;fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2));fs.copyFileSync('parents-sw.js',path.join(dest,'parents-sw.js'));}
 }
}
module.exports={appHTML,build};if(require.main===module)build(process.argv[2]);
