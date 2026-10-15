// Local-only UI fixture. Real frontend + real GAS handlers; external services mocked.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {appHTML}=require('../scripts/build-apps.cjs');
const { harness } = require('./helpers/gas-harness.cjs');
const h = harness();
// Opt-in sample activities live only in this in-memory preview, never production.
if (process.argv.includes('--rewards-demo')) {
 for (const member of ['Mikaela', 'Meaghan']) {
  const task = h.write({note:'add_todo',todo_task:'Pack school bag',todo_assignee:member});
  h.write({note:'set_reward_rule',source_type:'task',source_id:task.id,stars:5});
  const habit = h.write({note:'add_habit',habit:'Read for ten minutes',member,emoji:'📖'});
  h.write({note:'set_reward_rule',source_type:'habit',source_id:habit.id,stars:3});
 }
}
const root = path.resolve(__dirname, '..');
const bootstrap = `
<script>
window.fixtureMemories=Array.from({length:80},(_,i)=>({id:String(80-i),data:()=>({memory:'Memory '+(80-i),date:'2026-10-05',loggedBy:'Marcus',timestamp:{toDate:()=>new Date(2026,0,80-i)}})}));
window.fixtureMemoryListeners=new Set();
window.emitFixtureMemories=()=>fixtureMemoryListeners.forEach(fn=>fn());
function fixtureMemoryQuery(){let first=null,last=null,count=Infinity;
 const docs=()=>fixtureMemories.filter(d=>(!first||Number(d.id)<Number(first.id))&&(!last||Number(d.id)>=Number(last.id))).slice(0,count);
 return {where(){return this},orderBy(){return this},endAt(d){last=d;return this},limit(n){count=n;return this},startAfter(d){first=d;return this},get:async()=>({docs:docs()}),onSnapshot(cb){const notify=()=>cb({docs:docs(),forEach(fn){docs().forEach(fn)}});fixtureMemoryListeners.add(notify);notify();return()=>fixtureMemoryListeners.delete(notify)},doc:()=>({get:async()=>({exists:false}),set:async()=>{},delete:async()=>{}})};
}
window.firebase = {
 initializeApp(){},
 firestore: () => ({enablePersistence:()=>Promise.resolve(),collection:()=>fixtureMemoryQuery()}),
 storage: () => ({}),
 messaging: () => ({useServiceWorker(){},onMessage(){}}),
 functions: () => ({httpsCallable:name=>async payload=>name==='updateReminderSettings'?({data:{settings:payload?.settings||{enabled:false,packing:true,habits:true,overdue:true,includeChildren:false,hour:19,quietStart:21,quietEnd:7},bridgeReady:true}}):({data:{title:'Science Learning Journey',child:'Mikaela',sourceText:'',warnings:['The year is missing. Confirm the date.','End time not provided.'],event:{title:'Science Learning Journey',date:'',time:'07:15',endTime:'',location:'School',evidence:'Report at 7:15am on 23 September.'},tasks:[{title:'Pack water bottle',kind:'packing',due:'',evidence:'Bring a water bottle.'}]}})}),
 auth: () => ({currentUser:{email:'marcuswongjw@gmail.com',getIdToken:async()=> 'fixture-token'},signOut:async()=>{},onAuthStateChanged(cb){cb(null)}})
};
window.fixtureErrors=[]; window.addEventListener('error',e=>fixtureErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));
</script>`;
const setup = `<script>
window.addEventListener('DOMContentLoaded', async()=>{
 window.productionGasRequest=gasRequest;
 firebase.firestore.FieldValue={serverTimestamp:()=>new Date()};
 gasRequest=async body=>{const r=await fetch('/api',{method:'POST',body:JSON.stringify({...body,email:currentUserEmail})});return r.json()};
 window.fixtureLogin=async name=>{schoolReset();user=name;currentUserEmail=MEMBERS.find(m=>m.name===name).email;setAdultAccess(ADULT_EMAILS.includes(currentUserEmail));document.getElementById('login-screen').classList.remove('active');document.getElementById('app-screen').classList.add('active');await loadData();startMemoriesListener()};
 if (!location.search.includes('login-preview')) await fixtureLogin('Marcus');
});
</script>`;
http.createServer(async(req,res)=>{
 try {
  if(req.url==='/api'){
   let body='';for await(const chunk of req)body+=chunk;
   const d=JSON.parse(body), adult=h.c.isAdultEmail_(d.email);
   let result;
   if(d.action==='get_parent_dashboard'){result=h.c.getParentDashboardData(d.email);}
   else if(d.action==='get_all'||d.action==='get_family_dashboard'||d.action==='get_family_core'||d.action==='get_family_calendar'){
    const all=h.c.getTodos(h.ss,d.email,true);
    const links=h.c.schoolEventLinks_();
    result={rewards:h.c.getRewards_(h.ss),habits:h.c.getHabits(h.ss,d.email),habitLogs:h.c.getHabitLogs(h.ss,d.email),todos:all.filter(t=>t.status!=='Done'),completedTasks:all.filter(t=>t.status==='Done'),schoolTasks:all.filter(t=>t.sourceId),schoolPlans:h.c.schoolReadPlans_(h.ss,adult),events:h.c.getEvents(),isAdult:adult,memberName:h.c.memberNameFromEmail_(d.email),expenses:{total:0},expenseGroups:{},bucketList:[]};
    if(d.action==='get_family_core')delete result.events;
   }else if(d.action==='get_rewards')result={status:'ok',rewards:h.c.getRewards_(h.ss)};
   else result=h.write(d,d.email);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  const parentPage=req.url.split('?')[0].startsWith('/parents/');
  const url=(parentPage?req.url.replace('/parents/','/'):req.url).split('?')[0];
  if(url==='/'||url==='/index.html'){
   let html=appHTML(fs.readFileSync(path.join(root,'index.html'),'utf8'),parentPage?'parents':'family').replace(/<script src="https:[^>]+><\/script>/g,'').replace(/<link[^>]+href="https:[^>]+>/g,'');
   html=html.replace('</head>',bootstrap+'</head>').replace('</body>',setup+'</body>');
   res.setHeader('Content-Type','text/html');res.end(html);return;
  }
  if(!/^\/(js\/[\w.-]+\.js|css\/[\w.-]+\.css|assets\/[\w.-]+\.svg|[\w-]+\.png|favicon.svg|manifest.json|parents-sw.js)$/.test(url)){res.writeHead(404);res.end();return;}
  const file=path.join(root,url);res.setHeader('Content-Type',url.endsWith('.js')?'application/javascript':url.endsWith('.css')?'text/css':url.endsWith('.json')?'application/json':url.endsWith('.svg')?'image/svg+xml':'image/png');res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(500);res.end(JSON.stringify({status:'error',message:e.message}));}
}).listen(4173,'127.0.0.1',()=>console.log('School UI fixture: http://127.0.0.1:4173 — mocked external services'));
