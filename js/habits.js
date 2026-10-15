/* Habit schedules use Singapore dates and Monday-to-Sunday weeks. */
const HABIT_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function habitWeek(date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay()+6)%7));
  const start = d.toISOString().slice(0,10); d.setUTCDate(d.getUTCDate()+7);
  return {start,end:d.toISOString().slice(0,10)};
}
function habitMemberLogs(h, member) {
  const logs=new Map((data.habitLogs||[]).map(l=>[l.id,l]));
  for(const entry of habitWeekCache.values())if(entry.status==='ready')for(const log of entry.logs)logs.set(log.id,log);
  return [...logs.values()].filter(l => l.habitId === h.id && l.member === member);
}
function habitDone(h, member, date) { return habitMemberLogs(h,member).some(l => l.date === date); }
function habitWeekCount(h, member, date) {
  const {start,end} = habitWeek(date);
  return new Set(habitMemberLogs(h,member).filter(l => l.date >= start && l.date < end).map(l => l.date)).size;
}
function habitDue(h, member, date) {
  if ((h.state || 'active') !== 'active') return false;
  if (h.schedule === 'weekdays') return (h.weekdays || []).includes(new Date(date+'T00:00:00Z').getUTCDay());
  if (h.schedule === 'weekly') return habitDone(h,member,date) || habitWeekCount(h,member,date) < (h.weeklyTarget || 3);
  return true;
}
function habitScheduleLabel(h) {
  if (h.schedule === 'weekly') return `${h.weeklyTarget || 3} days each week`;
  if (h.schedule === 'weekdays') return [1,2,3,4,5,6,0].filter(d => (h.weekdays || []).includes(d)).map(d => HABIT_DAYS[d]).join(', ');
  return 'Every day';
}
function habitForMember(member, date) {
  return (data.habits || []).filter(h => habitMembers(h).includes(member) && habitDue(h,member,date));
}
function habitPendingKey(id, member, date) { return `${id}:${member}:${date}`; }
function habitProgressLabel(h, member, date) {
  return h.schedule === 'weekly' ? `${Math.min(h.weeklyTarget || 3,habitWeekCount(h,member,date))} of ${h.weeklyTarget || 3} this week` : habitScheduleLabel(h);
}
function childNextStep(tasks, habits, member, date) {
  const task = tasks.filter(t => t.status !== 'Done' && !['consent','payment'].includes(t.kind))
    .sort((a,b) => (a.dueRaw||date).localeCompare(b.dueRaw||date) || (a.kind==='packing'?0:1)-(b.kind==='packing'?0:1))[0];
  if (task) return {type:'task',id:task.id,title:task.task,kind:task.kind};
  const habit = habits.find(h => !habitDone(h,member,date));
  return habit ? {type:'habit',id:habit.id,title:habit.habit} : null;
}

function habitMembers(h) {
  if (h.member === 'Everyone') return ['Marcus','Eleanor','Mikaela','Meaghan'];
  return (Array.isArray(h.members) ? h.members : String(h.member || '').split(',')).map(m=>m.trim()).filter(m=>['Marcus','Eleanor','Mikaela','Meaghan'].includes(m));
}
function habitShared(h) { return habitMembers(h).length > 1; }

// Current progress stays in the dashboard; at most two older selected weeks are held in memory.
const habitWeekCache=new Map();
let habitWeekRevision=0;
function resetHabitWeekCache(){habitWeekRevision++;habitWeekCache.clear();}
function habitProgressReady(date){
 if(!data.habitLogWindow || habitWeek(date).start>=data.habitLogWindow.start)return true;
 return habitWeekCache.get(habitWeek(date).start)?.status==='ready';
}
function habitWeekNotice(date){
 if(habitProgressReady(date))return '';
 const entry=habitWeekCache.get(habitWeek(date).start),failed=entry?.status==='error';
 return `<p role="status">${failed?'Could not load this week’s habit history.':'Loading this week’s habit history…'}${failed?` <button type="button" class="btn btn-s" onclick="retryHabitWeek('${date}')">Retry week</button>`:''}</p>`;
}
function retryHabitWeek(date){habitWeekCache.delete(habitWeek(date).start);ensureHabitWeek(date);renderHabits();renderSchoolHome();}
function ensureHabitWeek(date){
 if(habitProgressReady(date))return;
 const week=habitWeek(date);if(habitWeekCache.has(week.start))return;
 const entry={status:'loading',logs:[]};habitWeekCache.set(week.start,entry);
 while(habitWeekCache.size>2)habitWeekCache.delete(habitWeekCache.keys().next().value);
 const revision=habitWeekRevision,account=currentUserEmail,generation=sessionGeneration,dashboard=dashboardGeneration;
 const current=()=>revision===habitWeekRevision&&account===currentUserEmail&&generation===sessionGeneration&&habitWeekCache.get(week.start)===entry;
 (async()=>{
  try{
   const result=await gasRequest({action:'get_habit_week',date});
   if(!current())return;
   if(dashboard!==dashboardGeneration||!result||result.status!=='ok'||result.start!==week.start||!Array.isArray(result.items))throw Error('History unavailable');
   entry.logs=result.items;entry.status='ready';
  }catch(_){if(current())entry.status='error';}
  finally{if(current()){renderHabits();renderSchoolHome();}}
 })();
}
function cacheHabitLog(log){
 if(!data.habitLogWindow || log.date>=data.habitLogWindow.start){data.habitLogs=(data.habitLogs||[]).filter(l=>l.id!==log.id);data.habitLogs.unshift(log);}
 for(const [start,entry] of habitWeekCache){if(habitWeek(log.date).start===start)entry.logs=[...entry.logs.filter(l=>l.id!==log.id),log];}
}
function removeCachedHabitLog(id){data.habitLogs=(data.habitLogs||[]).filter(l=>l.id!==id);for(const entry of habitWeekCache.values())entry.logs=entry.logs.filter(l=>l.id!==id);}
