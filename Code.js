// ============================================================
// WONG FAMILY BOT — Google Apps Script (PWA Version)
// with Firebase ID token verification
// Google Calendar ID: family09091668338066744284@group.calendar.google.com
// ============================================================

var CALENDAR_ID    = "family09091668338066744284@group.calendar.google.com";
var FAMILY_MEMBERS = ["Mikaela", "Meaghan", "Eleanor", "Marcus", "Everyone"];
var WEB_APP_URL    = "https://script.google.com/macros/s/AKfycbwQzpqQRRnK_PJRIbKWvPRhFVrQbfLEORciIRijBSwiz7WkX-7Ik2vTrZzE9VZ7Nehr/exec";

var NOTIFY_EMAILS = [
  "marcuswongjw@gmail.com",
  "eleanor.jiamin@gmail.com"
];

var EXPENSE_GROUPS = {
  '👶 Children':      ['Children - Books','Children - Enrichment','Children - School','Children - Toys','Mikaela - Sailing'],
  '👕 Clothing':      ['Clothing - Accessories','Clothing - Clothes','Clothing - Shoes'],
  '🍽 Eating Out':    ['Eating Out - Beverages','Eating Out - Breakfast','Eating Out - Dinner','Eating Out - Lunch','Eating Out - Snacks'],
  '📚 Education':     ['Education - Books','Education - Courses & Enrichment','Education - Subscription'],
  '🎭 Entertainment': ['Entertainment - Experiences','Entertainment - Subscriptions','Entertainment - Objects (toys, etc)'],
  '🎁 Gifts/Giving':  ['Gifts & Treats - CNY','Gifts & Treats - Family','Gifts & Treats - Friends','Gifts & Treats - Wedding','Giving - Church','Giving - Charity','Giving - Parents'],
  '🏥 Health':        ['Health & Fitness - Dental + Medical','Health & Fitness - Events + Subscription','Health & Fitness - Equipment + Supplements'],
  '🏠 Household':     ['Household - Appliances','Household - Groceries','Household - Helper','Household - Household Misc','Household - Renovation','Household - Utilities (electric, gas, water)','Household - Internet'],
  '🐾 Pets':          ['Pets - Pet Food','Pets - Grooming','Pets - Pet Misc'],
  '💆 Self Care':     ['Self Care - Massage','Self Care - Personal Care','Utilities - Mobile'],
  '✈️ Travel':        ['Travel - Hotels','Travel - Transport','Travel - Expenses'],
  '🚗 Transport':     ['Transportation - Bus/MRT','Transportation - Taxi/Grab','Transportation - Auto: Service','Transportation - Auto: Loan','Transportation - Auto: Gas'],
  '📈 Finance':       ['Endowment','Insurance','Investing','Taxes - Income Tax','Taxes - Property Tax'],
  '🌍 Others':        ['Electronics','Misc','Missions']
};

function toStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).valueOf();
}


// ─── FIREBASE TOKEN VERIFICATION ──────────────────────────
function verifyFirebaseToken(idToken) {
  if (!idToken) return null;
  try {
    var apiKey = 'AIzaSyAapGliVr1bcKa5ESvIPpT1VvPIHb0uwD0'; // your web API key
    var url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + apiKey;
    var payload = { idToken: idToken };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());
    if (result.users && result.users.length > 0) {
      // Return the user's email (or localId) for logging
      return result.users[0].email;
    }
  } catch (e) {
    Logger.log('Token verification error: ' + e);
  }
  return null;
}

function respondJSONP(data, callback) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// EMAIL HELPER
// ============================================================
function sendFamilyEmail(subject, htmlBody) {
  var plainBody = htmlBody.replace(/<[^>]+>/g, '').replace(/\n\n+/g, '\n').trim();
  NOTIFY_EMAILS.forEach(function(email) {
    try {
      MailApp.sendEmail({ to: email, subject: subject, body: plainBody, htmlBody: htmlBody });
      Logger.log('✅ email sent to: ' + email);
    } catch (err) {
      Logger.log('❌ email failed (' + email + '): ' + err);
    }
  });
}

function _h(tag, content, style) {
  style = style || '';
  return '<' + tag + (style ? ' style="' + style + '"' : '') + '>' + content + '</' + tag + '>';
}

function _li(content) { return '<li style="margin:4px 0;">' + content + '</li>'; }


// ============================================================
// DAILY TRIGGER — runs at 8am SGT every day
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


// ============================================================
// MORNING DIGEST
// ============================================================
function sendMorningDigest(now) {
  now = (now instanceof Date && !isNaN(now.getTime())) ? now : new Date();
  var tz      = Session.getScriptTimeZone();
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dateStr = Utilities.formatDate(now, tz, 'EEEE, d MMMM yyyy');
  var body    = '';

  body += _h('h2', '🌅 Good morning, Wong Family!', 'color:#2c7a4b;font-family:sans-serif;');
  body += _h('p', dateStr, 'color:#666;font-family:sans-serif;font-size:14px;');

  var verse = getDailyVerse();
  body += _h('div',
    _h('p', '"' + verse.text + '"', 'margin:0;font-style:italic;color:#333;') +
    _h('p', '— ' + verse.ref, 'margin:4px 0 0;color:#888;font-size:13px;'),
    'background:#f0f7f4;border-left:4px solid #2c7a4b;padding:12px 16px;border-radius:4px;font-family:sans-serif;margin:16px 0;'
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
  } catch (e) { Logger.log('Calendar error: ' + e); }

  var tdSheet = ss.getSheetByName('ToDo');
  if (tdSheet) {
    var tdVals = tdSheet.getDataRange().getValues(); var taskItems = '';
    for (var i = 1; i < tdVals.length; i++) {
      var row = tdVals[i];
      if (!row || toStr(row[5]).toLowerCase() === 'done') continue;
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
  sendFamilyEmail('🌅 Wong Family Morning Digest — ' + dateStr, body);
}


// ============================================================
// FETCH DAILY VERSE
// ============================================================
function getDailyVerse() {
  try {
    var url      = 'https://beta.ourmanna.com/api/v1/get/?format=json&order=daily';
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json     = JSON.parse(response.getContentText());
    if (json && json.verse && json.verse.details) {
      return { text: json.verse.details.text.trim(), ref: json.verse.details.reference.trim() };
    }
  } catch (e) { Logger.log('Ourmanna error: ' + e); }
  return { text: "I can do all things through Christ who strengthens me.", ref: "Philippians 4:13" };
}


// ============================================================
// EXPENSE SUMMARY (last day of month)
// ============================================================
function sendExpenseSummary(now) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var expSheet = ss.getSheetByName('Expenses'); if (!expSheet) return;
  var eVals    = expSheet.getDataRange().getValues();
  var thisMonth = now.getMonth(); var thisYear = now.getFullYear();
  var totals = {}; var byAccount = {}; var monthTotal = 0;
  for (var i = 1; i < eVals.length; i++) {
    var row = eVals[i]; var rowDate = new Date(row[1]); if (isNaN(rowDate.getTime())) rowDate = new Date(row[0]);
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
  sendFamilyEmail('💰 Wong Family — ' + monthName + ' Expense Summary', body);
}


// ============================================================
// EXPENSE REPORT (1st of month)
// ============================================================
function sendExpenseReport(now) {
  var ss          = SpreadsheetApp.getActiveSpreadsheet();
  var expSheet    = ss.getSheetByName('Expenses'); if (!expSheet) return;
  var lastMonth   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var targetMonth = lastMonth.getMonth(); var targetYear = lastMonth.getFullYear();
  var eVals = expSheet.getDataRange().getValues();
  var totals = {}; var byAccount = {}; var monthTotal = 0; var allRows = [];
  for (var i = 1; i < eVals.length; i++) {
    var row = eVals[i]; var rowDate = new Date(row[1]); if (isNaN(rowDate.getTime())) rowDate = new Date(row[0]);
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
  sendFamilyEmail('📊 Wong Family — ' + monthName + ' Full Report', body);
}


// ============================================================
// BIRTHDAY / ANNIVERSARY DAILY CHECK
// ============================================================
function checkUpcomingBirthdays() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var bdSheet = ss.getSheetByName('Birthdays');
  if (!bdSheet) return;
  var bdVals = bdSheet.getDataRange().getValues();
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
    var eventThisYear = new Date(now.getFullYear(), month, day);
    var eventDate     = eventThisYear >= today ? eventThisYear : new Date(now.getFullYear() + 1, month, day);
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
    sendFamilyEmail('🎂 Wong Family — Birthday Reminder', body);
  }
}


// ============================================================
// BUDGET ALERT CHECK — group level
// ============================================================
function checkBudgetAlerts() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var bdgSheet = ss.getSheetByName('Budgets');
  var expSheet = ss.getSheetByName('Expenses');
  if (!bdgSheet || !expSheet) return [];
  var bdgVals = bdgSheet.getDataRange().getValues();
  var expVals = expSheet.getDataRange().getValues();
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
      var eRow = expVals[i]; var rowDate = new Date(eRow[1]);
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
    if (pct >= 1.0) alerts.push({ group: group, spent: spent, budget: limit, pct: Math.round(pct * 100), level: 'over' });
    else if (pct >= 0.8) alerts.push({ group: group, spent: spent, budget: limit, pct: Math.round(pct * 100), level: 'warning' });
  }
  return alerts;
}

function sendBudgetAlerts(alerts) {
  if (!alerts || alerts.length === 0) return;
  var body = _h('h2', '📊 Budget Alert', 'font-family:sans-serif;color:#333;');
  alerts.forEach(function(a) {
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
  sendFamilyEmail('📊 Wong Family — Budget Alert', body);
}


// ============================================================
// FERTILITY NOTIFICATIONS
// ============================================================
function checkFertilityNotifications(now) {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var fertSheet = ss.getSheetByName('Fertility'); if (!fertSheet) return;
  var fertVals  = fertSheet.getDataRange().getValues();
  var lastPeriodStart = null;
  for (var i = 1; i < fertVals.length; i++) {
    var row = fertVals[i]; var fType = toStr(row[2]); var fDate = row[1] ? new Date(row[1]) : null;
    if (fDate && isNaN(fDate.getTime())) fDate = null;
    if (fType === 'Period Start' && fDate) { if (!lastPeriodStart || fDate > lastPeriodStart) lastPeriodStart = fDate; }
  }
  if (!lastPeriodStart) return;
  var tz           = Session.getScriptTimeZone();
  var fertileStart = new Date(lastPeriodStart); fertileStart.setDate(fertileStart.getDate() + 10);
  var fertileEnd   = new Date(lastPeriodStart); fertileEnd.setDate(fertileEnd.getDate() + 16);
  var nextPeriod   = new Date(lastPeriodStart); nextPeriod.setDate(nextPeriod.getDate() + 28);
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


// ============================================================
// RECURRING EXPENSES — auto-log on due date + email
// ============================================================
function processRecurringExpenses() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var recSheet = ss.getSheetByName('RecurringExpenses');
  if (!recSheet) return;
  var recVals = recSheet.getDataRange().getValues();
  if (recVals.length <= 1) return;

  var expSheet = ss.getSheetByName('Expenses');
  if (!expSheet) { expSheet = ss.insertSheet('Expenses'); expSheet.appendRow(['Timestamp', 'Date', 'Account', 'Category', 'Amount', 'Note']); }

  var now    = new Date();
  var today  = now.getDate();
  var logged = [];

  for (var i = 1; i < recVals.length; i++) {
    var row = recVals[i]; if (!row[0]) continue;
    if (toStr(row[6]).toLowerCase() === 'false') continue;
    var dueDay = parseInt(row[4]) || 1;
    if (dueDay !== today) continue;
    var name     = toStr(row[0]);
    var amount   = parseFloat(row[1]) || 0;
    var account  = toStr(row[2]) || 'Family';
    var category = toStr(row[3]) || 'Other';
    var dateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    expSheet.appendRow([new Date(), dateOnly, account, category, amount, name + ' (recurring)']);
    logged.push({ name: name, amount: amount, account: account });
  }

  if (logged.length > 0) {
    var lastRow = expSheet.getLastRow();
    if (lastRow > 2) expSheet.getRange(2, 1, lastRow - 1, expSheet.getLastColumn()).sort({ column: 2, ascending: true });
    var body = _h('h2', '🔄 Recurring Expenses Logged', 'font-family:sans-serif;color:#333;');
    var items = '';
    logged.forEach(function(r) { items += _li('<strong>' + r.name + '</strong> — $' + r.amount.toFixed(2) + ' (' + r.account + ')'); });
    body += '<ul style="font-family:sans-serif;color:#333;padding-left:20px;">' + items + '</ul>';
    body += _h('p', 'These have been automatically added to your expenses.', 'font-family:sans-serif;color:#888;font-size:13px;');
    sendFamilyEmail('🔄 Wong Family — Recurring Expenses Logged', body);
  }
}


// ============================================================
// KEEP ALIVE
// ============================================================
function keepAlive() {
  Logger.log('keepAlive — no external server to ping');
}


// ============================================================
// doGet — PWA fetches data + writes via GET+JSONP with token check
// ============================================================
function doGet(e) {
  var action   = e && e.parameter && e.parameter.action   ? e.parameter.action   : '';
  var callback = e && e.parameter && e.parameter.callback ? e.parameter.callback : '';
  var idToken  = e && e.parameter && e.parameter.idToken  ? e.parameter.idToken  : '';

  // Protected actions that require valid authentication
  // Note: submit_confirmed_expense is EXEMPT because it uses a UUID for security
  var protectedActions = ['get_all', 'write'];   // <-- removed 'submit_confirmed_expense'

  // If the action is protected, verify the token
  if (protectedActions.indexOf(action) !== -1) {
    var verifiedEmail = verifyFirebaseToken(idToken);
    if (!verifiedEmail) {
      var error = { status: 'error', message: 'Unauthorized: invalid or missing token' };
      return respondJSONP(error, callback);
    }
    // Optionally, you can store verifiedEmail in the script cache for logging
    // but we keep the existing 'user' field from the payload for simplicity.
  }

  // Handle confirm_expense_page separately (no token required, uses UUID)
  if (action === 'confirm_expense_page') {
    var id = e && e.parameter && e.parameter.id ? e.parameter.id : '';
    return renderConfirmExpensePage(id);
  }

  var output;
  try {
    switch (action) {
      case 'get_all':       output = getAllDashboardData(); break;
      case 'get_events':    output = getEvents();           break;
      case 'get_todos':     output = getTodos();            break;
      case 'get_expenses':  output = getExpensesData();     break;
      case 'get_budgets':   output = getBudgets();          break;
      case 'get_birthdays': output = getBirthdays();        break;
      case 'get_memories':  output = getMemories();         break;
      case 'get_fertility': output = getFertilityData();    break;
      case 'get_recurring': output = getRecurring();        break;
      case 'get_travel':    output = getTravelData();       break;
      case 'submit_confirmed_expense': output = handleSubmitConfirmedExpense(e.parameter); break;
      case 'write':
        var writeData = {};
        try { writeData = JSON.parse(e.parameter.data || '{}'); } catch(pe) {}
        output = handleWrite(writeData);
        break;
      default: output = { error: 'unknown action: ' + action };
    }
  } catch (err) {
    output = { error: err.toString() };
  }

  return respondJSONP(output, callback);
}


// ============================================================
// doPost — also checks token if provided
// ============================================================
function doPost(e) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('Log') || ss.insertSheet('Log');
  try {
    var data = JSON.parse(e.postData.contents);
    // If an idToken is provided, verify it
    if (data.idToken) {
      var verified = verifyFirebaseToken(data.idToken);
      if (!verified) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    var result = handleWrite(data);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    logSheet.appendRow([new Date(), 'POST ERROR', err.toString()]);
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}


// ============================================================
// handleWrite — all write operations called from doGet/JSONP
// ============================================================
function handleWrite(data) {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet  = ss.getSheetByName('Log') || ss.insertSheet('Log');
  var note      = toStr(data.note);
  var noteLower = note.toLowerCase().trim();
  var user      = toStr(data.user) || 'Unknown';

  try {

    // CALENDAR: add
    if (noteLower === 'add_event') {
      var title         = toStr(data.event_title) || 'Untitled Event';
      var dateStr       = toStr(data.event_date);
      var timeStr       = toStr(data.event_time);
      var endTimeStr    = toStr(data.event_end_time);
      var eventLocation = toStr(data.event_location);
      var eventNotes    = toStr(data.event_notes);
      var isAllDay      = !timeStr || timeStr === '';
      var startDate     = parseEventDate(dateStr, timeStr);
      var endDate;
      if (isAllDay) { endDate = new Date(startDate); endDate.setDate(endDate.getDate() + 1); }
      else if (endTimeStr) { endDate = parseEventDate(dateStr, endTimeStr); if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1); }
      else { endDate = new Date(startDate.getTime() + 60 * 60 * 1000); }
      var calendar     = CalendarApp.getCalendarById(CALENDAR_ID);
      var createdEvent = isAllDay
        ? calendar.createAllDayEvent(title, startDate, { description: eventNotes || '', location: eventLocation || '' })
        : calendar.createEvent(title, startDate, endDate, { description: eventNotes || '', location: eventLocation || '' });
      var calSheet = ss.getSheetByName('Calendar');
      if (!calSheet) { calSheet = ss.insertSheet('Calendar'); calSheet.appendRow(['Title', 'Date', 'Time', 'Added By', 'Notes', 'Google Event ID']); }
      var calNotes = eventNotes;
      if (eventLocation) calNotes = (calNotes ? calNotes + '\n' : '') + 'Location: ' + eventLocation;
      calSheet.appendRow([title, startDate, timeStr, user, calNotes, createdEvent.getId()]);
      return { status: 'ok', id: createdEvent.getId() };
    }

    // CALENDAR: delete
    if (noteLower === 'delete_event') {
      var eventId  = toStr(data.event_id);
      var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
      var ev       = calendar.getEventById(eventId);
      if (ev) ev.deleteEvent();
      var calSheet = ss.getSheetByName('Calendar');
      if (calSheet) {
        var cVals = calSheet.getDataRange().getValues();
        for (var ci = 1; ci < cVals.length; ci++) { if (toStr(cVals[ci][5]) === eventId) { calSheet.deleteRow(ci + 1); break; } }
      }
      return { status: 'ok' };
    }

    // TO-DO: add
    if (noteLower === 'add_todo') {
      var tdSheet = ss.getSheetByName('ToDo');
      if (!tdSheet) { tdSheet = ss.insertSheet('ToDo'); tdSheet.appendRow(['Date Added', 'Task', 'Assignee', 'Due Date', 'Added By', 'Status']); }
      var parsedDue = toStr(data.todo_due) ? parseEventDate(toStr(data.todo_due), '') : '';
      tdSheet.appendRow([new Date(), toStr(data.todo_task), toStr(data.todo_assignee) || 'Everyone', parsedDue, user, 'Open']);
      return { status: 'ok' };
    }

    // TO-DO: complete
    if (noteLower === 'complete_todo') {
      var tdSheet  = ss.getSheetByName('ToDo');
      var rowIndex = parseInt(toStr(data.todo_id));
      if (tdSheet && !isNaN(rowIndex)) { tdSheet.getRange(rowIndex, 6).setValue('Done'); tdSheet.getRange(rowIndex, 7).setValue(new Date()); }
      return { status: 'ok' };
    }

    // TO-DO: delete
    if (noteLower === 'delete_todo') {
      var tdSheet  = ss.getSheetByName('ToDo');
      var rowIndex = parseInt(toStr(data.todo_id));
      if (tdSheet && !isNaN(rowIndex) && rowIndex > 0) tdSheet.deleteRow(rowIndex);
      return { status: 'ok' };
    }

    // EXPENSES: delete
    if (noteLower === 'delete_expense') {
      var expSheet = ss.getSheetByName('Expenses');
      var rowNum   = parseInt(toStr(data.row_id));
      if (expSheet && !isNaN(rowNum) && rowNum > 1) expSheet.deleteRow(rowNum);
      return { status: 'ok' };
    }

    // EXPENSES: add
    if (noteLower === 'add_expense') {
      var expSheet = ss.getSheetByName('Expenses');
      if (!expSheet) { expSheet = ss.insertSheet('Expenses'); expSheet.appendRow(['Timestamp', 'Date', 'Account', 'Category', 'Amount', 'Note']); }
      var parsedDate = toStr(data.ex_date) ? parseEventDate(toStr(data.ex_date), '') : new Date();
      expSheet.appendRow([new Date(), parsedDate, toStr(data.ex_account) || 'Family', toStr(data.ex_category) || 'Other', parseFloat(data.ex_amount) || 0, toStr(data.ex_desc)]);
      var lastRow = expSheet.getLastRow();
      if (lastRow > 2) expSheet.getRange(2, 1, lastRow - 1, expSheet.getLastColumn()).sort({ column: 2, ascending: true });
      return { status: 'ok' };
    }

    // FERTILITY: add
    if (noteLower === 'add_fertility') {
      var fertSheet = ss.getSheetByName('Fertility');
      if (!fertSheet) { fertSheet = ss.insertSheet('Fertility'); fertSheet.appendRow(['Logged By', 'Date', 'Type', 'Notes', 'Logged At']); }
      var fertDate = toStr(data.fertility_date) ? parseEventDate(toStr(data.fertility_date), '') : new Date();
      fertSheet.appendRow([user, fertDate, toStr(data.fertility_type), toStr(data.fertility_notes), new Date()]);
      return { status: 'ok' };
    }

    // BIRTHDAYS: add
    if (noteLower === 'add_birthday') {
      var bdSheet = ss.getSheetByName('Birthdays');
      if (!bdSheet) { bdSheet = ss.insertSheet('Birthdays'); bdSheet.appendRow(['Name', 'Type', 'Date (MM-DD)', 'Year (optional)', 'Notes', 'Added By']); }
      bdSheet.appendRow([toStr(data.name), toStr(data.type) || 'Birthday', toStr(data.date), toStr(data.year), toStr(data.notes), user]);
      return { status: 'ok' };
    }

    // BUDGETS: set
    if (noteLower === 'set_budget') {
      var bdgSheet  = ss.getSheetByName('Budgets');
      if (!bdgSheet) { bdgSheet = ss.insertSheet('Budgets'); bdgSheet.appendRow(['Group', 'Monthly Budget', 'Account', 'Set By', 'Updated At']); }
      var groupName = toStr(data.group); 
      var budget    = parseFloat(data.budget) || 0;
      var budgetAcc = toStr(data.account) || 'Family';
      var bdgVals   = bdgSheet.getDataRange().getValues(); 
      var found     = false;
      for (var i = 1; i < bdgVals.length; i++) {
        if (toStr(bdgVals[i][0]).toLowerCase() === groupName.toLowerCase() &&
            toStr(bdgVals[i][2] || 'Family').toLowerCase() === budgetAcc.toLowerCase()) {
          bdgSheet.getRange(i + 1, 2).setValue(budget); 
          bdgSheet.getRange(i + 1, 4).setValue(user); 
          bdgSheet.getRange(i + 1, 5).setValue(new Date()); 
          found = true; 
          break;
        }
      }
      if (!found) bdgSheet.appendRow([groupName, budget, budgetAcc, user, new Date()]);
      return { status: 'ok' };
    }

    // BUDGETS: delete
    if (noteLower === 'delete_budget') {
      var bdgSheet  = ss.getSheetByName('Budgets');
      var groupName = toStr(data.group);
      var budgetAcc = toStr(data.account) || 'Family';
      if (bdgSheet) {
        var bdgVals = bdgSheet.getDataRange().getValues();
        for (var i = 1; i < bdgVals.length; i++) {
          if (toStr(bdgVals[i][0]).toLowerCase() === groupName.toLowerCase() &&
              toStr(bdgVals[i][2] || 'Family').toLowerCase() === budgetAcc.toLowerCase()) {
            bdgSheet.deleteRow(i + 1);
            break;
          }
        }
      }
      return { status: 'ok' };
    }

    // MEMORIES: add
    if (noteLower === 'add_memory') {
      var memSheet = ss.getSheetByName('Memories');
      if (!memSheet) { memSheet = ss.insertSheet('Memories'); memSheet.appendRow(['Logged By', 'Date', 'Type', 'Person', 'Memory', 'Logged At']); }
      var memDate = toStr(data.memory_date) ? parseEventDate(toStr(data.memory_date), '') : new Date();
      memSheet.appendRow([user, memDate, toStr(data.memory_type) || 'Moment', toStr(data.memory_person) || 'Everyone', toStr(data.memory_text), new Date()]);
      return { status: 'ok' };
    }

    // RECURRING: add
    if (noteLower === 'add_recurring') {
      var recSheet = ss.getSheetByName('RecurringExpenses');
      if (!recSheet) { recSheet = ss.insertSheet('RecurringExpenses'); recSheet.appendRow(['Name', 'Amount', 'Account', 'Category', 'Day of Month', 'Added By', 'Active']); }
      recSheet.appendRow([toStr(data.rec_name), parseFloat(data.rec_amount) || 0, toStr(data.rec_account) || 'Family', toStr(data.rec_category) || 'Other', parseInt(data.rec_day) || 1, user, 'true']);
      return { status: 'ok' };
    }

    // RECURRING: delete
    if (noteLower === 'delete_recurring') {
      var recSheet = ss.getSheetByName('RecurringExpenses');
      var rowNum   = parseInt(toStr(data.row_num));
      if (recSheet && !isNaN(rowNum) && rowNum > 1) recSheet.getRange(rowNum, 7).setValue('false');
      return { status: 'ok' };
    }

    // TRAVEL: add
    if (noteLower === 'add_trip') {
      var travelSheet = ss.getSheetByName('Travel');
      if (!travelSheet) {
        travelSheet = ss.insertSheet('Travel');
        travelSheet.appendRow(['ID', 'Date', 'City', 'Country', 'Lat', 'Lng', 'Members', 'Notes', 'Timestamp']);
      }
      var tripId = 'tr_' + Date.now() + '_' + Math.floor(Math.random()*1000);
      var tripDate = toStr(data.trip_date) ? parseEventDate(toStr(data.trip_date), '') : new Date();
      travelSheet.appendRow([
        tripId,
        tripDate,
        toStr(data.trip_city),
        toStr(data.trip_country),
        parseFloat(data.trip_lat) || 0,
        parseFloat(data.trip_lng) || 0,
        toStr(data.trip_members),
        toStr(data.trip_notes),
        new Date()
      ]);
      return { status: 'ok' };
    }

    // TRAVEL: delete
    if (noteLower === 'delete_trip') {
      var travelSheet = ss.getSheetByName('Travel');
      var targetId = toStr(data.trip_id);
      if (travelSheet) {
        var tVals = travelSheet.getDataRange().getValues();
        for (var ti = 1; ti < tVals.length; ti++) {
          if (toStr(tVals[ti][0]) === targetId) {
            travelSheet.deleteRow(ti + 1);
            break;
          }
        }
      }
      return { status: 'ok' };
    }

    // APPRECIATION: add
    if (noteLower === 'add_appreciation') {
      var appSheet = ss.getSheetByName('Appreciations');
      if (!appSheet) {
        appSheet = ss.insertSheet('Appreciations');
        appSheet.appendRow(['Timestamp', 'Sender', 'Recipient', 'Message', 'RevealDate']);
      }
      var sender = user;
      var recipient = sender === 'Marcus' ? 'Eleanor' : 'Marcus';
      var message = toStr(data.message);
      
      // Calculate next Friday 6:00 PM
      var now = new Date();
      var revealDate = new Date();
      var currentDay = now.getDay();
      var daysToFriday = (5 - currentDay + 7) % 7;
      if (daysToFriday === 0 && now.getHours() >= 18) {
        daysToFriday = 7;
      }
      revealDate.setDate(now.getDate() + daysToFriday);
      revealDate.setHours(18, 0, 0, 0); // 6:00 PM
      
      appSheet.appendRow([now, sender, recipient, message, revealDate]);
      return { status: 'ok' };
    }

    // LOVE CHECKIN: add
    if (noteLower === 'add_love_checkin') {
      var checkinSheet = ss.getSheetByName('LoveCheckins');
      if (!checkinSheet) {
        checkinSheet = ss.insertSheet('LoveCheckins');
        checkinSheet.appendRow(['Timestamp', 'User', 'Battery', 'Moods', 'Notes', 'Focus']);
      }
      var battery = parseInt(data.battery) || 5;
      var moods = toStr(data.moods);
      var notes = toStr(data.notes);
      var focus = toStr(data.focus);
      checkinSheet.appendRow([new Date(), user, battery, moods, notes, focus]);
      return { status: 'ok' };
    }

    logSheet.appendRow([new Date(), user, 'General', note]);
    return { status: 'ok' };

  } catch (err) {
    logSheet.appendRow([new Date(), 'WRITE ERROR', err.toString()]);
    return { status: 'error', message: err.toString() };
  }
}


// ============================================================
// DATA FETCH FUNCTIONS (called by doGet)
// ============================================================
function getAllDashboardData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    events:    getEvents(),
    todos:     getTodos(ss),
    expenses:  getExpensesData(ss),
    budgets:   getBudgets(ss),
    birthdays: getBirthdays(ss),
    memories:  getMemories(ss),
    fertility: getFertilityData(ss),
    recurring: getRecurring(ss),
    travel:    getTravelData(ss),
    appreciations: getAppreciationsData(ss),
    loveCheckins:  getLoveCheckinsData(ss),
    expenseGroups: EXPENSE_GROUPS
  };
}

function getEvents() {
  try {
    var calendar        = CalendarApp.getCalendarById(CALENDAR_ID);
    var now             = new Date();
    var thirtyDaysAgo   = new Date(); thirtyDaysAgo.setDate(now.getDate() - 30);
    var thirtyDaysLater = new Date(); thirtyDaysLater.setDate(now.getDate() + 30);
    var events          = calendar.getEvents(thirtyDaysAgo, thirtyDaysLater);
    var tz              = Session.getScriptTimeZone();
    var result          = [];
    for (var i = 0; i < events.length; i++) {
      var ev        = events[i];
      var titleDesc = ev.getTitle() + ' ' + (ev.getDescription() || '');
      var tags      = FAMILY_MEMBERS.filter(function(m) { return m !== 'Everyone' && titleDesc.toLowerCase().indexOf(m.toLowerCase()) !== -1; });
      var duration  = 0;
      try {
        duration = (ev.getEndTime().getTime() - ev.getStartTime().getTime()) / (1000 * 60 * 60);
      } catch (de) {}
      result.push({
        id:      ev.getId(),
        title:   ev.getTitle(),
        date:    Utilities.formatDate(ev.getStartTime(), tz, 'dd MMM yyyy'),
        dateRaw: Utilities.formatDate(ev.getStartTime(), tz, 'yyyy-MM-dd'),
        time:    ev.isAllDayEvent() ? 'All day' : Utilities.formatDate(ev.getStartTime(), tz, 'h:mm a'),
        endTime: ev.isAllDayEvent() ? '' : Utilities.formatDate(ev.getEndTime(), tz, 'h:mm a'),
        allDay:  ev.isAllDayEvent(),
        notes:   ev.getDescription() || '',
        location: ev.getLocation() || '',
        tags:    tags,
        duration: duration
      });
    }
    return result;
  } catch (e) { return []; }
}

function getTodos(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var tdSheet = ss.getSheetByName('ToDo');
  if (!tdSheet) return [];
  var tdVals = tdSheet.getDataRange().getValues();
  var tz     = Session.getScriptTimeZone();
  var result = [];
  for (var i = 1; i < tdVals.length; i++) {
    var row = tdVals[i]; if (toStr(row[5]).toLowerCase() === 'done') continue;
    result.push({
      rowNum:   i + 1,
      task:     toStr(row[1]),
      assignee: toStr(row[2]) || 'Everyone',
      due:      row[3] ? Utilities.formatDate(new Date(row[3]), tz, 'dd MMM yyyy') : '',
      dueRaw:   row[3] ? Utilities.formatDate(new Date(row[3]), tz, 'yyyy-MM-dd') : '',
      addedBy:  toStr(row[4]),
      status:   toStr(row[5]) || 'Open'
    });
  }
  return result;
}

function getExpensesData(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var expSheet = ss.getSheetByName('Expenses');
  if (!expSheet) return { rows: [], total: 0, byCategory: {}, byAccount: {}, history: [], lastMonthTotal: 0, familyTotal: 0, personalTotal: 0, familyByCategory: {}, personalByCategory: {}, familyHistory: [], personalHistory: [], lastMonthFamilyTotal: 0, lastMonthPersonalTotal: 0 };
  var eVals      = expSheet.getDataRange().getValues();
  var tz         = Session.getScriptTimeZone();
  
  var now        = new Date();
  var thisMonth  = now.getMonth();
  var thisYear   = now.getFullYear();
  
  var rows       = [];
  var total      = 0;
  var familyTotal = 0;
  var personalTotal = 0;
  var byCategory = {};
  var familyByCategory = {};
  var personalByCategory = {};
  var byAccount  = {};
  
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var last6Months = [];
  var familyHistory = [];
  var personalHistory = [];
  for (var m = 5; m >= 0; m--) {
    var d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var label = monthNames[d.getMonth()] + ' ' + String(d.getFullYear()).substring(2);
    last6Months.push({ key: key, label: label, total: 0 });
    familyHistory.push({ key: key, label: label, total: 0 });
    personalHistory.push({ key: key, label: label, total: 0 });
  }
  
  var lastMonthKey = '';
  var lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  lastMonthKey = lm.getFullYear() + '-' + String(lm.getMonth() + 1).padStart(2, '0');
  var lastMonthTotal = 0;
  var lastMonthFamilyTotal = 0;
  var lastMonthPersonalTotal = 0;
  
  for (var i = 1; i < eVals.length; i++) {
    var row = eVals[i];
    var rowDate = new Date(row[1]);
    if (isNaN(rowDate.getTime())) rowDate = new Date(row[0]);
    if (isNaN(rowDate.getTime())) continue;
    
    var amount = parseFloat(row[4]) || 0;
    var cat = toStr(row[3]) || 'Other';
    var acc = toStr(row[2]) || 'Family';
    var isPersonal = (acc === 'Personal Account');
    
    var rKey = rowDate.getFullYear() + '-' + String(rowDate.getMonth() + 1).padStart(2, '0');
    for (var h = 0; h < last6Months.length; h++) {
      if (last6Months[h].key === rKey) {
        last6Months[h].total += amount;
        if (isPersonal) {
          personalHistory[h].total += amount;
        } else {
          familyHistory[h].total += amount;
        }
        break;
      }
    }
    
    if (rKey === lastMonthKey) {
      lastMonthTotal += amount;
      if (isPersonal) {
        lastMonthPersonalTotal += amount;
      } else {
        lastMonthFamilyTotal += amount;
      }
    }
    
    if (rowDate.getMonth() === thisMonth && rowDate.getFullYear() === thisYear) {
      total += amount;
      byCategory[cat] = (byCategory[cat] || 0) + amount;
      byAccount[acc] = (byAccount[acc] || 0) + amount;
      
      if (isPersonal) {
        personalTotal += amount;
        personalByCategory[cat] = (personalByCategory[cat] || 0) + amount;
      } else {
        familyTotal += amount;
        familyByCategory[cat] = (familyByCategory[cat] || 0) + amount;
      }
      
      rows.push({
        rowNum: i + 1,
        date: Utilities.formatDate(rowDate, tz, 'dd MMM'),
        account: acc,
        category: cat,
        amount: amount,
        desc: toStr(row[5])
      });
    }
  }
  
  rows.reverse();
  return {
    rows: rows,
    total: total,
    byCategory: byCategory,
    byAccount: byAccount,
    history: last6Months,
    lastMonthTotal: lastMonthTotal,
    familyTotal: familyTotal,
    personalTotal: personalTotal,
    familyByCategory: familyByCategory,
    personalByCategory: personalByCategory,
    familyHistory: familyHistory,
    personalHistory: personalHistory,
    lastMonthFamilyTotal: lastMonthFamilyTotal,
    lastMonthPersonalTotal: lastMonthPersonalTotal
  };
}

function getBudgets(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var bdgSheet = ss.getSheetByName('Budgets');
  if (!bdgSheet) return [];
  var bdgVals  = bdgSheet.getDataRange().getValues();
  if (bdgVals.length <= 1) return [];
  
  var expSheet = ss.getSheetByName('Expenses');
  var eVals = expSheet ? expSheet.getDataRange().getValues() : [];
  var now = new Date(); var thisMonth = now.getMonth(); var thisYear = now.getFullYear();
  
  var budgets = [];
  for (var i = 1; i < bdgVals.length; i++) {
    var bRow = bdgVals[i]; if (!bRow[0]) continue;
    var gn = toStr(bRow[0]);
    var budgetAcc = toStr(bRow[2]) || 'Family';
    
    var spent = 0;
    var targetCategories = EXPENSE_GROUPS[gn] || [];
    
    for (var j = 1; j < eVals.length; j++) {
      var eRow = eVals[j];
      var eDate = new Date(eRow[1]); if (isNaN(eDate.getTime())) eDate = new Date(eRow[0]);
      if (eDate.getMonth() !== thisMonth || eDate.getFullYear() !== thisYear) continue;
      
      var eAcc = toStr(eRow[2]) || 'Family';
      if (eAcc.toLowerCase().indexOf(budgetAcc.toLowerCase()) === -1) continue;
      
      var eCat = toStr(eRow[3]) || 'Other';
      if (targetCategories.indexOf(eCat) !== -1) {
        spent += parseFloat(eRow[4]) || 0;
      }
    }
    
    budgets.push({ group: gn, budget: parseFloat(bRow[1]) || 0, spent: spent, account: budgetAcc, setBy: toStr(bRow[3]) });
  }
  return budgets;
}

function getBirthdays(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var bdSheet = ss.getSheetByName('Birthdays');
  if (!bdSheet) return [];
  var bdVals = bdSheet.getDataRange().getValues();
  var now    = new Date(); var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var tz     = Session.getScriptTimeZone();
  var result = [];
  for (var i = 1; i < bdVals.length; i++) {
    var row = bdVals[i]; if (!row[0] || !row[2]) continue;
    var parts = toStr(row[2]).split('-'); if (parts.length !== 2) continue;
    var month = parseInt(parts[0]) - 1; var day = parseInt(parts[1]);
    var eventThisYear = new Date(now.getFullYear(), month, day);
    var eventDate     = eventThisYear >= today ? eventThisYear : new Date(now.getFullYear() + 1, month, day);
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

function getMemories(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var memSheet = ss.getSheetByName('Memories');
  if (!memSheet) return [];
  var memVals = memSheet.getDataRange().getValues();
  var tz      = Session.getScriptTimeZone();
  var result  = [];
  for (var i = 1; i < memVals.length; i++) {
    var row = memVals[i]; if (!row[4]) continue;
    result.push({ rowNum: i + 1, loggedBy: toStr(row[0]), date: row[1] ? Utilities.formatDate(new Date(row[1]), tz, 'dd MMM yyyy') : '', type: toStr(row[2]) || 'Moment', person: toStr(row[3]) || 'Everyone', memory: toStr(row[4]) });
  }
  result.reverse();
  return result.slice(0, 20);
}

function getFertilityData(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var fertSheet = ss.getSheetByName('Fertility');
  if (!fertSheet) return {};
  var fertVals        = fertSheet.getDataRange().getValues();
  var lastPeriodStart = null; var lastPeriodEnd = null; var lastOvulation = null; var symptoms = [];
  var tz              = Session.getScriptTimeZone();
  for (var i = 1; i < fertVals.length; i++) {
    var row = fertVals[i]; var fType = toStr(row[2]); var fDate = row[1] ? new Date(row[1]) : null;
    if (fDate && isNaN(fDate.getTime())) fDate = null;
    if (fType === 'Period Start' && fDate) { if (!lastPeriodStart || fDate > lastPeriodStart) lastPeriodStart = fDate; }
    if (fType === 'Period End'   && fDate) { if (!lastPeriodEnd   || fDate > lastPeriodEnd)   lastPeriodEnd   = fDate; }
    if (fType === 'Ovulation'    && fDate) { if (!lastOvulation   || fDate > lastOvulation)   lastOvulation   = fDate; }
    if (fType === 'Symptom') symptoms.push({ date: fDate ? Utilities.formatDate(fDate, tz, 'dd MMM yyyy') : '', note: toStr(row[3]) });
  }
  var result = {};
  if (lastPeriodStart) {
    result.lastPeriodStart = Utilities.formatDate(lastPeriodStart, tz, 'dd MMM yyyy');
    var nextPeriod   = new Date(lastPeriodStart); nextPeriod.setDate(nextPeriod.getDate() + 28);
    var fertileStart = new Date(lastPeriodStart); fertileStart.setDate(fertileStart.getDate() + 10);
    var fertileEnd   = new Date(lastPeriodStart); fertileEnd.setDate(fertileEnd.getDate() + 16);
    result.nextPeriod   = Utilities.formatDate(nextPeriod,   tz, 'dd MMM yyyy');
    result.fertileStart = Utilities.formatDate(fertileStart, tz, 'dd MMM yyyy');
    result.fertileEnd   = Utilities.formatDate(fertileEnd,   tz, 'dd MMM yyyy');
  }
  if (lastPeriodEnd && lastPeriodStart) result.duration = Math.round((lastPeriodEnd - lastPeriodStart) / (1000 * 60 * 60 * 24));
  if (lastOvulation) result.lastOvulation = Utilities.formatDate(lastOvulation, tz, 'dd MMM yyyy');
  result.symptoms = symptoms.slice(-5).reverse();
  return result;
}

function getRecurring(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var recSheet = ss.getSheetByName('RecurringExpenses');
  if (!recSheet) return [];
  var recVals = recSheet.getDataRange().getValues();
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
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var travelSheet = ss.getSheetByName('Travel');
  if (!travelSheet) {
    travelSheet = ss.insertSheet('Travel');
    travelSheet.appendRow(['ID', 'Date', 'City', 'Country', 'Lat', 'Lng', 'Members', 'Notes', 'Timestamp']);
  }
  var vals = travelSheet.getDataRange().getValues();
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
  result.sort(function(a, b) {
    return b.dateRaw.localeCompare(a.dateRaw);
  });
  return result;
}

function getAppreciationsData(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Appreciations');
  if (!sheet) {
    sheet = ss.insertSheet('Appreciations');
    sheet.appendRow(['Timestamp', 'Sender', 'Recipient', 'Message', 'RevealDate']);
  }
  var vals = sheet.getDataRange().getValues();
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

function getLoveCheckinsData(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LoveCheckins');
  if (!sheet) {
    sheet = ss.insertSheet('LoveCheckins');
    sheet.appendRow(['Timestamp', 'User', 'Battery', 'Moods', 'Notes', 'Focus']);
  }
  var vals = sheet.getDataRange().getValues();
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
  return result;
}

// ============================================================
// HELPERS
// ============================================================
function parseEventDate(dateStr, timeStr) {
  dateStr = toStr(dateStr).trim(); timeStr = toStr(timeStr).trim();
  var now = new Date(); var year = now.getFullYear(); var parsed = null;
  var dmySlash = dateStr.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (dmySlash) { var yr = dmySlash[3] ? parseInt(dmySlash[3]) : year; if (yr < 100) yr += 2000; parsed = new Date(yr, parseInt(dmySlash[2]) - 1, parseInt(dmySlash[1])); }
  if (!parsed) {
    var dmy = dateStr.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{2,4}))?$/);
    if (dmy) {
      var months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
      var mo = months[dmy[2].toLowerCase().substring(0,3)];
      if (mo !== undefined) { var yr = dmy[3] ? parseInt(dmy[3]) : year; if (yr < 100) yr += 2000; parsed = new Date(yr, mo, parseInt(dmy[1])); }
    }
  }
  if (!parsed || isNaN(parsed.getTime())) parsed = new Date(dateStr);
  if (!parsed || isNaN(parsed.getTime())) parsed = new Date();
  if (timeStr && timeStr !== '') {
    var t12 = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i); var t24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (t12) { var h = parseInt(t12[1]); var min = t12[2] ? parseInt(t12[2]) : 0; var mer = t12[3].toLowerCase(); if (mer === 'pm' && h !== 12) h += 12; if (mer === 'am' && h === 12) h = 0; parsed.setHours(h, min, 0, 0); }
    else if (t24) { parsed.setHours(parseInt(t24[1]), parseInt(t24[2]), 0, 0); }
  } else { parsed.setHours(0, 0, 0, 0); }
  return parsed;
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function testCalendarConnection() {
  try { var cal = CalendarApp.getCalendarById(CALENDAR_ID); Logger.log('✅ Connected: ' + cal.getName()); }
  catch (e) { Logger.log('❌ Failed: ' + e); }
}

function testDigest() {
  sendMorningDigest(new Date());
  Logger.log('Digest sent — check email!');
}


// ============================================================
// PAYLAH SCANNER & APPROVAL SYSTEM
// ============================================================

function scanInboxForPayLah() {
  scanInboxForTransactions();
}

function parsePayLah(body) {
  var amtMatch = body.match(/Amount:\s*SGD\s*([\d\.]+)/i);
  var toMatch = body.match(/To:\s*(.+?)(?:\r|\n)/i);
  var dateMatch = body.match(/Date\s*&\s*Time:\s*(.+?)(?:\r|\n)/i);
  if (amtMatch && toMatch) {
    var amount = parseFloat(amtMatch[1]);
    var merchant = toMatch[1].trim();
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (dateMatch) {
      var dateParts = dateMatch[1].trim().split(/\s+/);
      if (dateParts.length >= 2) {
        dateStr = dateParts[0] + ' ' + dateParts[1] + ' ' + new Date().getFullYear();
      }
    }
    return { amount: amount, merchant: merchant, dateStr: dateStr };
  }
  return null;
}

function parseTrust(body) {
  var amtMatch = body.match(/spent\s+SGD\s+([\d\.]+)\s+at/i);
  var toMatch = body.match(/at\s+(.+?)\s+on\s+\d{1,2}\s+[a-z]{3}\s+\d{4}/i);
  var dateMatch = body.match(/on\s+(\d{1,2}\s+[a-z]{3}\s+\d{4})/i);
  if (amtMatch && toMatch) {
    var amount = parseFloat(amtMatch[1]);
    var merchant = toMatch[1].trim();
    merchant = merchant.replace(/\s+(Singapore SG|SG|Singapore)$/i, '').trim();
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (dateMatch) dateStr = dateMatch[1].trim();
    return { amount: amount, merchant: merchant, dateStr: dateStr };
  }
  return null;
}

function parseShopee(body) {
  var amtMatch = body.match(/(?:Amount Paid|Total Payment):\s*(?:S?\$|SGD)\s*([\d\.]+)/i);
  var orderMatch = body.match(/Order ID:\s*(#?\w+)/i);
  var dateMatch = body.match(/(?:Payment Date|Order Date):\s*(\d{1,2}\s+[a-z]{3}\s+\d{4})/i);
  var itemMatch = body.match(/^\s*1\.\s+(.+)$/m) || body.match(/1\.\s+(.+?)(?:\r|\n)/);
  if (amtMatch) {
    var amount = parseFloat(amtMatch[1]);
    var orderId = orderMatch ? orderMatch[1].trim() : '';
    var merchant = 'Shopee';
    if (itemMatch) {
      var itemName = itemMatch[1].trim();
      if (itemName.length > 50) itemName = itemName.substring(0, 47) + '...';
      merchant = 'Shopee: ' + itemName;
    } else if (orderId) {
      merchant = 'Shopee Order ' + orderId;
    }
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (dateMatch) dateStr = dateMatch[1].trim();
    return { amount: amount, merchant: merchant, dateStr: dateStr };
  }
  return null;
}

function parseDbsPayNow(body, msg) {
  var amtMatch = body.match(/(?:for|of|amount)?\s*(?:SGD|S?\$)\s*([\d\.,]+)/i);
  var toMatch = body.match(/to\s+([^.]+?)(?:\.|\r|\n|We are pleased|$)/i);
  var dateMatch = body.match(/dated\s+(\d{1,2}\s+[a-z]{3})/i) || body.match(/dated\s+(\d{1,2}\s+[a-z]{3}\s+\d{4})/i);
  
  if (!amtMatch && msg) {
    var subject = msg.getSubject();
    amtMatch = subject.match(/(?:SGD|S?\$)\s*([\d\.,]+)/i);
    if (!toMatch) toMatch = subject.match(/to\s+([^.]+?)$/i);
  }
  
  if (amtMatch) {
    var amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    var merchant = toMatch ? toMatch[1].trim() : 'DBS PayNow';
    merchant = merchant.replace(/\s+on\s+\d{1,2}\s+[a-z]{3}.*$/i, '').trim();
    
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (dateMatch) {
      var currentYear = new Date().getFullYear();
      dateStr = dateMatch[1].trim() + ' ' + currentYear;
    }
    return { amount: amount, merchant: merchant, dateStr: dateStr };
  }
  return null;
}

function parseGenericExpense(body, msg) {
  var amount = 0.0;
  var amtMatch = body.match(/(?:SGD|S?\$|USD)\s*([\d\.,]+)/i) || 
                 body.match(/Total(?:\s+Amount)?\s*:\s*(?:SGD|S?\$|USD)?\s*([\d\.,]+)/i) ||
                 body.match(/(?:Amount|Price)\s*:\s*(?:SGD|S?\$|USD)?\s*([\d\.,]+)/i);
  if (amtMatch) {
    var cleanAmt = amtMatch[1].replace(/,/g, '');
    amount = parseFloat(cleanAmt) || 0.0;
  }
  
  var merchant = '';
  var subject = msg ? msg.getSubject() : '';
  var fromName = msg ? msg.getFrom() : '';
  
  if (fromName) {
    var nameMatch = fromName.match(/^"?([^"<]+)"?\s*</);
    if (nameMatch) {
      merchant = nameMatch[1].trim();
    } else {
      merchant = fromName.trim();
    }
  }
  
  if (subject) {
    var cleanSubject = subject.replace(/^(?:Re|Fwd):\s*/i, '').trim();
    if (cleanSubject) {
      merchant = merchant ? merchant + ' (' + cleanSubject + ')' : cleanSubject;
    }
  }
  
  if (!merchant) {
    merchant = 'Generic Expense';
  }
  
  if (merchant.length > 50) {
    merchant = merchant.substring(0, 47) + '...';
  }
  
  var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
  if (msg) {
    try {
      var msgDate = msg.getDate();
      if (msgDate) {
        dateStr = msgDate.toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
      }
    } catch(e) {}
  }
  
  return { amount: amount, merchant: merchant, dateStr: dateStr };
}

function scanInboxForTransactions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pendingSheet = ss.getSheetByName('PendingExpenses');
  if (!pendingSheet) {
    pendingSheet = ss.insertSheet('PendingExpenses');
    pendingSheet.appendRow(['ID', 'Date', 'Account', 'Category', 'Amount', 'Note', 'Timestamp']);
  }
  
  var expSheet = ss.getSheetByName('Expenses');
  
  var label = GmailApp.getUserLabelByName('Expense-Processed');
  if (!label) {
    label = GmailApp.createLabel('Expense-Processed');
  }
  
  var templates = [
    {
      name: 'paylah',
      query: 'from:paylah.alert@dbs.com label:inbox',
      priority: 1,
      parse: parsePayLah
    },
    {
      name: 'dbs_paynow',
      query: 'from:ibanking.alert@dbs.com label:inbox',
      priority: 1,
      parse: parseDbsPayNow
    },
    {
      name: 'trust',
      query: 'from:from_us@trustbank.sg label:inbox',
      priority: 1,
      parse: parseTrust
    },
    {
      name: 'shopee',
      query: 'from:info@mail.shopee.sg label:inbox',
      priority: 2,
      parse: parseShopee
    },
    {
      name: 'expenses_label',
      query: 'label:inbox (label:expenses OR label:expense)',
      priority: 1,
      parse: function(body, msg) {
        var from = msg.getFrom().toLowerCase();
        if (from.indexOf('paylah.alert@dbs.com') !== -1) return parsePayLah(body);
        if (from.indexOf('ibanking.alert@dbs.com') !== -1) return parseDbsPayNow(body, msg);
        if (from.indexOf('from_us@trustbank.sg') !== -1) return parseTrust(body);
        if (from.indexOf('info@mail.shopee.sg') !== -1) return parseShopee(body);
        return parseGenericExpense(body, msg);
      }
    }
  ];
  
  templates.forEach(function(tpl) {
    var threads = GmailApp.search(tpl.query, 0, 10);
    threads.forEach(function(thread) {
      var messages = thread.getMessages();
      messages.forEach(function(msg) {
        if (msg.isStarred()) return;
        
        var body = msg.getPlainBody();
        var parsed = tpl.parse(body, msg);
        if (parsed) {
          var amount = parsed.amount;
          var merchant = parsed.merchant;
          if (merchant.toLowerCase().indexOf('fairprice') !== -1) {
            merchant = 'NTUC FairPrice';
          }
          var dateStr = parsed.dateStr;
          var details = proposeExpenseDetails(tpl.name === 'shopee' ? 'Shopee' : merchant);
          var category = details.category;
          var account = details.account;
          
          // Check for duplicate in logged Expenses
          var duplicateInLogged = findDuplicateInExpenses(expSheet, amount, dateStr);
          if (duplicateInLogged) {
            Logger.log('[' + tpl.name + '] Found duplicate in logged Expenses. Skipping.');
            msg.star();
            return;
          }
          
          // Check for duplicate in PendingExpenses
          var duplicateInPending = findDuplicateInPending(pendingSheet, amount, dateStr);
          if (duplicateInPending) {
            var existingId = duplicateInPending.id;
            var existingRowIdx = duplicateInPending.rowIdx;
            
            // If the new transaction is Shopee (priority 2) and the existing one is low-priority (priority 1)
            if (tpl.priority === 2 && (existingId.indexOf('p_paylah_') === 0 || existingId.indexOf('p_trust_') === 0)) {
              // Merge/enrich existing pending record
              pendingSheet.getRange(existingRowIdx, 4).setValue(category);
              pendingSheet.getRange(existingRowIdx, 6).setValue(merchant);
              var newId = 'p_shopee_' + existingId.split('_').slice(2).join('_');
              pendingSheet.getRange(existingRowIdx, 1).setValue(newId);
              
              Logger.log('[' + tpl.name + '] Merged duplicate. Updated pending row ' + existingRowIdx + ' with Shopee details.');
            } else {
              Logger.log('[' + tpl.name + '] Duplicate found in Pending. Skipping new notification.');
            }
          } else {
            // No duplicate: log new pending
            var id = 'p_' + tpl.name + '_' + Date.now() + '_' + Math.floor(Math.random()*1000);
            pendingSheet.appendRow([id, dateStr, account, category, amount, merchant, new Date()]);
            sendApprovalEmail(id, dateStr, amount, merchant, category, account);
            Logger.log('[' + tpl.name + '] Logged new pending transaction: ' + merchant + ' ($' + amount + ')');
          }
        }
        msg.star();
      });
      thread.addLabel(label);
      thread.moveToArchive();
    });
  });
}

function findDuplicateInPending(sheet, amount, dateStr) {
  if (!sheet) return null;
  var vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return null;
  
  var targetDate = parseEventDate(dateStr, '');
  if (!targetDate) return null;
  
  for (var i = 1; i < vals.length; i++) {
    var rowAmt = parseFloat(vals[i][4]) || 0;
    var rowDateStr = toStr(vals[i][1]);
    var rowDate = parseEventDate(rowDateStr, '');
    
    if (Math.abs(rowAmt - amount) < 0.01) {
      if (rowDate && Math.abs(rowDate.getTime() - targetDate.getTime()) <= 24 * 60 * 60 * 1000 * 1.5) {
        return { id: toStr(vals[i][0]), rowIdx: i + 1, rowData: vals[i] };
      }
    }
  }
  return null;
}

function findDuplicateInExpenses(sheet, amount, dateStr) {
  if (!sheet) return null;
  var vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return null;
  
  var targetDate = parseEventDate(dateStr, '');
  if (!targetDate) return null;
  
  for (var i = 1; i < vals.length; i++) {
    var rowAmt = parseFloat(vals[i][4]) || 0;
    var rowDateStr = toStr(vals[i][1]);
    var rowDate = parseEventDate(rowDateStr, '');
    
    if (Math.abs(rowAmt - amount) < 0.01) {
      if (rowDate && Math.abs(rowDate.getTime() - targetDate.getTime()) <= 24 * 60 * 60 * 1000 * 1.5) {
        return { rowIdx: i + 1, rowData: vals[i] };
      }
    }
  }
  return null;
}

function proposeCategory(merchant) {
  var mLower = merchant.toLowerCase();
  for (var groupName in EXPENSE_GROUPS) {
    var cats = EXPENSE_GROUPS[groupName];
    for (var c = 0; c < cats.length; c++) {
      var catLower = cats[c].toLowerCase();
      var subcatName = catLower.split(' - ').pop();
      if (mLower.indexOf(subcatName) !== -1 || subcatName.indexOf(mLower) !== -1) {
        return cats[c];
      }
    }
  }
  
  // Direct keyword fallbacks
  if (mLower.indexOf('grab') !== -1 || mLower.indexOf('gojek') !== -1 || mLower.indexOf('comfort') !== -1 || mLower.indexOf('transit') !== -1 || mLower.indexOf('mrt') !== -1) {
    return 'Transportation - Taxi/Grab';
  }
  if (mLower.indexOf('toast box') !== -1 || mLower.indexOf('starbucks') !== -1 || mLower.indexOf('mcdonald') !== -1 || mLower.indexOf('kopitiam') !== -1 || mLower.indexOf('food') !== -1 || mLower.indexOf('restaurant') !== -1) {
    return 'Eating Out - Lunch';
  }
  if (mLower.indexOf('fairprice') !== -1 || mLower.indexOf('cold storage') !== -1 || mLower.indexOf('supermarket') !== -1 || mLower.indexOf('sheng siong') !== -1) {
    return 'Household - Groceries';
  }
  return 'Misc';
}

function proposeExpenseDetails(merchant) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var expSheet = ss.getSheetByName('Expenses');
  
  var category = '';
  var account = 'Family';
  
  if (expSheet) {
    var vals = expSheet.getDataRange().getValues();
    var mLower = merchant.toLowerCase();
    for (var i = vals.length - 1; i >= 1; i--) {
      var pastNote = toStr(vals[i][5]).toLowerCase();
      var pastAcc = toStr(vals[i][2]);
      var pastCat = toStr(vals[i][3]);
      
      if (!pastNote || pastNote.trim().length < 2) continue;
      
      if (mLower.indexOf(pastNote) !== -1 || pastNote.indexOf(mLower) !== -1) {
        category = pastCat;
        account = pastAcc || 'Family';
        Logger.log('💡 Proposing details from past record: ' + pastNote + ' -> Cat: ' + category + ', Acc: ' + account);
        break;
      }
    }
  }
  
  if (!category) {
    category = proposeCategory(merchant);
  }
  
  return { category: category, account: account };
}

function sendApprovalEmail(id, dateStr, amount, merchant, category, account) {
  var webAppUrl = WEB_APP_URL;
  var approvalUrl = webAppUrl + '?action=confirm_expense_page&id=' + id;
  
  var sourceTitle = 'Expense';
  if (id.indexOf('p_paylah_') === 0) {
    sourceTitle = 'DBS PayLah!';
  } else if (id.indexOf('p_dbs_paynow_') === 0) {
    sourceTitle = 'DBS PayNow';
  } else if (id.indexOf('p_trust_') === 0) {
    sourceTitle = 'Trust Bank';
  } else if (id.indexOf('p_shopee_') === 0) {
    sourceTitle = 'Shopee';
  } else if (id.indexOf('p_expenses_label_') === 0) {
    sourceTitle = 'Tagged Expense';
  }
  
  var subject = '❓ Confirm ' + sourceTitle + ': $' + amount.toFixed(2) + ' at ' + merchant;
  var htmlBody = '<div style="font-family:sans-serif;max-width:400px;border:1px solid #e4e6ef;border-radius:10px;padding:20px;background:#f9f9fb;">' +
                 '<h3 style="color:#2c7a4b;margin-top:0;border-bottom:1px solid #e4e6ef;padding-bottom:10px;">' + sourceTitle + ' Detected</h3>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Merchant:</strong> ' + merchant + '</p>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Amount:</strong> $' + amount.toFixed(2) + '</p>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Date:</strong> ' + dateStr + '</p>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Proposed Account:</strong> ' + account + '</p>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Proposed Category:</strong> ' + category + '</p>' +
                 '<div style="margin-top:20px;text-align:center;">' +
                   '<a href="' + approvalUrl + '" style="background:#4f86c6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;font-size:14px;">Verify & Log Expense</a>' +
                 '</div>' +
                 '</div>';
  var plainBody = htmlBody.replace(/<[^>]+>/g, '').replace(/\n\n+/g, '\n').trim();
  try {
    MailApp.sendEmail({ to: "marcuswongjw@gmail.com", subject: subject, body: plainBody, htmlBody: htmlBody });
    Logger.log('✅ email sent to: marcuswongjw@gmail.com');
  } catch (err) {
    Logger.log('❌ email failed (marcuswongjw@gmail.com): ' + err);
  }
}

function renderConfirmExpensePage(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('PendingExpenses');
  if (!sheet) {
    return HtmlService.createHtmlOutput('<h3 style="font-family:sans-serif;text-align:center;margin-top:50px;color:#d9534f;">Error: PendingExpenses sheet not found.</h3>')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  
  var vals = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < vals.length; i++) {
    if (toStr(vals[i][0]) === id) { rowIdx = i + 1; break; }
  }
  
  if (rowIdx === -1) {
    return HtmlService.createHtmlOutput('<h3 style="font-family:sans-serif;color:#e74c3c;text-align:center;margin-top:50px;padding:20px;">This transaction has already been logged or dismissed.</h3>')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  
  var dateStr = toStr(vals[rowIdx-1][1]);
  var acc     = toStr(vals[rowIdx-1][2]);
  var cat     = toStr(vals[rowIdx-1][3]);
  var amt     = parseFloat(vals[rowIdx-1][4]) || 0;
  var desc    = toStr(vals[rowIdx-1][5]);
  
  // Build category options grouped
  var groupOptionsHtml = '';
  for (var grp in EXPENSE_GROUPS) {
    groupOptionsHtml += '<optgroup label="' + grp + '">';
    var cats = EXPENSE_GROUPS[grp];
    for (var c = 0; c < cats.length; c++) {
      var sel = (cats[c] === cat) ? ' selected' : '';
      groupOptionsHtml += '<option value="' + cats[c] + '"' + sel + '>' + cats[c] + '</option>';
    }
    groupOptionsHtml += '</optgroup>';
  }
  
  var webAppUrl = WEB_APP_URL;
  
  var html = '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<style>' +
        '* { box-sizing: border-box; }' +
        'body { font-family:-apple-system,BlinkMacSystemFont,sans-serif; background:#f5f6fa; color:#1a1a2e; padding:12px; margin:0; }' +
        '.card { background:#fff; border-radius:14px; border:1px solid #e4e6ef; padding:20px; max-width:480px; width:100%; margin:20px auto; box-shadow:0 4px 12px rgba(0,0,0,0.05); }' +
        'h3 { margin-top:0; color:#2c7a4b; text-align:center; }' +
        '.field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }' +
        'label { font-size:12px; font-weight:600; color:#5a5a72; }' +
        'input, select { padding:10px 12px; border:1.5px solid #e4e6ef; border-radius:8px; font-size:14px; outline:none; box-sizing:border-box; width:100%; }' +
        'input:focus, select:focus { border-color:#4f86c6; }' +
        '.btn-row { display:flex; gap:10px; margin-top:20px; }' +
        'button { flex:1; padding:12px; border:none; border-radius:8px; font-weight:600; font-size:14px; cursor:pointer; }' +
        '.btn-p { background:#4f86c6; color:#fff; }' +
        '.btn-s { background:#fdeaea; color:#b83232; }' +
      '</style>' +
    '</head>' +
    '<body>' +
      '<div class="card">' +
        '<h3>Verify PayLah! Expense</h3>' +
        '<form id="exp-form">' +
          '<input type="hidden" name="id" value="' + id + '">' +
          '<div class="field"><label>Description</label><input type="text" name="desc" value="' + desc + '"></div>' +
          '<div class="field"><label>Amount ($)</label><input type="number" step="0.01" name="amount" value="' + amt.toFixed(2) + '"></div>' +
          '<div class="field"><label>Date</label><input type="text" name="date" value="' + dateStr + '"></div>' +
          '<div class="field"><label>Account</label>' +
            '<select name="account">' +
              '<option value="Family" ' + (acc === 'Family' ? 'selected' : '') + '>Family</option>' +
              '<option value="Personal Account" ' + (acc === 'Personal Account' ? 'selected' : '') + '>Personal Account</option>' +
            '</select>' +
          '</div>' +
          '<div class="field"><label>Category</label>' +
            '<select name="category">' + groupOptionsHtml + '</select>' +
          '</div>' +
          '<div class="btn-row">' +
            '<button type="button" class="btn-s" onclick="submitForm(\'reject\')">Dismiss</button>' +
            '<button type="button" class="btn-p" onclick="submitForm(\'approve\')">Log Expense</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
      '<script>' +
        'function submitForm(action) {' +
          'var form = document.getElementById(\'exp-form\');' +
          'var formData = new FormData(form);' +
          'var query = \'?action=submit_confirmed_expense&status=\' + action;' +
          'formData.forEach(function(value, key){' +
            'query += \'&\' + encodeURIComponent(key) + \'=\' + encodeURIComponent(value);' +
          '});' +
          'document.body.innerHTML = \'<div style="text-align:center;margin-top:100px;font-family:sans-serif;color:#666;">Processing...</div>\';' +
          'var s = document.createElement(\'script\');' +
          's.src = \'' + webAppUrl + '\' + query + \'&callback=onDone\';' +
          'document.body.appendChild(s);' +
        '}' +
        'window.onDone = function(r) {' +
          'if (r && r.status === \'ok\') {' +
            'document.body.innerHTML = \'<div class="card" style="text-align:center;"><h3 style="color:#2c7a4b;">Success!</h3><p>\' + r.message + \'</p></div>\';' +
          '} else {' +
            'document.body.innerHTML = \'<div class="card" style="text-align:center;"><h3 style="color:#e74c3c;">Error</h3><p>\' + (r ? r.message : \'Unknown error\') + \'</p></div>\';' +
          '}' +
        '}' +
      '</script>' +
    '</body>' +
    '</html>';
  return HtmlService.createHtmlOutput(html).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function handleSubmitConfirmedExpense(params) {
  var id = params.id;
  var status = params.status;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pendingSheet = ss.getSheetByName('PendingExpenses');
  if (!pendingSheet) return { status: 'error', message: 'PendingExpenses sheet not found' };
  
  var vals = pendingSheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < vals.length; i++) {
    if (toStr(vals[i][0]) === id) { rowIdx = i + 1; break; }
  }
  
  if (rowIdx === -1) {
    return { status: 'error', message: 'This transaction was already processed' };
  }
  
  if (status === 'approve') {
    var desc = params.desc;
    var amount = parseFloat(params.amount) || 0;
    var dateStr = params.date;
    var account = params.account;
    var category = params.category;
    
    var expSheet = ss.getSheetByName('Expenses');
    if (!expSheet) {
      expSheet = ss.insertSheet('Expenses');
      expSheet.appendRow(['Timestamp', 'Date', 'Account', 'Category', 'Amount', 'Note']);
    }
    
    var parsedDate = parseEventDate(dateStr, '');
    
    // Log to Expenses
    expSheet.appendRow([new Date(), parsedDate, account, category, amount, desc]);
    
    // Sort Expenses
    var lastRow = expSheet.getLastRow();
    if (lastRow > 2) {
      expSheet.getRange(2, 1, lastRow - 1, expSheet.getLastColumn()).sort({ column: 2, ascending: true });
    }
    
    // Remove from PendingExpenses
    pendingSheet.deleteRow(rowIdx);
    
    return { status: 'ok', message: 'Expense of $' + amount.toFixed(2) + ' logged to ' + category + '!' };
  } else {
    // Just remove from Pending
    pendingSheet.deleteRow(rowIdx);
    return { status: 'ok', message: 'PayLah! expense dismissed.' };
  }
}

function testPayLahScanner() {
  testAllScanners();
}

function testAllScanners() {
  var mockPayLah = 'Transaction Alerts\n' +
                   'Transaction Ref: IPS78160863519729871\n' +
                   'Dear Sir / Madam,\n' +
                   'We refer to your PayLah! Scan & Pay Transfer dated 16 Jun. We are pleased to confirm that the transaction was completed.\n' +
                   'Date & Time:\t16 Jun 19:17 (SGT)\n' +
                   'Amount:\tSGD10.50\n' +
                   'From:\tPayLah! Wallet (Mobile ending 4128)\n' +
                   'To:\tTOAST BOX COFFEE SHOP\n';
                   
  var mockTrust = "You've spent SGD 1.60 at YHS VENDING MACHINE Singapore SG on 14 Jun 2026 14:14SGT with Trust Cashback card. You'll receive estimated S$0.02 cashback and up to 15% bonus cashback*. Not you? Alert us via the Trust App.";
  
  var mockShopee = "Hi marcuswong789,\n" +
                   "Your payment for order #260609M02BTMY7 has been confirmed. The seller has also been notified.\n\n" +
                   "ORDER DETAILS\n" +
                   "Order ID: #260609M02BTMY7\n" +
                   "Order Date: 09 Jun 2026 14:54:36\n" +
                   "Seller: dtfnbvbrd3\n\n" +
                   "1. [100%Original] Owala FreeSip 24/32oz Stainless-Steel Water Bottle with LockingPush-Button Lid\n" +
                   "Variation: Zootopia-Pink,24oz (710ml)\n" +
                   "Quantity: 1\n" +
                   "Price: S$31.00\n\n" +
                   "Merchandise Subtotal: S$31.00\n" +
                   "Total Payment: S$18.90\n\n" +
                   "PAYMENT DETAILS\n" +
                   "Payment Method: Mari Credit Card Instant Checkout\n" +
                   "Payment Date: 09 Jun 2026 14:54:39\n" +
                   "Amount Paid: S$18.90";
                   
  Logger.log('=== TEST: PAYLAH SCANNER ===');
  var paylahMatch = mockPayLah.match(/Amount:\s*SGD\s*([\d\.]+)/i);
  var paylahTo = mockPayLah.match(/To:\s*(.+?)(?:\r|\n)/i);
  var paylahDate = mockPayLah.match(/Date\s*&\s*Time:\s*(.+?)(?:\r|\n)/i);
  if (paylahMatch && paylahTo) {
    var amt = parseFloat(paylahMatch[1]);
    var merchant = paylahTo[1].trim();
    var dateStr = '16 Jun ' + new Date().getFullYear();
    if (paylahDate) {
      var parts = paylahDate[1].trim().split(/\s+/);
      if (parts.length >= 2) dateStr = parts[0] + ' ' + parts[1] + ' ' + new Date().getFullYear();
    }
    Logger.log('PayLah - Parsed successfully! Amt: ' + amt + ', Merchant: ' + merchant + ', Date: ' + dateStr + ', Cat: ' + proposeCategory(merchant));
  } else {
    Logger.log('PayLah - Parsing failed');
  }

  Logger.log('=== TEST: TRUST SCANNER ===');
  var trustAmt = mockTrust.match(/spent\s+SGD\s+([\d\.]+)\s+at/i);
  var trustTo = mockTrust.match(/at\s+(.+?)\s+on\s+\d{1,2}\s+[a-z]{3}\s+\d{4}/i);
  var trustDate = mockTrust.match(/on\s+(\d{1,2}\s+[a-z]{3}\s+\d{4})/i);
  if (trustAmt && trustTo) {
    var amt = parseFloat(trustAmt[1]);
    var merchant = trustTo[1].trim();
    merchant = merchant.replace(/\s+(Singapore SG|SG|Singapore)$/i, '').trim();
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (trustDate) dateStr = trustDate[1].trim();
    Logger.log('Trust - Parsed successfully! Amt: ' + amt + ', Merchant: ' + merchant + ', Date: ' + dateStr + ', Cat: ' + proposeCategory(merchant));
  } else {
    Logger.log('Trust - Parsing failed');
  }

  Logger.log('=== TEST: SHOPEE SCANNER ===');
  var shopeeAmt = mockShopee.match(/(?:Amount Paid|Total Payment):\s*(?:S?\$|SGD)\s*([\d\.]+)/i);
  var shopeeOrder = mockShopee.match(/Order ID:\s*(#?\w+)/i);
  var shopeeDate = mockShopee.match(/(?:Payment Date|Order Date):\s*(\d{1,2}\s+[a-z]{3}\s+\d{4})/i);
  var shopeeItem = mockShopee.match(/^\s*1\.\s+(.+)$/m) || mockShopee.match(/1\.\s+(.+?)(?:\r|\n)/);
  if (shopeeAmt) {
    var amt = parseFloat(shopeeAmt[1]);
    var orderId = shopeeOrder ? shopeeOrder[1].trim() : '';
    var merchant = 'Shopee';
    if (shopeeItem) {
      var itemName = shopeeItem[1].trim();
      if (itemName.length > 50) itemName = itemName.substring(0, 47) + '...';
      merchant = 'Shopee: ' + itemName;
    } else if (orderId) {
      merchant = 'Shopee Order ' + orderId;
    }
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (shopeeDate) dateStr = shopeeDate[1].trim();
    Logger.log('Shopee - Parsed successfully! Amt: ' + amt + ', Merchant: ' + merchant + ', Date: ' + dateStr + ', Cat: ' + proposeCategory('Shopee'));
  } else {
    Logger.log('Shopee - Parsing failed');
  }
}

function addApprovedTrips() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Travel');
  if (!sheet) {
    sheet = ss.insertSheet('Travel');
    sheet.appendRow(['ID', 'Date', 'City', 'Country', 'Lat', 'Lng', 'Members', 'Notes', 'Timestamp']);
  }
  var trips = [
    { city: 'Melbourne', country: 'Australia', date: '2018-06-01', lat: -37.8136, lng: 144.9631, members: 'Marcus,Eleanor,Mikaela' },
    { city: 'Tokyo', country: 'Japan', date: '2018-12-01', lat: 35.6762, lng: 139.6503, members: 'Marcus,Eleanor,Mikaela' },
    { city: 'Fukuoka', country: 'Japan', date: '2025-07-01', lat: 33.5902, lng: 130.4017, members: 'Marcus,Eleanor' },
    { city: 'Hanoi', country: 'Vietnam', date: '2024-06-01', lat: 21.0285, lng: 105.8542, members: 'Marcus,Eleanor,Mikaela,Meaghan' },
    { city: 'Langkawi', country: 'Malaysia', date: '2024-12-01', lat: 6.35, lng: 99.8, members: 'Marcus,Eleanor,Mikaela,Meaghan' },
    { city: 'Shanghai', country: 'China', date: '2023-12-01', lat: 31.2304, lng: 121.4737, members: 'Marcus,Eleanor,Mikaela,Meaghan' },
    { city: 'Qingdao', country: 'China', date: '2025-09-01', lat: 36.0671, lng: 120.3826, members: 'Marcus,Eleanor,Mikaela,Meaghan' }
  ];
  
  var existing = sheet.getDataRange().getValues();
  var existingKeys = {};
  for (var i = 1; i < existing.length; i++) {
    var key = existing[i][2] + '|' + existing[i][3] + '|' + Utilities.formatDate(new Date(existing[i][1]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    existingKeys[key] = true;
  }
  
  for (var j = 0; j < trips.length; j++) {
    var t = trips[j];
    var key = t.city + '|' + t.country + '|' + t.date;
    if (!existingKeys[key]) {
      var id = 'tr_' + Date.now() + '_' + Math.floor(Math.random()*1000);
      sheet.appendRow([id, new Date(t.date), t.city, t.country, t.lat, t.lng, t.members, 'Logged via batch script', new Date()]);
      Utilities.sleep(50);
    }
  }
}
