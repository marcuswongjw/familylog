const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){const scripts=[],firebase={};let persistence=0;const c=vm.createContext({firebase,familyAccount:email=>email==='family',currentUserEmail:'family',db:null,storage:null,messaging:null,Map,Promise,Error,setTimeout,clearTimeout,document:{head:{append:s=>scripts.push(s)},createElement:()=>({remove(){this.removed=true;}})}});vm.runInContext(fs.readFileSync('js/firebase-features.js','utf8'),c);return {c,scripts,firebase,get persistence(){return persistence},firestore(){firebase.firestore=()=>({clearPersistence:async()=>{persistence++},terminate:async()=>{}});scripts.at(-1).onload();}};}
test('photo SDK requests are lazy, deduplicated and legacy cache clearing precedes memory-only database use',async()=>{const h=setup();assert.equal(h.scripts.length,0);const a=h.c.ensureMemoryDatabase(),b=h.c.ensureMemoryDatabase();assert.equal(h.scripts.length,1);assert.equal(h.c.db,null);h.firestore();assert.equal(await a,await b);assert.equal(h.persistence,1);await h.c.ensureMemoryDatabase();assert.equal(h.scripts.length,1);});
test('failed feature downloads can retry without poisoning the shared promise',async()=>{const h=setup();const a=h.c.ensurePhotoStorage();h.scripts[0].onerror();await assert.rejects(a,/connection/);assert.equal(h.scripts[0].removed,true);const b=h.c.ensurePhotoStorage();assert.equal(h.scripts.length,2);h.firebase.storage=()=>({ready:true});h.scripts[1].onload();assert.equal((await b).ready,true);});
test('leaving Memories while its library loads cannot open a background listener',async()=>{let ready,started=0;const c=vm.createContext({Map,Date,familyAccount:()=>true,sessionGeneration:1,currentUserEmail:'parent',section:'memories',db:null,memoriesUnsubscribe:null,ensureMemoryDatabase:()=>new Promise(r=>ready=r),showError(){throw Error('unexpected error')}});vm.runInContext(fs.readFileSync('js/memories.js','utf8'),c);c.startMemoriesListener();c.stopMemoriesListener();c.section='home';c.db={collection(){started++;}};ready();await new Promise(r=>setImmediate(r));assert.equal(started,0);});

test('Functions and Messaging share lazy downloads without initializing unrelated photo services',async()=>{const h=setup();const a=h.c.ensureFunctionServices(),b=h.c.ensureFunctionServices();assert.equal(h.scripts.length,1);assert.match(h.scripts[0].src,/firebase-functions-compat/);h.firebase.functions=()=>({callable:true});h.scripts[0].onload();assert.equal((await a).callable,true);await b;const m=h.c.ensurePushMessaging();assert.equal(h.scripts.length,2);h.firebase.messaging=()=>({push:true});h.scripts[1].onload();assert.equal((await m).push,true);assert.equal(h.c.db,null);assert.equal(h.c.storage,null);});

test('both app shells keep only App and Auth as eager Firebase scripts',()=>{const source=fs.readFileSync('index.html','utf8'),{appHTML}=require('../scripts/build-apps.cjs');for(const mode of ['family','parents']){const names=[...appHTML(source,mode).matchAll(/<script src="assets\/firebase-([a-z]+)-compat-9[.]23[.]0[.]js"/g)].map(m=>m[1]);assert.deepEqual(names,['app','auth']);}});

test('cache clearing failure blocks queries and retries the same unstarted service',async()=>{
 const h=setup();let attempts=0;const instance={clearPersistence:async()=>{if(++attempts===1)throw Error('Old tab open')},terminate:async()=>{}};
 h.firebase.firestore=()=>instance;
 await assert.rejects(h.c.ensureMemoryDatabase(),/Close other app tabs/);assert.equal(h.c.db,null);
 assert.equal(await h.c.ensureMemoryDatabase(),instance);assert.equal(attempts,2);
});
test('unknown accounts cannot even load the Memories SDK',async()=>{
 const h=setup();h.c.currentUserEmail='outsider';await assert.rejects(h.c.ensureMemoryDatabase(),/family accounts/);assert.equal(h.scripts.length,0);
});
test('sign-out during cache initialization retires the old service before another session opens',async()=>{
 const h=setup();let clear,retire,instances=0,terminated=0;
 const first={clearPersistence:()=>new Promise(r=>clear=r),terminate:()=>{terminated++;return new Promise(r=>retire=r)}};
 const second={clearPersistence:async()=>{},terminate:async()=>{}};
 h.firebase.firestore=()=>++instances===1?first:second;
 const old=h.c.ensureMemoryDatabase();await new Promise(r=>setImmediate(r));
 h.c.resetMemoryDatabase();assert.equal(h.c.db,null);
 const next=h.c.ensureMemoryDatabase();clear();await assert.rejects(old,/account changed/);
 await new Promise(r=>setImmediate(r));assert.equal(terminated,1);assert.equal(instances,1);
 retire();assert.equal(await next,second);assert.equal(h.c.db,second);
});
