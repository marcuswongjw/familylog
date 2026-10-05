// Local-only UI fixture. Real frontend + real GAS handlers; external services mocked.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
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
window.firebase = {
 initializeApp(){},
 firestore: () => ({enablePersistence:()=>Promise.resolve(),collection:()=>({where(){return this},orderBy(){return this},limit(){return this},onSnapshot(cb){cb({docs:[],forEach(){}});return ()=>{}},doc:()=>({set:async()=>{},delete:async()=>{}})})}),
 storage: () => ({}),
 messaging: () => ({useServiceWorker(){}}),
 functions: () => ({httpsCallable:()=>async()=>({data:{title:'Science Learning Journey',child:'Mikaela',sourceText:'',warnings:['The year is missing. Confirm the date.','End time not provided.'],event:{title:'Science Learning Journey',date:'',time:'07:15',endTime:'',location:'School',evidence:'Report at 7:15am on 23 September.'},tasks:[{title:'Pack water bottle',kind:'packing',due:'',evidence:'Bring a water bottle.'}]}})}),
 auth: () => ({currentUser:{email:'marcuswongjw@gmail.com'},onAuthStateChanged(cb){cb(null)}})
};
window.fixtureErrors=[]; window.addEventListener('error',e=>fixtureErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));
</script>`;
const setup = `<script>
window.addEventListener('DOMContentLoaded', async()=>{
 gasRequest=async body=>{const r=await fetch('/api',{method:'POST',body:JSON.stringify({...body,email:currentUserEmail})});return r.json()};
 window.fixtureLogin=async name=>{schoolReset();user=name;currentUserEmail=MEMBERS.find(m=>m.name===name).email;setAdultAccess(ADULT_EMAILS.includes(currentUserEmail));document.getElementById('login-screen').classList.remove('active');document.getElementById('app-screen').classList.add('active');await loadData()};
 if (!location.search.includes('login-preview')) await fixtureLogin('Marcus');
});
</script>`;
http.createServer(async(req,res)=>{
 try {
  if(req.url==='/api'){
   let body='';for await(const chunk of req)body+=chunk;
   const d=JSON.parse(body), adult=h.c.isAdultEmail_(d.email);
   let result;
   if(d.action==='get_all'){
    const all=h.c.getTodos(h.ss,d.email,true);
    const links=h.c.schoolEventLinks_();
    result={rewards:h.c.getRewards_(h.ss),habits:h.c.getHabits(h.ss,d.email),habitLogs:h.c.getHabitLogs(h.ss,d.email),todos:all.filter(t=>t.status!=='Done'),completedTasks:all.filter(t=>t.status==='Done'),schoolTasks:all.filter(t=>t.sourceId),schoolPlans:h.c.schoolReadPlans_(h.ss,adult),events:[...h.calendar.values()].map(e=>({id:e.iCalUID,title:e.summary,dateRaw:(e.start.dateTime||e.start.date).slice(0,10),date:(e.start.dateTime||e.start.date).slice(0,10),time:e.start.dateTime?.slice(11,16)||'All day',tags:links[e.iCalUID]?[links[e.iCalUID].child]:[],location:e.location,notes:'',duration:1})),isAdult:adult,memberName:h.c.memberNameFromEmail_(d.email),expenses:{total:0},expenseGroups:{},bucketList:[]};
   }else result=h.write(d,d.email);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  const url=req.url.split('?')[0];
  if(url==='/'||url==='/index.html'){
   let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="https:[^>]+><\/script>/g,'').replace(/<link[^>]+href="https:[^>]+>/g,'');
   html=html.replace('</head>',bootstrap+'</head>').replace('</body>',setup+'</body>');
   res.setHeader('Content-Type','text/html');res.end(html);return;
  }
  if(!/^\/(js\/[\w.-]+\.js|css\/[\w.-]+\.css|assets\/[\w.-]+\.svg|[\w-]+\.png|favicon.svg|manifest.json)$/.test(url)){res.writeHead(404);res.end();return;}
  const file=path.join(root,url);res.setHeader('Content-Type',url.endsWith('.js')?'application/javascript':url.endsWith('.css')?'text/css':url.endsWith('.json')?'application/json':url.endsWith('.svg')?'image/svg+xml':'image/png');res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(500);res.end(JSON.stringify({status:'error',message:e.message}));}
}).listen(4173,'127.0.0.1',()=>console.log('School UI fixture: http://127.0.0.1:4173 — mocked external services'));
