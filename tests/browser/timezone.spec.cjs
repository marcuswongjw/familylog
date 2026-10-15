const {test,expect}=require('@playwright/test');
for(const {timezoneId,instant,today} of [
 {timezoneId:'America/Los_Angeles',instant:'2026-12-31T16:30:00Z',today:'2027-01-01'},
 {timezoneId:'Pacific/Kiritimati',instant:'2026-12-31T12:30:00Z',today:'2026-12-31'},
 {timezoneId:'Asia/Singapore',instant:'2026-12-31T16:30:00Z',today:'2027-01-01'}
])test.describe(timezoneId,()=>{
 test.use({timezoneId});
 test('Home, habits and calendar share the Singapore day across year boundaries',async({page})=>{
  await page.clock.setFixedTime(new Date(instant));await page.goto('/');await expect.poll(()=>page.evaluate(()=>data.calendarState)).toBe('ready');
  const dates=await page.evaluate(()=>({school:schoolToday(),home:todayStr(),selected:selectedCalDayStr,year:calYear,month:calMonth}));
  expect(dates).toEqual({school:today,home:today,selected:today,year:Number(today.slice(0,4)),month:Number(today.slice(5,7))-1});
  await page.evaluate(today=>{
   data.events=[{id:'timezone-event',title:'Singapore day event',dateRaw:today,date:fmtDate(today),time:'7:15 AM',tags:['Mikaela'],duration:1}];data.calendarState='ready';data.preparationState='ready';data.habits=[{id:'timezone-habit',habit:'Singapore daily reading',member:'Mikaela',schedule:'daily',state:'active'}];data.habitLogs=[];goTo('home');
  },today);
  await expect(page.locator('#today-wrap').locator('.card').first()).toContainText('Singapore day event');await expect(page.locator('#today-wrap').locator('.card').nth(1)).not.toContainText('Singapore day event');
  await page.evaluate(()=>goTo('habits'));await expect(page.locator('#habit-view-date')).toHaveValue(today);
  await page.evaluate(()=>{goTo('calendar');toggleCalView('year');});const monthIndex=Number(today.slice(5,7))-1;
  await expect(page.locator('.cal-year-month').nth(monthIndex).locator('.mini-day.has-event')).toHaveCount(1);
  await expect(page.locator('.cal-year-month .mini-day.has-event')).toHaveCount(1);
  await page.evaluate(()=>{toggleCalView('month');snapCalMonthToday();});await expect(page.locator('.cal-day-cell.today')).toHaveAttribute('data-date',today);
  await page.evaluate(()=>{toggleCalView('week');snapCalWeekToday();});expect(await page.evaluate(()=>weekDateStr(calWeekStart))).toBe(await page.evaluate(day=>habitWeek(day).start,today));
  await page.evaluate(()=>setSchoolDay(1));await expect(page.locator('#school-day')).toHaveValue(await page.evaluate(day=>schoolDayOffset(day,1),today));
  expect(await page.evaluate(()=>fixtureErrors)).toEqual([]);
 });
});
