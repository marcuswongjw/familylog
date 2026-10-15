// CalendarApp subset used by production. Native lookups take iCalUIDs, not REST IDs.
// https://developers.google.com/apps-script/reference/calendar/calendar#getEventById(String)
const {formatDate}=require('./gas-date.cjs');
function nativeLookup(calendar,events){
 return function getEventById(id){
  const raw=[...calendar.values()].filter(e=>e.iCalUID===id&&e.status!=='cancelled').sort((a,b)=>instant(a.start)-instant(b.start))[0];
  const event=events.filter(e=>(e.iCalUID||e.seriesId||e.id)===id&&e.status!=='cancelled').sort((a,b)=>a.start-b.start)[0];
  if(!raw&&!event)return null;
  const start=()=>raw?instant(raw.start):new Date(event.start),end=()=>raw?instant(raw.end):new Date(event.end);
  const target={getId:()=>id,getTitle:()=>raw?raw.summary:event.title,isRecurringEvent:()=>raw?!!raw.recurringEventId:!!event.recurring,
   getStartTime:start,getEndTime:end,isAllDayEvent:()=>raw?!!raw.start.date:!!event.allDay,
   deleteEvent(){if(raw)raw.status='cancelled';if(event)event.status='cancelled';},
   setTime(first,last){
    if(!Number.isFinite(+first)||!Number.isFinite(+last)||last<=first)throw Error('Invalid Calendar interval');
    if(raw){raw.start={dateTime:first.toISOString()};raw.end={dateTime:last.toISOString()};}
    if(event){event.start=new Date(first);event.end=new Date(last);event.allDay=false;}return target;
   },
   setAllDayDates(first,last){
    const from=formatDate(first,'Asia/Singapore','yyyy-MM-dd'),to=formatDate(last,'Asia/Singapore','yyyy-MM-dd');
    if(to<=from)throw Error('Invalid all-day Calendar interval');
    if(raw){raw.start={date:from};raw.end={date:to};}
    if(event){event.start=new Date(from+'T00:00:00+08:00');event.end=new Date(to+'T00:00:00+08:00');event.allDay=true;}return target;
   }
  };return target;
 };
}
function instant(part){return new Date(part.dateTime||part.date+'T00:00:00+08:00');}
module.exports={nativeLookup};
