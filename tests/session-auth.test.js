const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(remember='false'){
 const calls=[];let finish,fail=false;const auth={setPersistence:value=>{calls.push(value);return new Promise((resolve,reject)=>{finish=()=>fail?reject(Error('Blocked')):resolve()})},onAuthStateChanged:handler=>{calls.push('observe');handler(null);return()=>{}}};
 const c=vm.createContext({MEMBERS:[{name:'Marcus',email:'marcus@example.com'}],firebase:{auth:()=>auth},loadPreference:()=>remember});
 vm.runInContext(fs.readFileSync('js/session.js','utf8'),c);
 return{c,calls,finish:()=>finish(),fail:value=>fail=value};
}
test('restored sign-ins are converted to session storage before observation',async()=>{
 const h=setup();let observed=0;const a=h.c.initializeAccountSession(()=>observed++),b=h.c.prepareAccountSession();
 assert.equal(a,b);assert.deepEqual(h.calls,['session']);assert.equal(observed,0);
 h.finish();await a;assert.deepEqual(h.calls,['session','observe']);assert.equal(observed,1);
});
test('durable sign-in requires an existing explicit personal-device preference',async()=>{
 const h=setup('true');const pending=h.c.initializeAccountSession(()=>{});h.finish();await pending;assert.deepEqual(h.calls,['local','observe']);
});
test('failed initial privacy configuration does not observe restored users and allows a retry',async()=>{
 const h=setup();let observed=0;h.fail(true);const pending=h.c.initializeAccountSession(()=>observed++);h.finish();await assert.rejects(pending,/Blocked/);assert.equal(observed,0);
 h.fail(false);const retry=h.c.prepareAccountSession();h.finish();await retry;assert.equal(observed,1);assert.deepEqual(h.calls,['session','session','observe']);
});
