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
 await expect(page.locator('.habit-card').filter({hasText:'Shared tidy'}).locator('.habit-member-progress')).toHaveCount(1);
 await expect(page.getByRole('region',{name:'Meaghan’s progress',exact:true})).toHaveCount(2);
});

test('Everyone shows separate shared completions and quick logging awards only the chosen person',async({page})=>{
 const created=await page.evaluate(async()=>{
  const name='Shared progress '+Date.now(),r=await gPost({note:'add_habit',habit:name,members:['Mikaela','Meaghan']});
  await gPost({note:'set_habit_rewards',rules:[{source_id:r.id,stars:3}]});
  await gPost({note:'log_habit',habit_id:r.id,log_member:'Mikaela',date:schoolToday()});
  await loadData();goTo('habits');
  return {id:r.id,name,balances:Object.fromEntries(data.rewards.members.map(m=>[m.member,m.balance]))};
 });
 const card=page.locator('.habit-card').filter({hasText:created.name});
 await expect(card.locator('.habit-summary')).toHaveText('1 of 2 completed for this day');
 await expect(card.getByRole('region',{name:'Mikaela’s progress'})).toContainText('Done for this day');
 await expect(card.getByRole('region',{name:'Meaghan’s progress'})).not.toContainText('Done for this day');
 await card.getByRole('button',{name:'✓ Log for Meaghan',exact:true}).click();
 await expect(card.locator('.habit-summary')).toHaveText('2 of 2 completed for this day');
 await expect(card.getByRole('button',{name:'✓ Log for Meaghan',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>Object.fromEntries(data.rewards.members.map(m=>[m.member,m.balance])))).toEqual({...created.balances,Meaghan:created.balances.Meaghan+3});
 await page.evaluate(async()=>{await loadData();renderHabits();});
 await expect(card.locator('.habit-summary')).toHaveText('2 of 2 completed for this day');
 expect(await page.evaluate(id=>data.habitLogs.filter(l=>l.habitId===id).map(l=>l.member).sort(),created.id)).toEqual(['Meaghan','Mikaela']);
});

test('shared weekly goals, rest days and lifecycle states stay individual in cards and list on both screen sizes',async({page})=>{
 await page.evaluate(()=>{
  data.habitLogWindow=undefined;habitViewDate='2026-10-08';
  const common={members:['Mikaela','Meaghan'],state:'active'};
  data.habits=[{...common,id:'weekly-progress',habit:'Weekly progress',schedule:'weekly',weeklyTarget:1},{...common,id:'rest-progress',habit:'Rest progress',schedule:'weekdays',weekdays:[1]},{...common,id:'paused-progress',habit:'Paused progress',state:'paused'},{...common,id:'archived-progress',habit:'Archived progress',state:'archived'}];
  data.habitLogs=[{id:'weekly-entry',habitId:'weekly-progress',member:'Mikaela',date:'2026-10-05'}];goTo('habits');
 });
 for(const width of [1440,390])for(const layout of ['cards','list']){
  await page.setViewportSize({width,height:900});await page.locator('#habit-layout').selectOption(layout);
  const weekly=page.locator('.habit-card').filter({hasText:'Weekly progress'}),mikaela=weekly.getByRole('region',{name:'Mikaela’s progress'}),meaghan=weekly.getByRole('region',{name:'Meaghan’s progress'});
  await expect(mikaela).toContainText('1 of 1 this week');await expect(mikaela).toContainText('Weekly goal reached');await expect(mikaela.locator('.habit-day.done')).toHaveCount(1);await expect(mikaela.getByRole('button',{name:'✓ Log for Mikaela'})).toHaveCount(0);
  await expect(meaghan).toContainText('0 of 1 this week');await expect(meaghan.getByRole('button',{name:'✓ Log for Meaghan'})).toBeEnabled();
  await expect(page.locator('.habit-card').filter({hasText:'Rest progress'}).locator('.habit-rest')).toHaveText(['Rest day','Rest day']);
  await expect(page.locator('.habit-card').filter({hasText:'Paused progress'}).locator('.habit-member-progress button')).toHaveCount(0);
  await expect(page.locator('.habit-card').filter({hasText:'Archived progress'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 }
 await page.getByRole('button',{name:'Archived habits',exact:true}).click();
 await expect(page.locator('.habit-card')).toHaveCount(1);await expect(page.locator('.habit-member-progress button')).toHaveCount(0);
 await page.getByRole('button',{name:'Active habits',exact:true}).click();
 await page.evaluate(()=>{habitViewDate=schoolDayOffset(schoolToday(),1);renderHabits();});
 await expect(page.locator('.habit-card').filter({hasText:'Weekly progress'}).getByRole('button',{name:'Do this on the day'})).toHaveCount(2);
 for(const button of await page.getByRole('button',{name:'Do this on the day'}).all())await expect(button).toBeDisabled();
});

test('shared completion failures preserve individual progress and filtered notes keep their recipient and keyboard focus',async({page})=>{
 const name=await page.evaluate(async()=>{
  const name='Shared retry '+Date.now();await gPost({note:'add_habit',habit:name,members:['Mikaela','Meaghan']});await loadData();goTo('habits');
  const request=gasRequest;let fail=true;gasRequest=payload=>payload.note==='log_habit'&&fail?new Promise(resolve=>{fail=false;window.releaseHabitFailure=()=>resolve({status:'error',message:'Could not save this completion'});}):request(payload);return name;
 });
 const card=page.locator('.habit-card').filter({has:page.getByRole('heading',{name,exact:true})}),row=card.getByRole('region',{name:'Meaghan’s progress'});
 await row.getByRole('button',{name:'✓ Log for Meaghan'}).click();await expect(row.getByRole('button',{name:'Saving…'})).toBeDisabled();
 await expect(card.getByRole('button',{name:'✓ Log for Mikaela'})).toBeEnabled();
 await page.evaluate(()=>releaseHabitFailure());await expect(row.getByRole('button',{name:'✓ Log for Meaghan'})).toBeEnabled();await expect(row).toBeFocused();await expect(card.locator('.habit-summary')).toHaveText('0 of 2 completed for this day');
 await page.locator('#habit-person').selectOption('Meaghan');await expect(card.locator('.habit-member-progress')).toHaveCount(1);
 const notes=row.getByRole('button',{name:'Add notes for Meaghan'});await notes.click();await expect(page.locator('#hl-member')).toHaveValue('Meaghan');await page.locator('#hl-notes').fill('Read with Dad');await page.locator('#hl-submit').click();
 await expect(page.locator('#m-habit-log')).not.toHaveClass(/open/);await expect(notes).toBeFocused();await expect(row).toContainText('Done for this day');
 expect(await page.evaluate(name=>data.habitLogs.filter(l=>l.habitId===data.habits.find(h=>h.habit===name).id).map(l=>({member:l.member,notes:l.notes})),name)).toEqual([{member:'Meaghan',notes:'Read with Dad'}]);
});

test('Home fits desktop and mobile with today before the family overview on mobile',async({page})=>{
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.evaluate(()=>goTo('home'));
 const bounds=await page.evaluate(()=>{const today=document.querySelector('#today-wrap').getBoundingClientRect(),crew=document.querySelector('#dash-members').getBoundingClientRect(),greeting=document.querySelector('#greet').getBoundingClientRect(),calendar=document.querySelector('#home-calendar-status').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,todayWidth:today.width,crewWidth:crew.width,todayY:today.y,crewY:crew.y,greetingBottom:greeting.bottom,calendarY:calendar.y,calendarBottom:calendar.bottom};});
 expect(bounds.overflow).toBe(false);expect(bounds.todayWidth).toBeGreaterThan(300);if(width===390)expect(bounds.todayY).toBeLessThan(bounds.crewY);else expect(bounds.crewWidth).toBeGreaterThanOrEqual(290);
 expect(bounds.calendarY).toBeGreaterThanOrEqual(bounds.greetingBottom);expect(bounds.calendarBottom).toBeLessThanOrEqual(bounds.todayY);
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
 const habitName='Selected people habit '+Date.now();
 await page.evaluate(()=>openAddHabitModal());await page.locator('#hab-name').fill(habitName);
 await page.locator('#hab-member input[value="Marcus"]').uncheck();await page.locator('#hab-member input[value="Mikaela"]').check();await page.locator('#hab-member input[value="Meaghan"]').check();await page.locator('#hab-submit').click();await expect(page.locator('#m-habit')).not.toHaveClass(/open/);
 await expect.poll(()=>page.evaluate(name=>data.habits.some(h=>h.habit===name),habitName)).toBe(true);
 const id=await page.evaluate(name=>data.habits.find(h=>h.habit===name).id,habitName);
 await page.evaluate(id=>openHabitLogModal(id),id);await expect(page.locator('#hl-member option')).toHaveText(['Mikaela','Meaghan']);await page.keyboard.press('Escape');
 await page.evaluate(id=>openAddHabitModal(id),id);await expect(page.locator('#hab-member input[value="Mikaela"]')).toBeChecked();await expect(page.locator('#hab-member input[value="Meaghan"]')).toBeChecked();await page.locator('#hab-member input[value="Meaghan"]').uncheck();await page.locator('#hab-submit').click();await expect(page.locator('#m-habit')).not.toHaveClass(/open/);
 await expect.poll(()=>page.evaluate(id=>habitMembers(data.habits.find(h=>h.id===id)),id)).toEqual(['Mikaela']);
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

test('calendar freshness and retries stay separate from core in every view and retain old events on failure',async({page})=>{
 const stamp=await page.evaluate(async()=>{
  await gPost({note:'add_event',event_title:'Retained calendar event',event_date:schoolToday(),event_time:'10:00',event_member:'Mikaela'});
  await loadData();while(data.calendarState==='loading')await new Promise(r=>setTimeout(r,10));
  data.calendarRefreshedAt=Date.now()-3600000;const stamp=data.calendarRefreshedAt;
  const request=gasRequest;window.calendarReads=[];window.coreReads=0;
  gasRequest=body=>{if(body.action==='get_family_calendar')return new Promise(resolve=>calendarReads.push(resolve));if(body.action==='get_family_core')coreReads++;return request(body);};
  await loadData();return stamp;
 });
 await expect(page.locator('#connection-status')).toContainText('Family details · Last refreshed');await expect(page.locator('#connection-status')).toContainText('Calendar refreshing');
 await expect(page.locator('#home-calendar-status')).toContainText('Showing the last calendar');await expect(page.locator('#home-calendar-status button')).toBeDisabled();
 expect(await page.evaluate(()=>data.calendarRefreshedAt)).toBe(stamp);
 await page.evaluate(()=>calendarReads[0]({status:'error'}));await expect(page.locator('#home-calendar-status')).toContainText('Calendar could not refresh');
 await page.evaluate(()=>goTo('calendar'));
 for(const view of ['week','list','month','year']){
  await page.locator('#cal-view-'+view).click();await expect(page.locator('#plan-calendar-status')).toContainText('Showing the last calendar');await expect(page.locator('#plan-calendar-status').getByRole('button',{name:'Retry calendar',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>data.events.some(e=>e.title==='Retained calendar event'))).toBe(true);
  if(view==='list')await expect(page.locator('#cal-list')).toContainText('Retained calendar event');
 }
 const retry=page.locator('#plan-calendar-status').getByRole('button',{name:'Retry calendar',exact:true});await retry.focus();await page.keyboard.press('Enter');
 await expect(page.locator('#plan-calendar-status button')).toBeDisabled();expect(await page.evaluate(()=>({core:coreReads,calendar:calendarReads.length}))).toEqual({core:1,calendar:2});
 await page.evaluate(()=>calendarReads[1]({status:'ok',events:[],preparationState:'ready'}));await expect(page.locator('#plan-calendar-status')).toContainText('Calendar last refreshed');await expect(page.locator('#plan-calendar-status button')).toBeFocused();
 expect(await page.evaluate(()=>data.calendarRefreshedAt)).toBeGreaterThan(stamp);await expect(page.locator('#connection-status')).not.toContainText('Calendar could not refresh');
 await page.locator('#cal-view-list').click();await expect(page.locator('#cal-list')).toContainText('No upcoming events');
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
});

test('a child with a failed first calendar gets retry and no false clear-day or empty-schedule claim',async({page,context})=>{
 await page.evaluate(async()=>{
  clearSessionState();user='Meaghan';currentUserEmail='meaghanwongzx@gmail.com';setAdultAccess(false);
  const request=gasRequest;gasRequest=async body=>{
   if(body.action==='get_family_calendar')return {status:'error',message:'Calendar unavailable'};
   const r=await request(body);if(body.action==='get_family_core'){r.todos=[];r.schoolTasks=[];r.completedTasks=[];r.habits=[];r.habitLogs=[];}return r;
  };await loadData();goTo('home');
 });
 await expect(page.locator('#home-calendar-status')).toContainText('Calendar events are not available yet');await expect(page.locator('#school-home')).not.toContainText('Clear day ahead');await expect(page.locator('#school-home')).toContainText('Your checklist is clear so far');
 await page.evaluate(()=>goTo('calendar'));
 for(const view of ['list','month','week','year']){await page.locator('#cal-view-'+view).click();await expect(page.locator('#plan-calendar-status').getByRole('button',{name:'Retry calendar',exact:true})).toBeEnabled();await expect(page.locator('#cal-list')).not.toContainText('No events scheduled');await expect(page.locator('#cal-list')).not.toContainText('No upcoming events');}
 await context.setOffline(true);await expect(page.locator('#plan-calendar-status')).toContainText('Offline');await expect(page.locator('#plan-calendar-status button')).toBeDisabled();
 await context.setOffline(false);await expect(page.locator('#plan-calendar-status button')).toBeEnabled();
 await page.evaluate(()=>clearSessionState());expect(await page.evaluate(()=>data.calendarRefreshedAt)).toBeUndefined();await expect(page.locator('#plan-calendar-status')).not.toContainText('Showing the last calendar');await expect(page.locator('#connection-status')).toContainText('Not refreshed yet');
});

test('partial preparation failure keeps calendar freshness and offers a calendar-only recovery',async({page})=>{
 await page.evaluate(async()=>{
  const request=gasRequest;window.calendarAttempts=0;window.preparationCoreReads=0;
  gasRequest=async body=>{if(body.action==='get_family_core')preparationCoreReads++;const r=await request(body);if(body.action==='get_family_calendar')r.preparationState=++calendarAttempts===1?'error':'ready';return r;};
  await loadData();while(data.calendarState==='loading')await new Promise(r=>setTimeout(r,10));goTo('home');
 });
 await expect(page.locator('#home-calendar-status')).toContainText('Calendar last refreshed');await expect(page.locator('#home-calendar-status')).toContainText('Preparation tasks could not refresh');await expect(page.locator('#data-warning')).toBeVisible();
 await page.locator('#home-calendar-status').getByRole('button',{name:'Retry calendar',exact:true}).click();
 await expect(page.locator('#home-calendar-status')).not.toContainText('Preparation tasks could not refresh');await expect(page.locator('#home-calendar-status').getByRole('button',{name:'Refresh calendar',exact:true})).toBeEnabled();await expect(page.locator('#data-warning')).toBeHidden();
 expect(await page.evaluate(()=>({core:preparationCoreReads,calendar:calendarAttempts}))).toEqual({core:1,calendar:2});
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
 await page.evaluate(async()=>{await ensureMemoryDatabase();goTo('memories');document.querySelector('#mem-list').innerHTML=mediaImgHtml('https://example.com/photo.jpg');});
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

test('Loading check shows real server stages and exports only numeric diagnostics',async({page})=>{
 await page.evaluate(async()=>{
  const original=fetch;window.fetch=(url,options)=>url===FAMILY_GAS_URL||url===GAS_URL?original('/api',{...options,body:JSON.stringify({...JSON.parse(options.body),email:currentUserEmail})}):original(url,options);
  gasRequest=productionGasRequest;resetNestPerformance();await loadData();while(data.calendarState==='loading')await new Promise(r=>setTimeout(r,10));goTo('more');
 });
 await page.getByRole('button',{name:'Loading check',exact:false}).click();await expect(page.locator('#m-loading-check')).toHaveClass(/open/);await expect(page.locator('#loading-check-body')).toContainText('Server: Family overview');await expect(page.locator('#loading-check-body')).toContainText('rows scanned');
 const report=await page.evaluate(()=>exportNestPerformance());expect(report.samples.some(s=>s.source==='server'&&s.counts.sheet_reads>0)).toBe(true);expect(report.samples.some(s=>s.source==='browser'&&s.stages.network)).toBe(true);expect(JSON.stringify(report)).not.toMatch(/marcuswong|mikaelawong|idToken|fixture-token|Pack school bag|Read for ten/);
 const before=report.samples.filter(s=>s.endpoint==='core_ready').length;await page.getByRole('button',{name:'Measure refresh',exact:true}).click();await expect(page.getByRole('button',{name:'Measure refresh',exact:true})).toBeEnabled();expect(await page.evaluate(()=>exportNestPerformance().samples.filter(s=>s.endpoint==='core_ready').length)).toBeGreaterThan(before);
 await page.keyboard.press('Escape');await page.evaluate(async()=>{await fixtureLogin('Mikaela');resetNestPerformance();goTo('more')});await expect(page.getByRole('button',{name:'Loading check',exact:false})).toHaveCount(0);await page.evaluate(()=>showLoadingCheck());await expect(page.locator('#m-loading-check')).not.toHaveClass(/open/);
});

test('Home leaves photo services idle and Memories starts and stops its connection on demand',async({page})=>{
 expect(await page.evaluate(()=>({database:!!db,storage:!!storage,listeners:fixtureMemoryListeners.size}))).toEqual({database:false,storage:false,listeners:0});
 await page.evaluate(()=>goTo('memories'));
 await expect.poll(()=>page.evaluate(()=>fixtureMemoryListeners.size)).toBe(1);
 await expect(page.locator('#mem-list')).toContainText('Memory');
 await page.evaluate(()=>goTo('home'));
 expect(await page.evaluate(()=>fixtureMemoryListeners.size)).toBe(0);
});

test('completed tasks page on demand, preserve the page after failure, and clear on account switch',async({page})=>{
 await page.evaluate(async()=>{
  for(let i=0;i<54;i++){
   const t=await gasRequest({action:'write',note:'add_todo',todo_task:'Archive regression '+i,todo_assignee:'Marcus'});
   await gasRequest({action:'write',note:'complete_todo',todo_id:t.id});
  }
  await loadData();while(data.calendarState==='loading')await new Promise(r=>setTimeout(r,10));goTo('tasks');
 });
 await page.getByRole('button',{name:'Completed tasks',exact:true}).click();
 await expect(page.locator('#task-list')).toContainText('Showing 50 completed tasks');
 await page.getByRole('button',{name:'Older',exact:true}).click();
 await expect(page.getByRole('button',{name:'Newer',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>taskHistoryPage.items.length)).toBeLessThan(50);
 const ids=await page.evaluate(()=>taskHistoryPage.items.map(t=>t.id));
 await page.evaluate(()=>{window.archiveTransport=gasRequest;gasRequest=async body=>body.action==='get_completed_tasks'?{status:'error'}:archiveTransport(body)});
 await page.getByRole('button',{name:'Newer',exact:true}).click();
 await expect(page.locator('#task-list')).toContainText('Could not load this page');
 expect(await page.evaluate(()=>taskHistoryPage.items.map(t=>t.id))).toEqual(ids);
 await page.evaluate(()=>{gasRequest=archiveTransport;});
 await page.getByRole('button',{name:'Newer',exact:true}).click();
 await expect(page.locator('#task-list')).toContainText('Showing 50 completed tasks');
 expect(await page.evaluate(()=>taskHistoryCursors.length)).toBe(1);
 await page.evaluate(async()=>{
  gasRequest=()=>new Promise(resolve=>window.archiveResolve=resolve);window.oldHistoryRequest=loadTaskHistory(true);
  clearSessionState();user='Mikaela';currentUserEmail='mikaelawonght@gmail.com';
  archiveResolve({status:'ok',items:[{id:'old-parent',task:'Parent archive'}],nextCursor:null});await oldHistoryRequest;
 });
 expect(await page.evaluate(()=>({page:taskHistoryPage,open:taskHistoryOpen,busy:taskHistoryBusy}))).toEqual({page:null,open:false,busy:false});
});

test('older habit weeks load complete progress and notes browse on demand with filters and recovery',async({page})=>{
 const id=await page.evaluate(async()=>{
  const h=await gasRequest({action:'write',note:'add_habit',habit:'Archive reading',members:['Mikaela'],schedule:'weekly',weekly_target:1});
  for(const date of ['2025-01-06','2024-12-30','2024-12-23'])await gasRequest({action:'write',note:'log_habit',habit_id:h.id,log_member:'Mikaela',date,notes:'Full archive notes '+date});
  await loadData();while(data.calendarState==='loading')await new Promise(r=>setTimeout(r,10));habitViewDate='2025-01-08';goTo('habits');return h.id;
 });
 const card=page.locator('.habit-card').filter({hasText:'Archive reading'});
 await expect(card).toContainText('1 of 1 this week');await expect(card.locator('.habit-day.done')).toHaveCount(1);
 await card.locator('summary').click();await card.getByRole('button',{name:'Browse all history'}).click();
 const dialog=page.locator('#family-archive');await expect(dialog).toContainText('Full archive notes 2025-01-06');
 await dialog.locator('#archive-person').selectOption('Meaghan');await expect(dialog).toContainText('No records found');
 await dialog.locator('#archive-person').selectOption('Mikaela');await expect(dialog).toContainText('Full archive notes 2024-12-23');
 await page.keyboard.press('Escape');await expect(card.getByRole('button',{name:'Browse all history'})).toBeFocused();
 await page.evaluate(()=>{window.archiveOriginalRequest=gasRequest;gasRequest=async body=>body.action==='get_family_archive'?{status:'error'}:archiveOriginalRequest(body)});
 await card.getByRole('button',{name:'Browse all history'}).click();await expect(dialog).toContainText('Could not load history');
 await page.evaluate(()=>{gasRequest=archiveOriginalRequest});await dialog.getByRole('button',{name:'Retry',exact:true}).click();await expect(dialog).toContainText('Full archive notes');await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>data.habitLogs.some(l=>l.notes?.startsWith('Full archive notes')))).toBe(false);
 // An archive reply from a previous account may not recreate its closed dialog.
 await page.evaluate(async id=>{gasRequest=()=>new Promise(r=>window.resolveOldArchive=r);openFamilyArchive('habits',id);clearSessionState();user='Mikaela';currentUserEmail='mikaelawonght@gmail.com';resolveOldArchive({status:'ok',items:[{notes:'Old parent data'}],nextCursor:null});await new Promise(r=>setTimeout(r,0));},id);
 await expect(page.locator('#family-archive')).toHaveCount(0);
});

test('saved announcements page summaries and fetch one full source with retry',async({page})=>{
 await page.evaluate(async()=>{
  for(let i=0;i<26;i++){
   const d=await gasRequest({action:'write',note:'save_school_draft',plan:{title:'Archive notice '+i,child:'Mikaela',sourceText:'Original archived notice '+i,event:{enabled:false},tasks:[{title:'Archived school task '+i,kind:'homework',assignee:'Mikaela',due:'2025-01-08'}]}});
   await gasRequest({action:'write',note:'publish_school_draft',source_id:d.id,revision:d.revision});
  }
  await loadData();while(data.calendarState==='loading')await new Promise(r=>setTimeout(r,10));goTo('home');
 });
 expect(await page.evaluate(()=>data.schoolPlans.filter(p=>p.status==='published').length)).toBe(20);
 expect(await page.evaluate(()=>data.schoolPlans.filter(p=>p.status==='published').every(p=>p.summaryOnly&&!p.sourceText))).toBe(true);
 await page.locator('summary').filter({hasText:'Saved announcements'}).click();await page.getByRole('button',{name:'Browse announcements'}).click();
 const dialog=page.locator('#family-archive');await expect(dialog).toContainText('20 records on this page');
 await dialog.getByRole('button',{name:'Older',exact:true}).click();await expect(dialog.getByRole('button',{name:'Newer',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>familyArchiveState.items.every(p=>!p.sourceText&&!p.event))).toBe(true);
 await page.evaluate(()=>{window.noticeOriginalRequest=gasRequest;gasRequest=async body=>body.action==='get_school_plan'?{status:'error'}:noticeOriginalRequest(body)});
 await dialog.locator('[data-archive-notice]').first().click();await expect(page.locator('#school-dialog')).toContainText('Could not load this announcement');
 await page.evaluate(()=>{gasRequest=noticeOriginalRequest});await page.locator('#school-dialog').getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.locator('#school-review pre')).toContainText('Original archived notice');
 await page.locator('#school-dialog').getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('button',{name:'Browse announcements'})).toBeFocused();
 await page.evaluate(async()=>{
  const summary=data.schoolPlans.find(p=>p.summaryOnly);gasRequest=()=>new Promise(r=>window.resolveOldNotice=r);const pending=openSchoolCapture(summary.id);
  clearSessionState();user='Mikaela';currentUserEmail='mikaelawonght@gmail.com';resolveOldNotice({status:'ok',plan:{title:'Old private source'}});await pending;
 });
 expect(await page.evaluate(()=>schoolDraft)).toBe(null);await expect(page.locator('#school-dialog')).not.toBeVisible();await expect(page.locator('#school-review')).toBeEmpty();
});

test('reminders initialize without Messaging, load it when enabled and restore focus after saving or Escape',async({page})=>{
 expect(await page.evaluate(()=>!!messaging)).toBe(false);
 await page.evaluate(()=>{
  window.reminderPermissionCalls=0;window.reminderTokenCalls=0;
  Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'granted',requestPermission:async()=>{reminderPermissionCalls++;return 'granted';}}});
  firebase.messaging=()=>({onMessage(){},getToken:async options=>{reminderTokenCalls++;window.reminderUsesWorker=!!options.serviceWorkerRegistration.active;return 'fixture-reminder-token';}});
 });
 await page.locator('#notifBell').click();
 const dialog=page.locator('#reminder-dialog');await expect(dialog).toBeVisible();expect(await page.evaluate(()=>!!messaging)).toBe(false);expect(await page.evaluate(()=>reminderPermissionCalls)).toBe(0);
 await dialog.locator('#reminder-enabled').check();await dialog.getByRole('button',{name:'Save reminders'}).click();
 await expect(dialog).toHaveCount(0);await expect(page.locator('#notifBell')).toBeFocused();
 expect(await page.evaluate(()=>({tokens:reminderTokenCalls,permission:reminderPermissionCalls,worker:reminderUsesWorker}))).toEqual({tokens:1,permission:1,worker:true});
 await page.locator('#notifBell').click();await expect(dialog.locator('#reminder-enabled')).toBeChecked();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator('#notifBell')).toBeFocused();
 await page.locator('#notifBell').click();await dialog.locator('#reminder-enabled').uncheck();await dialog.getByRole('button',{name:'Save reminders'}).click();await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>reminderTokenCalls)).toBe(1);
});

test('failed reminder-service loading leaves Home usable and the bell can retry',async({page})=>{
 await page.evaluate(()=>{window.previousReminderLoader=ensureFunctionServices;ensureFunctionServices=async()=>{throw Error('Reminder service unavailable. Please retry.');}});
 await page.locator('#notifBell').click();await expect(page.locator('#toast')).toContainText('Reminder service unavailable');await expect(page.locator('#notifBell')).toBeEnabled();await expect(page.locator('#reminder-dialog')).toHaveCount(0);await expect(page.locator('#s-home')).toHaveClass(/active/);
 await page.evaluate(()=>{ensureFunctionServices=previousReminderLoader;});await page.locator('#notifBell').click();await expect(page.locator('#reminder-dialog')).toBeVisible();expect(await page.evaluate(()=>!!messaging)).toBe(false);await page.keyboard.press('Escape');
});

test('account switching while school services load prevents a stale AI request',async({page})=>{
 expect(await page.evaluate(async()=>{
  let release,calls=0;const previous=ensureFunctionServices;ensureFunctionServices=()=>new Promise(r=>release=r);
  openSchoolCapture();document.querySelector('#school-text').value='Notice that should not be sent after closing';const pending=extractSchool(false);
  while(!release)await new Promise(r=>setTimeout(r,0));clearSessionState();user='Mikaela';currentUserEmail='mikaelawonght@gmail.com';release({httpsCallable:()=>async()=>{calls++;return {data:{}}}});await pending;ensureFunctionServices=previous;return {calls,draft:schoolDraft};
 })).toEqual({calls:0,draft:null});
});
