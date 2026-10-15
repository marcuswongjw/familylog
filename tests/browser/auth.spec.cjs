const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.goto('/?login-preview');await page.waitForFunction(()=>typeof fixtureAuthListener==='function');});
test.afterEach(async({page})=>{expect(await page.evaluate(()=>fixtureErrors)).toEqual([]);});

test('parent passwords support letters and symbols, clear on success, and use a session by default',async({page})=>{
 await page.getByRole('button',{name:'Marcus',exact:true}).click();
 await page.locator('#login-password').fill('Longer parent password! 2026');
 await page.locator('#login-password').press('Enter');
 await expect(page.locator('#app-screen')).toHaveClass(/active/);
 await expect(page.locator('#login-password')).toHaveValue('');
 expect(await page.evaluate(()=>fixtureAuthPersistence)).toEqual(['session','session']);
 expect(await page.evaluate(()=>loadPreference('rememberDevice','false'))).toBe('false');
});

test('personal-device sign-in is explicit and logout resets the choice and memory state',async({page})=>{
 await page.getByRole('button',{name:'Marcus',exact:true}).click();
 await page.locator('#login-password').fill('123456'); // Existing parent passwords still work.
 await page.locator('#login-remember').check();await page.locator('#login-btn').click();
 await expect(page.locator('#app-screen')).toHaveClass(/active/);
 expect(await page.evaluate(()=>fixtureAuthPersistence.at(-1))).toBe('local');
 await page.evaluate(()=>goTo('memories'));await expect(page.locator('#mem-list')).toContainText('Memory 80');
 await page.evaluate(()=>logout());
 await expect(page.locator('#app-screen')).not.toHaveClass(/active/);
 expect(await page.evaluate(()=>({remember:loadPreference('rememberDevice','false'),db:db===null,memories:data.memories,listener:memoriesUnsubscribe,list:document.getElementById('mem-list').innerHTML}))).toEqual({remember:'false',db:true,memories:[],listener:null,list:''});
 await page.getByRole('button',{name:'Mikaela',exact:true}).click();
 await expect(page.locator('#login-remember')).not.toBeChecked();
 await page.locator('#login-password').fill('654321');await page.locator('#login-btn').click();
 await expect(page.locator('#hname')).toHaveText('Mikaela');
 expect(await page.evaluate(()=>fixtureAuthPersistence.at(-1))).toBe('session');
 await page.evaluate(()=>goTo('memories'));await expect(page.locator('#mem-list')).toContainText('Memory 80');
});

test('children retain six-digit PIN validation and changing members clears credentials',async({page})=>{
 await page.getByRole('button',{name:'Mikaela',exact:true}).click();
 await expect(page.locator('#login-password')).toHaveAttribute('inputmode','numeric');
 await page.locator('#login-password').fill('longer child password');await page.locator('#login-btn').click();
 await expect(page.locator('#login-error')).toContainText('exactly 6 digits');
 await expect(page.locator('#app-screen')).not.toHaveClass(/active/);
 await page.getByRole('button',{name:'Eleanor',exact:true}).click();
 await expect(page.locator('#login-password')).toHaveValue('');
 await expect(page.locator('#login-password')).toHaveAttribute('inputmode','text');
});

test('failed persistence never sends credentials and can retry without a reload',async({page})=>{
 await page.evaluate(()=>{window.authAttempts=0;fixtureAuth.signInWithEmailAndPassword=async()=>authAttempts++;fixtureAuth.setPersistence=async()=>{throw Error('Storage unavailable')};});
 await page.getByRole('button',{name:'Marcus',exact:true}).click();await page.locator('#login-password').fill('Keep this password');
 await page.locator('#login-btn').click();await expect(page.locator('#login-error')).toContainText('Could not sign in');
 expect(await page.evaluate(()=>authAttempts)).toBe(0);
 await expect(page.locator('#login-password')).toHaveValue('Keep this password');await expect(page.locator('#login-btn')).toBeEnabled();
 await page.evaluate(()=>{fixtureAuth.setPersistence=async()=>{};fixtureAuth.signInWithEmailAndPassword=async email=>fixtureAuthListener({email});});
 await page.locator('#login-btn').click();await expect(page.locator('#app-screen')).toHaveClass(/active/);
});

test('an unrecognised restored account is rejected before dashboard, reminders or Memories start',async({page})=>{
 expect(await page.evaluate(async()=>{
  let calls=0;loadData=()=>calls++;initReminders=()=>calls++;firebase.firestore=()=>{calls++;throw Error('must not open')};
  fixtureAuthListener({email:'outsider@example.com'});section='memories';startMemoriesListener();
  try{await ensureMemoryDatabase()}catch(_){}
  return{calls,email:currentUserEmail,adult:isAdultUser};
 })).toEqual({calls:0,email:'',adult:false});
 await expect(page.locator('#login-error')).toContainText('family accounts');await expect(page.locator('#app-screen')).not.toHaveClass(/active/);
});

test('restored family identities are normalised before login and private data stays gated',async({page})=>{
 await page.evaluate(()=>fixtureAuthListener({email:'MIKAELAWONGHT@GMAIL.COM'}));
 await expect(page.locator('#hname')).toHaveText('Mikaela');
 expect(await page.evaluate(()=>({email:currentUserEmail,adult:isAdultUser}))).toEqual({email:'mikaelawonght@gmail.com',adult:false});
});

test('bundled Firestore SDK clears a legacy disk cache and recreates a memory-only session after reset',async({page})=>{
 // Use the pinned, real SDK on an isolated page, with all Firestore network requests blocked.
 await page.route('**/sdk-privacy-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Local SDK privacy check</title>'}));
 await page.route('https://firestore.googleapis.com/**',route=>route.abort());
 await page.goto('/sdk-privacy-check');
 for(const name of ['app','auth','firestore'])await page.addScriptTag({url:'/assets/firebase-'+name+'-compat-9.23.0.js'});
 await page.evaluate(async()=>{
  window.fixtureErrors=[];
  firebase.initializeApp({projectId:'demo-familylog',apiKey:'local-fixture',appId:'local-fixture'});
  const legacy=firebase.firestore();await legacy.enablePersistence();await legacy.disableNetwork();
  legacy.collection('memories').doc('legacy').set({memory:'Old cached memory'}).catch(()=>{});
  await legacy.collection('memories').doc('legacy').get({source:'cache'});await legacy.terminate();
  window.db=null;window.currentUserEmail='family';window.familyAccount=email=>email==='family';
 });
 await page.addScriptTag({url:'/js/firebase-features.js'});
 expect(await page.evaluate(async()=>{
  const first=await ensureMemoryDatabase();await first.disableNetwork();
  const old=await first.collection('memories').get({source:'cache'});
  resetMemoryDatabase();const second=await ensureMemoryDatabase();await second.disableNetwork();
  const cacheNames=(await indexedDB.databases()).map(d=>d.name);
  const result={legacyExists:old.docs.some(doc=>doc.id==='legacy'),fresh:first!==second,diskCache:cacheNames.some(name=>name.startsWith('firestore/'))};
  resetMemoryDatabase();return result;
 })).toEqual({legacyExists:false,fresh:true,diskCache:false});
});

test('legacy cache cleanup failure is visible and retryable without opening a listener',async({page})=>{
 await page.evaluate(async()=>{await fixtureLogin('Marcus');window.privacyAttempts=0;firebase.firestore=()=>({clearPersistence:async()=>{if(++privacyAttempts===1)throw Error('Another tab holds the cache')},terminate:async()=>{},collection:()=>fixtureMemoryQuery()});goTo('memories');});
 await expect(page.locator('#mem-list')).toContainText('Close other app tabs');
 expect(await page.evaluate(()=>fixtureMemoryListeners.size)).toBe(0);
 await page.locator('#mem-list').getByRole('button',{name:'Try again'}).click();
 await expect(page.locator('#mem-list')).toContainText('Memory 80');
 expect(await page.evaluate(()=>privacyAttempts)).toBe(2);
});

test('parent app rejects a restored child before loading any private data',async({page})=>{
 await page.goto('/parents/?login-preview');await page.waitForFunction(()=>typeof fixtureAuthListener==='function');
 expect(await page.evaluate(()=>{let calls=0;loadData=()=>calls++;initReminders=()=>calls++;fixtureAuthListener({email:'mikaelawonght@gmail.com'});return{calls,email:currentUserEmail,adult:isAdultUser};})).toEqual({calls:0,email:'',adult:false});
 await expect(page.locator('#login-error')).toContainText('only to parents');
 await expect(page.locator('#app-screen')).not.toHaveClass(/active/);
});
