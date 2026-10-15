// Wong’s Nest: family dashboard and activity readers. Domain implementations live in gas/.
function recordActivity_(ss, user, action, category, description, details) {
  try {
    ss = ss || appSpreadsheet_();
    var sheet = ss.getSheetByName(activitySheetName_());
    if (!sheet) {
      sheet = ss.insertSheet(activitySheetName_());
      sheet.appendRow(['Timestamp', 'User', 'Action', 'Category', 'Description', 'Details']);
    }
    sheet.appendRow([new Date().toISOString(), user || 'Family', schoolCell_(action), schoolCell_(category), schoolCell_(description), schoolCell_(details || '')]);
  } catch (e) {
    console.log('recordActivity_ error: ' + e);
  }
}

function getActivityLogMeasured_(ss, allTodos, habitLogs, scope) {
  ss = ss || appSpreadsheet_();
  var list = [];
  var seen = {};

  var sheet = ss.getSheetByName(activitySheetName_());
  if (!sheet && FAMILY_BACKEND_MODE_) sheet = ss.getSheetByName('ActivityLog');
  var sources = sheet ? [sheet] : [];
  if (FAMILY_BACKEND_MODE_) { var legacy=ss.getSheetByName('ActivityLog'); if(legacy && legacy!==sheet)sources.push(legacy); }
  sources.forEach(function(source){
    // Append-only logs: walk backwards in small ranges, stopping once 50 relevant unique rows exist.
    for(var end=source.getLastRow();end>=2 && list.length<50;){
      var start=Math.max(2,end-99),vals=perfReadRange_(source,start,1,end-start+1,6);
      for(var i=vals.length-1;i>=0 && list.length<50;i--){
        var r=vals[i];
        if (!r[0]) continue;
        if (scope === 'family' && ['Tasks','Calendar','Habits'].indexOf(toStr(r[3])) === -1) continue;
        var ts;
        try { ts = r[0] instanceof Date ? r[0].toISOString() : (new Date(r[0]).toISOString()); } catch (_) { ts = toStr(r[0]); }
        var desc = toStr(r[4]);
        var act = toStr(r[2]) || 'general';
        var key = act + '|' + desc + '|' + ts.slice(0, 16);
        if (seen[key]) continue;
        seen[key] = true;
        list.push({
          timestamp: ts,
          user: toStr(r[1]) || 'Family',
          action: act,
          category: toStr(r[3]) || 'General',
          description: desc,
          details: toStr(r[5]) || ''
        });
      }
      end=start-1;
    }
  });

  // Synthesize recent task completions from allTodos
  if (Array.isArray(allTodos)) {
    allTodos.forEach(function(t) {
      if (t.status === 'Done' && (t.completedAt || t.completedRaw)) {
        var ts = t.completedAt || (t.completedRaw + 'T12:00:00.000Z');
        var member = t.completedBy || t.assignee || 'Someone';
        var desc = member + ' completed task: "' + t.task + '"';
        var key = 'task_done|' + desc + '|' + ts.slice(0, 16);
        if (!seen[key]) {
          seen[key] = true;
          list.push({
            timestamp: ts,
            user: member,
            action: 'task_done',
            category: 'Tasks',
            description: desc,
            details: t.assignee && t.assignee !== 'Everyone' ? 'Assigned to ' + t.assignee : ''
          });
        }
      }
      if (t.createdAt && t.task) {
        var ts = t.createdAt;
        var member = t.addedBy || 'Someone';
        var desc = member + ' added task: "' + t.task + '"' + (t.assignee && t.assignee !== 'Everyone' ? ' for ' + t.assignee : '');
        var key = 'task_add|' + desc + '|' + ts.slice(0, 16);
        if (!seen[key]) {
          seen[key] = true;
          list.push({
            timestamp: ts,
            user: member,
            action: 'task_add',
            category: 'Tasks',
            description: desc,
            details: t.assignee && t.assignee !== 'Everyone' ? 'For ' + t.assignee : ''
          });
        }
      }
    });
  }

  // Synthesize recent habit logs
  if (Array.isArray(habitLogs)) {
    habitLogs.slice(-20).forEach(function(h) {
      if (h.date && h.habit) {
        var ts = h.date + 'T12:00:00.000Z';
        var member = h.loggedBy || h.member || 'Someone';
        var desc = member + ' completed habit: "' + h.habit + '"';
        var key = 'habit_log|' + desc + '|' + ts.slice(0, 10);
        if (!seen[key]) {
          seen[key] = true;
          list.push({
            timestamp: ts,
            user: member,
            action: 'habit_log',
            category: 'Habits',
            description: desc,
            details: h.notes || ''
          });
        }
      }
    });
  }

  list.sort(function(a, b) {
    return String(b.timestamp).localeCompare(String(a.timestamp));
  });

  return list.slice(0, 50);
}

function getAllDashboardDataMeasured_(verifiedEmail, scope, deferArchives) {
  var ss = appSpreadsheet_();
  var adult = isAdultEmail_(verifiedEmail);
  var coreOnly = scope === 'family-core';
  var includePrivate = !FAMILY_BACKEND_MODE_ && adult && scope !== 'family' && !coreOnly;
  var preparation = coreOnly ? null : calendarPreparation_(ss, false);
  var events = preparation ? preparation.events : null;
  var allTodos = getTodos(ss, verifiedEmail, true);
  var habits = getHabits(ss, verifiedEmail);
  var habitLogs = getHabitLogs(ss, verifiedEmail);
  var completed = completedTaskPage_(allTodos);
  // One immutable notice snapshot serves plans and health; never cached across requests/writes.
  var schoolRows = adult ? schoolStoredRows_(ss) : [];
  var schoolRecords = perfStage_('school_plans',function(){return schoolCoreRecords_(schoolRows,adult,deferArchives);});
  // Sheets own the dashboard; Firestore owns memories (see ARCHITECTURE.md).
  return {
    events:    coreOnly ? undefined : memberEvents_(events, verifiedEmail),
    preparationState: preparation ? preparation.preparationState : undefined,
    dataWarnings: schoolRecords.warnings,
    todos:     allTodos.filter(function(t) { return t.status.toLowerCase() !== 'done'; }),
    completedTasks: completed.items,
    completedTaskHistory: {nextCursor:completed.nextCursor},
    schoolPlans: schoolRecords.plans,
    schoolArchiveAvailable: adult && schoolRows.length>0,
    schoolTasks: allTodos.filter(function(t) { return !!t.sourceId; }),
    expenses:  includePrivate ? getExpensesData(ss) : emptyExpensesPayload_(),
    budgets:   includePrivate ? getBudgets(ss) : [],
    birthdays: getBirthdays(ss),
    // Adult-only payloads are empty for children's accounts
    fertility:      includePrivate ? getFertilityData(ss) : [],
    recurring:      includePrivate ? getRecurring(ss) : [],
    travel:         [],
    appreciations:  includePrivate ? getAppreciationsData(ss) : [],
    loveCheckins:   includePrivate ? getLoveCheckinsData(ss) : [],
    intimacyLog:    includePrivate ? getIntimacyLogData(ss) : [],
    bucketList:     includePrivate ? getBucketList(ss) : [],
    habits:         habits,
    habitLogs:      deferArchives ? habitLogs.map(habitProgressLog_) : habitLogs,
    habitLogWindow: habitLogWindow_(),
    rewards:        getRewards_(ss),
    activityLog:    adult ? getActivityLog(ss, allTodos, habitLogs, FAMILY_BACKEND_MODE_ || coreOnly ? 'family' : scope) : [],
    expenseGroups:  includePrivate ? EXPENSE_GROUPS : {},
    isAdult:        adult,
    memberName:     memberNameFromEmail_(verifiedEmail) || '',
    // Explicit nulls so old clients don't fall back to stale dual-path assumptions
    chat: null,
    memories: null,
    dataSources: {
      sheets: ['events', 'todos', 'schoolPlans', 'schoolTasks', 'expenses', 'budgets', 'birthdays', 'fertility',
               'recurring', 'appreciations', 'loveCheckins', 'intimacyLog', 'bucketList', 'habits', 'habitLogs', 'rewards', 'activityLog'],
      firebase: ['memories', 'auth', 'fcmTokens']
    }
  };
}

function getBirthdays(ss) {
  ss = ss || appSpreadsheet_();
  var bdSheet = ss.getSheetByName('Birthdays');
  if (!bdSheet) return [];
  var bdVals = perfReadRows_(bdSheet);
  var now    = new Date(); var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var tz     = Session.getScriptTimeZone();
  var result = [];
  for (var i = 1; i < bdVals.length; i++) {
    var row = bdVals[i]; if (!row[0] || !row[2]) continue;
    var parts = toStr(row[2]).split('-'); if (parts.length !== 2) continue;
    var month = parseInt(parts[0]) - 1; var day = parseInt(parts[1]);
    var eventThisYear = annualEventDate_(now.getFullYear(), month, day);
    var eventDate     = eventThisYear >= today ? eventThisYear : annualEventDate_(now.getFullYear() + 1, month, day);
    var daysAway      = Math.floor((eventDate - today) / (1000 * 60 * 60 * 24));
    var agePart = ''; var yearVal = toStr(row[3]);
    if (yearVal) {
      var yr = parseInt(yearVal);
      agePart = toStr(row[1]) === 'Birthday' ? 'turning ' + (eventDate.getFullYear() - yr) : (eventDate.getFullYear() - yr) + ' years';
    }
    result.push({ rowNum: i + 1, name: toStr(row[0]), type: toStr(row[1]) || 'Birthday', date: toStr(row[2]), dateLabel: Utilities.formatDate(eventDate, tz, 'MMM d'), daysAway: daysAway, agePart: agePart, year: yearVal, notes: toStr(row[4]) });
  }
  result.sort(function(a, b) { return a.daysAway - b.daysAway; });
  return result;
}
