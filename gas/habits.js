function habitMembers_(value) {
  if (value === 'Everyone') return REWARD_MEMBERS_.slice();
  return toStr(value).split(',').map(function(m){return m.trim();}).filter(function(m){return REWARD_MEMBERS_.indexOf(m) !== -1;});
}
function ensureHabitSheets_(ss) {
  ss = ss || appSpreadsheet_();
  var hSheet = ss.getSheetByName('Habits');
  if (!hSheet) {
    hSheet = ss.insertSheet('Habits');
    hSheet.appendRow(['ID', 'Member', 'Habit', 'Emoji', 'CreatedBy', 'CreatedAt']);
    hSheet.appendRow(['default_meaghan_violin', 'Meaghan', 'Violin practice', '🎻', 'System', new Date()]);
  }
  if (perfReadRows_(hSheet)[0][6] !== 'Schedule') hSheet.getRange(1, 7, 1, 5).setValues([['Schedule', 'Weekdays', 'WeeklyTarget', 'State', 'UpdatedAt']]);
  var hlSheet = ss.getSheetByName('HabitLogs');
  if (!hlSheet) {
    hlSheet = ss.insertSheet('HabitLogs');
    hlSheet.appendRow(['ID', 'HabitID', 'Member', 'Habit', 'Date', 'Notes', 'LoggedBy', 'Timestamp']);
  }
  return { habits: hSheet, logs: hlSheet };
}

function habitScheduleInput_(data) {
  var mode = toStr(data.schedule) || 'daily', days = data.weekdays || [], target = data.weekly_target == null ? 3 : data.weekly_target;
  if (['daily','weekdays','weekly'].indexOf(mode) < 0) throw new Error('Choose a valid habit schedule.');
  if (mode === 'weekdays' && (!Array.isArray(days) || !days.length || days.length > 7 || days.some(function(d){return typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6;}) || new Set(days).size !== days.length)) throw new Error('Choose at least one day of the week.');
  if (mode === 'weekly' && (typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > 7)) throw new Error('Choose a weekly target from 1 to 7.');
  return {mode:mode,days:mode === 'weekdays' ? days : [],target:mode === 'weekly' ? target : 3};
}
function habitScheduled_(definition, date, member, logs) {
  var mode = toStr(definition[6]) || 'daily', day = new Date(date+'T00:00:00Z').getUTCDay();
  if (mode === 'weekdays') return toStr(definition[7]).split(',').map(Number).indexOf(day) >= 0;
  if (mode !== 'weekly') return true;
  var monday = new Date(date+'T00:00:00Z'); monday.setUTCDate(monday.getUTCDate() - ((day+6)%7));
  var start = monday.toISOString().slice(0,10); monday.setUTCDate(monday.getUTCDate()+7); var end = monday.toISOString().slice(0,10);
  // Exclude this occurrence so a retry can recover its reward. Count distinct days.
  var days = {};
  logs.slice(1).forEach(function(r){var d = r[4] instanceof Date ? Utilities.formatDate(r[4],'Asia/Singapore','yyyy-MM-dd') : toStr(r[4]); if (r[1] === definition[0] && r[2] === member && d >= start && d < end && d !== date) days[d]=true;});
  return Object.keys(days).length < (Number(definition[8]) || 3);
}

function getHabitsMeasured_(ss, verifiedEmail) {
  ss = ss || appSpreadsheet_();
  var sheets = ensureHabitSheets_(ss);
  var rows = perfReadRows_(sheets.habits);
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0] || !r[2]) continue;
    if (verifiedEmail && !isAdultEmail_(verifiedEmail) && r[9] === 'archived') continue;
    if (verifiedEmail && !isAdultEmail_(verifiedEmail) && habitMembers_(r[1]).indexOf(memberNameFromEmail_(verifiedEmail)) === -1) continue;
    result.push({
      id: toStr(r[0]),
      member: toStr(r[1]), members: habitMembers_(r[1]),
      habit: toStr(r[2]),
      emoji: toStr(r[3]) || '⭐',
      createdBy: toStr(r[4]),
      schedule: toStr(r[6]) || 'daily', weekdays: toStr(r[7]).split(',').filter(function(x){return x !== '';}).map(Number),
      weeklyTarget: Number(r[8]) || 3, state: toStr(r[9]) || 'active'
    });
  }
  return result;
}

function getHabitLogsMeasured_(ss, verifiedEmail) {
  ss = ss || appSpreadsheet_();
  ensureHabitSheets_(ss);
  return habitReadLogs_(ss,verifiedEmail,habitLogWindow_().start,'');
}


// Runs inside the family write lock; reward and retry IDs remain unchanged.
function habitHandleWrite_(data,ss,verifiedEmail,user,operation) {
  var noteLower=toStr(data.note).toLowerCase().trim();
    // ── HABIT: log completion ──
    if (noteLower === 'log_habit') {
      var sheets = ensureHabitSheets_(ss);
      var habitId = toStr(data.habit_id);
      var definition = perfReadRows_(sheets.habits).find(function(r, i) { return i > 0 && r[0] === habitId; });
      if (!definition) return { status: 'error', message: 'Choose an existing habit.' };
      // The definition controls identity; caller-supplied member/habit cannot spoof rewards.
      var assigned = habitMembers_(definition[1]);
      var member = assigned.length > 1 ? (isAdultEmail_(verifiedEmail) ? (toStr(data.log_member) || (assigned.indexOf(user) !== -1 ? user : assigned[0])) : user) : assigned[0];
      if (assigned.indexOf(member) === -1) return {status:'error',message:'This habit is not assigned to that person.'};
      if (REWARD_MEMBERS_.indexOf(member) === -1) return { status: 'error', message: 'Choose a family member to log for.' };
      if (definition[9] === 'paused' || definition[9] === 'archived') return { status: 'error', message: 'This habit is paused or archived.' };
      var habit = toStr(definition[2]);
      if (!isAdultEmail_(verifiedEmail) && member !== user) return { status: 'error', message: 'You can only log habits for yourself.' };
      var today = Utilities.formatDate(new Date(), 'Asia/Singapore', 'yyyy-MM-dd');
      var dateStr;
      try { dateStr = schoolDate_(toStr(data.date) || today, false); } catch (e) { return { status: 'error', message: 'Choose a valid date.' }; }
      if (dateStr > today) return { status: 'error', message: 'Log your habit after you have done it.' };
      var notes = toStr(data.notes);
      if (notes.length > 1000) return { status: 'error', message: 'Keep notes under 1,000 characters.' };
      var logRows = perfReadRows_(sheets.logs);
      var existing = logRows.find(function(r, i) {
        var day = r[4] instanceof Date ? Utilities.formatDate(r[4], 'Asia/Singapore', 'yyyy-MM-dd') : toStr(r[4]);
        return i > 0 && r[1] === habitId && r[2] === member && day === dateStr;
      });
      var logId = existing ? toStr(existing[0]) : Utilities.getUuid();
      if (!existing) {
        var logRow = [logId, habitId, member, schoolCell_(habit), dateStr, schoolCell_(notes), user, new Date()];
        sheets.logs.appendRow(logRow);
        logRows.push(logRow);
      }
      SpreadsheetApp.flush();
      var eligible = habitScheduled_(definition, dateStr, member, logRows);
      var award = dateStr === today && eligible ? rewardAward_(ss, 'habit', habitId, member, member + ':' + dateStr) : { stars: 0, member: member };
      if (!existing) {
        var logger = (user === member ? user : user + ' for ' + member);
        var habitAwardTxt = (award && award.stars > 0) ? ' (+' + award.stars + '★)' : '';
        recordActivity_(ss, user, 'habit_log', 'Habits', logger + ' completed habit: "' + habit + '"' + habitAwardTxt, (notes ? 'Notes: ' + notes : ''));
      }
      return { status: 'ok', id: logId, date: dateStr, duplicate: !!existing, award: award, rewards: getRewards_(ss),
        log: { id: logId, habitId: habitId, member: member, habit: habit, date: dateStr, notes: existing ? toStr(existing[5]) : notes, loggedBy: existing ? toStr(existing[6]) : user } };
    }

    // ── HABIT: delete completion log ──
    if (noteLower === 'delete_habit_log') {
      var logId = toStr(data.id || data.log_id);
      if (!logId) return { status: 'error', message: 'Log ID required' };
      var sheets = ensureHabitSheets_(ss);
      var rows = perfReadRows_(sheets.logs);
      var rowIndex = rows.findIndex(function(r, i) { return i > 0 && r[0] === logId; });
      if (rowIndex < 1) return { status: 'error', message: 'Log entry not found' };
      var parent = isAdultEmail_(verifiedEmail);
      if (!parent && rows[rowIndex][2] !== user && rows[rowIndex][6] !== user) {
        return { status: 'error', message: 'You can only delete your own habit logs.' };
      }
      var deletedHabit = toStr(rows[rowIndex][3]) || 'habit';
      var deletedMember = toStr(rows[rowIndex][2]) || user;
      sheets.logs.deleteRow(rowIndex + 1);
      console.log('✅ Habit log deleted: ' + logId);
      recordActivity_(ss, user, 'habit_delete', 'Habits', user + ' removed habit log: "' + deletedHabit + '" for ' + deletedMember);
      return { status: 'ok' };
    }

    // Habit lifecycle preserves IDs, logs and the immutable reward ledger.
    if (noteLower === 'add_habit' || noteLower === 'edit_habit') {
      var sheets = ensureHabitSheets_(ss), parent = isAdultEmail_(verifiedEmail);
      var habitId = toStr(data.habit_id), rows = perfReadRows_(sheets.habits);
      var index = rows.findIndex(function(r,i){return i > 0 && r[0] === habitId;});
      var editing = noteLower === 'edit_habit';
      if (editing && index < 1) return { status:'error', message:'Habit not found. Refresh before editing.' };
      if (!editing && data.members === undefined && data.member && FAMILY_MEMBERS.indexOf(data.member) === -1) return {status:'error',message:'Choose a family member.'};
      var existingMembers = editing ? habitMembers_(rows[index][1]) : [];
      var assigned;
      if (data.members !== undefined) {
        if (!Array.isArray(data.members) || !data.members.length || data.members.length > 4 || data.members.some(function(m){return REWARD_MEMBERS_.indexOf(m) === -1;})) return {status:'error',message:'Choose at least one family member.'};
        assigned = REWARD_MEMBERS_.filter(function(m){return data.members.indexOf(m) !== -1;});
      } else assigned = editing ? existingMembers : habitMembers_(toStr(data.member) || user);
      var member = assigned.length === 4 ? 'Everyone' : assigned.join(',');
      if (!assigned.length || (!parent && (assigned.length !== 1 || assigned[0] !== user || (editing && (existingMembers.length !== 1 || existingMembers[0] !== user))))) return { status:'error', message:'You can only manage habits for yourself.' };
      var habit = toStr(data.habit).trim(), emoji = toStr(data.emoji).trim() || '⭐';
      if (!habit || habit.length > 80 || emoji.length > 12) return { status:'error', message:'Use a habit name up to 80 characters and a short emoji.' };
      var schedule = habitScheduleInput_(data);
      var state = editing ? (toStr(rows[index][9]) || 'active') : 'active';
      if (editing) {
        sheets.habits.getRange(index+1,2,1,3).setValues([[member,schoolCell_(habit),schoolCell_(emoji)]]);
        sheets.habits.getRange(index+1,7,1,5).setValues([[schedule.mode,schedule.days.join(','),schedule.target,state,new Date()]]);
      } else {
        // Recover the destination row even if its append or the operation ledger lost its response.
        var recoveredHabit = operationRecover_(ss,operation,sheets.habits,0,11);
        if (recoveredHabit) return recoveredHabit;
        habitId = operation ? operation.id : Utilities.getUuid();
        if (rows[0][11] !== 'OperationFingerprint') sheets.habits.getRange(1,12).setValue('OperationFingerprint');
        sheets.habits.appendRow([habitId,member,schoolCell_(habit),schoolCell_(emoji),user,new Date(),schedule.mode,schedule.days.join(','),schedule.target,'active',new Date(),operation ? operation.fingerprint : '']);
      }
      return operationFinish_(ss,operation,{status:'ok',id:habitId});
    }
    if (noteLower === 'set_habit_state' || noteLower === 'delete_habit') {
      if (!isAdultEmail_(verifiedEmail)) return {status:'error',message:'Only parents can pause or archive habits.'};
      var sheets = ensureHabitSheets_(ss), habitId = toStr(data.habit_id || data.id);
      var index = perfReadRows_(sheets.habits).findIndex(function(r,i){return i > 0 && r[0] === habitId;});
      if (index < 1) return {status:'error',message:'Habit not found.'};
      var state = noteLower === 'delete_habit' ? 'archived' : toStr(data.state);
      if (['active','paused','archived'].indexOf(state) < 0) return {status:'error',message:'Choose active, paused or archived.'};
      sheets.habits.getRange(index+1,10,1,2).setValues([[state,new Date()]]);
      return {status:'ok',id:habitId,state:state};
    }


  return {status:"error",message:"Unknown habit action"};
}
