'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { harness } = require('./helpers/gas-harness.cjs');
const child = 'mikaelawonght@gmail.com';
const sibling = 'meaghanwongzx@gmail.com';
const profile = (h, name = 'Mikaela') => h.c.getRewards_(h.ss).members.find(m => m.member === name);
const today = h => h.c.Utilities.formatDate(new Date(), 'Asia/Singapore', 'yyyy-MM-dd');
function activity(h, type = 'task', member = 'Mikaela', stars = 5) {
  const added = h.write(type === 'task' ? {note:'add_todo',todo_task:'Pack school bag',todo_assignee:member} : {note:'add_habit',habit:'Read together',member});
  assert.equal(added.status, 'ok');
  assert.equal(h.write({note:'set_reward_rule',source_type:type,source_id:added.id,stars}).status, 'ok');
  return added.id;
}
function complete(h, id, email = child) { return h.write({note:'complete_todo',todo_id:id}, email); }
function log(h, id, extra = {}, email = child) { return h.write({note:'log_habit',habit_id:id,date:today(h),...extra}, email); }

test('default companions need no migration or reward sheets on read', () => {
  const h = harness(), rewards = h.c.getRewards_(h.ss);
  assert.equal(rewards.members.length, 4); assert.equal(rewards.family.earned, 0);
  assert.equal(profile(h).name, 'Pip'); assert.equal(h.sheets.RewardLedger, undefined);
});
test('unselected tasks complete without awarding stars', () => {
  const h = harness(), id = h.write({note:'add_todo',todo_task:'Pack',todo_assignee:'Mikaela'}).id;
  assert.equal(complete(h,id).award.stars, 0); assert.equal(profile(h).balance, 0);
});
test('only parents set rewards on existing open activities with allowed amounts', () => {
  const h = harness(), id = activity(h);
  for (const request of [{stars:5,email:child},{stars:2},{stars:100},{stars:-1},{stars:5,source_id:'missing'}]) {
    assert.equal(h.write({note:'set_reward_rule',source_type:'task',source_id:id,...request},request.email).status,'error');
  }
  complete(h,id);
  assert.equal(h.write({note:'set_reward_rule',source_type:'task',source_id:id,stars:5}).status,'error');
});
test('task completion awards assignee once, including retries and parent completion', () => {
  const h = harness(), id = activity(h);
  assert.equal(complete(h,id,'marcuswongjw@gmail.com').award.member,'Mikaela');
  assert.equal(complete(h,id).award.stars,0); assert.equal(profile(h).balance,5);
  assert.equal(profile(h,'Marcus').balance,0);
  assert.equal(h.write({note:'help_todo',todo_id:id},child).status,'error');
});
test('lost reward append response recovers without duplicate stars', () => {
  const h = harness(), id = activity(h);
  h.c.rewardSheet_(h.ss,'RewardLedger',['ID','Member','Kind','Stars','Source','At']).failAppendAfter = true;
  assert.equal(complete(h,id).status,'error');
  assert.equal(complete(h,id).status,'ok'); assert.equal(profile(h).balance,5);
  assert.equal(h.sheets.ToDo.rows[1][5],'Done');
});
test('Everyone task credits only the first completer', () => {
  const h = harness(), id = activity(h,'task','Everyone');
  assert.equal(complete(h,id).award.stars,5); assert.equal(complete(h,id,sibling).award.stars,0);
  assert.equal(profile(h,'Meaghan').balance,0);
});
test('habit duplicate retries preserve a single log and reward', () => {
  const h = harness(), id = activity(h,'habit');
  const first = log(h,id,{notes:'Read a chapter'}), second = log(h,id,{notes:'Different'});
  assert.equal(first.award.stars,5); assert.equal(second.award.stars,0);
  assert.equal(second.id,first.id); assert.equal(second.log.notes,'Read a chapter');
  assert.equal(h.sheets.HabitLogs.rows.length,2); assert.equal(profile(h).balance,5);
});
test('lost habit append response recovers log before awarding', () => {
  const h = harness(), id = activity(h,'habit'); h.sheets.HabitLogs.failAppendAfter = true;
  assert.equal(log(h,id).status,'error'); assert.equal(profile(h).balance,0);
  assert.equal(log(h,id).award.stars,5); assert.equal(h.sheets.HabitLogs.rows.length,2);
});
test('habit identity comes from definition, not client member or title', () => {
  const h = harness(), id = activity(h,'habit');
  assert.equal(log(h,id,{},sibling).status,'error');
  const saved = log(h,id,{member:'Meaghan',habit:'Forged'});
  assert.equal(saved.log.member,'Mikaela'); assert.equal(saved.log.habit,'Read together');
  assert.equal(profile(h,'Meaghan').balance,0);
});
test('deleting and relogging cannot farm rewards', () => {
  const h = harness(), id = activity(h,'habit'), first = log(h,id);
  assert.equal(h.write({note:'delete_habit_log',id:first.id},child).status,'ok');
  assert.equal(log(h,id).award.stars,0); assert.equal(profile(h).balance,5);
});
test('past entries earn nothing and future or invalid dates are rejected', () => {
  const h = harness(), id = activity(h,'habit');
  assert.equal(log(h,id,{date:'2020-01-01'}).award.stars,0);
  assert.equal(log(h,id,{date:'2099-01-01'}).status,'error');
  assert.equal(log(h,id,{date:'2026-02-30'}).status,'error');
  assert.equal(log(h,id,{notes:'x'.repeat(1001)}).status,'error');
  assert.equal(profile(h).balance,0);
});
test('shared habits reward each member once for the same day', () => {
  const h = harness(), id = activity(h,'habit','Everyone',3);
  assert.equal(log(h,id).award.stars,3); assert.equal(log(h,id,{},sibling).award.stars,3);
  assert.equal(h.c.getRewards_(h.ss).family.earned,6);
});
test('purchase validates balance, price, item and identity; duplicate buys spend once', () => {
  const h = harness(), request = {note:'buy_reward_item',item_id:'glasses',member:'Meaghan',cost:0};
  assert.equal(h.write(request,child).status,'error');
  complete(h,activity(h));
  assert.equal(h.write(request,child).status,'ok'); assert.equal(h.write(request,child).status,'ok');
  assert.equal(profile(h).balance,0); assert.deepEqual(Array.from(profile(h).owned),['glasses']);
  assert.equal(profile(h,'Meaghan').owned.length,0);
  assert.equal(h.write({...request,item_id:'unknown'},child).status,'error');
  assert.equal(h.c.getRewards_(h.ss).family.earned,5);
});
test('lost purchase response retry preserves one unlock and one debit', () => {
  const h = harness(); complete(h,activity(h)); h.sheets.RewardLedger.failAppendAfter = true;
  const request = {note:'buy_reward_item',item_id:'glasses'};
  assert.equal(h.write(request,child).status,'error'); assert.equal(h.write(request,child).status,'ok');
  assert.equal(profile(h).balance,0); assert.equal(profile(h).owned.length,1);
});
test('companion can only wear owned accessories and updates authenticated member', () => {
  const h = harness(), request = {note:'save_companion',species:'cat',companion_name:'Sunny',equipped:'glasses',member:'Meaghan'};
  assert.equal(h.write(request,child).status,'error'); complete(h,activity(h));
  h.write({note:'buy_reward_item',item_id:'glasses'},child);
  assert.equal(h.write(request,child).status,'ok'); assert.equal(profile(h).equipped,'glasses');
  assert.equal(profile(h).name,'Sunny'); assert.equal(profile(h,'Meaghan').name,'Mochi');
  for (const extra of [{species:'dog'},{companion_name:''},{companion_name:'x'.repeat(25)}]) assert.equal(h.write({...request,...extra},child).status,'error');
});
test('family milestone uses lifetime earnings and survives spending', () => {
  const h = harness(); for(let i=0;i<8;i++) complete(h,activity(h));
  h.write({note:'buy_reward_item',item_id:'backpack'},child);
  assert.equal(profile(h).balance,28); assert.equal(h.c.getRewards_(h.ss).family.unlocked,true);
});
function client(gPost) {
  const source = fs.readFileSync(require.resolve('../js/app.js'),'utf8');
  const block = source.slice(source.indexOf('    const pendingHabitLogs'),source.indexOf('    async function delHabitLog'));
  const c = vm.createContext({window:{},Set,currentUserEmail:child,data:{habits:[{id:'h',habit:'Read'}],habitLogs:[]},schoolToday:()=> '2026-10-05',gPost,
    renderHabits(){},renderHome(){},renderSchoolHome(){},applyRewardResult(){c.celebrations++},toast(){},showError(){c.errors++},celebrations:0,errors:0});
  vm.runInContext(block,c); return c;
}
test('habit UI waits for confirmed save and blocks duplicate pending clicks', async () => {
  let resolve, calls=0; const c = client(()=>{calls++;return new Promise(r=>resolve=r)});
  const pending = c.window.logHabitQuick('h');
  assert.equal(c.data.habitLogs.length,0); assert.equal(c.celebrations,0);
  assert.equal(await c.window.logHabitQuick('h'),false); assert.equal(calls,1);
  resolve({status:'ok',log:{id:'confirmed',habitId:'h'}});
  assert.equal(await pending,true); assert.equal(c.data.habitLogs[0].id,'confirmed'); assert.equal(c.celebrations,1);
});
test('habit UI failed saves or account changes never add logs or celebrate', async () => {
  const c = client(async()=>({status:'error',message:'Offline'}));
  assert.equal(await c.window.logHabitQuick('h'),false); assert.equal(c.data.habitLogs.length,0); assert.equal(c.celebrations,0);
  let resolve; const changed = client(()=>new Promise(r=>resolve=r)); const pending=changed.window.logHabitQuick('h');
  changed.currentUserEmail=sibling; resolve({status:'ok',log:{id:'other-account'}});
  assert.equal(await pending,false); assert.equal(changed.data.habitLogs.length,0);
});
test('a failed task completion write earns no stars', () => {
  const h = harness(), id = activity(h), original = h.sheets.ToDo.getRange;
  h.sheets.ToDo.getRange = function(row,col,...rest) {
    if(row>1 && col===6) return {setValues(){throw new Error('Sheets unavailable')}};
    return original.call(this,row,col,...rest);
  };
  assert.equal(complete(h,id).status,'error'); assert.equal(profile(h).balance,0);
  h.sheets.ToDo.getRange = original;
  assert.equal(complete(h,id).award.stars,5);
});
test('shared task preserves first reward recipient if earning fails before append', () => {
  const h = harness(), id = activity(h,'task','Everyone');
  const ledger = h.c.rewardSheet_(h.ss,'RewardLedger',['ID','Member','Kind','Stars','Source','At']);
  const append = ledger.appendRow;
  ledger.appendRow = ()=>{throw new Error('Before append')};
  assert.equal(complete(h,id).status,'error'); assert.equal(h.sheets.ToDo.rows[1][5],'Done');
  ledger.appendRow = append;
  assert.equal(complete(h,id,sibling).award.member,'Mikaela');
  assert.equal(profile(h).balance,5); assert.equal(profile(h,'Meaghan').balance,0);
});
