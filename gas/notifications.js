function sendFamilyEmail(subject, htmlBody) {
  var plainBody = htmlBody.replace(/<[^>]+>/g, '').replace(/\n\n+/g, '\n').trim();
  NOTIFY_EMAILS.forEach(function(email) {
    try {
      MailApp.sendEmail({ to: email, subject: subject, body: plainBody, htmlBody: htmlBody });
      console.log('✅ email sent to: ' + email);
    } catch (err) {
      console.log('❌ email failed (' + email + '): ' + err);
    }
  });
}

function _h(tag, content, style) {
  style = style || '';
  return '<' + tag + (style ? ' style="' + style + '"' : '') + '>' + content + '</' + tag + '>';
}

function _li(content) { return '<li style="margin:4px 0;">' + content + '</li>'; }

// ============================================================
// DAILY NOTIFICATIONS
// ============================================================
function dailyNotifications() {
  var now     = new Date();
  var day     = now.getDate();
  var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (day === lastDay) sendExpenseSummary(now);
  if (day === 1)       sendExpenseReport(now);
  checkFertilityNotifications(now);
  checkUpcomingBirthdays();
  sendBudgetAlerts(checkBudgetAlerts());
  processRecurringExpenses();
  sendMorningDigest(now);
}

function sendMorningDigest(now) {
  now = (now instanceof Date && !isNaN(now.getTime())) ? now : new Date();
  var tz      = Session.getScriptTimeZone();
  var ss      = appSpreadsheet_();
  var today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dateStr = Utilities.formatDate(now, tz, 'EEEE, d MMMM yyyy');
  var body    = '';

  body += _h('h2', 'Wong’s Nest — Morning Digest', 'color:#1E3F30;font-family:sans-serif;');
  body += _h('p', dateStr, 'color:#666;font-family:sans-serif;font-size:14px;');

  var verse = getDailyVerse();
  body += _h('div',
    _h('p', '"' + verse.text + '"', 'margin:0;font-style:italic;color:#333;') +
    _h('p', '— ' + verse.ref, 'margin:4px 0 0;color:#888;font-size:13px;'),
    'background:#FDF4E1;border-left:4px solid #1E3F30;padding:12px 16px;border-radius:4px;font-family:sans-serif;margin:16px 0;'
  );

  try {
    var calendar   = CalendarApp.getCalendarById(CALENDAR_ID);
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var events     = calendar.getEvents(todayStart, todayEnd);
    if (events.length > 0) {
      var eventItems = '';
      events.forEach(function(ev) {
        var timeStr = ev.isAllDayEvent() ? 'All day' : Utilities.formatDate(ev.getStartTime(), tz, 'h:mm a');
        eventItems += _li('<strong>' + ev.getTitle() + '</strong> · ' + timeStr);
      });
      body += _h('h3', '📅 Today\'s Events', 'font-family:sans-serif;color:#333;margin-bottom:4px;');
      body += '<ul style="margin:0;padding-left:20px;font-family:sans-serif;color:#333;">' + eventItems + '</ul>';
    }
  } catch (e) { console.log('Calendar error: ' + e); }

  var tdSheet = ss.getSheetByName('ToDo');
  if (tdSheet) {
    var tdVals = perfReadRows_(tdSheet); var taskItems = '';
    for (var i = 1; i < tdVals.length; i++) {
      var row = tdVals[i];
      if (!row || ['done', 'deleted'].indexOf(toStr(row[5]).toLowerCase()) !== -1) continue;
      if (!row[3] || row[3] === '') continue;
      var dueDate = new Date(row[3]); if (isNaN(dueDate.getTime())) continue;
      var dueDateDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (dueDateDay <= today) taskItems += _li(toStr(row[1]) + ' <span style="color:#888;">→ ' + toStr(row[2]) + '</span>');
    }
    if (taskItems) {
      body += _h('h3', '✅ Tasks Due Today', 'font-family:sans-serif;color:#333;margin-bottom:4px;margin-top:20px;');
      body += '<ul style="margin:0;padding-left:20px;font-family:sans-serif;color:#333;">' + taskItems + '</ul>';
    }
  }
  body += _h('p', 'Have a blessed day! 🙏', 'font-family:sans-serif;color:#666;margin-top:24px;');
  sendFamilyEmail('Wong’s Nest — Morning Digest — ' + dateStr, body);
}

function nightlyNotifications() {
  var now = new Date();
  sendNightBeforeDigest(now);
}

function sendNightBeforeDigest(now) {
  now = (now instanceof Date && !isNaN(now.getTime())) ? now : new Date();
  var tz = Session.getScriptTimeZone();
  var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  var tomorrowStr = Utilities.formatDate(tomorrow, tz, 'yyyy-MM-dd');
  var tomorrowDisplay = Utilities.formatDate(tomorrow, tz, 'EEEE, d MMMM yyyy');

  var body = '';
  body += _h('h2', 'Wong’s Nest — Night-Before Prep', 'color:#1E3F30;font-family:sans-serif;');
  body += _h('p', 'Tomorrow: ' + tomorrowDisplay, 'color:#666;font-family:sans-serif;font-size:14px;');

  var tomorrowEvents = [];
  try {
    var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    var tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    var tomorrowEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1);
    var events = calendar.getEvents(tomorrowStart, tomorrowEnd);
    var schoolLinks = schoolEventLinks_();
    var manualMembers = manualEventMembers_();
    events.forEach(function(ev) {
      var timeStr = ev.isAllDayEvent() ? 'All day' : Utilities.formatDate(ev.getStartTime(), tz, 'h:mm a');
      var explicitTag = '';
      try { if (typeof ev.getTag === 'function') explicitTag = ev.getTag('familylogMember'); } catch (te) {}
      if (!explicitTag && schoolLinks[ev.getId()]) explicitTag = schoolLinks[ev.getId()].child;
      if (!explicitTag) explicitTag = manualMembers[ev.getId()] || '';
      var title = ev.getTitle();
      if (title.indexOf('EYE') !== -1) title += ' (End Year Exams)';
      tomorrowEvents.push({
        id: ev.getId(),
        title: title,
        time: timeStr,
        location: ev.getLocation() || '',
        member: explicitTag,
        dateRaw: tomorrowStr
      });
    });
  } catch (e) { console.log('Night digest calendar error: ' + e); }

  if (tomorrowEvents.length > 0) {
    var evHtml = '';
    tomorrowEvents.forEach(function(ev) {
      evHtml += _li('<strong>' + ev.title + '</strong> · ' + ev.time + (ev.member ? ' (' + ev.member + ')' : '') + (ev.location ? ' · ' + ev.location : ''));
    });
    body += _h('h3', '📅 Tomorrow’s Schedule', 'font-family:sans-serif;color:#333;margin-bottom:4px;');
    body += '<ul style="margin:0;padding-left:20px;font-family:sans-serif;color:#333;">' + evHtml + '</ul>';
  }

  var ss = appSpreadsheet_();
  // Generate the full preparation window before reading digest tasks, without a browser.
  if (FAMILY_SERVICE_FORWARDING_ && !FAMILY_BACKEND_MODE_) { var preparationRequest = signedReminderRequest_(); preparationRequest.action = 'prepare_family_tasks'; reminderSnapshot_(preparationRequest); }
  else calendarPreparation_(ss, true);
  var tdSheet = ss.getSheetByName('ToDo');
  var openTasks = [];
  if (tdSheet) {
    var tdVals = perfReadRows_(tdSheet);
    for (var i = 1; i < tdVals.length; i++) {
      var row = tdVals[i];
      if (!row || ['done', 'deleted'].indexOf(toStr(row[5]).toLowerCase()) !== -1) continue;
      var due = row[3] ? Utilities.formatDate(new Date(row[3]), tz, 'yyyy-MM-dd') : '';
      if (!due || due <= tomorrowStr) {
        openTasks.push({
          task: toStr(row[1]),
          assignee: toStr(row[2]) || 'Everyone',
          kind: toStr(row[9]),
          due: due
        });
      }
    }
  }

  if (openTasks.length > 0) {
    var taskHtml = '';
    openTasks.forEach(function(t) {
      var icon = t.kind === 'packing' ? '🎒 ' : '✅ ';
      taskHtml += _li(icon + '<strong>' + t.task + '</strong> <span style="color:#888;">→ ' + t.assignee + (t.due ? ' (Due ' + t.due + ')' : '') + '</span>');
    });
    body += _h('h3', '🎒 Open Prep & Packing Items', 'font-family:sans-serif;color:#333;margin-bottom:4px;margin-top:20px;');
    body += '<ul style="margin:0;padding-left:20px;font-family:sans-serif;color:#333;">' + taskHtml + '</ul>';
  } else {
    body += _h('p', '🌟 Everything is all packed and ready for tomorrow!', 'background:#f0fdf4;border-left:4px solid #22c55e;padding:12px;border-radius:4px;font-family:sans-serif;color:#15803d;margin-top:20px;');
  }

  body += _h('p', 'Rest well! 🌙', 'font-family:sans-serif;color:#888;margin-top:24px;font-size:13px;');
  sendFamilyEmail('Wong’s Nest — Night-Before Prep — ' + tomorrowDisplay, body);
}

function getDailyVerse() {
  try {
    var url      = 'https://beta.ourmanna.com/api/v1/get/?format=json&order=daily';
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json     = JSON.parse(response.getContentText());
    if (json && json.verse && json.verse.details) {
      return { text: json.verse.details.text.trim(), ref: json.verse.details.reference.trim() };
    }
  } catch (e) { console.log('Ourmanna error: ' + e); }
  return { text: "I can do all things through Christ who strengthens me.", ref: "Philippians 4:13" };
}

function sendExpenseSummary(now) {
  var ss       = appSpreadsheet_();
  var expSheet = ss.getSheetByName('Expenses'); if (!expSheet) return;
  var eVals    = perfReadRows_(expSheet);
  var thisMonth = now.getMonth(); var thisYear = now.getFullYear();
  var totals = {}; var byAccount = {}; var monthTotal = 0;
  for (var i = 1; i < eVals.length; i++) {
    var row = eVals[i]; if (toStr(row[8]) === 'Deleted') continue; var rowDate = new Date(row[1]); if (isNaN(rowDate.getTime())) rowDate = new Date(row[0]);
    if (rowDate.getMonth() === thisMonth && rowDate.getFullYear() === thisYear) {
      var amount = parseFloat(row[4]) || 0; var category = toStr(row[3]) || 'Other'; var account = toStr(row[2]) || 'Family';
      monthTotal += amount; totals[category] = (totals[category] || 0) + amount; byAccount[account] = (byAccount[account] || 0) + amount;
    }
  }
  var monthName = Utilities.formatDate(now, Session.getScriptTimeZone(), 'MMMM yyyy');
  var body = _h('h2', '💰 ' + monthName + ' — Expense Summary', 'font-family:sans-serif;color:#333;');
  body += _h('p', 'Total spent: <strong>$' + monthTotal.toFixed(2) + '</strong>', 'font-family:sans-serif;font-size:16px;');
  body += _h('h3', 'By Category', 'font-family:sans-serif;color:#555;');
  var catItems = '';
  for (var cat in totals) catItems += _li(cat + ' — <strong>$' + totals[cat].toFixed(2) + '</strong>');
  body += '<ul style="font-family:sans-serif;color:#333;padding-left:20px;">' + catItems + '</ul>';
  body += _h('h3', 'By Account', 'font-family:sans-serif;color:#555;');
  var accItems = '';
  for (var acc in byAccount) accItems += _li(acc + ': <strong>$' + byAccount[acc].toFixed(2) + '</strong>');
  body += '<ul style="font-family:sans-serif;color:#333;padding-left:20px;">' + accItems + '</ul>';
  sendFamilyEmail('Wong’s Nest — ' + monthName + ' Expense Summary', body);
}

function sendExpenseReport(now) {
  var ss          = appSpreadsheet_();
  var expSheet    = ss.getSheetByName('Expenses'); if (!expSheet) return;
  var lastMonth   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var targetMonth = lastMonth.getMonth(); var targetYear = lastMonth.getFullYear();
  var eVals = perfReadRows_(expSheet);
  var totals = {}; var byAccount = {}; var monthTotal = 0; var allRows = [];
  for (var i = 1; i < eVals.length; i++) {
    var row = eVals[i]; if (toStr(row[8]) === 'Deleted') continue; var rowDate = new Date(row[1]); if (isNaN(rowDate.getTime())) rowDate = new Date(row[0]);
    if (rowDate.getMonth() === targetMonth && rowDate.getFullYear() === targetYear) {
      var amount = parseFloat(row[4]) || 0; var category = toStr(row[3]) || 'Other';
      var desc = toStr(row[5]) || ''; var account = toStr(row[2]) || 'Family';
      monthTotal += amount; totals[category] = (totals[category] || 0) + amount; byAccount[account] = (byAccount[account] || 0) + amount;
      allRows.push({ date: rowDate, amount: amount, category: category, desc: desc, account: account });
    }
  }
  var monthName = Utilities.formatDate(lastMonth, Session.getScriptTimeZone(), 'MMMM yyyy');
  var body = _h('h2', '📊 ' + monthName + ' — Full Report', 'font-family:sans-serif;color:#333;');
  body += _h('p', 'Total spent: <strong>$' + monthTotal.toFixed(2) + '</strong>', 'font-family:sans-serif;font-size:16px;');
  body += _h('h3', 'By Category', 'font-family:sans-serif;color:#555;');
  var sortedCats = Object.keys(totals).sort(function(a, b) { return totals[b] - totals[a]; });
  var catItems = '';
  sortedCats.forEach(function(cat) { catItems += _li(cat + ' — <strong>$' + totals[cat].toFixed(2) + '</strong>'); });
  body += '<ul style="font-family:sans-serif;color:#333;padding-left:20px;">' + catItems + '</ul>';
  body += _h('h3', 'By Account', 'font-family:sans-serif;color:#555;');
  var accItems = '';
  for (var acc in byAccount) accItems += _li(acc + ': <strong>$' + byAccount[acc].toFixed(2) + '</strong>');
  body += '<ul style="font-family:sans-serif;color:#333;padding-left:20px;">' + accItems + '</ul>';
  var top5 = allRows.sort(function(a, b) { return b.amount - a.amount; }).slice(0, 5);
  if (top5.length > 0) {
    body += _h('h3', 'Top 5 Expenses', 'font-family:sans-serif;color:#555;');
    var topItems = '';
    top5.forEach(function(r) {
      var d = Utilities.formatDate(r.date, Session.getScriptTimeZone(), 'dd MMM');
      topItems += _li(d + ' · <strong>$' + r.amount.toFixed(2) + '</strong> · ' + r.desc + ' (' + r.account + ')');
    });
    body += '<ul style="font-family:sans-serif;color:#333;padding-left:20px;">' + topItems + '</ul>';
  }
  sendFamilyEmail('Wong’s Nest — ' + monthName + ' Full Report', body);
}

// new Date(year, 1, 29) silently rolls to Mar 1 in non-leap years;
// celebrate Feb-29 birthdays on Feb 28 instead.
function checkUpcomingBirthdays() {
  var ss      = appSpreadsheet_();
  var bdSheet = ss.getSheetByName('Birthdays');
  if (!bdSheet) return;
  var bdVals = perfReadRows_(bdSheet);
  if (bdVals.length <= 1) return;

  var now      = new Date();
  var today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var tz       = Session.getScriptTimeZone();
  var messages = [];

  for (var i = 1; i < bdVals.length; i++) {
    var row    = bdVals[i];
    var name   = toStr(row[0]); var type = toStr(row[1]) || 'Birthday';
    var raw    = toStr(row[2]); var yearVal = toStr(row[3]);
    if (!name || !raw) continue;
    var parts = raw.split('-'); if (parts.length !== 2) continue;
    var month         = parseInt(parts[0]) - 1; var day = parseInt(parts[1]);
    var eventThisYear = annualEventDate_(now.getFullYear(), month, day);
    var eventDate     = eventThisYear >= today ? eventThisYear : annualEventDate_(now.getFullYear() + 1, month, day);
    var daysAway      = Math.floor((eventDate - today) / (1000 * 60 * 60 * 24));
    var dateStr       = Utilities.formatDate(eventDate, tz, 'MMM d');
    var agePart       = '';
    if (yearVal) {
      var yr = parseInt(yearVal);
      if (type === 'Birthday')                 agePart = ' (turning ' + (eventDate.getFullYear() - yr) + ')';
      else if (type === 'Wedding Anniversary') agePart = ' (' + (eventDate.getFullYear() - yr) + ' years! 💑)';
    }
    if (daysAway === 7)      messages.push('🎂 <strong>7-day reminder:</strong> ' + name + '\'s ' + type + ' is in 7 days on ' + dateStr + '!' + agePart);
    else if (daysAway === 1) messages.push('🎉 <strong>Tomorrow</strong> is ' + name + '\'s ' + type + '! (' + dateStr + ')' + agePart);
    else if (daysAway === 0) messages.push('🥳 <strong>Today</strong> is ' + name + '\'s ' + type + '! Happy ' + (type === 'Birthday' ? 'Birthday' : 'Anniversary') + ', ' + name + '!' + agePart + ' 🎊');
  }

  if (messages.length > 0) {
    var body = _h('h2', '🎂 Birthday & Anniversary Reminder', 'font-family:sans-serif;color:#333;');
    messages.forEach(function(m) { body += _h('p', m, 'font-family:sans-serif;font-size:15px;border-left:4px solid #f4a261;padding:8px 12px;margin:8px 0;background:#fff8f0;border-radius:4px;'); });
    sendFamilyEmail('Wong’s Nest — Birthday Reminder', body);
  }
}

function checkBudgetAlerts() {
  var ss       = appSpreadsheet_();
  var bdgSheet = ss.getSheetByName('Budgets');
  var expSheet = ss.getSheetByName('Expenses');
  if (!bdgSheet || !expSheet) return [];
  var bdgVals = perfReadRows_(bdgSheet);
  var expVals = perfReadRows_(expSheet);
  if (bdgVals.length <= 1 || expVals.length <= 1) return [];

  var now = new Date(); var thisMonth = now.getMonth(); var thisYear = now.getFullYear();
  var alerts = [];

  for (var j = 1; j < bdgVals.length; j++) {
    var bRow  = bdgVals[j];
    var group = toStr(bRow[0]); if (!group) continue;
    var limit = parseFloat(bRow[1]) || 0; if (limit <= 0) continue;
    var budgetAcc = toStr(bRow[2]) || 'Family';

    var spent = 0;
    var targetCategories = EXPENSE_GROUPS[group] || [];

    for (var i = 1; i < expVals.length; i++) {
      var eRow = expVals[i]; if (toStr(eRow[8]) === 'Deleted') continue; var rowDate = new Date(eRow[1]);
      if (isNaN(rowDate.getTime())) rowDate = new Date(eRow[0]);
      if (rowDate.getMonth() !== thisMonth || rowDate.getFullYear() !== thisYear) continue;

      var eAcc = toStr(eRow[2]) || 'Family';
      if (eAcc.toLowerCase().indexOf(budgetAcc.toLowerCase()) === -1) continue;

      var eCat = toStr(eRow[3]) || 'Other';
      if (targetCategories.indexOf(eCat) !== -1) {
        spent += parseFloat(eRow[4]) || 0;
      }
    }

    var pct = spent / limit;
    if (pct >= 1.0) alerts.push({ group: group, account: budgetAcc, spent: spent, budget: limit, pct: Math.round(pct * 100), level: 'over' });
    else if (pct >= 0.8) alerts.push({ group: group, account: budgetAcc, spent: spent, budget: limit, pct: Math.round(pct * 100), level: 'warning' });
  }
  return alerts;
}

function sendBudgetAlerts(alerts) {
  if (!alerts || alerts.length === 0) return;

  // Only email when a group's alert level CHANGES this month. Previously
  // the same 80%/over-budget alert was re-sent every single day.
  var props = PropertiesService.getScriptProperties();
  var tz = Session.getScriptTimeZone();
  var monthKey = 'budgetAlertState_' + Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  var prevMonth = new Date(); prevMonth.setMonth(prevMonth.getMonth() - 1);
  try { props.deleteProperty('budgetAlertState_' + Utilities.formatDate(prevMonth, tz, 'yyyy-MM')); } catch (e) {}
  var prevState = {};
  try { prevState = JSON.parse(props.getProperty(monthKey) || '{}'); } catch (e) {}

  var fresh = alerts.filter(function(a) {
    return prevState[a.group + '|' + (a.account || '')] !== a.level;
  });
  var nextState = {};
  alerts.forEach(function(a) { nextState[a.group + '|' + (a.account || '')] = a.level; });
  try { props.setProperty(monthKey, JSON.stringify(nextState)); } catch (e) {}
  if (fresh.length === 0) return;

  var body = _h('h2', '📊 Budget Alert', 'font-family:sans-serif;color:#333;');
  fresh.forEach(function(a) {
    var colour = a.level === 'over' ? '#c0392b' : '#c9a84c';
    var emoji  = a.level === 'over' ? '🚨' : '⚠️';
    var label  = a.level === 'over' ? 'OVER BUDGET by $' + (a.spent - a.budget).toFixed(2) : a.pct + '% used';
    var pct    = Math.min(a.pct, 100);
    var bar    = '<div style="background:#eee;border-radius:4px;height:8px;margin:6px 0;"><div style="width:' + pct + '%;background:' + colour + ';height:100%;border-radius:4px;"></div></div>';
    body += _h('div',
      _h('p', emoji + ' <strong>' + a.group + '</strong> — ' + label, 'margin:0;font-size:15px;') +
      bar +
      _h('p', '$' + a.spent.toFixed(2) + ' / $' + a.budget.toFixed(2), 'margin:0;font-size:13px;color:#666;'),
      'font-family:sans-serif;border:1px solid #eee;border-radius:6px;padding:12px;margin:8px 0;'
    );
  });
  sendFamilyEmail('Wong’s Nest — Budget Alert', body);
}

// ─── CYCLE ESTIMATION ──────────────────────────────────────
// Collect all 'Period Start' dates from the Fertility sheet values.
function getPeriodStarts_(fertVals) {
  var starts = [];
  for (var i = 1; i < fertVals.length; i++) {
    var row = fertVals[i];
    if (toStr(row[2]) !== 'Period Start') continue;
    var d = row[1] ? new Date(row[1]) : null;
    if (d && !isNaN(d.getTime())) starts.push(d);
  }
  starts.sort(function(a, b) { return a - b; });
  return starts;
}

// Average of the last few observed cycle lengths, clamped to a sane
// range — instead of the fixed 28-day assumption used previously.
function estimateCycleLengthDays_(periodStarts) {
  if (!periodStarts || periodStarts.length < 2) return 28;
  var gaps = [];
  for (var i = 1; i < periodStarts.length; i++) {
    var gap = Math.round((periodStarts[i] - periodStarts[i - 1]) / 86400000);
    if (gap >= 21 && gap <= 45) gaps.push(gap);   // ignore data-entry gaps
  }
  if (gaps.length === 0) return 28;
  var recent = gaps.slice(-3);
  var avg = Math.round(recent.reduce(function(a, b) { return a + b; }, 0) / recent.length);
  return Math.min(35, Math.max(21, avg));
}

function checkFertilityNotifications(now) {
  var ss        = appSpreadsheet_();
  var fertSheet = ss.getSheetByName('Fertility'); if (!fertSheet) return;
  var fertVals  = perfReadRows_(fertSheet);
  var starts    = getPeriodStarts_(fertVals);
  if (starts.length === 0) return;
  var lastPeriodStart = starts[starts.length - 1];
  var cycleLen        = estimateCycleLengthDays_(starts);
  var ovulationOffset = cycleLen - 14;   // luteal phase ≈ 14 days
  var tz           = Session.getScriptTimeZone();
  var fertileStart = new Date(lastPeriodStart); fertileStart.setDate(fertileStart.getDate() + ovulationOffset - 4);
  var fertileEnd   = new Date(lastPeriodStart); fertileEnd.setDate(fertileEnd.getDate() + ovulationOffset + 2);
  var nextPeriod   = new Date(lastPeriodStart); nextPeriod.setDate(nextPeriod.getDate() + cycleLen);
  var today            = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var fertileStartDay  = new Date(fertileStart.getFullYear(), fertileStart.getMonth(), fertileStart.getDate());
  var nextPeriodDay    = new Date(nextPeriod.getFullYear(), nextPeriod.getMonth(), nextPeriod.getDate());
  var daysUntilFertile = Math.round((fertileStartDay - today) / (1000 * 60 * 60 * 24));
  var daysUntilPeriod  = Math.round((nextPeriodDay   - today) / (1000 * 60 * 60 * 24));
  var fsStr = Utilities.formatDate(fertileStart, tz, 'dd MMM yyyy');
  var feStr = Utilities.formatDate(fertileEnd,   tz, 'dd MMM yyyy');
  var npStr = Utilities.formatDate(nextPeriod,   tz, 'dd MMM yyyy');
  if (daysUntilFertile === 3) {
    var body = _h('h2', '🌸 Fertile Window in 3 Days', 'font-family:sans-serif;color:#c0392b;') +
               _h('p', 'Fertile window: <strong>' + fsStr + ' – ' + feStr + '</strong>', 'font-family:sans-serif;font-size:15px;');
    sendFamilyEmail('🌸 Fertility — Fertile Window in 3 Days', body);
  }
  if (daysUntilFertile === 1) {
    var body = _h('h2', '🌸 Fertile Window Starts Tomorrow!', 'font-family:sans-serif;color:#c0392b;') +
               _h('p', 'Fertile window: <strong>' + fsStr + ' – ' + feStr + '</strong>', 'font-family:sans-serif;font-size:15px;');
    sendFamilyEmail('🌸 Fertility — Fertile Window Starts Tomorrow', body);
  }
  if (daysUntilPeriod === 3) {
    var body = _h('h2', '🩸 Period Due in 3 Days', 'font-family:sans-serif;color:#e74c3c;') +
               _h('p', 'Estimated next period: <strong>' + npStr + '</strong>', 'font-family:sans-serif;font-size:15px;');
    sendFamilyEmail('🩸 Fertility — Period Due Soon', body);
  }
}

function processRecurringExpenses() {
  var ss       = appSpreadsheet_();
  var recSheet = ss.getSheetByName('RecurringExpenses');
  if (!recSheet) return;
  var recVals = perfReadRows_(recSheet);
  if (recVals.length <= 1) return;

  var expSheet = ss.getSheetByName('Expenses');
  if (!expSheet) { expSheet = ss.insertSheet('Expenses'); expSheet.appendRow(['Timestamp', 'Date', 'Account', 'Category', 'Amount', 'Note','ID','Operation Fingerprint','Status']); }

  var now    = new Date();
  var today  = now.getDate();
  var logged = [];

  for (var i = 1; i < recVals.length; i++) {
    var row = recVals[i]; if (!row[0]) continue;
    if (toStr(row[6]).toLowerCase() === 'false') continue;
    var dueDay = fullNumber_(row[4]);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) continue;
    if (dueDay !== today) continue;
    var name     = toStr(row[0]);
    var amount   = fullNumber_(row[1]);
    var account  = toStr(row[2]) || 'Family';
    var category = toStr(row[3]) || 'Other';
    var dateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!Number.isFinite(amount) || amount < 0 || !financeAccount_(account) || !financeCategory_(category)) { console.log('Skipped invalid recurring record'); continue; }
    expSheet.appendRow([new Date(), dateOnly, account, schoolCell_(category), amount, schoolCell_(name + ' (recurring)'), 'exp_'+Utilities.getUuid(),'','']);
    logged.push({ name: name, amount: amount, account: account });
  }

  if (logged.length > 0) {
    // No sheet re-sort — see the note in add_expense.
    var body = _h('h2', '🔄 Recurring Expenses Logged', 'font-family:sans-serif;color:#333;');
    var items = '';
    logged.forEach(function(r) { items += _li('<strong>' + r.name + '</strong> — $' + r.amount.toFixed(2) + ' (' + r.account + ')'); });
    body += '<ul style="font-family:sans-serif;color:#333;padding-left:20px;">' + items + '</ul>';
    body += _h('p', 'These have been automatically added to your expenses.', 'font-family:sans-serif;color:#888;font-size:13px;');
    sendFamilyEmail('Wong’s Nest — Recurring Expenses Logged', body);
  }
}

function keepAlive() {
  console.log('keepAlive — no external server to ping');
}

// ============================================================
// DOGET / DOPOST
// ============================================================
function testCalendarConnection() {
  try { var cal = CalendarApp.getCalendarById(CALENDAR_ID); console.log('✅ Connected: ' + cal.getName()); }
  catch (e) { console.log('❌ Failed: ' + e); }
}

function testDigest() {
  sendMorningDigest(new Date());
  console.log('Digest sent — check email!');
}

// ============================================================
// 8. EXPENSE SCANNER & APPROVAL SYSTEM (with txRef)
// ============================================================

