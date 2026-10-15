const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{page.on('dialog',dialog=>dialog.accept());await page.goto('/');await expect(page.locator('#app-screen')).toHaveClass(/active/);});
test.afterEach(async({page})=>{expect(await page.evaluate(()=>fixtureErrors)).toEqual([]);});
test('failed form preserves input and reports no success',async({page})=>{await page.evaluate(()=>{gasRequest=async()=>({status:'error',message:'Rejected'});openM('m-task');});await page.locator('#tk-title').fill('Keep this task');await page.locator('#tk-submit').click();await expect(page.locator('#m-task')).toHaveClass(/open/);await expect(page.locator('#tk-title')).toHaveValue('Keep this task');await expect(page.locator('#tk-submit')).toBeEnabled();});
test('Undo cancels deletion before any request and failed expiry restores the event',async({page})=>{expect(await page.evaluate(async()=>{data.events=[{id:'e',title:'Class',dateRaw:'2026-10-06'}];let calls=0;gasRequest=async()=>{calls++;return {status:'error'}};delEvent('e');undoLast();const undo={calls,count:data.events.length};delEvent('e');await new Promise(r=>setTimeout(r,5500));return {undo,calls,count:data.events.length};})).toEqual({undo:{calls:0,count:1},calls:1,count:1});});
test('late parent response cannot populate a child session',async({page})=>{expect(await page.evaluate(async()=>{let finish;gasRequest=()=>new Promise(r=>finish=r);const pending=loadData();clearSessionState();user='Mikaela';currentUserEmail='mikaelawonght@gmail.com';finish({isAdult:true,expenses:{total:999},events:[]});await pending;return {adult:isAdultUser,expenses:data.expenses};})).toEqual({adult:false});});
test('shared habits record separately for each child',async({page})=>{expect(await page.evaluate(async()=>{const added=await gasRequest({action:'write',note:'add_habit',habit:'Read together',member:'Everyone'});await gasRequest({action:'write',note:'log_habit',habit_id:added.id,log_member:'Mikaela',date:schoolToday()});await loadData();return {own:data.habitLogs.some(l=>l.habitId===added.id&&l.member==='Mikaela'),other:data.habitLogs.some(l=>l.habitId===added.id&&l.member==='Meaghan')};})).toEqual({own:true,other:false});});
test('modal traps focus, Escape restores it, and backdrop uses the same close path',async({page})=>{await page.evaluate(()=>{const opener=document.querySelector('#notifBell');opener.focus();openM('m-task');});await expect(page.locator('#m-task .modal')).toHaveAttribute('aria-modal','true');await page.locator('#tk-submit').focus();await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement.closest('#m-task'))).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('#m-task')).not.toHaveClass(/open/);await expect(page.locator('#notifBell')).toBeFocused();await page.evaluate(()=>{openM('m-task');document.querySelector('#m-task').click()});await expect(page.locator('#notifBell')).toBeFocused();});
test('offline reward completion is rejected without sending or queuing a write',async({page,context})=>{await context.setOffline(true);expect(await page.evaluate(async()=>{gasRequest=window.productionGasRequest;const result=await gPost({note:'log_habit',habit_id:'x',date:schoolToday()});return {status:result.status,message:result.message};})).toMatchObject({status:'error',message:expect.stringContaining('not queued')});await expect(page.locator('#connection-status')).toContainText('Offline');});
test('photo retry reuses upload and confirms metadata before clearing preview',async({page})=>{expect(await page.evaluate(async()=>{const docs=new Map();let uploads=0,fail=true;const previousDb=db,previousStorage=storage;db={collection:()=>({doc:id=>({get:async()=>({exists:docs.has(id),data:()=>docs.get(id)}),set:async p=>{if(fail){fail=false;throw Error('Metadata failed')};docs.set(id,p)}})})};storage={ref:()=>({getMetadata:async()=>{if(!uploads)throw {code:'storage/object-not-found'}},put:async()=>uploads++,updateMetadata:async()=>{},getDownloadURL:async()=> 'https://example.com/photo.jpg'})};firebase.firestore.FieldValue={serverTimestamp:()=>new Date()};memImageBase64='data:image/jpeg;base64,AA==';openM('m-memory');document.querySelector('#mem-text').value='Keep photo';await submitMemory();const retained=!!memImageBase64;await submitMemory();db=previousDb;storage=previousStorage;return {retained,uploads,docs:docs.size,cleared:memImageBase64===null};})).toEqual({retained:true,uploads:1,docs:1,cleared:true});});

test('companions respect reduced motion and refreshed status is visible',async({page})=>{await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>goTo('rewards'));await expect(page.locator('#connection-status')).toContainText('Last refreshed');const animation=await page.evaluate(()=>{const el=document.querySelector('.reward-character');el?.closest('.reward-hero-art')?.classList.add('reward-happy');return el?getComputedStyle(el).animationName:'none';});expect(animation).toBe('none');});

test('habits list filters a person and shared progress without exposing siblings to children',async({page})=>{
 await page.evaluate(()=>{data.habits=[{id:'own',habit:'Mikaela reading',member:'Mikaela',schedule:'daily',state:'active'},{id:'other',habit:'Meaghan phonics',member:'Meaghan',schedule:'daily',state:'active'},{id:'shared',habit:'Shared tidy',member:'Everyone',schedule:'daily',state:'active'}];goTo('habits');});
 await page.locator('#habit-layout').selectOption('list');await page.locator('#habit-person').selectOption('Mikaela');
 await expect(page.locator('.habit-list .habit-card')).toHaveCount(2);await expect(page.locator('#habits-container')).not.toContainText('Meaghan phonics');
 await page.evaluate(()=>{user='Meaghan';setAdultAccess(false);renderHabits();});
 await expect(page.locator('#habit-person')).toHaveCount(0);await expect(page.locator('#habits-container')).not.toContainText('Mikaela reading');
});

test('Home fits desktop and mobile with today before the family overview on mobile',async({page})=>{
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.evaluate(()=>goTo('home'));
 const bounds=await page.evaluate(()=>{const today=document.querySelector('#today-wrap').getBoundingClientRect(),crew=document.querySelector('#dash-members').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,todayWidth:today.width,crewWidth:crew.width,todayY:today.y,crewY:crew.y};});
 expect(bounds.overflow).toBe(false);expect(bounds.todayWidth).toBeGreaterThan(300);if(width===390)expect(bounds.todayY).toBeLessThan(bounds.crewY);else expect(bounds.crewWidth).toBeGreaterThanOrEqual(290);
 }
});

test('new companions save through the backend and the life jacket renders after purchase',async({page})=>{
 await page.evaluate(async()=>{for(let i=0;i<3;i++){const t=await gasRequest({action:'write',note:'add_todo',todo_task:'Fixture stars '+i,todo_assignee:'Marcus',todo_stars:5});await gasRequest({action:'write',note:'complete_todo',todo_id:t.id});}const p=(await gasRequest({action:'get_rewards'})).rewards.members.find(m=>m.member===user);await gasRequest({action:'write',note:'save_companion',species:p.species,companion_name:p.name,equipped:''});await loadData();goTo('rewards');});
 await expect(page.locator('[name="reward-species"]')).toHaveCount(8);
 for(const species of ['turtle','dolphin','penguin','otter']){await page.locator('[name="reward-species"][value="'+species+'"]').check();await page.locator('#reward-profile-form button[type="submit"], #reward-profile-form .btn-p').click();await expect.poll(()=>page.evaluate(()=>rewardProfile().species)).toBe(species);}
 if(!await page.evaluate(()=>rewardProfile().owned.includes('life-jacket')))await page.locator('[data-accessory="life-jacket"]').click();await expect.poll(()=>page.evaluate(()=>rewardProfile().owned.includes('life-jacket'))).toBe(true);
 await page.locator('[data-accessory="life-jacket"]').click();await expect.poll(()=>page.evaluate(()=>rewardProfile().equipped)).toBe('life-jacket');await expect(page.locator('.reward-hero-art svg')).toHaveAttribute('aria-label',/otter.*wearing an accessory/);
});

test('family gallery shows current companions without editing others; reward administration is separate and parent-only',async({page})=>{
 await page.evaluate(()=>goTo('rewards'));await expect(page.locator('#reward-habit-form')).toHaveCount(0);await expect(page.locator('#reward-rule-form')).toHaveCount(0);await expect(page.locator('#family-goal-form')).toHaveCount(0);
 await page.getByRole('button',{name:'Visit family companions'}).click();await expect(page.locator('.companion-visit-card')).toHaveCount(4);await expect(page.locator('.companion-visit-card')).toContainText(['Marcus','Eleanor','Mikaela','Meaghan']);
 await page.locator('.companion-greeting').first().click();await expect(page.locator('#companion-gallery input')).toHaveCount(0);
 await page.getByRole('button',{name:'Dress my companion'}).click();await page.locator('#rewards-container').getByRole('button',{name:'Reward settings',exact:true}).click();await expect(page.locator('#reward-habit-form')).toBeVisible();await expect(page.locator('#reward-rule-form')).toBeVisible();await expect(page.locator('#family-goal-form')).toBeVisible();
 const first=page.locator('[data-habit-stars]').first();await first.fill('7');await page.locator('#reward-habit-form button[type="submit"]').click();await expect.poll(()=>page.evaluate(()=>data.rewards.rules.some(r=>r.type==='habit'&&r.stars===7))).toBe(true);
 await page.evaluate(()=>{user='Mikaela';currentUserEmail='mikaelawonght@gmail.com';setAdultAccess(false);goTo('companions');});await expect(page.locator('.companion-visit-card')).toHaveCount(4);await page.evaluate(()=>goTo('reward-admin'));await expect(page.locator('#s-reward-admin')).not.toHaveClass(/active/);
});
test('habit form selects multiple people, edits assignment and limits logging to selected people',async({page})=>{
 await page.evaluate(()=>openAddHabitModal());await page.locator('#hab-name').fill('Selected people habit');
 await page.locator('#hab-member input[value="Marcus"]').uncheck();await page.locator('#hab-member input[value="Mikaela"]').check();await page.locator('#hab-member input[value="Meaghan"]').check();await page.locator('#hab-submit').click();await expect(page.locator('#m-habit')).not.toHaveClass(/open/);
 const id=await page.evaluate(()=>data.habits.find(h=>h.habit==='Selected people habit').id);
 await page.evaluate(id=>openHabitLogModal(id),id);await expect(page.locator('#hl-member option')).toHaveText(['Mikaela','Meaghan']);await page.keyboard.press('Escape');
 await page.evaluate(id=>openAddHabitModal(id),id);await expect(page.locator('#hab-member input[value="Mikaela"]')).toBeChecked();await expect(page.locator('#hab-member input[value="Meaghan"]')).toBeChecked();await page.locator('#hab-member input[value="Meaghan"]').uncheck();await page.locator('#hab-submit').click();await expect(page.locator('#m-habit')).not.toHaveClass(/open/);
 expect(await page.evaluate(id=>habitMembers(data.habits.find(h=>h.id===id)),id)).toEqual(['Mikaela']);
});
test('an all-day calendar move reaches the real backend handler and survives refresh',async({page})=>{
 const result=await page.evaluate(async()=>{const date=schoolToday(),next=schoolDayOffset(date,1);const created=await gPost({note:'add_event',event_title:'P1 all-day move',event_date:date,event_time:'',event_member:'Mikaela'});const moved=await gPost({note:'update_event_date',event_id:created.id,new_date:next});await loadData();return {created,moved,next,id:created.id};});
 expect(result.created.status).toBe('ok');expect(result.moved.status).toBe('ok');await expect.poll(()=>page.evaluate(id=>data.events.find(e=>e.id===id)?.dateRaw,result.id)).toBe(result.next);await page.reload();await expect(page.locator('#app-screen')).toHaveClass(/active/);await expect.poll(()=>page.evaluate(id=>data.events.find(e=>e.id===id)?.dateRaw,result.id)).toBe(result.next);
});

test('habit form retries a lost successful response without adding a second shared habit',async({page})=>{
 await page.evaluate(()=>{const request=gasRequest;let lost=false;gasRequest=async payload=>{const result=await request(payload);if(payload.note==='add_habit'&&!lost){lost=true;return {status:'error',message:'Response lost. Please retry.'};}return result;};openAddHabitModal();});
 await page.locator('#hab-name').fill('Retry shared reading');await page.locator('#hab-member input[value="Marcus"]').uncheck();await page.locator('#hab-member input[value="Mikaela"]').check();await page.locator('#hab-member input[value="Meaghan"]').check();
 await page.locator('#hab-submit').click();await expect(page.locator('#m-habit')).toHaveClass(/open/);await expect(page.locator('#hab-submit')).toBeEnabled();await expect(page.locator('#hab-name')).toHaveValue('Retry shared reading');
 await page.locator('#hab-submit').click();await expect(page.locator('#m-habit')).not.toHaveClass(/open/);expect(await page.evaluate(()=>data.habits.filter(h=>h.habit==='Retry shared reading').length)).toBe(1);
});

test('habit save during calendar loading recovers without a manual refresh',async({page})=>{
 const result=await page.evaluate(async()=>{
  const original=gasRequest,calendar=[];
  gasRequest=payload=>payload.action==='get_family_calendar'?new Promise(resolve=>calendar.push(resolve)):original(payload);
  await loadData();const initial=data.calendarState;
  const saved=await gPost({note:'add_habit',habit:'Calendar loading regression',members:['Mikaela','Meaghan']});
  calendar[0]({events:[{id:'stale-calendar'}],todos:[]});await new Promise(r=>setTimeout(r,0));const pending=data.calendarState;
  calendar[1]({events:[],todos:[],completedTasks:[],schoolTasks:[]});await new Promise(r=>setTimeout(r,0));
  return {initial,pending,status:saved.status,reads:calendar.length,final:data.calendarState,stale:data.events.some(e=>e.id==='stale-calendar')};
 });
 expect(result).toEqual({initial:'loading',pending:'loading',status:'ok',reads:2,final:'ready',stale:false});
 await expect(page.locator('#dash-summary')).not.toContainText('Loading the family calendar');
});

test('partial school and preparation warnings keep healthy family screens usable and clear on logout',async({page})=>{
 await page.evaluate(async()=>{const request=gasRequest;gasRequest=async payload=>{const result=await request(payload);if(payload.action==='get_family_core'||payload.action==='get_family_calendar'){result.dataWarnings=['One school notice needs repair. Other family data is available.'];if(payload.action==='get_family_calendar')result.preparationState='error';}return result;};await loadData();});
 await expect(page.locator('#data-warning')).toBeVisible();await expect(page.locator('#data-warning')).toContainText('One school notice needs repair');await expect(page.locator('#data-warning')).toContainText('preparation tasks could not refresh');
 await page.evaluate(()=>goTo('habits'));await expect(page.locator('#s-habits')).toHaveClass(/active/);await page.evaluate(()=>clearSessionState());await expect(page.locator('#data-warning')).toBeHidden();
});

test('memory archive keeps its boundary after insertion and updates older records live',async({page})=>{
 await page.evaluate(()=>goTo('memories'));await page.getByRole('button',{name:'Load older memories'}).click();await expect.poll(()=>page.evaluate(()=>data.memories.length)).toBe(80);
 await page.evaluate(()=>{fixtureMemories.unshift({id:'81',data:()=>({memory:'Newest memory',type:42,timestamp:{toDate:()=>new Date(2026,0,81)}})});emitFixtureMemories();});
 await expect.poll(()=>page.evaluate(()=>data.memories.length)).toBe(81);expect(await page.evaluate(()=>data.memories.some(m=>m.id==='31'))).toBe(true);
 await page.evaluate(()=>{fixtureMemories=fixtureMemories.filter(d=>d.id!=='3').map(d=>d.id==='2'?{id:'2',data:()=>({memory:'Older memory edited',type:'Moment',timestamp:{toDate:()=>new Date(2026,0,2)}})}:d);emitFixtureMemories();});
 await expect(page.locator('#mem-list')).toContainText('Older memory edited');expect(await page.evaluate(()=>data.memories.some(m=>m.id==='3'))).toBe(false);
});

test('photo viewer and mobile drawer trap focus, close with Escape and restore the opener',async({page})=>{
 await page.evaluate(()=>{document.querySelector('#mem-list').innerHTML=mediaImgHtml('https://example.com/photo.jpg');goTo('memories');document.querySelector('#mem-list').innerHTML=mediaImgHtml('https://example.com/photo.jpg');});
 const photo=page.getByRole('button',{name:'Open photo'}).first();await photo.focus();await page.keyboard.press('Enter');await expect(page.locator('#chat-lightbox')).toHaveClass(/open/);await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close photo'})).toBeFocused();await page.keyboard.press('Escape');await expect(photo).toBeFocused();
 await page.evaluate(()=>{document.querySelector('#notifBell').focus();toggleMenuDrawer(true)});await expect(page.locator('#menu-drawer')).toHaveAttribute('role','dialog');await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>!!document.activeElement.closest('#menu-drawer'))).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('#menu-drawer')).not.toHaveClass(/open/);await expect(page.locator('#notifBell')).toBeFocused();
});
test('background deletion survives reload without a beacon and retries only after user confirmation',async({page})=>{
 const id=await page.evaluate(async()=>{const r=await gPost({note:'add_event',event_title:'Deferred delete regression',event_date:schoolToday(),event_member:'Mikaela'});await loadData();while(data.calendarState==='loading')await new Promise(r=>setTimeout(r,10));window.beaconCalls=0;navigator.sendBeacon=()=>{beaconCalls++;throw Error('Beacon unavailable')};delEvent(r.id);_flushPendingUndo(true);return r.id;});
 expect(await page.evaluate(()=>beaconCalls)).toBe(0);await page.reload();await expect(page.locator('#deletion-status')).toBeVisible();await expect.poll(()=>page.evaluate(id=>data.events.some(e=>e.id===id),id)).toBe(true);await page.getByRole('button',{name:'Retry deletion',exact:true}).click();await expect(page.locator('#deletion-status')).toBeHidden();await expect.poll(()=>page.evaluate(id=>data.calendarState==='ready'&&!data.events.some(e=>e.id===id),id)).toBe(true);
});
test('installed app shell starts offline with cached versioned assets and local Firebase SDKs',async({page,context})=>{
 await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);await context.setOffline(true);await page.reload();await expect(page.locator('#app-screen')).toHaveClass(/active/);await expect(page.locator('#connection-status')).toContainText('Offline');
 const sdk=await page.evaluate(async()=>{const r=await fetch('assets/firebase-firestore-compat-9.23.0.js');return {ok:r.ok,type:r.headers.get('content-type')}});expect(sdk.ok).toBe(true);expect(sdk.type).toContain('javascript');
});
