const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers/gas-harness.cjs'),{formatDate}=require('./helpers/gas-date.cjs');
test('formatDate honors Singapore midnight, overseas DST, quoted literals and time-only patterns',()=>{
 const date=new Date('2026-12-31T16:05:09Z');
 assert.equal(formatDate(date,'Asia/Singapore','yyyy-MM-dd HH:mm:ss'),'2027-01-01 00:05:09');
 assert.equal(formatDate(date,'Asia/Singapore','EEEE, d MMMM yyyy'),'Friday, 1 January 2027');
 assert.equal(formatDate(date,'Asia/Singapore','h:mm a'),'12:05 AM');
 assert.equal(formatDate(date,'America/Los_Angeles','HH:mm Z'),'08:05 -0800');
 assert.equal(formatDate(new Date('2026-03-08T09:59:00Z'),'America/Los_Angeles','HH:mm Z'),'01:59 -0800');
 assert.equal(formatDate(new Date('2026-03-08T10:01:00Z'),'America/Los_Angeles','HH:mm Z'),'03:01 -0700');
 assert.equal(formatDate(date,'UTC',"yyyy-MM-dd'T'HH:mm:ss'Z'"),'2026-12-31T16:05:09Z');
 assert.equal(formatDate(new Date('2026-09-23T00:00:00Z'),'Asia/Singapore','dd MMM yyyy'),'23 Sep 2026');
 assert.throws(()=>formatDate(date,'UTC','yyyy-QQ'),/Unsupported/);
});
test('native Calendar lookups use iCalUID, return detached dates and mutate only the selected event',()=>{
 const h=harness({service:'family'}),calendar=h.c.CalendarApp.getCalendarById(h.c.CALENDAR_ID);
 h.calendarEvents.push({id:'later@google.com',restId:'later-rest',title:'Later',start:new Date('2026-10-18T15:15:37Z'),end:new Date('2026-10-18T17:15:37Z')},{id:'first@google.com',restId:'first-rest',title:'First',start:new Date('2026-10-18T02:00:00Z'),end:new Date('2026-10-18T03:00:00Z')});
 assert.equal(calendar.getEventById('later-rest'),null);assert.equal(calendar.getEventById('missing'),null);
 const selected=calendar.getEventById('later@google.com'),date=selected.getStartTime();date.setFullYear(1999);assert.equal(selected.getStartTime().getUTCFullYear(),2026);
 assert.equal(h.write({note:'update_event_date',event_id:'later@google.com',new_date:'2026-10-20'}).status,'ok');
 assert.equal(selected.getStartTime().toISOString(),'2026-10-20T15:15:37.000Z');assert.equal(selected.getEndTime()-selected.getStartTime(),7200000);assert.equal(h.calendarEvents[1].start.toISOString(),'2026-10-18T02:00:00.000Z');
 assert.equal(h.write({note:'delete_event',event_id:'later@google.com'}).status,'ok');assert.equal(calendar.getEventById('later@google.com'),null);assert.ok(calendar.getEventById('first@google.com'));
});
test('native all-day dates ignore time and keep an exclusive multi-day end',()=>{
 const h=harness(),event={id:'span@google.com',title:'Span',allDay:true,start:new Date('2026-10-18T00:00:00+08:00'),end:new Date('2026-10-21T00:00:00+08:00')};h.calendarEvents.push(event);
 const native=h.c.CalendarApp.getCalendarById(h.c.CALENDAR_ID).getEventById(event.id);
 assert.equal(native.setAllDayDates(new Date('2026-10-22T18:00:00+08:00'),new Date('2026-10-25T02:00:00+08:00')),native);
 assert.equal(native.getStartTime().toISOString(),'2026-10-21T16:00:00.000Z');assert.equal(native.getEndTime()-native.getStartTime(),3*86400000);
 assert.throws(()=>native.setAllDayDates(new Date('2026-10-22T01:00:00+08:00'),new Date('2026-10-22T23:00:00+08:00')),/interval/);
});
test('native recurring-series lookup exposes the first occurrence but production refuses ambiguous mutation',()=>{
 const h=harness();for(const day of [20,18])h.calendarEvents.push({id:'series@google.com',restId:'series_'+day,recurring:true,title:'Series',start:new Date('2026-10-'+day+'T08:00:00Z'),end:new Date('2026-10-'+day+'T09:00:00Z')});
 const native=h.c.CalendarApp.getCalendarById(h.c.CALENDAR_ID).getEventById('series@google.com');assert.equal(native.getStartTime().getUTCDate(),18);
 assert.equal(h.write({note:'delete_event',event_id:'series@google.com'}).status,'error');assert.ok(h.calendarEvents.every(e=>e.status!=='cancelled'));
 assert.throws(()=>h.c.UrlFetchApp.fetch('https://example.com/calendar/v3/calendars/x/events'),/endpoint/);
});
test('habit archive timestamps represent the actual UTC instant while completion dates remain Singapore dates',()=>{
 const h=harness({service:'family'}),timestamp=new Date('2026-12-31T16:05:09Z');
 const log=h.c.habitLogFromRow_(['log','habit','Mikaela','Read',timestamp,'Notes','Marcus',timestamp]);
 assert.equal(log.date,'2027-01-01');assert.equal(Date.parse(log.timestamp),timestamp.getTime());assert.equal(log.timestamp,'2026-12-31T16:05:09.000Z');
});
