function doGet(e) {
  try {
    var action   = e && e.parameter && e.parameter.action   ? e.parameter.action   : '';
    var callback = e && e.parameter && e.parameter.callback ? e.parameter.callback : '';
    var idToken  = e && e.parameter && e.parameter.idToken  ? e.parameter.idToken  : '';
    var verifiedEmail = null;

    // Default-deny: EVERY action requires a verified family token except
    // the expense-approval endpoints, which are opened from signed email links.
    if (FAMILY_BACKEND_MODE_) {
      if (action === 'health') {
        try { appSpreadsheet_().getId(); CalendarApp.getCalendarById(CALENDAR_ID).getName(); calendarApi_('get','?singleEvents=true&maxResults=1&timeMin='+encodeURIComponent(new Date().toISOString())); return respondJSONP({status:'ready',backend:'family'},''); }
        catch(accessError) { return respondJSONP({status:'error',backend:'family',calendarStatus:accessError.calendarStatus||0,calendarReason:accessError.calendarReason||'',message:'Family backend access check failed.'},''); }
      }
      return respondJSONP({status:'error',message:'Use authenticated POST requests.'}, '');
    }
    var openActions = ['confirm_expense_page', 'submit_confirmed_expense'];
    if (openActions.indexOf(action) === -1) {
      verifiedEmail = verifyFirebaseToken(idToken);
      if (!verifiedEmail) {
        var error = { status: 'error', message: 'Unauthorized: invalid or missing token' };
        return respondJSONP(error, callback);
      }
    }

    if (action === 'confirm_expense_page') {
      return renderConfirmExpensePage(
        e.parameter.id || '',
        e.parameter.exp || '',
        e.parameter.sig || ''
      );
    }

    if (FAMILY_SERVICE_FORWARDING_ && action === 'get_all') return respondJSONP(legacySplitDashboard_({idToken:idToken},verifiedEmail),callback);
    if (FAMILY_SERVICE_FORWARDING_ && familyReadAction_(action)) return respondJSONP(familyForward_({action:action,idToken:idToken}),callback);
    var output;
    switch (action) {
      case 'get_all':       output = getAllDashboardData(verifiedEmail); break;
      case 'get_family_dashboard': output = getAllDashboardData(verifiedEmail, 'family'); break;
      case 'get_parent_dashboard': output = getParentDashboardData(verifiedEmail); break;
      // Chat is retired — neither Sheets nor Firebase accepts new messages
      case 'get_chat':
        output = { status: 'error', message: 'Chat has been removed from Wong’s Nest.' };
        break;
      case 'get_events':    output = memberEvents_(getEvents(), verifiedEmail); break;
      case 'get_todos':     output = getTodos(null, verifiedEmail);            break;
      case 'get_expenses':  output = isAdultEmail_(verifiedEmail) ? getExpensesData() : emptyExpensesPayload_(); break;
      case 'get_budgets':   output = isAdultEmail_(verifiedEmail) ? getBudgets() : [];          break;
      case 'get_birthdays': output = getBirthdays();        break;
      // Memories live in Firestore only — see ARCHITECTURE.md
      case 'get_memories':
        output = {
          status: 'error',
          message: 'Memories use Firestore. Open the Memories tab in the app.'
        };
        break;
      case 'get_fertility':
        output = isAdultEmail_(verifiedEmail) ? getFertilityData() : [];
        break;
      case 'get_recurring': output = isAdultEmail_(verifiedEmail) ? getRecurring() : [];        break;
      case 'get_travel':    output = [];       break;
      case 'submit_confirmed_expense':
        output = handleSubmitConfirmedExpense(e.parameter);
        break;
      case 'write':
        var writeData = {};
        try { writeData = JSON.parse(e.parameter.data || '{}'); } catch(pe) {}
        writeData._verifiedEmail = verifiedEmail;
        writeData.idToken = idToken;
        output = handleWrite(writeData);
        break;
      default: output = { error: 'unknown action: ' + action };
    }
    return respondJSONP(output, callback);
  } catch (err) {
    console.log('❌ doGet error: ' + err.stack);
    var fallback = { status: 'error', message: 'An internal error occurred. Please try again later.' };
    return respondJSONP(fallback, e && e.parameter && e.parameter.callback ? e.parameter.callback : '');
  }
}

function doPostInner_(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if(perfContext_)perfContext_.endpoint=PERF_ENDPOINTS_.indexOf(data.action)>=0?data.action:'other';
    if (data.action === 'verify_reminder_snapshot') return perfJson_({status:!FAMILY_BACKEND_MODE_ && reminderAuthorized_(data) ? 'ok' : 'error'});
    if (data.action === 'reminder_snapshot' || data.action === 'prepare_family_tasks') return perfJson_(reminderSnapshot_(data));
    // The token is mandatory. The old check only ran `if (data.idToken)`,
    // so omitting the token skipped verification entirely — an
    // unauthenticated write path for anyone who knew the URL.
    var verified = verifyFirebaseToken(data.idToken);
    if (!verified) {
      return perfJson_({ status: 'error', message: 'Unauthorized' });
    }

    if(perfContext_)perfContext_.adult=isAdultEmail_(verified);
    // Prefer POST for all app traffic so idTokens never appear in URLs / proxy logs.
    var action = toStr(data.action).toLowerCase().trim();
    if (FAMILY_BACKEND_MODE_) {
      if (action === 'get_all') action = 'get_family_dashboard';
      if (!familyReadAction_(action) && !(action === 'write' && familyWriteNote_(data.note))) return perfJson_({status:'error',message:'Unavailable in family service'});
    } else if (FAMILY_SERVICE_FORWARDING_ && familyReadAction_(action)) {
      return perfJson_(familyForward_(data));
    }
    if (action === 'get_all') {
      if (FAMILY_SERVICE_FORWARDING_) return perfJson_(legacySplitDashboard_(data,verified));
      return perfJson_(getAllDashboardData(verified));
    }

    if (action === 'get_family_dashboard' || action === 'get_parent_dashboard') {
      var dashboard = action === 'get_family_dashboard' ? getAllDashboardData(verified, 'family') : getParentDashboardData(verified);
      return perfJson_(dashboard);
    }

    if (action === 'get_family_core') {
      return perfJson_(getAllDashboardData(verified, 'family-core',data.archive_version===1));
    }
    if (action === 'get_family_calendar') {
      var ss = appSpreadsheet_();
      var preparation = calendarPreparation_(ss, false), events = preparation.events;
      var tasks = getTodos(ss, verified, true);
      var completed = completedTaskPage_(tasks);
      return perfJson_({status:'ok',completedTaskHistory:{nextCursor:completed.nextCursor},preparationState:preparation.preparationState,dataWarnings:schoolRecordWarnings_(ss,isAdultEmail_(verified)),events:memberEvents_(events, verified),todos:tasks.filter(function(t){return t.status.toLowerCase() !== 'done';}),completedTasks:completed.items,schoolTasks:tasks.filter(function(t){return !!t.sourceId;})});
    }

    if (action === 'get_events' || action === 'get_todos' || action === 'get_birthdays') {
      var rows = action === 'get_events' ? memberEvents_(getEvents(),verified) : action === 'get_todos' ? getTodos(null,verified) : getBirthdays();
      return perfJson_(rows);
    }
    if (action === 'get_family_archive') return perfJson_(familyArchive_(appSpreadsheet_(),data,verified));
    if (action === 'get_school_plan') return perfJson_(schoolPlanById_(appSpreadsheet_(),data.source_id,verified));
    if (action === 'get_habit_week') return perfJson_(habitWeekRead_(appSpreadsheet_(),data.date,verified));
    if (action === 'get_completed_tasks') {
      return perfJson_(Object.assign({status:'ok'},completedTaskPage_(getTodos(null,verified,true),data.cursor)));
    }
    if (action === 'get_rewards') {
      return perfJson_({status:'ok',rewards:getRewards_(appSpreadsheet_())});
    }

    // Default: write (note field). Explicit action=write also accepted.
    data._verifiedEmail = verified;
    var result = handleWrite(data);
    return perfJson_(result);
  } catch (err) {
    console.log('❌ doPost error: ' + err.stack);
    return perfJson_({ status: 'error', message: 'Internal server error' });
  }
}

// ============================================================
// HANDLE WRITE (with all existing + new endpoints)
// ============================================================
// All mutations run under a script lock so two family members writing
// at the same moment can't interleave read-modify-write sequences
// (e.g. a delete-by-row landing while another handler is mid-update).
function handleWrite(data) {
  if (FAMILY_BACKEND_MODE_ && !familyWriteNote_(data.note)) return {status:'error',message:'Unavailable in family service'};
  if (!FAMILY_BACKEND_MODE_ && FAMILY_SERVICE_FORWARDING_ && familyWriteNote_(data.note)) return familyForward_(Object.assign({},data,{action:'write'}));
  var lock = LockService.getScriptLock();
  try {
    perfStage_('lock_wait',function(){lock.waitLock(10000);});
  } catch (e) {
    return { status: 'error', message: 'Server busy — please try again in a moment.' };
  }
  try {
    return handleWriteInner_(data);
  } finally {
    lock.releaseLock();
  }
}

function handleWriteInner_(data) {
  var ss        = appSpreadsheet_();
  var note      = toStr(data.note);
  var noteLower = note.toLowerCase().trim();
  if (note.length > 80) return {status:'error',message:'Invalid action.'};

  // Identity is derived only from the verified Firebase email.
  // Client-supplied data.user is ignored (spoof protection).
  var verifiedEmail = toStr(data._verifiedEmail).toLowerCase();
  var user = memberNameFromEmail_(verifiedEmail);
  if (!user) {
    return { status: 'error', message: 'Unauthorized: unknown family member' };
  }

  // Adults-only features (Us sanctuary, fertility, couple bucket list)
  if (ADULT_ONLY_NOTES.indexOf(noteLower) !== -1 && !isAdultEmail_(verifiedEmail)) {
    return { status: 'error', message: 'This feature is only available to parents.' };
  }

  if (['set_reward_rule', 'set_habit_rewards', 'buy_reward_item', 'save_companion', 'set_family_goal'].indexOf(noteLower) !== -1) return rewardHandleWrite_(data, ss, verifiedEmail, user);

  if (noteLower === 'save_school_draft' || noteLower === 'publish_school_draft') return schoolHandleWrite_(data, ss, verifiedEmail, user);

  var logSheet = ss.getSheetByName('Log') || ss.insertSheet('Log');

  try {
    var operation = operationContext_(ss,data,verifiedEmail,noteLower);
    if (operation && operation.cached) return operation.cached;
    if (!FAMILY_BACKEND_MODE_) {
      var parentResult=parentHandleWrite_(data,ss,verifiedEmail,user,operation);
      if (parentResult !== null) return parentResult;
    }
    if (['log_habit','delete_habit_log','add_habit','edit_habit','set_habit_state','delete_habit'].indexOf(noteLower)!==-1) return habitHandleWrite_(data,ss,verifiedEmail,user,operation);
    // ── EVENT: add ──
    if (noteLower === 'add_event') {
      var title = toStr(data.event_title) || 'Untitled Event';
      var dateStr = toStr(data.event_date);
      var timeStr = toStr(data.event_time);
      var endTimeStr = toStr(data.event_end_time);
      var eventLocation = toStr(data.event_location);
      var eventNotes = toStr(data.event_notes);

      if (!dateStr || !writeValidateDate_(dateStr)) {
        return { status: 'error', message: 'Invalid event date' };
      }
      if (!writeValidateString_(title, 100)) {
        return { status: 'error', message: 'Event title too long' };
      }
      if (!writeValidateString_(eventLocation, 200)) {
        return { status: 'error', message: 'Location too long' };
      }
      if (!writeValidateString_(eventNotes, 1000)) {
        return { status: 'error', message: 'Notes too long' };
      }

      var isAllDay = !timeStr || timeStr === '';
      var startDate = parseEventDate(dateStr, timeStr);
      var endDate;
      if (isAllDay) { endDate = new Date(startDate); endDate.setDate(endDate.getDate() + 1); }
      else if (endTimeStr) { endDate = parseEventDate(dateStr, endTimeStr); if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1); }
      else { endDate = new Date(startDate.getTime() + 60 * 60 * 1000); }

      var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
      var member = toStr(data.event_member) || toStr(data.event_child) || '';
      if (member && FAMILY_MEMBERS.indexOf(member) === -1) return {status:'error',message:'Choose a valid family member.'};
      var createdEvent = operation ? operationCalendar_(operation,title,startDate,endDate,isAllDay,eventNotes,eventLocation,member) : isAllDay
        ? calendar.createAllDayEvent(title, startDate, { description: eventNotes || '', location: eventLocation || '' })
        : calendar.createEvent(title, startDate, endDate, { description: eventNotes || '', location: eventLocation || '' });

      if (member && FAMILY_MEMBERS.indexOf(member) !== -1 && member !== 'Everyone') {
        try { if (typeof createdEvent.setTag === 'function') createdEvent.setTag('familylogMember', member); } catch (te) {}
      }

      var calSheet = ss.getSheetByName('Calendar');
      if (!calSheet) { calSheet = ss.insertSheet('Calendar'); calSheet.appendRow(['Title', 'Date', 'Time', 'Added By', 'Notes', 'Google Event ID']); }
      var calNotes = eventNotes;
      if (eventLocation) calNotes = (calNotes ? calNotes + '\n' : '') + 'Location: ' + eventLocation;
      var calendarRows = perfReadRows_(calSheet);
      if (!calendarRows.some(function(r,i){return i>0 && r[5]===createdEvent.getId();})) calSheet.appendRow([schoolCell_(title), startDate, timeStr, user, schoolCell_(calNotes), createdEvent.getId(), operation ? operation.fingerprint : '', member]);
      console.log('✅ Event added: ' + title + (member ? ' [' + member + ']' : ''));
      recordActivity_(ss, user, 'event_add', 'Calendar', user + ' added event: "' + title + '" on ' + dateStr, (member ? 'For ' + member : ''));
      return operationFinish_(ss,operation,{ status: 'ok', id: createdEvent.getId() });
    }

    // ── EVENT: delete ──
    if (noteLower === 'delete_event') {
      var eventId = toStr(data.event_id);
      if (!eventId) return { status: 'error', message: 'Missing event ID' };
      var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
      if (schoolEventLinks_()[eventId]) return { status: 'error', message: 'School events are linked to a reviewed plan. Edit the event in Google Calendar and adjust its preparation tasks together.' };
      var target = calendarTarget_(eventId);
      var evTitle = calendarDelete_(target);
      var calSheet = ss.getSheetByName('Calendar');
      if (calSheet) {
        var cVals = perfReadRows_(calSheet);
        for (var ci = 1; ci < cVals.length; ci++) {
          if (toStr(cVals[ci][5]) === eventId) {
            if (!evTitle && cVals[ci][0]) evTitle = toStr(cVals[ci][0]);
            calSheet.deleteRow(ci + 1);
            break;
          }
        }
      }
      console.log('✅ Event deleted: ' + eventId);
      recordActivity_(ss, user, 'event_delete', 'Calendar', user + ' deleted event: "' + (evTitle || eventId) + '"');
      return { status: 'ok' };
    }

    // ── EVENT: update date ──
    if (noteLower === 'update_event_date') {
      var eventId = toStr(data.event_id);
      var newDateStr = toStr(data.new_date);
      if (!eventId || !newDateStr) return { status: 'error', message: 'Missing event ID or new date' };
      if (!writeValidateDate_(newDateStr)) return { status: 'error', message: 'Invalid new date' };

      var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
      if (schoolEventLinks_()[eventId]) return { status: 'error', message: 'School events are linked to a reviewed plan. Edit the event in Google Calendar and adjust its preparation tasks together.' };
      var target = calendarTarget_(eventId);
      if (!target) return {status:'error',message:'Event not found in calendar'};
      var movedTitle = calendarMove_(target,newDateStr);
      var newStart = parseEventDate(newDateStr,'');

      // Update the Calendar sheet
      var calSheet = ss.getSheetByName('Calendar');
      if (calSheet) {
        var cVals = perfReadRows_(calSheet);
        for (var ci = 1; ci < cVals.length; ci++) {
          if (toStr(cVals[ci][5]) === eventId) {
            calSheet.getRange(ci + 1, 2).setValue(newStart);
            break;
          }
        }
      }
      console.log('✅ Event date updated: ' + eventId + ' to ' + newDateStr);
      recordActivity_(ss, user, 'event_edit', 'Calendar', user + ' moved event "' + movedTitle + '" to ' + newDateStr);
      return { status: 'ok' };
    }

    // ── TODO: add ──
    if (noteLower === 'add_todo') {
      var task = toStr(data.todo_task);
      var assignee = toStr(data.todo_assignee) || 'Everyone';
      var due = toStr(data.todo_due);
      if (!task) return { status: 'error', message: 'Task cannot be empty' };
      if (!writeValidateString_(task, 200)) return { status: 'error', message: 'Task too long' };
      if (due && !writeValidateDate_(due)) return { status: 'error', message: 'Invalid due date' };

      if (FAMILY_MEMBERS.indexOf(assignee) === -1 || (!isAdultEmail_(verifiedEmail) && assignee !== user)) return { status: 'error', message: 'You can only create tasks for yourself.' };
      var tdSheet = ensureTodoIds_(ss);
      var parsedDue = due ? parseEventDate(due, '') : '';
      var existing = operationRecover_(ss,operation,tdSheet,7,13); if (existing) return existing;
      var taskId = operation ? operation.id : Utilities.getUuid();
      tdSheet.appendRow([new Date(), schoolCell_(task), assignee, parsedDue, user, 'Open', '', taskId, '', '', '', '', '', operation ? operation.fingerprint : '']);
      SpreadsheetApp.flush();
      if (isAdultEmail_(verifiedEmail) && data.todo_stars !== undefined) {
        var addStars = Number(data.todo_stars);
        if ([0, 1, 3, 5].indexOf(addStars) !== -1 && addStars > 0) {
          rewardHandleWrite_({ note: 'set_reward_rule', source_type: 'task', source_id: taskId, stars: addStars }, ss, verifiedEmail, user);
        }
      }
      var starsTxt = (isAdultEmail_(verifiedEmail) && Number(data.todo_stars) > 0) ? ' (★' + Number(data.todo_stars) + ')' : '';
      recordActivity_(ss, user, 'task_add', 'Tasks', user + ' added task: "' + task + '"' + (assignee ? ' for ' + assignee : '') + starsTxt, (due ? 'Due: ' + due : ''));
      return operationFinish_(ss,operation,{ status: 'ok', id: taskId });
    }

    if (['complete_todo', 'delete_todo', 'help_todo'].indexOf(noteLower) !== -1) {
      var tdSheet = ensureTodoIds_(ss);
      var taskId = toStr(data.todo_id);
      var rows = perfReadRows_(tdSheet);
      var rowIndex = rows.findIndex(function(r, i) { return i > 0 && r[7] === taskId; });
      if (rowIndex < 1) return { status: 'error', message: 'Task not found. Refresh the app before trying again.' };
      var taskRow = rows[rowIndex];
      var parent = isAdultEmail_(verifiedEmail);
      if (!parent && (taskRow[2] !== user && taskRow[2] !== 'Everyone' || ['consent', 'payment'].indexOf(taskRow[9]) !== -1 || noteLower === 'delete_todo')) return { status: 'error', message: 'Only a parent can change this task.' };
      if (taskRow[5] === 'Deleted') return { status: 'error', message: 'This task was deleted.' };
      // A late help request cannot reopen a task that another device completed.
      if (taskRow[5] === 'Done' && noteLower === 'help_todo') return { status: 'error', message: 'This task is already complete. Refresh your plan.' };
      var status = noteLower === 'delete_todo' ? 'Deleted' : noteLower === 'help_todo' ? 'Needs help' : 'Done';
      var recipient = toStr(taskRow[12]) || (taskRow[2] === 'Everyone' ? user : toStr(taskRow[2]));
      tdSheet.getRange(rowIndex + 1, 6, 1, 8).setValues([[status, status === 'Done' ? (taskRow[6] || new Date()) : '',
        taskRow[7], taskRow[8] || '', taskRow[9] || '', taskRow[10] || '', taskRow[11] || '',
        status === 'Done' ? recipient : (taskRow[12] || '')]]);
      SpreadsheetApp.flush();
      // Save completion first. A retry can finish a missing award on a Done task.
      var award = status === 'Done' ? rewardAward_(ss, 'task', taskId, recipient, 'once') : { stars: 0, member: recipient };
      if (status === 'Done') {
        var completer = (user === recipient ? user : user + ' for ' + recipient);
        var awardTxt = (award && award.stars > 0) ? ' (+' + award.stars + '★)' : '';
        recordActivity_(ss, user, 'task_done', 'Tasks', completer + ' completed task: "' + taskRow[1] + '"' + awardTxt, (recipient ? 'Assignee: ' + recipient : ''));
      } else if (status === 'Deleted') {
        recordActivity_(ss, user, 'task_delete', 'Tasks', user + ' deleted task: "' + taskRow[1] + '"');
      } else if (status === 'Needs help') {
        recordActivity_(ss, user, 'task_help', 'Tasks', user + ' requested help on task: "' + taskRow[1] + '"');
      }
      return { status: 'ok', award: award, rewards: getRewards_(ss) };
    }

    // ── TODO: edit ──
    if (noteLower === 'edit_todo') {
      var taskId = toStr(data.todo_id);
      var task = toStr(data.todo_task);
      var assignee = toStr(data.todo_assignee) || 'Everyone';
      var due = toStr(data.todo_due);
      if (!taskId) return { status: 'error', message: 'Task ID required' };
      if (!task) return { status: 'error', message: 'Task cannot be empty' };
      if (!writeValidateString_(task, 200)) return { status: 'error', message: 'Task too long' };
      if (due && !writeValidateDate_(due)) return { status: 'error', message: 'Invalid due date' };
      if (FAMILY_MEMBERS.indexOf(assignee) === -1) return { status: 'error', message: 'Invalid assignee' };

      var tdSheet = ensureTodoIds_(ss);
      var rows = perfReadRows_(tdSheet);
      var rowIndex = rows.findIndex(function(r, i) { return i > 0 && r[7] === taskId; });
      if (rowIndex < 1) return { status: 'error', message: 'Task not found. Refresh the app before trying again.' };
      var taskRow = rows[rowIndex];
      var parent = isAdultEmail_(verifiedEmail);
      if (!parent && (taskRow[2] !== user || assignee !== user)) {
        return { status: 'error', message: 'You can only edit tasks assigned to yourself.' };
      }
      if (taskRow[5] === 'Deleted') return { status: 'error', message: 'This task was deleted.' };

      var parsedDue = due ? parseEventDate(due, '') : '';
      tdSheet.getRange(rowIndex + 1, 2, 1, 3).setValues([[schoolCell_(task), assignee, parsedDue]]);
      SpreadsheetApp.flush();
      if (isAdultEmail_(verifiedEmail) && data.todo_stars !== undefined) {
        var editStars = Number(data.todo_stars);
        if ([0, 1, 3, 5].indexOf(editStars) !== -1) {
          rewardHandleWrite_({ note: 'set_reward_rule', source_type: 'task', source_id: taskId, stars: editStars }, ss, verifiedEmail, user);
        }
      }
      recordActivity_(ss, user, 'task_edit', 'Tasks', user + ' updated task: "' + task + '"', (assignee ? 'Assigned to ' + assignee : ''));
      return { status: 'ok' };
    }

    // ── CHAT: Firebase-owned — never write to Sheets ──
    if (noteLower === 'add_chat_message') {
      return {
        status: 'error',
        message: 'Chat has been removed from Wong’s Nest.'
      };
    }

    // ── BIRTHDAY: add ──
    if (noteLower === 'add_birthday') {
      var name = toStr(data.name);
      var type = toStr(data.type) || 'Birthday';
      var date = toStr(data.date); // MM-DD
      var year = toStr(data.year);
      var notes = toStr(data.notes);
      if (!birthdayDate_(date,year) || ['Birthday','Wedding Anniversary'].indexOf(type) < 0) return {status:'error',message:'Choose a valid celebration date and type.'};
      if (!name || !date) return { status: 'error', message: 'Name and date (MM-DD) required' };
      if (!writeValidateString_(name, 100)) return { status: 'error', message: 'Name too long' };
      if (!writeValidateString_(notes, 200)) return { status: 'error', message: 'Notes too long' };

      var bdSheet = ss.getSheetByName('Birthdays');
      if (!bdSheet) { bdSheet = ss.insertSheet('Birthdays'); bdSheet.appendRow(['Name', 'Type', 'Date (MM-DD)', 'Year (optional)', 'Notes', 'Added By']); }
      var existing = operationRecover_(ss,operation,bdSheet,6,7); if (existing) return existing;
      bdSheet.appendRow([schoolCell_(name), type, date, year, schoolCell_(notes), user, operation ? operation.id : '', operation ? operation.fingerprint : '']);
      console.log('✅ Birthday added');
      recordActivity_(ss, user, 'birthday_add', 'Celebrations', user + ' added celebration: ' + name, type + ' on ' + date);
      return operationFinish_(ss,operation,{ status:'ok',id:operation ? operation.id : '' });
    }

    // ── MEMORY: Firebase-owned — never write to Sheets ──
    if (noteLower === 'add_memory') {
      return {
        status: 'error',
        message: 'Memories use Firestore + Storage only. Save from the app Memories tab.'
      };
    }

    // ── Unknown note ──
    logSheet.appendRow([new Date(), user, 'General', schoolCell_(note)]);
    console.log('ℹ️ Unknown note type: ' + note);
    // Do NOT return ok for unknown notes — that made saves look successful without writing data
    return { status: 'error', message: 'Unknown action: ' + note + '. Redeploy the latest Code.js if this is a new feature.' };

  } catch (err) {
    console.log('❌ handleWrite error: ' + err.stack);
    return { status: 'error', message: 'An internal error occurred while processing your request.' };
  }
}

// ============================================================
// 6. ACTIVITY LOG & DATA FETCH FUNCTIONS
// ============================================================
