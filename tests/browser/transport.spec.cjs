const {test,expect}=require('@playwright/test');
const {serviceConfig}=require('../../scripts/project-config.cjs');
async function wireTransport(page){
 const calls=[],violations=[];let broken='';
 await page.route('https://script.google.com/**',async route=>{
  const request=route.request(),body=request.postDataJSON(),expected=body.note==='configure_reminder_bridge'||request.frame().url().includes('/parents/')?'parents':'family';
  if(request.method()!=='POST'||request.url()!==serviceConfig(expected).url||request.headers()['content-type']!=='text/plain;charset=utf-8'||!String(body.idToken).startsWith('fixture-token:'))violations.push('Invalid production transport contract');
  calls.push({service:expected,action:body.action,note:body.note});
  if(body.action==='get_family_calendar'&&broken){const kind=broken;broken='';return route.fulfill({status:kind==='http'?503:200,contentType:'application/json',body:kind==='http'?'{}':'<html>Login</html>'});}
  const response=await page.request.post('/api',{data:body,headers:{'x-fixture-service':expected}});await route.fulfill({status:response.status(),contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:await response.text()});
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
