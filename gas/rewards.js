// ============================================================
// COMPANIONS & STARS — server-owned ledger, under handleWrite's lock.
// Earn IDs survive edits/deletes; spending never reduces family progress.
// ============================================================
var REWARD_ITEMS_ = [
  { id: 'glasses', name: 'Reading glasses', cost: 5, description: 'For a curious little companion.' },
  { id: 'sailing-cap', name: 'Sailing cap', cost: 8, description: 'Ready for a little adventure.' },
  { id: 'ballet-bow', name: 'Ballet bow', cost: 8, description: 'A bow for your next happy dance.' },
  { id: 'backpack', name: 'Little backpack', cost: 12, description: 'Small steps, big adventures.' },
  {id:'sunhat',name:'Sunny hat',cost:10,description:'A little shade for sunny days.'},
  {id:'scarf',name:'Cosy scarf',cost:10,description:'Wrapped up for a cosy day.'},
  {id:'crown',name:'Star crown',cost:20,description:'Celebrate your steady little wins.'},
  {id:'flower',name:'Garden flower',cost:6,description:'A tiny bloom from our family garden.'},
  {id:'cape',name:'Superhelper cape',cost:18,description:'Every small act of kindness counts.'},
  {id:'party-hat',name:'Party hat',cost:14,description:'Make an ordinary day a celebration.'}
];
var REWARD_GOALS_ = [
  {id:'garden',name:'Our family garden',stars:40,emoji:'🌷'},
  {id:'reading',name:'Our cosy reading corner',stars:80,emoji:'📚'},
  {id:'picnic',name:'Our family picnic',stars:120,emoji:'🧺'}
];
var REWARD_MEMBERS_ = ['Marcus', 'Eleanor', 'Mikaela', 'Meaghan'];
var COMPANION_DEFAULTS_ = {
  Marcus: { species: 'bear', name: 'Oak' }, Eleanor: { species: 'cat', name: 'Clover' },
  Mikaela: { species: 'fox', name: 'Pip' }, Meaghan: { species: 'rabbit', name: 'Mochi' }
};
function rewardSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(headers); }
  return sheet;
}
function rewardRows_(ss, name) {
  var sheet = ss.getSheetByName(name);
  return sheet ? sheet.getDataRange().getValues().slice(1).filter(function(r) { return r[0]; }) : [];
}
function getRewards_(ss, savedRules) {
  var ledger = rewardRows_(ss, 'RewardLedger');
  var profiles = rewardRows_(ss, 'Companions');
  var familyStars = 0;
  var members = REWARD_MEMBERS_.map(function(member) {
    var entries = ledger.filter(function(r) { return r[1] === member; });
    var earned = entries.filter(function(r) { return r[2] === 'earn'; }).reduce(function(n, r) { return n + Number(r[3]); }, 0);
    var balance = entries.reduce(function(n, r) { return n + Number(r[3]); }, 0);
    familyStars += earned;
    var owned = entries.filter(function(r) { return r[2] === 'purchase'; }).map(function(r) { return toStr(r[4]); });
    var saved = profiles.find(function(r) { return r[0] === member; });
    var defaults = COMPANION_DEFAULTS_[member];
    return { member: member, earned: earned, balance: balance, owned: owned,
      species: saved ? toStr(saved[1]) : defaults.species,
      name: saved ? toStr(saved[2]) : defaults.name,
      equipped: saved && owned.indexOf(saved[3]) !== -1 ? toStr(saved[3]) : '' };
  });
  var selected = rewardRows_(ss,'FamilyGoal')[0];
  var goal = REWARD_GOALS_.find(function(g){return selected && g.id === selected[0];}) || REWARD_GOALS_[0];
  return { members: members, catalog: REWARD_ITEMS_, goals: REWARD_GOALS_, family: { earned: familyStars, goal: goal.stars, unlocked: familyStars >= goal.stars, name: goal.name, goalId:goal.id, emoji:goal.emoji },
    rules: (savedRules || rewardRows_(ss, 'RewardRules')).filter(function(r){return r[0];}).map(function(r) { return { type: toStr(r[1]), sourceId: toStr(r[2]), stars: Number(r[3]) }; }) };
}
function rewardAward_(ss, type, sourceId, member, occurrence) {
  var none = { stars: 0, member: member };
  if (REWARD_MEMBERS_.indexOf(member) === -1) return none;
  var rule = rewardRows_(ss, 'RewardRules').find(function(r) { return r[1] === type && r[2] === sourceId; });
  if (!rule || Number(rule[3]) <= 0) return none;
  var id = 'earn:' + type + ':' + sourceId + ':' + occurrence;
  if (rewardRows_(ss, 'RewardLedger').some(function(r) { return r[0] === id; })) return none;
  var stars = Number(rule[3]);
  var sheet = rewardSheet_(ss, 'RewardLedger', ['ID', 'Member', 'Kind', 'Stars', 'Source or Item', 'Earned At']);
  sheet.appendRow([id, member, 'earn', stars, type + ':' + sourceId, new Date()]);
  SpreadsheetApp.flush();
  return { stars: stars, member: member };
}
function rewardHandleWrite_(data, ss, email, user) {
  try {
    var note = toStr(data.note).toLowerCase().trim();
    if (note === 'set_family_goal') {
      if (!isAdultEmail_(email)) throw new Error('Only parents can choose the family goal.');
      if (!REWARD_GOALS_.some(function(g){return g.id === data.goal_id;})) throw new Error('Choose an existing family goal.');
      rewardSheet_(ss,'FamilyGoal',['Goal','UpdatedBy','UpdatedAt']).getRange(2,1,1,3).setValues([[data.goal_id,user,new Date()]]);
    } else if (note === 'set_habit_rewards') {
      if (!isAdultEmail_(email)) throw new Error('Only parents can choose which activities earn stars.');
      if (!Array.isArray(data.rules) || !data.rules.length || data.rules.length > 500) throw new Error('Choose the habits to update.');
      var habitSheet=ss.getSheetByName('Habits');
      var habitIds=habitSheet?habitSheet.getDataRange().getValues().slice(1).map(function(r){return toStr(r[0]);}):[];
      var seen = {};
      var updates = data.rules.map(function(rule) {
        var sourceId = toStr(rule.source_id), stars = rule.stars;
        if (habitIds.indexOf(sourceId) === -1 || seen[sourceId]) throw new Error('A habit changed. Refresh before saving stars.');
        if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 0 || stars > 100) throw new Error('Enter a whole number from 0 to 100 stars for each habit.');
        seen[sourceId] = true;
        return ['habit:' + sourceId, 'habit', sourceId, stars, user, new Date()];
      });
      // Validate every row before a single write; preserve task and omitted habit rules.
      var rules = rewardSheet_(ss, 'RewardRules', ['ID', 'Type', 'Source ID', 'Stars', 'Updated By', 'Updated At']);
      var rows = rules.getDataRange().getValues().slice(1);
      updates.forEach(function(update) {
        var index = rows.findIndex(function(row) { return row[0] === update[0]; });
        if (index < 0) rows.push(update); else rows[index] = update;
      });
      rules.getRange(2, 1, rows.length, 6).setValues(rows.map(function(row) { return row.slice(0, 6); }));
      SpreadsheetApp.flush();
      return {status:'ok',rewards:getRewards_(ss,rows)};
    } else if (note === 'set_reward_rule') {
      if (!isAdultEmail_(email)) throw new Error('Only parents can choose which activities earn stars.');
      var type = toStr(data.source_type), sourceId = toStr(data.source_id), stars = Number(data.stars);
      if (['task', 'habit'].indexOf(type) === -1 || [0, 1, 3, 5].indexOf(stars) === -1) throw new Error('Choose 0, 1, 3 or 5 stars.');
      var sheet = type === 'task' ? ensureTodoIds_(ss) : ensureHabitSheets_(ss).habits;
      var source = sheet.getDataRange().getValues().find(function(r, i) { return i > 0 && toStr(r[type === 'task' ? 7 : 0]) === sourceId; });
      if (!source || (type === 'task' && ['Done', 'Deleted'].indexOf(source[5]) !== -1)) throw new Error('Choose an existing open task or habit.');
      var rules = rewardSheet_(ss, 'RewardRules', ['ID', 'Type', 'Source ID', 'Stars', 'Updated By', 'Updated At']);
      var id = type + ':' + sourceId;
      var row = rules.getDataRange().getValues().findIndex(function(r) { return r[0] === id; });
      var values = [id, type, sourceId, stars, user, new Date()];
      if (row > 0) rules.getRange(row + 1, 1, 1, 6).setValues([values]); else rules.appendRow(values);
    } else if (note === 'buy_reward_item') {
      var item = REWARD_ITEMS_.find(function(i) { return i.id === data.item_id; });
      if (!item) throw new Error('Accessory not found.');
      var id = 'buy:' + user + ':' + item.id;
      var ledger = rewardRows_(ss, 'RewardLedger');
      if (!ledger.some(function(r) { return r[0] === id; })) {
        var profile = getRewards_(ss).members.find(function(m) { return m.member === user; });
        if (profile.balance < item.cost) throw new Error('Keep collecting stars to unlock this accessory.');
        rewardSheet_(ss, 'RewardLedger', ['ID', 'Member', 'Kind', 'Stars', 'Source or Item', 'Earned At']).appendRow([id, user, 'purchase', -item.cost, item.id, new Date()]);
      }
    } else if (note === 'save_companion') {
      var species = toStr(data.species), name = toStr(data.companion_name).trim(), equipped = toStr(data.equipped);
      if (['fox', 'rabbit', 'bear', 'cat'].indexOf(species) === -1 || !name || name.length > 24) throw new Error('Choose a companion and a name of up to 24 characters.');
      var profile = getRewards_(ss).members.find(function(m) { return m.member === user; });
      if (equipped && profile.owned.indexOf(equipped) === -1) throw new Error('Unlock this accessory before wearing it.');
      var sheet = rewardSheet_(ss, 'Companions', ['Member', 'Species', 'Name', 'Equipped', 'Updated At']);
      var row = sheet.getDataRange().getValues().findIndex(function(r) { return r[0] === user; });
      var values = [user, species, schoolCell_(name), equipped, new Date()];
      if (row > 0) sheet.getRange(row + 1, 1, 1, 5).setValues([values]); else sheet.appendRow(values);
    }
    return { status: 'ok', rewards: getRewards_(ss) };
  } catch (e) { return { status: 'error', message: e.message }; }
}

// Retry-safe creates. Keys are scoped to verified account + action, never row numbers.
function operationContext_(ss,data,email,note) {
  if (['add_todo','add_event','add_expense','add_trip','add_birthday'].indexOf(note)<0 || !data.operation_id) return null;
  if (!/^[A-Za-z0-9-]{16,80}$/.test(data.operation_id)) throw new Error('Invalid operation ID.');
  var fields={};Object.keys(data).sort().forEach(function(k){if(k[0]!=='_' && ['idToken','user','action','operation_id'].indexOf(k)<0) fields[k]=data[k];});
  var op={id:'op'+schoolHash_(email+'|'+note+'|'+data.operation_id),fingerprint:schoolHash_(JSON.stringify(fields)),note:note,email:email};
  var sheet=ss.getSheetByName('Operations');
  var row=sheet && sheet.getDataRange().getValues().slice(1).find(function(r){return r[0]===op.id;});
  if(row){if(row[1]!==op.fingerprint)throw new Error('This saved request changed. Start a new entry.');op.cached=JSON.parse(row[4]);}
  return op;
}
function operationFinish_(ss,op,result) {
  if(op){var sheet=ss.getSheetByName('Operations');if(!sheet){sheet=ss.insertSheet('Operations');sheet.appendRow(['ID','Fingerprint','Action','Email','Result','At']);}sheet.appendRow([op.id,op.fingerprint,op.note,op.email,JSON.stringify(result),new Date()]);SpreadsheetApp.flush();}
  return result;
}
function operationRecover_(ss,op,sheet,idColumn,hashColumn) {
  if(!op)return null;
  var row=sheet.getDataRange().getValues().slice(1).find(function(r){return r[idColumn]===op.id;});
  if(!row)return null;if(row[hashColumn]!==op.fingerprint)throw new Error('This saved request changed. Start a new entry.');
  return operationFinish_(ss,op,{status:'ok',id:op.id});
}
function operationCalendar_(op,title,start,end,allDay,notes,location,member) {
  var url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(CALENDAR_ID)+'/events';
  var event={id:op.id,summary:title,description:notes||'',location:location||'',extendedProperties:{private:{familylogMember:member,member:member,operationFingerprint:op.fingerprint}}};
  if(allDay){event.start={date:Utilities.formatDate(start,'Asia/Singapore','yyyy-MM-dd')};event.end={date:Utilities.formatDate(end,'Asia/Singapore','yyyy-MM-dd')};}
  else {event.start={dateTime:start.toISOString(),timeZone:'Asia/Singapore'};event.end={dateTime:end.toISOString(),timeZone:'Asia/Singapore'};}
  var headers={Authorization:'Bearer '+ScriptApp.getOAuthToken()};
  var response=UrlFetchApp.fetch(url+'?sendUpdates=none',{method:'post',contentType:'application/json',headers:headers,payload:JSON.stringify(event),muteHttpExceptions:true});
  if(response.getResponseCode()===409)response=UrlFetchApp.fetch(url+'/'+op.id,{headers:headers,muteHttpExceptions:true});
  if(response.getResponseCode()<200 || response.getResponseCode()>=300)throw new Error('Calendar save interrupted. Retry the same entry.');
  var saved=JSON.parse(response.getContentText());
  if(saved.status==='cancelled' || saved.extendedProperties.private.operationFingerprint!==op.fingerprint)throw new Error('This calendar request was changed or deleted. Start a new entry.');
  var id=saved.iCalUID||op.id+'@google.com';
  var calendar=CalendarApp.getCalendarById(CALENDAR_ID);
  var nativeEvent=typeof calendar.getEventById==='function'?calendar.getEventById(id):null;
  return nativeEvent||{getId:function(){return id;}};
}
function reminderSnapshot_(data) {
  var secret=PropertiesService.getScriptProperties().getProperty('REMINDER_BRIDGE_SECRET');
  var timestamp=Number(data.timestamp);
  if(!secret || !Number.isFinite(timestamp) || Math.abs(Date.now()-timestamp)>300000)return {status:'error',message:'Unauthorized'};
  var bytes=Utilities.computeHmacSha256Signature('reminder_snapshot|'+timestamp,secret);
  var expected=bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
  var supplied=toStr(data.signature);var difference=expected.length^supplied.length;
  for(var i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^(supplied.charCodeAt(i)||0);
  if(difference)return {status:'error',message:'Unauthorized'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  return {status:'ok',todos:getTodos(ss,null,false),habits:getHabits(ss),habitLogs:getHabitLogs(ss),events:getEvents()};
}

function manualEventMembers_(){
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Calendar'),members={};
  if(sheet)sheet.getDataRange().getValues().slice(1).forEach(function(r){if(r[5]&&FAMILY_MEMBERS.indexOf(r[7])!==-1)members[toStr(r[5])]=r[7];});
  return members;
}
