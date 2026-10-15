function getParentDashboardDataMeasured_(verifiedEmail) {
  if (!isAdultEmail_(verifiedEmail)) return {status:'error',message:'This app is available only to parents.'};
  var ss=appSpreadsheet_();
  return {status:'ok',isAdult:true,memberName:memberNameFromEmail_(verifiedEmail),
    expenses:getExpensesData(ss),budgets:getBudgets(ss),recurring:getRecurring(ss),
    fertility:getFertilityData(ss),appreciations:getAppreciationsData(ss),
    loveCheckins:getLoveCheckinsData(ss),intimacyLog:getIntimacyLogData(ss),
    bucketList:getBucketList(ss),expenseGroups:EXPENSE_GROUPS};
}

function getBucketListMeasured_(ss) {
  ss = ss || appSpreadsheet_();
  var sheet = ss.getSheetByName('BucketList');
  if (!sheet) {
    // Create the sheet if it doesn't exist
    sheet = ss.insertSheet('BucketList');
    sheet.appendRow(['ID', 'Item', 'AddedBy', 'Completed', 'CompletedAt']);
    return [];
  }
  var vals = perfReadRows_(sheet);
  var result = [];
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    if (!row[0]) continue;
    result.push({
      id: toStr(row[0]),
      item: toStr(row[1]),
      addedBy: toStr(row[2]),
      completed: toStr(row[3]).toLowerCase() === 'true',
      completedAt: row[4] ? Utilities.formatDate(new Date(row[4]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : ''
    });
  }
  return result;
}

function getMemoriesLegacySheet_(ss) {
  ss = ss || appSpreadsheet_();
  var memSheet = ss.getSheetByName('Memories');
  if (!memSheet) return [];
  var memVals = perfReadRows_(memSheet);
  var tz      = Session.getScriptTimeZone();
  var result  = [];
  for (var i = 1; i < memVals.length; i++) {
    var row = memVals[i];
    // Sheet columns: 0 LoggedBy, 1 Date, 2 Type, 3 Person, 4 Memory,
    // 5 LoggedAt, 6 ImageUrl, 7 ImageId.
    if (!row[4] && !row[6]) continue;
    result.push({
      rowNum: i + 1,
      loggedBy: toStr(row[0]),
      date: row[1] ? Utilities.formatDate(new Date(row[1]), tz, 'dd MMM yyyy') : '',
      type: toStr(row[2]) || 'Moment',
      person: toStr(row[3]) || 'Everyone',
      memory: toStr(row[4]),
      imageUrl: toStr(row[6]),
      imageId: toStr(row[7])
    });
  }
  result.reverse();
  return result.slice(0, 200);
}

function getFertilityDataMeasured_(ss) {
  ss = ss || appSpreadsheet_();
  var fertSheet = ss.getSheetByName('Fertility');
  if (!fertSheet) return {};
  var fertVals        = perfReadRows_(fertSheet);
  var lastPeriodStart = null;
  var lastOvulation = null;
  var symptoms = [];
  var tz = Session.getScriptTimeZone();
  var ALLOWED_FERT_TYPES = {
    'Period Start': true,
    'Period End': true,
    'Ovulation': true,
    'Symptom': true
  };

  for (var i = 1; i < fertVals.length; i++) {
    var row = fertVals[i];
    var fType = toStr(row[2]);
    var fDate = row[1] ? new Date(row[1]) : null;
    if (fDate && isNaN(fDate.getTime())) fDate = null;
    if (!ALLOWED_FERT_TYPES[fType]) continue;

    if (fType === 'Period Start' && fDate) {
      if (!lastPeriodStart || fDate > lastPeriodStart) lastPeriodStart = fDate;
    }
    if (fType === 'Ovulation' && fDate) {
      if (!lastOvulation || fDate > lastOvulation) lastOvulation = fDate;
    }
    // Log recent non-cycle notes for the timeline (symptoms + any type with notes)
    if (fType === 'Symptom' || (fType !== 'Period Start' && toStr(row[3]))) {
      symptoms.push({
        date: fDate ? Utilities.formatDate(fDate, tz, 'dd MMM yyyy') : '',
        type: fType,
        note: toStr(row[3]) || fType
      });
    }
  }

  var result = {};
  var starts = getPeriodStarts_(fertVals);
  if (lastPeriodStart) {
    var cycleLen = estimateCycleLengthDays_(starts);
    var ovulationOffset = cycleLen - 14;
    result.lastPeriodStart = Utilities.formatDate(lastPeriodStart, tz, 'dd MMM yyyy');
    result.lastPeriodStartRaw = Utilities.formatDate(lastPeriodStart, tz, 'yyyy-MM-dd');
    result.cycleLength = cycleLen;

    // Period duration: first Period End on/after the latest Period Start (same cycle)
    var matchingEnd = null;
    for (var j = 1; j < fertVals.length; j++) {
      var r2 = fertVals[j];
      if (toStr(r2[2]) !== 'Period End') continue;
      var d2 = r2[1] ? new Date(r2[1]) : null;
      if (!d2 || isNaN(d2.getTime())) continue;
      if (d2 < lastPeriodStart) continue;
      // Prefer the soonest end after start (typical menses length)
      if (!matchingEnd || d2 < matchingEnd) matchingEnd = d2;
    }
    if (matchingEnd) {
      var dur = Math.round((matchingEnd - lastPeriodStart) / (1000 * 60 * 60 * 24));
      // Guard against bad pairings (e.g. end from a later cycle mis-tagged)
      if (dur >= 0 && dur <= 14) result.duration = dur;
    }

    var nextPeriod = new Date(lastPeriodStart);
    nextPeriod.setDate(nextPeriod.getDate() + cycleLen);
    var fertileStart = new Date(lastPeriodStart);
    fertileStart.setDate(fertileStart.getDate() + ovulationOffset - 4);
    var fertileEnd = new Date(lastPeriodStart);
    fertileEnd.setDate(fertileEnd.getDate() + ovulationOffset + 2);
    result.nextPeriod = Utilities.formatDate(nextPeriod, tz, 'dd MMM yyyy');
    result.nextPeriodRaw = Utilities.formatDate(nextPeriod, tz, 'yyyy-MM-dd');
    result.fertileStart = Utilities.formatDate(fertileStart, tz, 'dd MMM yyyy');
    result.fertileEnd = Utilities.formatDate(fertileEnd, tz, 'dd MMM yyyy');
    result.fertileStartRaw = Utilities.formatDate(fertileStart, tz, 'yyyy-MM-dd');
    result.fertileEndRaw = Utilities.formatDate(fertileEnd, tz, 'yyyy-MM-dd');
  }
  if (lastOvulation) {
    result.lastOvulation = Utilities.formatDate(lastOvulation, tz, 'dd MMM yyyy');
    result.lastOvulationRaw = Utilities.formatDate(lastOvulation, tz, 'yyyy-MM-dd');
  }
  // Newest symptoms first for the UI timeline
  result.symptoms = symptoms.slice(-8).reverse();
  return result;
}

function getRecurringMeasured_(ss) {
  ss = ss || appSpreadsheet_();
  var recSheet = ss.getSheetByName('RecurringExpenses');
  if (!recSheet) return [];
  var recVals = perfReadRows_(recSheet);
  var now     = new Date(); var today = now.getDate();
  var result  = [];
  for (var i = 1; i < recVals.length; i++) {
    var row = recVals[i]; if (!row[0]) continue;
    if (toStr(row[6]).toLowerCase() === 'false') continue;
    var day      = parseInt(row[4]) || 1;
    var daysLeft = day >= today ? day - today : (daysInMonth(now) - today + day);
    result.push({ rowNum: i + 1, name: toStr(row[0]), amount: parseFloat(row[1]) || 0, account: toStr(row[2]) || 'Family', category: toStr(row[3]) || 'Other', day: day, daysLeft: daysLeft });
  }
  result.sort(function(a, b) { return a.daysLeft - b.daysLeft; });
  return result;
}

function getTravelData(ss) {
  ss = ss || appSpreadsheet_();
  var travelSheet = ss.getSheetByName('Travel');
  if (!travelSheet) {
    travelSheet = ss.insertSheet('Travel');
    travelSheet.appendRow(['ID', 'Date', 'City', 'Country', 'Lat', 'Lng', 'Members', 'Notes', 'Timestamp']);
  }
  var vals = perfReadRows_(travelSheet);
  var tz = Session.getScriptTimeZone();
  var result = [];
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    if (!row[0]) continue;
    var tripDate = new Date(row[1]);
    if (isNaN(tripDate.getTime())) tripDate = new Date();
    result.push({
      id: toStr(row[0]),
      date: Utilities.formatDate(tripDate, tz, 'dd MMM yyyy'),
      dateRaw: Utilities.formatDate(tripDate, tz, 'yyyy-MM-dd'),
      city: toStr(row[2]),
      country: toStr(row[3]),
      lat: parseFloat(row[4]) || 0,
      lng: parseFloat(row[5]) || 0,
      members: toStr(row[6]) ? toStr(row[6]).split(',').map(function(m) { return m.trim(); }) : [],
      notes: toStr(row[7])
    });
  }
  result.sort(function(a, b) { return b.dateRaw.localeCompare(a.dateRaw); });
  return result;
}

function getAppreciationsDataMeasured_(ss) {
  ss = ss || appSpreadsheet_();
  var sheet = ss.getSheetByName('Appreciations');
  if (!sheet) {
    sheet = ss.insertSheet('Appreciations');
    sheet.appendRow(['Timestamp', 'Sender', 'Recipient', 'Message', 'RevealDate']);
  }
  var vals = perfReadRows_(sheet);
  var tz = Session.getScriptTimeZone();
  var result = [];
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    if (!row[0]) continue;
    var tDate = new Date(row[0]);
    var revDate = new Date(row[4]);
    result.push({
      timestamp: isNaN(tDate.getTime()) ? '' : Utilities.formatDate(tDate, tz, 'yyyy-MM-dd HH:mm:ss'),
      sender: toStr(row[1]),
      recipient: toStr(row[2]),
      message: toStr(row[3]),
      revealDate: isNaN(revDate.getTime()) ? '' : Utilities.formatDate(revDate, tz, "yyyy-MM-dd'T'HH:mm:ss")
    });
  }
  return result;
}

function getLoveCheckinsDataMeasured_(ss) {
  ss = ss || appSpreadsheet_();
  var sheet = ss.getSheetByName('LoveCheckins');
  if (!sheet) {
    sheet = ss.insertSheet('LoveCheckins');
    sheet.appendRow(['Timestamp', 'User', 'Battery', 'Moods', 'Notes', 'Focus']);
  }
  var vals = perfReadRows_(sheet);
  var tz = Session.getScriptTimeZone();
  var result = [];
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    if (!row[0]) continue;
    var tDate = new Date(row[0]);
    result.push({
      timestamp: isNaN(tDate.getTime()) ? '' : Utilities.formatDate(tDate, tz, 'yyyy-MM-dd HH:mm:ss'),
      user: toStr(row[1]),
      battery: parseInt(row[2]) || 5,
      moods: toStr(row[3]) ? toStr(row[3]).split(',').map(function(m) { return m.trim(); }) : [],
      notes: toStr(row[4]),
      focus: toStr(row[5])
    });
  }
  // The missing return here was why the check-in history never displayed.
  return result;
}

/** Private couple intimacy log (adults only). */
function getIntimacyLogDataMeasured_(ss) {
  ss = ss || appSpreadsheet_();
  var sheet = ss.getSheetByName('IntimacyLog');
  if (!sheet) {
    sheet = ss.insertSheet('IntimacyLog');
    sheet.appendRow(['ID', 'Timestamp', 'LoggedBy', 'Date', 'Notes', 'Rating']);
    return [];
  }
  var vals = perfReadRows_(sheet);
  var tz = Session.getScriptTimeZone();
  var result = [];
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    var id = toStr(row[0]);
    if (!id && (row[3] === '' || row[3] === null || row[3] === undefined)) continue;

    // Date column may be: Date object, yyyy-MM-dd string, or locale string
    var dateRaw = '';
    var d = null;
    var rawDate = row[3];
    if (Object.prototype.toString.call(rawDate) === '[object Date]' && !isNaN(rawDate.getTime())) {
      d = rawDate;
      dateRaw = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    } else {
      var dateStr = toStr(rawDate).trim();
      // Prefer leading ISO if present (handles "2026-07-11" and datetime strings)
      var isoLead = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
      if (isoLead) {
        dateRaw = isoLead[1];
        d = parseEventDateStrict(dateRaw, '');
      } else if (dateStr) {
        d = parseEventDateStrict(dateStr, '');
        if (d) dateRaw = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      }
    }

    var ts = null;
    if (Object.prototype.toString.call(row[1]) === '[object Date]' && !isNaN(row[1].getTime())) {
      ts = row[1];
    } else if (row[1]) {
      ts = new Date(row[1]);
      if (isNaN(ts.getTime())) ts = null;
    }

    result.push({
      id: id || ('int_row_' + i),
      timestamp: ts ? Utilities.formatDate(ts, tz, 'yyyy-MM-dd HH:mm:ss') : '',
      loggedBy: toStr(row[2]),
      date: d ? Utilities.formatDate(d, tz, 'dd MMM yyyy') : (dateRaw || ''),
      dateRaw: dateRaw,
      notes: toStr(row[4]),
      rating: parseInt(row[5], 10) || 0
    });
  }
  // Newest first
  result.sort(function(a, b) {
    return toStr(b.dateRaw).localeCompare(toStr(a.dateRaw)) || toStr(b.timestamp).localeCompare(toStr(a.timestamp));
  });
  return result.slice(0, 40);
}

// getChatMessages removed — chat is Firestore-only (see index.html startChatListener).

// ============================================================
// 7. HELPERS
// ============================================================
// Strict parser: returns null when the date string can't be understood,
// so validation can actually reject bad input.

// Runs inside the shared write lock, after verified identity and operation checks.
function parentHandleWrite_(data,ss,verifiedEmail,user,operation) {
  var noteLower=toStr(data.note).toLowerCase().trim();
    if (noteLower === 'configure_reminder_bridge') {
      if (!/^[a-f0-9]{64}$/.test(toStr(data.bridge_secret))) return {status:'error',message:'Invalid bridge configuration.'};
      PropertiesService.getScriptProperties().setProperty('REMINDER_BRIDGE_SECRET',data.bridge_secret);
      return {status:'ok'};
    }
    // ── EXPENSE: add ──
    if (noteLower === 'add_expense') {
      var desc = toStr(data.ex_desc);
      var amount = fullNumber_(data.ex_amount);
      var date = toStr(data.ex_date);
      var category = toStr(data.ex_category) || 'Other';
      var account = toStr(data.ex_account) || 'Family';

      if (!financeAccount_(account) || !financeCategory_(category)) return {status:'error',message:'Choose a valid account and category.'};
      if (!desc) return { status: 'error', message: 'Description required' };
      if (!Number.isFinite(amount) || amount < 0) return { status: 'error', message: 'Invalid amount' };
      if (!date || !writeValidateDate_(date)) return { status: 'error', message: 'Invalid date' };
      if (!writeValidateString_(desc, 200)) return { status: 'error', message: 'Description too long' };

      var expSheet = ss.getSheetByName('Expenses');
      if (!expSheet) { expSheet = ss.insertSheet('Expenses'); expSheet.appendRow(['Timestamp', 'Date', 'Account', 'Category', 'Amount', 'Note','ID','Operation Fingerprint','Status']); }
      var parsedDate = parseEventDate(date, '');
      var existing = operationRecover_(ss,operation,expSheet,6,7); if (existing) return existing;
      var expenseId = operation ? operation.id : 'exp_'+Utilities.getUuid();
      expSheet.appendRow([new Date(), parsedDate, account, schoolCell_(category), amount, schoolCell_(desc), expenseId, operation ? operation.fingerprint : '','']);
      // NOTE: the sheet is intentionally NOT re-sorted here. Sorting on
      // every insert shuffled every row number, so a delete sent from a
      // client that loaded before someone else's add could remove the
      // wrong expense. Date ordering is applied in getExpensesData()
      // instead, so the app still shows newest-first.
      console.log('✅ Expense added');
      recordActivity_(ss, user, 'expense_add', 'Expenses', user + ' added expense: $' + amount.toFixed(2) + ' for ' + desc, category + ' (' + account + ')');
      return operationFinish_(ss,operation,{ status: 'ok', id: expenseId });
    }

    // ── EXPENSE: delete ──
    if (noteLower === 'delete_expense') {
      var expenseId = toStr(data.expense_id);
      if (!expenseId) return {status:'error',message:'Refresh Expenses before deleting. A stable expense ID is required.'};
      var expSheet = ss.getSheetByName('Expenses');
      var expenseRows = expSheet ? perfReadRows_(expSheet) : [];
      var expenseIndex = expenseRows.findIndex(function(r,i){return i > 0 && toStr(r[6]) === expenseId;});
      if (expenseIndex < 1) return {status:'error',message:'Expense not found. Refresh before deleting.'};
      expSheet.getRange(expenseIndex+1,9).setValue('Deleted');
      recordActivity_(ss, user, 'expense_delete', 'Expenses', user + ' deleted an expense');
      return { status: 'ok' };
    }

    // ── FERTILITY: add ──
    if (noteLower === 'add_fertility') {
      var fertDate = toStr(data.fertility_date);
      var fertType = toStr(data.fertility_type);
      var fertNotes = toStr(data.fertility_notes);
      var allowedFert = {
        'Period Start': true,
        'Period End': true,
        'Ovulation': true,
        'Symptom': true
      };
      if (!fertDate || !fertType) return { status: 'error', message: 'Date and type required' };
      if (!allowedFert[fertType]) return { status: 'error', message: 'Invalid fertility entry type' };
      if (!writeValidateDate_(fertDate)) return { status: 'error', message: 'Invalid date' };
      if (!writeValidateString_(fertNotes, 500)) return { status: 'error', message: 'Notes too long' };

      var fertSheet = ss.getSheetByName('Fertility');
      if (!fertSheet) {
        fertSheet = ss.insertSheet('Fertility');
        fertSheet.appendRow(['Logged By', 'Date', 'Type', 'Notes', 'Logged At']);
      }
      var parsed = parseEventDate(fertDate, '');
      if (!parsed) return { status: 'error', message: 'Invalid date' };
      fertSheet.appendRow([user, parsed, fertType, schoolCell_(fertNotes), new Date()]);
      console.log('✅ Fertility entry added: ' + fertType);
      return { status: 'ok' };
    }

    // ── BUDGET: set ──
    if (noteLower === 'set_budget') {
      var group = toStr(data.group);
      var budget = fullNumber_(data.budget);
      var budgetAcc = toStr(data.account) || 'Family';
      if (!group) return { status: 'error', message: 'Group name required' };
      if (!financeAccount_(budgetAcc) || !Object.prototype.hasOwnProperty.call(EXPENSE_GROUPS,group)) return {status:'error',message:'Choose a valid budget group and account.'};
      if (!Number.isFinite(budget) || budget < 0) return { status: 'error', message: 'Invalid budget amount' };
      if (!writeValidateString_(group, 100)) return { status: 'error', message: 'Group name too long' };

      var bdgSheet = ss.getSheetByName('Budgets');
      if (!bdgSheet) { bdgSheet = ss.insertSheet('Budgets'); bdgSheet.appendRow(['Group', 'Monthly Budget', 'Account', 'Set By', 'Updated At']); }
      var bdgVals = perfReadRows_(bdgSheet);
      var found = false;
      for (var i = 1; i < bdgVals.length; i++) {
        if (toStr(bdgVals[i][0]).toLowerCase() === group.toLowerCase() &&
            toStr(bdgVals[i][2] || 'Family').toLowerCase() === budgetAcc.toLowerCase()) {
          bdgSheet.getRange(i + 1, 2).setValue(budget);
          bdgSheet.getRange(i + 1, 4).setValue(user);
          bdgSheet.getRange(i + 1, 5).setValue(new Date());
          found = true;
          break;
        }
      }
      if (!found) bdgSheet.appendRow([group, budget, budgetAcc, user, new Date()]);
      console.log('✅ Budget set: ' + group + ' $' + budget);
      return { status: 'ok' };
    }

    // ── BUDGET: delete ──
    if (noteLower === 'delete_budget') {
      var group = toStr(data.group);
      var budgetAcc = toStr(data.account) || 'Family';
      if (!group) return { status: 'error', message: 'Group name required' };
      var bdgSheet = ss.getSheetByName('Budgets');
      if (bdgSheet) {
        var bdgVals = perfReadRows_(bdgSheet);
        for (var i = 1; i < bdgVals.length; i++) {
          if (toStr(bdgVals[i][0]).toLowerCase() === group.toLowerCase() &&
              toStr(bdgVals[i][2] || 'Family').toLowerCase() === budgetAcc.toLowerCase()) {
            bdgSheet.deleteRow(i + 1);
            break;
          }
        }
      }
      console.log('✅ Budget deleted: ' + group);
      return { status: 'ok' };
    }

    // ── RECURRING: add ──
    if (noteLower === 'add_recurring') {
      var recName = toStr(data.rec_name);
      var recAmount = fullNumber_(data.rec_amount);
      var recDay = fullNumber_(data.rec_day);
      var recCategory = toStr(data.rec_category) || 'Other';
      var recAccount = toStr(data.rec_account) || 'Family';
      if (!financeAccount_(recAccount) || !financeCategory_(recCategory)) return {status:'error',message:'Choose a valid account and category.'};
      if (!recName) return { status: 'error', message: 'Name required' };
      if (!Number.isFinite(recAmount) || recAmount < 0) return { status: 'error', message: 'Invalid amount' };
      if (!Number.isInteger(recDay) || recDay < 1 || recDay > 28) return { status: 'error', message: 'Day must be 1-28' };
      if (!writeValidateString_(recName, 100)) return { status: 'error', message: 'Name too long' };

      var recSheet = ss.getSheetByName('RecurringExpenses');
      if (!recSheet) { recSheet = ss.insertSheet('RecurringExpenses'); recSheet.appendRow(['Name', 'Amount', 'Account', 'Category', 'Day of Month', 'Added By', 'Active']); }
      recSheet.appendRow([schoolCell_(recName), recAmount, recAccount, recCategory, recDay, user, 'true']);
      console.log('✅ Recurring added: ' + recName);
      return { status: 'ok' };
    }

    // ── RECURRING: delete ──
    if (noteLower === 'delete_recurring') {
      var rowNum = fullNumber_(data.row_num);
      if (!Number.isInteger(rowNum) || rowNum < 2) return { status: 'error', message: 'Invalid row number' };
      var recSheet = ss.getSheetByName('RecurringExpenses');
      if (!recSheet || rowNum > recSheet.getLastRow()) return {status:'error',message:'Recurring expense not found. Refresh before deleting.'};
      recSheet.getRange(rowNum, 7).setValue('false');
      console.log('✅ Recurring disabled: ' + rowNum);
      return { status: 'ok' };
    }

    // ── TRAVEL: retired ──
    if (noteLower === 'add_trip' || noteLower === 'delete_trip') {
      return { status: 'error', message: 'The travel feature has been removed.' };
    }

    // ── APPRECIATION: add ──
    if (noteLower === 'add_appreciation') {
      var message = toStr(data.message);
      if (!message) return { status: 'error', message: 'Message required' };
      if (!writeValidateString_(message, 1000)) return { status: 'error', message: 'Message too long' };

      var appSheet = ss.getSheetByName('Appreciations');
      if (!appSheet) {
        appSheet = ss.insertSheet('Appreciations');
        appSheet.appendRow(['Timestamp', 'Sender', 'Recipient', 'Message', 'RevealDate']);
      }
      var sender = user;
      var recipient = sender === 'Marcus' ? 'Eleanor' : 'Marcus';
      var now = new Date();
      var revealDate = new Date();
      var currentDay = now.getDay();
      var daysToFriday = (5 - currentDay + 7) % 7;
      if (daysToFriday === 0 && now.getHours() >= 18) daysToFriday = 7;
      revealDate.setDate(now.getDate() + daysToFriday);
      revealDate.setHours(18, 0, 0, 0);
      appSheet.appendRow([now, sender, recipient, schoolCell_(message), revealDate]);
      console.log('✅ Appreciation added from ' + sender);
      return { status: 'ok' };
    }

    // ── LOVE CHECKIN: add ──
    if (noteLower === 'add_love_checkin') {
      var battery = fullNumber_(data.battery);
      var moods = toStr(data.moods);
      var notes = toStr(data.notes);
      var focus = toStr(data.focus);
      if (!Number.isInteger(battery) || battery < 1 || battery > 5) return { status: 'error', message: 'Battery must be 1-5' };
      if (!writeValidateString_(moods, 200)) return {status:'error',message:'Moods too long'};
      if (!writeValidateString_(notes, 500)) return { status: 'error', message: 'Notes too long' };
      if (!writeValidateString_(focus, 200)) return { status: 'error', message: 'Focus too long' };

      var checkinSheet = ss.getSheetByName('LoveCheckins');
      if (!checkinSheet) {
        checkinSheet = ss.insertSheet('LoveCheckins');
        checkinSheet.appendRow(['Timestamp', 'User', 'Battery', 'Moods', 'Notes', 'Focus']);
      }
      checkinSheet.appendRow([new Date(), user, battery, schoolCell_(moods), schoolCell_(notes), schoolCell_(focus)]);
      console.log('✅ Love check-in added for ' + user);
      return { status: 'ok' };
    }

    // ── INTIMACY: log (couple only) ──
    if (noteLower === 'add_intimacy') {
      var intimacyDate = toStr(data.intimacy_date).trim();
      var intimacyNotes = toStr(data.intimacy_notes);
      var intimacyRating = data.intimacy_rating == null || data.intimacy_rating === '' ? 0 : fullNumber_(data.intimacy_rating);
      if (!intimacyDate) return { status: 'error', message: 'Date required' };
      if (!writeValidateDate_(intimacyDate)) return { status: 'error', message: 'Invalid date' };
      if (!writeValidateString_(intimacyNotes, 500)) return { status: 'error', message: 'Notes too long' };
      if (!Number.isInteger(intimacyRating) || intimacyRating < 0 || intimacyRating > 5) return {status:'error',message:'Choose a rating from 1 to 5, or leave it blank.'};

      // Normalize to yyyy-MM-dd so the sheet round-trips without timezone shifts
      var intParsed = parseEventDateStrict(intimacyDate, '');
      if (!intParsed) return { status: 'error', message: 'Invalid date' };
      var intTz = Session.getScriptTimeZone();
      var intimacyDateIso = Utilities.formatDate(intParsed, intTz, 'yyyy-MM-dd');

      var intSheet = ss.getSheetByName('IntimacyLog');
      if (!intSheet) {
        intSheet = ss.insertSheet('IntimacyLog');
        intSheet.appendRow(['ID', 'Timestamp', 'LoggedBy', 'Date', 'Notes', 'Rating']);
      }
      var intId = 'int_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      var intNow = new Date();
      // Store Date column as ISO string (not Date object) — Sheets Date cells can
      // shift a day under UTC vs script timezone and disappear from the UI.
      intSheet.appendRow([intId, intNow, user, intimacyDateIso, schoolCell_(intimacyNotes), intimacyRating || '']);
      SpreadsheetApp.flush();
      console.log('✅ Intimacy logged by ' + user + ' date=' + intimacyDateIso);
      var intEntry = {
        id: intId,
        timestamp: Utilities.formatDate(intNow, intTz, 'yyyy-MM-dd HH:mm:ss'),
        loggedBy: user,
        date: Utilities.formatDate(intParsed, intTz, 'dd MMM yyyy'),
        dateRaw: intimacyDateIso,
        notes: intimacyNotes,
        rating: intimacyRating || 0
      };
      return {
        status: 'ok',
        id: intId,
        entry: intEntry,
        intimacyLog: getIntimacyLogData(ss)
      };
    }

    if (noteLower === 'delete_intimacy') {
      var delId = toStr(data.id);
      if (!delId) return { status: 'error', message: 'Missing id' };
      var delSheet = ss.getSheetByName('IntimacyLog');
      if (!delSheet) return { status: 'error', message: 'Not found' };
      var delVals = perfReadRows_(delSheet);
      for (var di = 1; di < delVals.length; di++) {
        if (toStr(delVals[di][0]) === delId) {
          delSheet.deleteRow(di + 1);
          console.log('✅ Intimacy entry deleted: ' + delId);
          return { status: 'ok' };
        }
      }
      return { status: 'error', message: 'Entry not found' };
    }

    // ── BUCKET LIST: add item ──
    if (noteLower === 'add_bucket_item') {
      var item = toStr(data.item);
      if (!item) return { status: 'error', message: 'Item text required' };
      if (!writeValidateString_(item, 200)) return { status: 'error', message: 'Item too long' };

      var bucketSheet = ss.getSheetByName('BucketList');
      if (!bucketSheet) {
        bucketSheet = ss.insertSheet('BucketList');
        bucketSheet.appendRow(['ID', 'Item', 'AddedBy', 'Completed', 'CompletedAt']);
      }
      var id = 'bkt_' + Date.now() + '_' + Math.floor(Math.random()*1000);
      bucketSheet.appendRow([id, schoolCell_(item), user, 'false', '']);
      console.log('✅ Bucket item added: ' + item);
      return { status: 'ok' };
    }

    // ── BUCKET LIST: toggle completed ──
    if (noteLower === 'toggle_bucket_item') {
      var id = toStr(data.id);
      if (!id) return { status: 'error', message: 'Item ID required' };
      var bucketSheet = ss.getSheetByName('BucketList');
      if (!bucketSheet) return { status: 'error', message: 'BucketList sheet not found' };
      var vals = perfReadRows_(bucketSheet);
      var foundRow = -1;
      for (var bi = 1; bi < vals.length; bi++) {
        if (toStr(vals[bi][0]) === id) { foundRow = bi + 1; break; }
      }
      if (foundRow === -1) return { status: 'error', message: 'Item not found' };
      var current = toStr(vals[foundRow-1][3]).toLowerCase() === 'true';
      var newVal = current ? 'false' : 'true';
      bucketSheet.getRange(foundRow, 4).setValue(newVal);
      if (newVal === 'true') {
        bucketSheet.getRange(foundRow, 5).setValue(new Date());
      } else {
        bucketSheet.getRange(foundRow, 5).setValue('');
      }
      console.log('✅ Bucket item toggled: ' + id);
      return { status: 'ok' };
    }

    // ── BUCKET LIST: delete item ──
    if (noteLower === 'delete_bucket_item') {
      var id = toStr(data.id);
      if (!id) return { status: 'error', message: 'Item ID required' };
      var bucketSheet = ss.getSheetByName('BucketList');
      if (!bucketSheet) return { status: 'error', message: 'BucketList sheet not found' };
      var vals = perfReadRows_(bucketSheet);
      for (var bi = 1; bi < vals.length; bi++) {
        if (toStr(vals[bi][0]) === id) { bucketSheet.deleteRow(bi + 1); break; }
      }
      console.log('✅ Bucket item deleted: ' + id);
      return { status: 'ok' };
    }


  return null;
}
function getExpensesData() { var args=arguments; return perfStage_('expenses',function(){return getExpensesDataMeasured_.apply(null,args);}); }
function getBudgets() { var args=arguments; return perfStage_('budgets',function(){return getBudgetsMeasured_.apply(null,args);}); }
function getParentDashboardData() { var args=arguments; return perfStage_('parent_dashboard',function(){return getParentDashboardDataMeasured_.apply(null,args);}); }
function getRecurring() { var args=arguments; return perfStage_('recurring',function(){return getRecurringMeasured_.apply(null,args);}); }
function getFertilityData() { var args=arguments; return perfStage_('private_records',function(){return getFertilityDataMeasured_.apply(null,args);}); }
function getAppreciationsData() { var args=arguments; return perfStage_('private_records',function(){return getAppreciationsDataMeasured_.apply(null,args);}); }
function getLoveCheckinsData() { var args=arguments; return perfStage_('private_records',function(){return getLoveCheckinsDataMeasured_.apply(null,args);}); }
function getIntimacyLogData() { var args=arguments; return perfStage_('private_records',function(){return getIntimacyLogDataMeasured_.apply(null,args);}); }
function getBucketList() { var args=arguments; return perfStage_('private_records',function(){return getBucketListMeasured_.apply(null,args);}); }
