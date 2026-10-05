'use strict';
const FAMILY={ 'marcuswongjw@gmail.com':'Marcus','eleanor.jiamin@gmail.com':'Eleanor','mikaelawonght@gmail.com':'Mikaela','meaghanwongzx@gmail.com':'Meaghan' };
const PARENTS=['marcuswongjw@gmail.com','eleanor.jiamin@gmail.com'];
const DEFAULTS={enabled:false,packing:true,habits:true,overdue:true,includeChildren:false,hour:19,quietStart:21,quietEnd:7};
function settings(raw={},parent=false){
 const result={...DEFAULTS};
 for(const key of ['enabled','packing','habits','overdue','includeChildren']){if(key in raw&&typeof raw[key]!=='boolean')throw new Error('Choose valid reminder options.');if(key in raw)result[key]=raw[key];}
 for(const key of ['hour','quietStart','quietEnd']){if(key in raw&&(!Number.isInteger(raw[key])||raw[key]<0||raw[key]>23))throw new Error('Choose valid reminder hours.');if(key in raw)result[key]=raw[key];}
 if(!parent)result.includeChildren=false;return result;
}
function singaporeClock(now){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const p=Object.fromEntries(parts.map(p=>[p.type,p.value]));return {date:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute)};}
function quiet(hour,start,end){return start===end?false:start<end?hour>=start&&hour<end:hour>=start||hour<end;}
function week(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+7);return {start,end:d.toISOString().slice(0,10)};}
function plan(snapshot,email,prefs,now=new Date()){
 const member=FAMILY[email];if(!member)return null;const parent=PARENTS.includes(email),s=settings(prefs,parent),clock=singaporeClock(now);
 if(!s.enabled||clock.hour!==s.hour||quiet(clock.hour,s.quietStart,s.quietEnd))return null;
 const scope=parent&&s.includeChildren?[member,'Mikaela','Meaghan']:[member],items=[],date=clock.date;
 for(const t of snapshot.todos||[]){
  if(['Done','Deleted'].includes(t.status))continue;
  const adultTask=['consent','payment'].includes(t.kind);
  if(adultTask&&!parent)continue;
  if(!scope.includes(t.assignee)&&t.assignee!=='Everyone')continue;
  if(t.kind==='packing'){if(s.packing&&(!t.dueRaw||t.dueRaw<=date))items.push({kind:'packing',text:`${t.assignee}: ${t.task}`});continue;}
  else if(s.overdue&&t.dueRaw&&t.dueRaw<=date)items.push({kind:'overdue',text:`${t.assignee}: ${t.task}`});
  else if(parent&&s.overdue&&t.status==='Needs help')items.push({kind:'help',text:`${t.assignee} needs a hand: ${t.task}`});
 }
 if(s.habits)for(const h of snapshot.habits||[]){
  if((h.state||'active')!=='active')continue;
  for(const who of scope){
   if(h.member!==who&&h.member!=='Everyone')continue;
   const logs=(snapshot.habitLogs||[]).filter(l=>l.habitId===h.id&&l.member===who);
   if(logs.some(l=>l.date===date))continue;
   if(h.schedule==='weekdays'&&!(h.weekdays||[]).includes(new Date(date+'T00:00:00Z').getUTCDay()))continue;
   const bounds=week(date);
   if(h.schedule==='weekly'&&new Set(logs.filter(l=>l.date>=bounds.start&&l.date<bounds.end).map(l=>l.date)).size>=(h.weeklyTarget||3))continue;
   items.push({kind:'habit',text:`${who}: ${h.habit}`});
  }
 }
 if(!items.length)return null;
 return {id:`${date}:${email}`,date,recipient:email,title:'A little reminder from Wong’s Nest',body:items.slice(0,3).map(i=>i.text).join(' · ').slice(0,350)+(items.length>3?` · +${items.length-3} more`:''),screen:'home',count:items.length};
}
module.exports={FAMILY,PARENTS,DEFAULTS,settings,singaporeClock,quiet,plan};
