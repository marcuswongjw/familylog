/* Habit schedules use Singapore dates and Monday-to-Sunday weeks. */
const HABIT_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function habitWeek(date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay()+6)%7));
  const start = d.toISOString().slice(0,10); d.setUTCDate(d.getUTCDate()+7);
  return {start,end:d.toISOString().slice(0,10)};
}
function habitMemberLogs(h, member) {
  return (data.habitLogs || []).filter(l => l.habitId === h.id && l.member === member);
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
  return (data.habits || []).filter(h => (h.member === member || h.member === 'Everyone') && habitDue(h,member,date));
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
