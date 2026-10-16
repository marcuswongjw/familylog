const {test,expect}=require('@playwright/test');
const {serviceConfig}=require('../../scripts/project-config.cjs');
async function wireTransport(page,hooks={}){
 const calls=[],violations=[];let broken='';
 await page.route('https://script.google.com/**',async route=>{
  const request=route.request(),body=request.postDataJSON(),expected=body.note==='configure_reminder_bridge'||request.frame().url().includes('/parents/')?'parents':'family';
  if(request.method()!=='POST'||request.url()!==serviceConfig(expected).url||request.headers()['content-type']!=='text/plain;charset=utf-8'||!String(body.idToken).startsWith('fixture-token:'))violations.push('Invalid production transport contract');
  calls.push({service:expected,action:body.action,note:body.note});
  if(body.action==='get_family_calendar'&&broken){const kind=broken;broken='';return route.fulfill({status:kind==='http'?503:200,contentType:'application/json',body:kind==='http'?'{}':'<html>Login</html>'});}
  if(hooks.beforeFetch)await hooks.beforeFetch(body);
  const response=await page.request.post('/api',{data:body,headers:{'x-fixture-service':expected}});const text=await response.text();if(hooks.afterResponse)await hooks.afterResponse(body,JSON.parse(text));await route.fulfill({status:response.status(),contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:text});
 });
 return {calls,violations,breakCalendar:kind=>broken=kind};
}
test('production transport routes both apps, reminder setup and child writes through the configured endpoints',async({page})=>{
 const transport=await wireTransport(page);await page.goto('/?transport-preview=1');await expect.poll(()=>page.evaluate(()=>data.calendarState)).toBe('ready');
 expect(await page.evaluate(()=>gasRequest===productionGasRequest)).toBe(true);
 expect(transport.calls).toEqual(expect.arrayContaining([{service:'family',action:'get_family_core',note:undefined},{service:'family',action:'get_family_calendar',note:undefined}]));
 const id=await page.evaluate(async()=>{const h=await gPost({note:'add_habit',habit:'Production transport '+Date.now(),members:['Meaghan']});await gPost({note:'configure_reminder_bridge',bridge_secret:'a'.repeat(64)});return h.id;});
 expect(id).toBeTruthy();expect(transport.calls.some(call=>call.service==='parents'&&call.note==='configure_reminder_bridge')).toBe(true);
 await page.evaluate(async()=>{clearSessionState();await fixtureLogin('Meaghan');});
 const completion=await page.evaluate(async id=>gPost({note:'log_habit',habit_id:id,date:schoolToday(),log_member:'Marcus'}),id);expect(completion.status).toBe('ok');expect(completion.log.member).toBe('Meaghan');
 const denied=await page.evaluate(()=>gasRequest({action:'get_parent_dashboard'}));expect(denied.status).toBe('error');
 await page.goto('/parents/?transport-preview=1');await expect.poll(()=>page.evaluate(()=>!!data.expenses)).toBe(true);expect(await page.evaluate(()=>gasRequest===productionGasRequest)).toBe(true);expect(transport.calls.some(call=>call.service==='parents'&&call.action==='get_parent_dashboard')).toBe(true);
 expect(transport.violations).toEqual([]);expect(await page.evaluate(()=>fixtureErrors)).toEqual([]);
});
for(const failure of ['http','json'])test('production transport recovers from '+failure+' calendar responses without discarding the core',async({page})=>{
 const transport=await wireTransport(page);await page.goto('/?transport-preview=1');await expect.poll(()=>page.evaluate(()=>data.calendarState)).toBe('ready');
 const stamp=await page.evaluate(()=>data.calendarRefreshedAt);transport.breakCalendar(failure);
 await page.locator('#home-calendar-status').getByRole('button',{name:'Refresh calendar',exact:true}).click();await expect(page.locator('#home-calendar-status')).toContainText('Calendar could not refresh');
 expect(await page.evaluate(()=>({ready:!!data.rewards,stamp:data.calendarRefreshedAt}))).toEqual({ready:true,stamp});
 await page.locator('#home-calendar-status').getByRole('button',{name:'Retry calendar',exact:true}).click();await expect.poll(()=>page.evaluate(()=>data.calendarState)).toBe('ready');expect(transport.violations).toEqual([]);expect(await page.evaluate(()=>fixtureErrors)).toEqual([]);
});

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
test('both production reads start together and early Calendar preparation survives a slower overview',async({page,request})=>{
 const tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'});
 const saved=await request.post('/api',{data:{email:'marcuswongjw@gmail.com',action:'write',note:'add_event',operation_id:'parallel-browser-'+Date.now(),event_title:'Nat B Training parallel '+Date.now(),event_date:tomorrow,event_time:'13:30',event_member:'Mikaela'}});
 const created=await saved.json();expect(created.status).toBe('ok');
 const source='cal_natb_'+created.id.replace(/[^a-zA-Z0-9]/g,'_');
 const coreRead=deferred(),releaseCore=deferred();let calendarPayload,olderCorePayload;
 const transport=await wireTransport(page,{
  beforeFetch:async body=>{if(body.action==='get_family_calendar')await coreRead.promise;},
  afterResponse:async(body,result)=>{if(body.action==='get_family_core'){olderCorePayload=result;coreRead.resolve();await releaseCore.promise;}else if(body.action==='get_family_calendar')calendarPayload=result;}
 });
 await page.goto('/?transport-preview=1');
 await expect.poll(()=>transport.calls.filter(c=>c.action==='get_family_core'||c.action==='get_family_calendar').length).toBe(2);
 await expect.poll(()=>!!calendarPayload).toBe(true);
 expect(olderCorePayload.todos.filter(t=>t.sourceId.startsWith(source))).toHaveLength(0);
 expect(calendarPayload.todos.filter(t=>t.sourceId.startsWith(source))).toHaveLength(2);
 await expect(page.locator('#home-calendar-status')).toContainText('Refreshing calendar');
 expect(await page.evaluate(()=>data.todos)).toBeUndefined();
 await expect(page.locator('#top-progress-bar')).toHaveCSS('opacity','1');
 releaseCore.resolve();await expect.poll(()=>page.evaluate(()=>data.calendarState)).toBe('ready');
 expect(await page.evaluate(source=>data.todos.filter(t=>t.sourceId.startsWith(source)).length,source)).toBe(2);
 expect(await page.evaluate(()=>data.habits.length)).toBeGreaterThan(0);
 await expect(page.locator('#top-progress-bar')).toHaveCSS('opacity','0');
 expect(await page.evaluate(()=>exportNestPerformance().samples.filter(s=>s.endpoint==='family_ready'&&!s.counts.errors).length)).toBe(1);
 expect(transport.violations).toEqual([]);expect(await page.evaluate(()=>fixtureErrors)).toEqual([]);
});

test('a stalled Calendar does not delay the visible overview or its independent retry',async({page})=>{
 const release=deferred();let calendarRequests=0;
 const transport=await wireTransport(page,{beforeFetch:async body=>{if(body.action==='get_family_calendar'&&++calendarRequests===1)await release.promise;}});
 await page.goto('/?transport-preview=1');
 await expect(page.locator('#connection-status')).toContainText('Last refreshed');
 await expect(page.locator('#home-calendar-status')).toContainText('Refreshing calendar');
 expect(await page.evaluate(()=>!!data.rewards)).toBe(true);await expect(page.locator('#top-progress-bar')).toHaveCSS('opacity','1');
 release.resolve();await expect.poll(()=>page.evaluate(()=>data.calendarState)).toBe('ready');
 expect(transport.violations).toEqual([]);expect(await page.evaluate(()=>fixtureErrors)).toEqual([]);
});
