// ============================================================
// WONG FAMILY BOT — Google Apps Script (PWA Version)
// with Firebase ID token verification
// Google Calendar ID: family09091668338066744284@group.calendar.google.com
// ============================================================

// ─── HARDCODED DEFAULTS (overridden by Script Properties) ───
var DEFAULT_CALENDAR_ID    = "family09091668338066744284@group.calendar.google.com";
var DEFAULT_WEB_APP_URL    = "https://script.google.com/macros/s/AKfycbwQzpqQRRnK_PJRIbKWvPRhFVrQbfLEORciIRijBSwiz7WkX-7Ik2vTrZzE9VZ7Nehr/exec";
var DEFAULT_NOTIFY_EMAILS  = ["marcuswongjw@gmail.com", "eleanor.jiamin@gmail.com"];
var DEFAULT_FIREBASE_API_KEY = "AIzaSyAapGliVr1bcKa5ESvIPpT1VvPIHb0uwD0";
// Only these accounts may read or write via the API. A valid Firebase
// token alone is NOT enough — anyone who self-registers on the Firebase
// project would otherwise pass verification.
var DEFAULT_ALLOWED_EMAILS = [
  "marcuswongjw@gmail.com",
  "eleanor.jiamin@gmail.com",
  "mikaelawonght@gmail.com",
  "meaghanwongzx@gmail.com"
];
// Parents only — Us sanctuary, fertility, bucket list (server-enforced).
var DEFAULT_ADULT_EMAILS = [
  "marcuswongjw@gmail.com",
  "eleanor.jiamin@gmail.com"
];
// Canonical email → display name. Client-supplied "user" is never trusted.
var DEFAULT_EMAIL_TO_MEMBER = {
  "marcuswongjw@gmail.com": "Marcus",
  "eleanor.jiamin@gmail.com": "Eleanor",
  "mikaelawonght@gmail.com": "Mikaela",
  "meaghanwongzx@gmail.com": "Meaghan"
};

// ─── SCRIPT PROPERTIES HELPER ──────────────────────────────
function getScriptProperty(key, defaultValue) {
  try {
    var val = PropertiesService.getScriptProperties().getProperty(key);
    if (val) return val;
  } catch (e) { /* ignore */ }
  return defaultValue;
}

// ─── LOAD CONFIG FROM SCRIPT PROPERTIES ────────────────────
var CONFIG = {
  CALENDAR_ID:    getScriptProperty('CALENDAR_ID', DEFAULT_CALENDAR_ID),
  WEB_APP_URL:    getScriptProperty('WEB_APP_URL', DEFAULT_WEB_APP_URL),
  NOTIFY_EMAILS:  getScriptProperty('NOTIFY_EMAILS', DEFAULT_NOTIFY_EMAILS.join(',')).split(',').map(function(s){ return s.trim(); }),
  FIREBASE_API_KEY: getScriptProperty('FIREBASE_API_KEY', DEFAULT_FIREBASE_API_KEY),
  ALLOWED_EMAILS: getScriptProperty('ALLOWED_EMAILS', DEFAULT_ALLOWED_EMAILS.join(',')).split(',').map(function(s){ return s.trim().toLowerCase(); }),
  ADULT_EMAILS:   getScriptProperty('ADULT_EMAILS', DEFAULT_ADULT_EMAILS.join(',')).split(',').map(function(s){ return s.trim().toLowerCase(); }),
  APPROVAL_EMAIL: getScriptProperty('APPROVAL_EMAIL', 'marcuswongjw@gmail.com'),
  APPROVAL_SECRET: getScriptProperty('APPROVAL_SECRET', '')
};

var CALENDAR_ID    = CONFIG.CALENDAR_ID;
var WEB_APP_URL    = CONFIG.WEB_APP_URL;
var NOTIFY_EMAILS  = CONFIG.NOTIFY_EMAILS;
var FIREBASE_API_KEY = CONFIG.FIREBASE_API_KEY || DEFAULT_FIREBASE_API_KEY;
var ALLOWED_EMAILS = CONFIG.ALLOWED_EMAILS;
var ADULT_EMAILS   = CONFIG.ADULT_EMAILS;
var APPROVAL_EMAIL = CONFIG.APPROVAL_EMAIL;
var APPROVAL_SECRET = CONFIG.APPROVAL_SECRET;

// ─── FAMILY MEMBERS & EXPENSE GROUPS ────────────────────────
var FAMILY_MEMBERS = ["Mikaela", "Meaghan", "Eleanor", "Marcus", "Everyone"];
var EMAIL_TO_MEMBER = DEFAULT_EMAIL_TO_MEMBER;
// Adult-only write actions (Us / fertility / couple bucket list)
var ADULT_ONLY_NOTES = [
  'add_appreciation', 'add_love_checkin', 'add_fertility',
  'add_bucket_item', 'toggle_bucket_item', 'delete_bucket_item',
  'add_intimacy', 'delete_intimacy'
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

// ─── IDENTITY & ROLE HELPERS ──────────────────────────────
function isAllowedEmail_(email) {
  return ALLOWED_EMAILS.indexOf(toStr(email).toLowerCase()) !== -1;
}

function isAdultEmail_(email) {
  return ADULT_EMAILS.indexOf(toStr(email).toLowerCase()) !== -1;
}

/** Map verified Firebase email → family display name. Never trust client. */
function memberNameFromEmail_(email) {
  var key = toStr(email).toLowerCase();
  if (EMAIL_TO_MEMBER[key]) return EMAIL_TO_MEMBER[key];
  return null;
}

// ─── EXPENSE APPROVAL SIGNING ─────────────────────────────
// Links in approval emails carry id + exp + HMAC so guessing pending
// IDs is not enough to approve/reject expenses.
function getApprovalSecret_() {
  if (APPROVAL_SECRET) return APPROVAL_SECRET;
  // Stable fallback so signing works without extra setup. Prefer setting
  // Script Property APPROVAL_SECRET to a long random string in production.
  return 'familylog-approval-v1|' + FIREBASE_API_KEY + '|' + WEB_APP_URL;
}

function makeApprovalSig_(id, exp) {
  var payload = toStr(id) + '|' + toStr(exp);
  var raw = Utilities.computeHmacSha256Signature(payload, getApprovalSecret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

/** Build signed query params for an approval link (7-day expiry). */
function buildApprovalToken_(id) {
  var exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  return { id: id, exp: String(exp), sig: makeApprovalSig_(id, String(exp)) };
}

function verifyApprovalToken_(id, exp, sig) {
  if (!id || !exp || !sig) return false;
  var expNum = parseInt(exp, 10);
  if (!expNum || isNaN(expNum)) return false;
  if (expNum < Math.floor(Date.now() / 1000)) return false;
  var expected = makeApprovalSig_(id, String(expNum));
  // Constant-time-ish compare
  if (expected.length !== toStr(sig).length) return false;
  var ok = true;
  for (var i = 0; i < expected.length; i++) {
    if (expected.charAt(i) !== sig.charAt(i)) ok = false;
  }
  return ok;
}

// ─── FIREBASE TOKEN VERIFICATION ──────────────────────────

// Verifies the token with Firebase AND checks the resulting email
// against the family allowlist. Results are cached for 10 minutes
// (keyed by a hash of the token) so chat polling doesn't spend one
// UrlFetchApp call per request — that quota is shared with the daily
// digest, verse fetch, and expense scanner.
function verifyFirebaseToken(idToken) {
  if (!idToken) {
    console.log('❌ No token provided');
    return null;
  }
  var cache = null, cacheKey = null;
  try {
    cache = CacheService.getScriptCache();
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken);
    cacheKey = 'tok_' + Utilities.base64EncodeWebSafe(digest);
    var cached = cache.get(cacheKey);
    if (cached === '__denied__') return null;
    if (cached) return cached;
  } catch (e) { /* cache unavailable — fall through to live check */ }

  var email = null;
  try {
    var url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY;
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());
    if (result.users && result.users.length > 0) {
      email = result.users[0].email;
    } else if (result.error) {
      console.log('❌ Firebase error: ' + result.error.message);
    }
  } catch (e) {
    console.log('❌ Token verification error: ' + e.toString());
  }

  if (email && !isAllowedEmail_(email)) {
    console.log('❌ Verified account is not in the family allowlist: ' + email);
    email = null;
  } else if (email) {
    console.log('✅ Token verified for: ' + email);
  }

  try { if (cache && cacheKey) cache.put(cacheKey, email || '__denied__', 600); } catch (e) {}
  return email;
}

function respondJSONP(data, callback) {
  var json = JSON.stringify(data);
  // The callback name is echoed into an executable JS response, so it
  // must be a plain identifier — anything else is a script injection.
  if (callback && /^[A-Za-z0-9_$.]+$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// HTML-escape for values interpolated into served pages and emails.
function escapeHtml_(s) {
  return toStr(s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

// ============================================================
// EMAIL HELPERS
// ============================================================
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
  } catch (e) { console.log('Calendar error: ' + e); }

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

// new Date(year, 1, 29) silently rolls to Mar 1 in non-leap years;
// celebrate Feb-29 birthdays on Feb 28 instead.
function annualEventDate_(year, month, day) {
  var d = new Date(year, month, day);
  if (month === 1 && day === 29 && d.getMonth() !== 1) d = new Date(year, 1, 28);
  return d;
}

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
    sendFamilyEmail('🎂 Wong Family — Birthday Reminder', body);
  }
}

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
  sendFamilyEmail('📊 Wong Family — Budget Alert', body);
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
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var fertSheet = ss.getSheetByName('Fertility'); if (!fertSheet) return;
  var fertVals  = fertSheet.getDataRange().getValues();
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
    // No sheet re-sort — see the note in add_expense.
    var body = _h('h2', '🔄 Recurring Expenses Logged', 'font-family:sans-serif;color:#333;');
    var items = '';
    logged.forEach(function(r) { items += _li('<strong>' + r.name + '</strong> — $' + r.amount.toFixed(2) + ' (' + r.account + ')'); });
    body += '<ul style="font-family:sans-serif;color:#333;padding-left:20px;">' + items + '</ul>';
    body += _h('p', 'These have been automatically added to your expenses.', 'font-family:sans-serif;color:#888;font-size:13px;');
    sendFamilyEmail('🔄 Wong Family — Recurring Expenses Logged', body);
  }
}

function keepAlive() {
  console.log('keepAlive — no external server to ping');
}

// ============================================================
// DOGET / DOPOST
// ============================================================
function doGet(e) {
  try {
    var action   = e && e.parameter && e.parameter.action   ? e.parameter.action   : '';
    var callback = e && e.parameter && e.parameter.callback ? e.parameter.callback : '';
    var idToken  = e && e.parameter && e.parameter.idToken  ? e.parameter.idToken  : '';
    var verifiedEmail = null;

    // Default-deny: EVERY action requires a verified family token except
    // the expense-approval endpoints, which are opened from signed email links.
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

    var output;
    switch (action) {
      case 'get_all':       output = getAllDashboardData(verifiedEmail); break;
      // Chat lives in Firestore only — Sheets chat endpoints removed
      case 'get_chat':
        output = { status: 'error', message: 'Chat is served from Firestore, not Sheets.' };
        break;
      case 'get_events':    output = getEvents();           break;
      case 'get_todos':     output = getTodos();            break;
      case 'get_expenses':  output = getExpensesData();     break;
      case 'get_budgets':   output = getBudgets();          break;
      case 'get_birthdays': output = getBirthdays();        break;
      case 'get_memories':  output = getMemories();         break;
      case 'get_fertility':
        output = isAdultEmail_(verifiedEmail) ? getFertilityData() : [];
        break;
      case 'get_recurring': output = getRecurring();        break;
      case 'get_travel':    output = getTravelData();       break;
      case 'submit_confirmed_expense':
        output = handleSubmitConfirmedExpense(e.parameter);
        break;
      case 'write':
        var writeData = {};
        try { writeData = JSON.parse(e.parameter.data || '{}'); } catch(pe) {}
        writeData._verifiedEmail = verifiedEmail;
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

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    // The token is mandatory. The old check only ran `if (data.idToken)`,
    // so omitting the token skipped verification entirely — an
    // unauthenticated write path for anyone who knew the URL.
    var verified = verifyFirebaseToken(data.idToken);
    if (!verified) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Prefer POST for all app traffic so idTokens never appear in URLs / proxy logs.
    var action = toStr(data.action).toLowerCase().trim();
    if (action === 'get_all') {
      return ContentService.createTextOutput(JSON.stringify(getAllDashboardData(verified)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Default: write (note field). Explicit action=write also accepted.
    data._verifiedEmail = verified;
    var result = handleWrite(data);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.log('❌ doPost error: ' + err.stack);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Internal server error' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// HANDLE WRITE (with all existing + new endpoints)
// ============================================================
// All mutations run under a script lock so two family members writing
// at the same moment can't interleave read-modify-write sequences
// (e.g. a delete-by-row landing while another handler is mid-update).
function handleWrite(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
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
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet  = ss.getSheetByName('Log') || ss.insertSheet('Log');
  var note      = toStr(data.note);
  var noteLower = note.toLowerCase().trim();

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

  // ---- Helper validation functions ----
  function validateDate(d) {
    if (!d) return true;
    // Uses the strict parser: the lenient parseEventDate falls back to
    // "today" on garbage input, which made this check always pass and
    // silently logged wrong dates.
    return parseEventDateStrict(d, '') !== null;
  }
  function validateAmount(a) {
    var num = parseFloat(a);
    return !isNaN(num) && num >= 0;
  }
  function validateString(s, maxLen) {
    maxLen = maxLen || 500;
    return s.length <= maxLen;
  }

  try {
    // ── EVENT: add ──
    if (noteLower === 'add_event') {
      var title = toStr(data.event_title) || 'Untitled Event';
      var dateStr = toStr(data.event_date);
      var timeStr = toStr(data.event_time);
      var endTimeStr = toStr(data.event_end_time);
      var eventLocation = toStr(data.event_location);
      var eventNotes = toStr(data.event_notes);

      if (!validateDate(dateStr)) {
        return { status: 'error', message: 'Invalid event date' };
      }
      if (!validateString(title, 100)) {
        return { status: 'error', message: 'Event title too long' };
      }
      if (!validateString(eventLocation, 200)) {
        return { status: 'error', message: 'Location too long' };
      }
      if (!validateString(eventNotes, 1000)) {
        return { status: 'error', message: 'Notes too long' };
      }

      var isAllDay = !timeStr || timeStr === '';
      var startDate = parseEventDate(dateStr, timeStr);
      var endDate;
      if (isAllDay) { endDate = new Date(startDate); endDate.setDate(endDate.getDate() + 1); }
      else if (endTimeStr) { endDate = parseEventDate(dateStr, endTimeStr); if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1); }
      else { endDate = new Date(startDate.getTime() + 60 * 60 * 1000); }

      var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
      var createdEvent = isAllDay
        ? calendar.createAllDayEvent(title, startDate, { description: eventNotes || '', location: eventLocation || '' })
        : calendar.createEvent(title, startDate, endDate, { description: eventNotes || '', location: eventLocation || '' });

      var calSheet = ss.getSheetByName('Calendar');
      if (!calSheet) { calSheet = ss.insertSheet('Calendar'); calSheet.appendRow(['Title', 'Date', 'Time', 'Added By', 'Notes', 'Google Event ID']); }
      var calNotes = eventNotes;
      if (eventLocation) calNotes = (calNotes ? calNotes + '\n' : '') + 'Location: ' + eventLocation;
      calSheet.appendRow([title, startDate, timeStr, user, calNotes, createdEvent.getId()]);
      console.log('✅ Event added: ' + title);
      return { status: 'ok', id: createdEvent.getId() };
    }

    // ── EVENT: delete ──
    if (noteLower === 'delete_event') {
      var eventId = toStr(data.event_id);
      if (!eventId) return { status: 'error', message: 'Missing event ID' };
      var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
      var ev = calendar.getEventById(eventId);
      if (ev) ev.deleteEvent();
      var calSheet = ss.getSheetByName('Calendar');
      if (calSheet) {
        var cVals = calSheet.getDataRange().getValues();
        for (var ci = 1; ci < cVals.length; ci++) {
          if (toStr(cVals[ci][5]) === eventId) { calSheet.deleteRow(ci + 1); break; }
        }
      }
      console.log('✅ Event deleted: ' + eventId);
      return { status: 'ok' };
    }

    // ── EVENT: update date ──
    if (noteLower === 'update_event_date') {
      var eventId = toStr(data.event_id);
      var newDateStr = toStr(data.new_date);
      if (!eventId || !newDateStr) return { status: 'error', message: 'Missing event ID or new date' };
      if (!validateDate(newDateStr)) return { status: 'error', message: 'Invalid new date' };

      var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
      var ev = calendar.getEventById(eventId);
      if (!ev) return { status: 'error', message: 'Event not found in calendar' };

      // Parse new date and time from existing event
      var startTime = ev.getStartTime();
      var endTime = ev.getEndTime();
      var newStart = parseEventDate(newDateStr, Utilities.formatDate(startTime, Session.getScriptTimeZone(), 'HH:mm'));
      var newEnd = parseEventDate(newDateStr, Utilities.formatDate(endTime, Session.getScriptTimeZone(), 'HH:mm'));
      if (ev.isAllDayEvent()) {
        // For all-day events, we only set the new start date
        ev.setDate(newStart, newStart);
      } else {
        ev.setTime(newStart, newEnd);
      }

      // Update the Calendar sheet
      var calSheet = ss.getSheetByName('Calendar');
      if (calSheet) {
        var cVals = calSheet.getDataRange().getValues();
        for (var ci = 1; ci < cVals.length; ci++) {
          if (toStr(cVals[ci][5]) === eventId) {
            calSheet.getRange(ci + 1, 2).setValue(newStart);
            break;
          }
        }
      }
      console.log('✅ Event date updated: ' + eventId + ' to ' + newDateStr);
      return { status: 'ok' };
    }

    // ── TODO: add ──
    if (noteLower === 'add_todo') {
      var task = toStr(data.todo_task);
      var assignee = toStr(data.todo_assignee) || 'Everyone';
      var due = toStr(data.todo_due);
      if (!task) return { status: 'error', message: 'Task cannot be empty' };
      if (!validateString(task, 200)) return { status: 'error', message: 'Task too long' };
      if (due && !validateDate(due)) return { status: 'error', message: 'Invalid due date' };

      var tdSheet = ss.getSheetByName('ToDo');
      if (!tdSheet) { tdSheet = ss.insertSheet('ToDo'); tdSheet.appendRow(['Date Added', 'Task', 'Assignee', 'Due Date', 'Added By', 'Status', 'Completed At']); }
      var parsedDue = due ? parseEventDate(due, '') : '';
      tdSheet.appendRow([new Date(), task, assignee, parsedDue, user, 'Open']);
      console.log('✅ Task added: ' + task);
      return { status: 'ok' };
    }

    // ── TODO: complete ──
    if (noteLower === 'complete_todo') {
      var rowIndex = parseInt(toStr(data.todo_id));
      if (isNaN(rowIndex) || rowIndex < 1) return { status: 'error', message: 'Invalid todo ID' };
      var tdSheet = ss.getSheetByName('ToDo');
      if (tdSheet) { tdSheet.getRange(rowIndex, 6).setValue('Done'); tdSheet.getRange(rowIndex, 7).setValue(new Date()); }
      console.log('✅ Todo completed: ' + rowIndex);
      return { status: 'ok' };
    }

    // ── TODO: delete ──
    if (noteLower === 'delete_todo') {
      var rowIndex = parseInt(toStr(data.todo_id));
      if (isNaN(rowIndex) || rowIndex < 1) return { status: 'error', message: 'Invalid todo ID' };
      var tdSheet = ss.getSheetByName('ToDo');
      if (tdSheet) tdSheet.deleteRow(rowIndex);
      console.log('✅ Todo deleted: ' + rowIndex);
      return { status: 'ok' };
    }

    // ── EXPENSE: add ──
    if (noteLower === 'add_expense') {
      var desc = toStr(data.ex_desc);
      var amount = parseFloat(data.ex_amount);
      var date = toStr(data.ex_date);
      var category = toStr(data.ex_category) || 'Other';
      var account = toStr(data.ex_account) || 'Family';

      if (!desc) return { status: 'error', message: 'Description required' };
      if (isNaN(amount) || amount < 0) return { status: 'error', message: 'Invalid amount' };
      if (!validateDate(date)) return { status: 'error', message: 'Invalid date' };
      if (!validateString(desc, 200)) return { status: 'error', message: 'Description too long' };

      var expSheet = ss.getSheetByName('Expenses');
      if (!expSheet) { expSheet = ss.insertSheet('Expenses'); expSheet.appendRow(['Timestamp', 'Date', 'Account', 'Category', 'Amount', 'Note']); }
      var parsedDate = parseEventDate(date, '');
      expSheet.appendRow([new Date(), parsedDate, account, category, amount, desc]);
      // NOTE: the sheet is intentionally NOT re-sorted here. Sorting on
      // every insert shuffled every row number, so a delete sent from a
      // client that loaded before someone else's add could remove the
      // wrong expense. Date ordering is applied in getExpensesData()
      // instead, so the app still shows newest-first.
      console.log('✅ Expense added: ' + desc + ' $' + amount);
      return { status: 'ok' };
    }

    // ── CHAT: removed (Firestore is the only chat backend) ──
    if (noteLower === 'add_chat_message') {
      return {
        status: 'error',
        message: 'Chat uses Firestore. Send messages from the app Chat tab, not Sheets.'
      };
    }

    // ── EXPENSE: delete ──
    if (noteLower === 'delete_expense') {
      var rowNum = parseInt(toStr(data.row_id));
      if (isNaN(rowNum) || rowNum < 1) return { status: 'error', message: 'Invalid row ID' };
      var expSheet = ss.getSheetByName('Expenses');
      if (expSheet) expSheet.deleteRow(rowNum);
      console.log('✅ Expense deleted: ' + rowNum);
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
      if (!validateDate(fertDate)) return { status: 'error', message: 'Invalid date' };
      if (!validateString(fertNotes, 500)) return { status: 'error', message: 'Notes too long' };

      var fertSheet = ss.getSheetByName('Fertility');
      if (!fertSheet) {
        fertSheet = ss.insertSheet('Fertility');
        fertSheet.appendRow(['Logged By', 'Date', 'Type', 'Notes', 'Logged At']);
      }
      var parsed = parseEventDate(fertDate, '');
      if (!parsed) return { status: 'error', message: 'Invalid date' };
      fertSheet.appendRow([user, parsed, fertType, fertNotes, new Date()]);
      console.log('✅ Fertility entry added: ' + fertType);
      return { status: 'ok' };
    }

    // ── BIRTHDAY: add ──
    if (noteLower === 'add_birthday') {
      var name = toStr(data.name);
      var type = toStr(data.type) || 'Birthday';
      var date = toStr(data.date); // MM-DD
      var year = toStr(data.year);
      var notes = toStr(data.notes);
      if (!name || !date) return { status: 'error', message: 'Name and date (MM-DD) required' };
      if (!validateString(name, 100)) return { status: 'error', message: 'Name too long' };
      if (!validateString(notes, 200)) return { status: 'error', message: 'Notes too long' };

      var bdSheet = ss.getSheetByName('Birthdays');
      if (!bdSheet) { bdSheet = ss.insertSheet('Birthdays'); bdSheet.appendRow(['Name', 'Type', 'Date (MM-DD)', 'Year (optional)', 'Notes', 'Added By']); }
      bdSheet.appendRow([name, type, date, year, notes, user]);
      console.log('✅ Birthday added: ' + name);
      return { status: 'ok' };
    }

    // ── BUDGET: set ──
    if (noteLower === 'set_budget') {
      var group = toStr(data.group);
      var budget = parseFloat(data.budget);
      var budgetAcc = toStr(data.account) || 'Family';
      if (!group) return { status: 'error', message: 'Group name required' };
      if (isNaN(budget) || budget < 0) return { status: 'error', message: 'Invalid budget amount' };
      if (!validateString(group, 100)) return { status: 'error', message: 'Group name too long' };

      var bdgSheet = ss.getSheetByName('Budgets');
      if (!bdgSheet) { bdgSheet = ss.insertSheet('Budgets'); bdgSheet.appendRow(['Group', 'Monthly Budget', 'Account', 'Set By', 'Updated At']); }
      var bdgVals = bdgSheet.getDataRange().getValues();
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
        var bdgVals = bdgSheet.getDataRange().getValues();
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

    // ── MEMORY: add ──
    if (noteLower === 'add_memory') {
      var memory = toStr(data.memory_text);
      var memType = toStr(data.memory_type) || 'Moment';
      var memPerson = toStr(data.memory_person) || 'Everyone';
      var memDate = toStr(data.memory_date);
      if (!memory && !data.image) return { status: 'error', message: 'Memory text or photo required' };
      if (!validateString(memory, 2000)) return { status: 'error', message: 'Memory too long' };
      if (memDate && !validateDate(memDate)) return { status: 'error', message: 'Invalid date' };

      var imgUrl = '';
      var imgId = '';
      
      // New memory images go through Firebase Storage in the PWA — not Drive.
      if (data.image && data.image.indexOf('data:image/') === 0) {
        return {
          status: 'error',
          message: 'Memory images must be uploaded via the app (Firebase Storage). Drive uploads are disabled.'
        };
      }
      if (data.imageUrl) imgUrl = toStr(data.imageUrl);

      var memSheet = ss.getSheetByName('Memories');
      if (!memSheet) {
        memSheet = ss.insertSheet('Memories');
        memSheet.appendRow(['Logged By', 'Date', 'Type', 'Person', 'Memory', 'Logged At', 'ImageUrl', 'ImageId']);
      }
      var parsed = memDate ? parseEventDate(memDate, '') : new Date();
      memSheet.appendRow([user, parsed, memType, memPerson, memory, new Date(), imgUrl, imgId]);
      console.log('✅ Memory added: ' + memory.substring(0, 50) + '...');
      return { status: 'ok' };
    }

    // ── RECURRING: add ──
    if (noteLower === 'add_recurring') {
      var recName = toStr(data.rec_name);
      var recAmount = parseFloat(data.rec_amount);
      var recDay = parseInt(data.rec_day);
      var recCategory = toStr(data.rec_category) || 'Other';
      var recAccount = toStr(data.rec_account) || 'Family';
      if (!recName) return { status: 'error', message: 'Name required' };
      if (isNaN(recAmount) || recAmount < 0) return { status: 'error', message: 'Invalid amount' };
      if (isNaN(recDay) || recDay < 1 || recDay > 28) return { status: 'error', message: 'Day must be 1-28' };
      if (!validateString(recName, 100)) return { status: 'error', message: 'Name too long' };

      var recSheet = ss.getSheetByName('RecurringExpenses');
      if (!recSheet) { recSheet = ss.insertSheet('RecurringExpenses'); recSheet.appendRow(['Name', 'Amount', 'Account', 'Category', 'Day of Month', 'Added By', 'Active']); }
      recSheet.appendRow([recName, recAmount, recAccount, recCategory, recDay, user, 'true']);
      console.log('✅ Recurring added: ' + recName);
      return { status: 'ok' };
    }

    // ── RECURRING: delete ──
    if (noteLower === 'delete_recurring') {
      var rowNum = parseInt(toStr(data.row_num));
      if (isNaN(rowNum) || rowNum < 1) return { status: 'error', message: 'Invalid row number' };
      var recSheet = ss.getSheetByName('RecurringExpenses');
      if (recSheet) recSheet.getRange(rowNum, 7).setValue('false');
      console.log('✅ Recurring disabled: ' + rowNum);
      return { status: 'ok' };
    }

    // ── TRAVEL: add ──
    if (noteLower === 'add_trip') {
      var city = toStr(data.trip_city);
      var country = toStr(data.trip_country);
      var tripDate = toStr(data.trip_date);
      var lat = parseFloat(data.trip_lat);
      var lng = parseFloat(data.trip_lng);
      var members = toStr(data.trip_members);
      var notes = toStr(data.trip_notes);
      if (!city || !country) return { status: 'error', message: 'City and country required' };
      if (!validateDate(tripDate)) return { status: 'error', message: 'Invalid date' };
      if (isNaN(lat) || isNaN(lng)) return { status: 'error', message: 'Invalid coordinates' };
      if (!validateString(notes, 500)) return { status: 'error', message: 'Notes too long' };

      var travelSheet = ss.getSheetByName('Travel');
      if (!travelSheet) {
        travelSheet = ss.insertSheet('Travel');
        travelSheet.appendRow(['ID', 'Date', 'City', 'Country', 'Lat', 'Lng', 'Members', 'Notes', 'Timestamp']);
      }
      var tripId = 'tr_' + Date.now() + '_' + Math.floor(Math.random()*1000);
      var parsed = parseEventDate(tripDate, '');
      travelSheet.appendRow([tripId, parsed, city, country, lat, lng, members, notes, new Date()]);
      console.log('✅ Trip added: ' + city + ', ' + country);
      return { status: 'ok' };
    }

    // ── TRAVEL: delete ──
    if (noteLower === 'delete_trip') {
      var targetId = toStr(data.trip_id);
      if (!targetId) return { status: 'error', message: 'Trip ID missing' };
      var travelSheet = ss.getSheetByName('Travel');
      if (travelSheet) {
        var tVals = travelSheet.getDataRange().getValues();
        for (var ti = 1; ti < tVals.length; ti++) {
          if (toStr(tVals[ti][0]) === targetId) {
            travelSheet.deleteRow(ti + 1);
            break;
          }
        }
      }
      console.log('✅ Trip deleted: ' + targetId);
      return { status: 'ok' };
    }

    // ── APPRECIATION: add ──
    if (noteLower === 'add_appreciation') {
      var message = toStr(data.message);
      if (!message) return { status: 'error', message: 'Message required' };
      if (!validateString(message, 1000)) return { status: 'error', message: 'Message too long' };

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
      appSheet.appendRow([now, sender, recipient, message, revealDate]);
      console.log('✅ Appreciation added from ' + sender);
      return { status: 'ok' };
    }

    // ── LOVE CHECKIN: add ──
    if (noteLower === 'add_love_checkin') {
      var battery = parseInt(data.battery) || 5;
      var moods = toStr(data.moods);
      var notes = toStr(data.notes);
      var focus = toStr(data.focus);
      if (isNaN(battery) || battery < 1 || battery > 5) return { status: 'error', message: 'Battery must be 1-5' };
      if (!validateString(notes, 500)) return { status: 'error', message: 'Notes too long' };
      if (!validateString(focus, 200)) return { status: 'error', message: 'Focus too long' };

      var checkinSheet = ss.getSheetByName('LoveCheckins');
      if (!checkinSheet) {
        checkinSheet = ss.insertSheet('LoveCheckins');
        checkinSheet.appendRow(['Timestamp', 'User', 'Battery', 'Moods', 'Notes', 'Focus']);
      }
      checkinSheet.appendRow([new Date(), user, battery, moods, notes, focus]);
      console.log('✅ Love check-in added for ' + user);
      return { status: 'ok' };
    }

    // ── INTIMACY: log (couple only) ──
    if (noteLower === 'add_intimacy') {
      var intimacyDate = toStr(data.intimacy_date);
      var intimacyNotes = toStr(data.intimacy_notes);
      var intimacyRating = parseInt(data.intimacy_rating, 10);
      if (!intimacyDate) return { status: 'error', message: 'Date required' };
      if (!validateDate(intimacyDate)) return { status: 'error', message: 'Invalid date' };
      if (!validateString(intimacyNotes, 500)) return { status: 'error', message: 'Notes too long' };
      if (isNaN(intimacyRating) || intimacyRating < 1 || intimacyRating > 5) intimacyRating = 0;

      var intSheet = ss.getSheetByName('IntimacyLog');
      if (!intSheet) {
        intSheet = ss.insertSheet('IntimacyLog');
        intSheet.appendRow(['ID', 'Timestamp', 'LoggedBy', 'Date', 'Notes', 'Rating']);
      }
      var intId = 'int_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      var intParsed = parseEventDate(intimacyDate, '');
      if (!intParsed) return { status: 'error', message: 'Invalid date' };
      intSheet.appendRow([intId, new Date(), user, intParsed, intimacyNotes, intimacyRating || '']);
      console.log('✅ Intimacy logged by ' + user);
      return { status: 'ok', id: intId };
    }

    if (noteLower === 'delete_intimacy') {
      var delId = toStr(data.id);
      if (!delId) return { status: 'error', message: 'Missing id' };
      var delSheet = ss.getSheetByName('IntimacyLog');
      if (!delSheet) return { status: 'error', message: 'Not found' };
      var delVals = delSheet.getDataRange().getValues();
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
      if (!validateString(item, 200)) return { status: 'error', message: 'Item too long' };

      var bucketSheet = ss.getSheetByName('BucketList');
      if (!bucketSheet) {
        bucketSheet = ss.insertSheet('BucketList');
        bucketSheet.appendRow(['ID', 'Item', 'AddedBy', 'Completed', 'CompletedAt']);
      }
      var id = 'bkt_' + Date.now() + '_' + Math.floor(Math.random()*1000);
      bucketSheet.appendRow([id, item, user, 'false', '']);
      console.log('✅ Bucket item added: ' + item);
      return { status: 'ok' };
    }

    // ── BUCKET LIST: toggle completed ──
    if (noteLower === 'toggle_bucket_item') {
      var id = toStr(data.id);
      if (!id) return { status: 'error', message: 'Item ID required' };
      var bucketSheet = ss.getSheetByName('BucketList');
      if (!bucketSheet) return { status: 'error', message: 'BucketList sheet not found' };
      var vals = bucketSheet.getDataRange().getValues();
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
      var vals = bucketSheet.getDataRange().getValues();
      for (var bi = 1; bi < vals.length; bi++) {
        if (toStr(vals[bi][0]) === id) { bucketSheet.deleteRow(bi + 1); break; }
      }
      console.log('✅ Bucket item deleted: ' + id);
      return { status: 'ok' };
    }

    // ── Unknown note ──
    logSheet.appendRow([new Date(), user, 'General', note]);
    console.log('ℹ️ Unknown note type: ' + note);
    return { status: 'ok' };

  } catch (err) {
    console.log('❌ handleWrite error: ' + err.stack);
    return { status: 'error', message: 'An internal error occurred while processing your request.' };
  }
}

// ============================================================
// 6. DATA FETCH FUNCTIONS (unchanged)
// ============================================================
function getAllDashboardData(verifiedEmail) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var adult = isAdultEmail_(verifiedEmail);
  return {
    events:    getEvents(),
    todos:     getTodos(ss),
    expenses:  getExpensesData(ss),
    budgets:   getBudgets(ss),
    birthdays: getBirthdays(ss),
    memories:  getMemories(ss),
    // Adult-only payloads are empty for children's accounts
    fertility:      adult ? getFertilityData(ss) : [],
    recurring:      getRecurring(ss),
    travel:         getTravelData(ss),
    appreciations:  adult ? getAppreciationsData(ss) : [],
    loveCheckins:   adult ? getLoveCheckinsData(ss) : [],
    intimacyLog:    adult ? getIntimacyLogData(ss) : [],
    bucketList:     adult ? getBucketList(ss) : [],
    // chat is NOT included — live via Firestore only (avoids dual Sheets path)
    expenseGroups:  EXPENSE_GROUPS,
    isAdult:        adult,
    memberName:     memberNameFromEmail_(verifiedEmail) || ''
  };
}

function getBucketList(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('BucketList');
  if (!sheet) {
    // Create the sheet if it doesn't exist
    sheet = ss.insertSheet('BucketList');
    sheet.appendRow(['ID', 'Item', 'AddedBy', 'Completed', 'CompletedAt']);
    return [];
  }
  var vals = sheet.getDataRange().getValues();
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
        if (isPersonal) personalHistory[h].total += amount;
        else familyHistory[h].total += amount;
        break;
      }
    }
    if (rKey === lastMonthKey) {
      lastMonthTotal += amount;
      if (isPersonal) lastMonthPersonalTotal += amount;
      else lastMonthFamilyTotal += amount;
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
        desc: toStr(row[5]),
        ts: rowDate.getTime()
      });
    }
  }
  // Newest first, sorted explicitly — the sheet itself is append-ordered
  // now that per-insert sorting was removed (see add_expense).
  rows.sort(function(a, b) { return b.ts - a.ts; });
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

function getMemories(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var memSheet = ss.getSheetByName('Memories');
  if (!memSheet) return [];
  var memVals = memSheet.getDataRange().getValues();
  var tz      = Session.getScriptTimeZone();
  var result  = [];
  for (var i = 1; i < memVals.length; i++) {
    var row = memVals[i];
    // Sheet columns: 0 LoggedBy, 1 Date, 2 Type, 3 Person, 4 Memory,
    // 5 LoggedAt, 6 ImageUrl, 7 ImageId. The old code read the image
    // from columns 5/6 — off by one — so photos never rendered and the
    // empty-row filter compared against LoggedAt (always populated).
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
  return result.slice(0, 20);
}

function getFertilityData(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var fertSheet = ss.getSheetByName('Fertility');
  if (!fertSheet) return {};
  var fertVals        = fertSheet.getDataRange().getValues();
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
  result.sort(function(a, b) { return b.dateRaw.localeCompare(a.dateRaw); });
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
  // The missing return here was why the check-in history never displayed.
  return result;
}

/** Private couple intimacy log (adults only). */
function getIntimacyLogData(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('IntimacyLog');
  if (!sheet) {
    sheet = ss.insertSheet('IntimacyLog');
    sheet.appendRow(['ID', 'Timestamp', 'LoggedBy', 'Date', 'Notes', 'Rating']);
    return [];
  }
  var vals = sheet.getDataRange().getValues();
  var tz = Session.getScriptTimeZone();
  var result = [];
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    if (!row[0] && !row[3]) continue;
    var d = row[3] ? new Date(row[3]) : null;
    if (d && isNaN(d.getTime())) d = null;
    var ts = row[1] ? new Date(row[1]) : null;
    result.push({
      id: toStr(row[0]),
      timestamp: ts && !isNaN(ts.getTime()) ? Utilities.formatDate(ts, tz, 'yyyy-MM-dd HH:mm:ss') : '',
      loggedBy: toStr(row[2]),
      date: d ? Utilities.formatDate(d, tz, 'dd MMM yyyy') : '',
      dateRaw: d ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : '',
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
function parseEventDateStrict(dateStr, timeStr) {
  dateStr = toStr(dateStr).trim(); timeStr = toStr(timeStr).trim();
  // Normalize weird Unicode spaces from some locale formatters
  dateStr = dateStr.replace(/[\u00a0\u202f]/g, ' ');
  if (!dateStr) return null;
  var now = new Date(); var year = now.getFullYear(); var parsed = null;
  // ISO yyyy-MM-dd (preferred from date inputs)
  var iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    parsed = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  }
  var dmySlash = dateStr.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!parsed && dmySlash) { var yr = dmySlash[3] ? parseInt(dmySlash[3]) : year; if (yr < 100) yr += 2000; parsed = new Date(yr, parseInt(dmySlash[2]) - 1, parseInt(dmySlash[1])); }
  if (!parsed) {
    var dmy = dateStr.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{2,4}))?$/);
    if (dmy) {
      var months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
      var mo = months[dmy[2].toLowerCase().substring(0,3)];
      if (mo !== undefined) { var yr2 = dmy[3] ? parseInt(dmy[3]) : year; if (yr2 < 100) yr2 += 2000; parsed = new Date(yr2, mo, parseInt(dmy[1])); }
    }
  }
  if (!parsed || isNaN(parsed.getTime())) parsed = new Date(dateStr);
  if (!parsed || isNaN(parsed.getTime())) return null;
  if (timeStr && timeStr !== '') {
    var t12 = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i); var t24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (t12) { var h = parseInt(t12[1]); var min = t12[2] ? parseInt(t12[2]) : 0; var mer = t12[3].toLowerCase(); if (mer === 'pm' && h !== 12) h += 12; if (mer === 'am' && h === 12) h = 0; parsed.setHours(h, min, 0, 0); }
    else if (t24) { parsed.setHours(parseInt(t24[1]), parseInt(t24[2]), 0, 0); }
  } else { parsed.setHours(0, 0, 0, 0); }
  return parsed;
}

// Lenient wrapper kept for existing callers that expect a date back no
// matter what — falls back to today (midnight) on unparseable input.
function parseEventDate(dateStr, timeStr) {
  var parsed = parseEventDateStrict(dateStr, timeStr);
  if (parsed) return parsed;
  var fallback = new Date();
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

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

function scanInboxForPayLah() {
  scanInboxForTransactions();
}

// ---- PARSERS (with transaction reference extraction) ----
// Bank alerts often omit the year ("16 Jun"). Assuming the current year
// mislabels December transactions scanned in January, so if the
// resulting date lands in the future, it must belong to last year.
function inferYearForPastDate_(day, monthStr) {
  var year = new Date().getFullYear();
  var candidate = parseEventDateStrict(day + ' ' + monthStr + ' ' + year, '');
  if (candidate && candidate.getTime() > Date.now() + 86400000) year -= 1;
  return year;
}

function parsePayLah(body) {
  var amtMatch = body.match(/Amount:\s*SGD\s*([\d\.]+)/i);
  var toMatch = body.match(/To:\s*(.+?)(?:\r|\n)/i);
  var dateMatch = body.match(/Date\s*&\s*Time:\s*(.+?)(?:\r|\n)/i);
  var refMatch = body.match(/Transaction Ref:\s*([A-Z0-9]+)/i);
  if (amtMatch && toMatch) {
    var amount = parseFloat(amtMatch[1]);
    var merchant = toMatch[1].trim();
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (dateMatch) {
      var parts = dateMatch[1].trim().split(/\s+/);
      if (parts.length >= 2) {
        dateStr = parts[0] + ' ' + parts[1] + ' ' + inferYearForPastDate_(parts[0], parts[1]);
      }
    }
    var txRef = refMatch ? refMatch[1].trim() : null;
    return { amount: amount, merchant: merchant, dateStr: dateStr, txRef: txRef };
  }
  return null;
}

function parseTrust(body) {
  var amtMatch = body.match(/spent\s+SGD\s+([\d\.]+)\s+at/i);
  var toMatch = body.match(/at\s+(.+?)\s+on\s+\d{1,2}\s+[a-z]{3}\s+\d{4}/i);
  var dateMatch = body.match(/on\s+(\d{1,2}\s+[a-z]{3}\s+\d{4})/i);
  var refMatch = body.match(/Transaction\s*(?:Ref|ID):\s*([A-Z0-9]+)/i);
  if (amtMatch && toMatch) {
    var amount = parseFloat(amtMatch[1]);
    var merchant = toMatch[1].trim();
    merchant = merchant.replace(/\s+(Singapore SG|SG|Singapore)$/i, '').trim();
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (dateMatch) dateStr = dateMatch[1].trim();
    var txRef = refMatch ? refMatch[1].trim() : null;
    return { amount: amount, merchant: merchant, dateStr: dateStr, txRef: txRef };
  }
  return null;
}

/**
 * Shopee payment / order confirmation emails.
 * - Amount = order total paid (Amount Paid / Total Payment), never a single line-item Price.
 * - Description includes ALL numbered products (not only item 1).
 */
function parseShopee(body) {
  if (!body) return null;
  var text = String(body);

  // --- Order total (prefer paid totals; never "Price:" on a line item) ---
  var amount = null;
  var totalPatterns = [
    /Amount\s*Paid\s*[:：]\s*(?:S?\$|SGD)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /Total\s*Payment\s*[:：]\s*(?:S?\$|SGD)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /Grand\s*Total\s*[:：]\s*(?:S?\$|SGD)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /Order\s*Total\s*[:：]\s*(?:S?\$|SGD)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /Total\s*Amount\s*[:：]\s*(?:S?\$|SGD)\s*([\d,]+(?:\.\d{1,2})?)/i
  ];
  for (var tp = 0; tp < totalPatterns.length; tp++) {
    var tm = text.match(totalPatterns[tp]);
    if (tm) {
      amount = parseFloat(String(tm[1]).replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0) break;
      amount = null;
    }
  }
  // Last resort only: merchandise subtotal (pre-discount), still not line Price
  if (amount === null) {
    var sub = text.match(/Merchandise\s*Subtotal\s*[:：]\s*(?:S?\$|SGD)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (sub) {
      amount = parseFloat(String(sub[1]).replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) amount = null;
    }
  }
  if (amount === null) return null;

  // --- All line items: "1. name", "2. name", ... ---
  var items = [];
  var itemRe = /^\s*(\d+)\.\s+(.+?)\s*$/gm;
  var im;
  while ((im = itemRe.exec(text)) !== null) {
    var rawName = im[2].trim().replace(/\s+/g, ' ');
    if (!rawName || rawName.length < 2) continue;
    // Skip numbered non-product lines
    if (/^(order|payment|shipping|delivery|subtotal|total|seller)/i.test(rawName)) continue;
    // Quantity often sits on the next few lines after the title
    var window = text.substring(im.index, Math.min(text.length, im.index + 500));
    var qtyMatch = window.match(/Quantity\s*[:：]\s*(\d+)/i);
    var qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    if (isNaN(qty) || qty < 1) qty = 1;
    items.push({ name: rawName, qty: qty });
  }
  if (items.length === 0) {
    var prodMatch = text.match(/Product\s*Name\s*[:：]\s*(.+)/i);
    if (prodMatch) {
      items.push({ name: prodMatch[1].trim().split(/\r?\n/)[0].trim(), qty: 1 });
    }
  }

  var orderMatch = text.match(/Order\s*ID\s*[:：]\s*(#?[\w-]+)/i)
    || text.match(/order\s+(#?[\w-]+)\s+has been confirmed/i);
  var orderId = orderMatch ? orderMatch[1].trim() : '';

  var sellerMatch = text.match(/Seller\s*[:：]\s*(.+)/i);
  var seller = sellerMatch ? sellerMatch[1].trim().split(/\r?\n/)[0].trim() : '';

  var dateMatch = text.match(/(?:Payment Date|Order Date)\s*[:：]\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i);
  var dateStr = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  if (dateMatch) dateStr = dateMatch[1].trim();

  // Description covers every product (capped for sheet cells)
  var merchant = formatShopeeMerchant_(items, seller, orderId);

  return {
    amount: amount,
    merchant: merchant,
    dateStr: dateStr,
    txRef: orderId || null,
    itemCount: items.length,
    items: items
  };
}

/** Build a Shopee expense note from all line items. */
function formatShopeeMerchant_(items, seller, orderId) {
  if (!items || items.length === 0) {
    if (seller) return 'Shopee: ' + seller;
    if (orderId) return 'Shopee Order ' + orderId;
    return 'Shopee';
  }
  function shortLabel(it, maxLen) {
    var n = it.name || '';
    if (it.qty > 1) n = it.qty + '× ' + n;
    if (n.length > maxLen) n = n.substring(0, maxLen - 3) + '...';
    return n;
  }
  if (items.length === 1) {
    return 'Shopee: ' + shortLabel(items[0], 100);
  }
  var maxList = 5;
  var parts = [];
  for (var i = 0; i < items.length && i < maxList; i++) {
    parts.push(shortLabel(items[i], 40));
  }
  var more = items.length > maxList ? ' (+' + (items.length - maxList) + ' more)' : '';
  var desc = 'Shopee (' + items.length + ' items): ' + parts.join('; ') + more;
  if (desc.length > 200) desc = desc.substring(0, 197) + '...';
  return desc;
}

/**
 * Prefer plain text; if thin (HTML-only emails), strip HTML so item lists survive.
 */
function emailBodyText_(msg) {
  if (!msg) return '';
  var plain = '';
  try { plain = msg.getPlainBody() || ''; } catch (e) { plain = ''; }
  if (plain && plain.replace(/\s+/g, ' ').trim().length >= 80) return plain;
  var html = '';
  try { html = msg.getBody() || ''; } catch (e2) { html = ''; }
  if (!html) return plain || '';
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n')
    .replace(/<\s*\/\s*div\s*>/gi, '\n')
    .replace(/<\s*\/\s*tr\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, function(_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function parseDbsPayNow(body, msg) {
  var toMatch = body.match(/^To:\s*(.+)$/m);
  var amtMatch = body.match(/Amount:\s*SGD\s*([\d\.,]+)/i);
  var dateMatch = body.match(/Date & Time:\s*(\d{1,2}\s+[A-Z]{3}\s+\d{2}:\d{2})/i);
  var refMatch = body.match(/Transaction Ref:\s*([A-Z0-9]+)/i);
  if (amtMatch) {
    var amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    var merchant = toMatch ? toMatch[1].trim() : 'DBS Card Transaction';
    merchant = merchant.replace(/\s+$/, '');
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (dateMatch) {
      var parts = dateMatch[1].trim().split(/\s+/);
      var day = parts[0];
      var month = parts[1];
      dateStr = day + ' ' + month + ' ' + inferYearForPastDate_(day, month);
    }
    var txRef = refMatch ? refMatch[1].trim() : null;
    return { amount: amount, merchant: merchant, dateStr: dateStr, txRef: txRef };
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
    if (nameMatch) merchant = nameMatch[1].trim();
    else merchant = fromName.trim();
  }
  if (subject) {
    var cleanSubject = subject.replace(/^(?:Re|Fwd):\s*/i, '').trim();
    if (cleanSubject) {
      merchant = merchant ? merchant + ' (' + cleanSubject + ')' : cleanSubject;
    }
  }
  if (!merchant) merchant = 'Generic Expense';
  if (merchant.length > 50) merchant = merchant.substring(0, 47) + '...';
  var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
  if (msg) {
    try {
      var msgDate = msg.getDate();
      if (msgDate) dateStr = msgDate.toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    } catch(e) {}
  }
  var refMatch = body.match(/(?:Ref|Reference|ID|Order)[\s#:]+([A-Z0-9]+)/i);
  var txRef = refMatch ? refMatch[1].trim() : null;
  return { amount: amount, merchant: merchant, dateStr: dateStr, txRef: txRef };
}

// ---- DUPLICATE DETECTION (with txRef fallback) ----
function findDuplicateInPending(sheet, amount, dateStr, merchant, txRef) {
  if (!sheet) return null;
  var vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return null;
  var targetDate = parseEventDate(dateStr, '');
  if (!targetDate) return null;
  var merchantLower = merchant.toLowerCase().trim();
  for (var i = 1; i < vals.length; i++) {
    var rowAmt = parseFloat(vals[i][4]) || 0;
    var rowDateStr = toStr(vals[i][1]);
    var rowDate = parseEventDate(rowDateStr, '');
    var rowMerchant = toStr(vals[i][5]).toLowerCase().trim();
    var rowNote = toStr(vals[i][5]);
    // Strong match: same txRef stored in note
    if (txRef && rowNote.indexOf(txRef) !== -1) {
      return { id: toStr(vals[i][0]), rowIdx: i + 1 };
    }
    // Fallback: merchant + amount + date within 1.5 days
    if (Math.abs(rowAmt - amount) < 0.01 &&
        rowDate && Math.abs(rowDate.getTime() - targetDate.getTime()) <= 36 * 60 * 60 * 1000 &&
        rowMerchant === merchantLower) {
      return { id: toStr(vals[i][0]), rowIdx: i + 1 };
    }
  }
  return null;
}

function findDuplicateInExpenses(sheet, amount, dateStr, merchant, txRef) {
  if (!sheet) return null;
  var vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return null;
  var targetDate = parseEventDate(dateStr, '');
  if (!targetDate) return null;
  var merchantLower = merchant.toLowerCase().trim();
  for (var i = 1; i < vals.length; i++) {
    var rowAmt = parseFloat(vals[i][4]) || 0;
    var rowDateStr = toStr(vals[i][1]);
    var rowDate = parseEventDate(rowDateStr, '');
    var rowMerchant = toStr(vals[i][5]).toLowerCase().trim();
    var rowNote = toStr(vals[i][5]);
    if (txRef && rowNote.indexOf(txRef) !== -1) {
      return { rowIdx: i + 1 };
    }
    if (Math.abs(rowAmt - amount) < 0.01 &&
        rowDate && Math.abs(rowDate.getTime() - targetDate.getTime()) <= 36 * 60 * 60 * 1000 &&
        rowMerchant === merchantLower) {
      return { rowIdx: i + 1 };
    }
  }
  return null;
}

// ---- MAIN SCANNER ----
function scanInboxForTransactions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pendingSheet = ss.getSheetByName('PendingExpenses');
  if (!pendingSheet) {
    pendingSheet = ss.insertSheet('PendingExpenses');
    pendingSheet.appendRow(['ID', 'Date', 'Account', 'Category', 'Amount', 'Note', 'Timestamp']);
  }
  var expSheet = ss.getSheetByName('Expenses');
  var label = GmailApp.getUserLabelByName('Expense-Processed');
  if (!label) label = GmailApp.createLabel('Expense-Processed');
  var failLabel = GmailApp.getUserLabelByName('Expense-Failed');
  if (!failLabel) failLabel = GmailApp.createLabel('Expense-Failed');

  var templates = [
    { name: 'paylah', query: 'from:paylah.alert@dbs.com label:inbox', parse: parsePayLah },
    { name: 'dbs_paynow', query: 'from:ibanking.alert@dbs.com label:inbox', parse: parseDbsPayNow },
    { name: 'trust', query: 'from:from_us@trustbank.sg label:inbox', parse: parseTrust },
    { name: 'shopee', query: 'from:info@mail.shopee.sg label:inbox', parse: parseShopee },
    { name: 'expenses_label', query: 'label:inbox (label:expenses OR label:expense)', parse: function(body, msg) {
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
    var threads = GmailApp.search(tpl.query, 0, 20);
    threads.forEach(function(thread) {
      var messages = thread.getMessages();
      var hadParseFailure = false;
      messages.forEach(function(msg) {
        if (msg.isStarred()) return;
        // Plain text first; fall back to stripped HTML (Shopee is often HTML-heavy)
        var body = typeof emailBodyText_ === 'function' ? emailBodyText_(msg) : (msg.getPlainBody() || '');
        var parsed = tpl.parse(body, msg);
        if (parsed) {
          var amount = parsed.amount;
          var merchant = parsed.merchant;
          if (merchant.toLowerCase().indexOf('fairprice') !== -1) merchant = 'NTUC FairPrice';
          var dateStr = parsed.dateStr;
          var txRef = parsed.txRef || null;
          // Categorise Shopee by store name, not the long multi-item description
          var details = proposeExpenseDetails(
            tpl.name === 'shopee' || merchant.indexOf('Shopee') === 0 ? 'Shopee' : merchant
          );
          var category = details.category;
          var account = details.account;

          if (findDuplicateInExpenses(expSheet, amount, dateStr, merchant, txRef)) {
            console.log('[' + tpl.name + '] Found in Expenses. Skipping.');
            msg.star();
            return;
          }
          if (findDuplicateInPending(pendingSheet, amount, dateStr, merchant, txRef)) {
            console.log('[' + tpl.name + '] Duplicate pending. Skipping.');
            msg.star();
            return;
          }

          var note = merchant;
          if (txRef) note += ' (Ref: ' + txRef + ')';
          // Unguessable id (uuid) — approval links also carry an HMAC
          var id = 'p_' + tpl.name + '_' + Utilities.getUuid().replace(/-/g, '');
          pendingSheet.appendRow([id, dateStr, account, category, amount, note, new Date()]);
          sendApprovalEmail(id, dateStr, amount, merchant, category, account);
          console.log('[' + tpl.name + '] Logged new pending: ' + merchant + ' ($' + amount + ')' + (txRef ? ' Ref: ' + txRef : ''));
        } else {
          // Previously unparseable messages were starred and archived with
          // no trace — a silently dropped transaction. Flag the thread so
          // it can be reviewed under the Expense-Failed label.
          hadParseFailure = true;
          console.log('[' + tpl.name + '] Could not parse message: ' + msg.getSubject());
        }
        msg.star();
      });
      if (hadParseFailure) thread.addLabel(failLabel);
      thread.addLabel(label);
      thread.moveToArchive();
    });
  });
}

// ---- PROPOSAL & EMAIL (unchanged) ----
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
        break;
      }
    }
  }
  if (!category) category = proposeCategory(merchant);
  return { category: category, account: account };
}

function sendApprovalEmail(id, dateStr, amount, merchant, category, account) {
  var webAppUrl = WEB_APP_URL;
  var tok = buildApprovalToken_(id);
  var approvalUrl = webAppUrl + '?action=confirm_expense_page'
    + '&id=' + encodeURIComponent(tok.id)
    + '&exp=' + encodeURIComponent(tok.exp)
    + '&sig=' + encodeURIComponent(tok.sig);
  var sourceTitle = 'Expense';
  if (id.indexOf('p_paylah_') === 0) sourceTitle = 'DBS PayLah!';
  else if (id.indexOf('p_dbs_paynow_') === 0) sourceTitle = 'DBS PayNow';
  else if (id.indexOf('p_trust_') === 0) sourceTitle = 'Trust Bank';
  else if (id.indexOf('p_shopee_') === 0) sourceTitle = 'Shopee';
  else if (id.indexOf('p_expenses_label_') === 0) sourceTitle = 'Tagged Expense';

  var subject = '❓ Confirm ' + sourceTitle + ': $' + amount.toFixed(2) + ' at ' + merchant;
  var htmlBody = '<div style="font-family:sans-serif;max-width:400px;border:1px solid #e4e6ef;border-radius:10px;padding:20px;background:#f9f9fb;">' +
                 '<h3 style="color:#2c7a4b;margin-top:0;border-bottom:1px solid #e4e6ef;padding-bottom:10px;">' + sourceTitle + ' Detected</h3>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Merchant:</strong> ' + escapeHtml_(merchant) + '</p>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Amount:</strong> $' + amount.toFixed(2) + '</p>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Date:</strong> ' + escapeHtml_(dateStr) + '</p>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Proposed Account:</strong> ' + escapeHtml_(account) + '</p>' +
                 '<p style="margin:8px 0;font-size:14px;"><strong>Proposed Category:</strong> ' + escapeHtml_(category) + '</p>' +
                 '<div style="margin-top:20px;text-align:center;">' +
                   '<a href="' + approvalUrl + '" style="background:#4f86c6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;font-size:14px;">Verify & Log Expense</a>' +
                 '</div>' +
                 '<p style="margin-top:16px;font-size:11px;color:#888;text-align:center;">This link expires in 7 days and cannot be guessed.</p>' +
                 '</div>';
  var plainBody = htmlBody.replace(/<[^>]+>/g, '').replace(/\n\n+/g, '\n').trim();
  try {
    MailApp.sendEmail({ to: APPROVAL_EMAIL, subject: subject, body: plainBody, htmlBody: htmlBody });
    console.log('✅ email sent to: ' + APPROVAL_EMAIL);
  } catch (err) {
    console.log('❌ email failed (' + APPROVAL_EMAIL + '): ' + err);
  }
}

// ---- APPROVAL PAGE & HANDLER ----
function renderConfirmExpensePage(id, exp, sig) {
  if (!verifyApprovalToken_(id, exp, sig)) {
    return HtmlService.createHtmlOutput(
      '<h3 style="font-family:sans-serif;color:#e74c3c;text-align:center;margin-top:50px;padding:20px;">' +
      'This approval link is invalid or has expired. Open the latest email link, or dismiss the pending expense from the app.</h3>'
    ).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
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
  var groupOptionsHtml = '';
  for (var grp in EXPENSE_GROUPS) {
    groupOptionsHtml += '<optgroup label="' + escapeHtml_(grp) + '">';
    var cats = EXPENSE_GROUPS[grp];
    for (var c = 0; c < cats.length; c++) {
      var sel = (cats[c] === cat) ? ' selected' : '';
      groupOptionsHtml += '<option value="' + escapeHtml_(cats[c]) + '"' + sel + '>' + escapeHtml_(cats[c]) + '</option>';
    }
    groupOptionsHtml += '</optgroup>';
  }
  var webAppUrl = WEB_APP_URL;
  // Amount/date are locked to the sheet values (hidden + display only).
  // Category/account/description may be corrected by the family.
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
        'input:disabled { background:#f0f1f5; color:#555; }' +
        '.btn-row { display:flex; gap:10px; margin-top:20px; }' +
        'button { flex:1; padding:12px; border:none; border-radius:8px; font-weight:600; font-size:14px; cursor:pointer; }' +
        '.btn-p { background:#4f86c6; color:#fff; }' +
        '.btn-s { background:#fdeaea; color:#b83232; }' +
      '</style>' +
    '</head>' +
    '<body>' +
      '<div class="card">' +
        '<h3>Verify Expense</h3>' +
        '<form id="exp-form">' +
          '<input type="hidden" name="id" value="' + escapeHtml_(id) + '">' +
          '<input type="hidden" name="exp" value="' + escapeHtml_(toStr(exp)) + '">' +
          '<input type="hidden" name="sig" value="' + escapeHtml_(toStr(sig)) + '">' +
          '<div class="field"><label>Description</label><input type="text" name="desc" value="' + escapeHtml_(desc) + '" maxlength="200"></div>' +
          '<div class="field"><label>Amount ($)</label><input type="text" value="' + amt.toFixed(2) + '" disabled><div style="font-size:11px;color:#888;">Locked to bank alert (cannot be changed here)</div></div>' +
          '<div class="field"><label>Date</label><input type="text" value="' + escapeHtml_(dateStr) + '" disabled></div>' +
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
          'var query = \'?action=submit_confirmed_expense&status=\' + encodeURIComponent(action);' +
          'formData.forEach(function(value, key){' +
            'query += \'&\' + encodeURIComponent(key) + \'=\' + encodeURIComponent(value);' +
          '});' +
          'document.body.innerHTML = \'<div style="text-align:center;margin-top:100px;font-family:sans-serif;color:#666;">Processing...</div>\';' +
          'var s = document.createElement(\'script\');' +
          's.src = \'' + webAppUrl + '\' + query + \'&callback=onDone\';' +
          'document.body.appendChild(s);' +
        '}' +
        'window.onDone = function(r) {' +
          'var msg = (r && r.message) ? r.message : \'Unknown error\';' +
          'var ok = r && r.status === \'ok\';' +
          'var card = document.createElement(\'div\');' +
          'card.className = \'card\'; card.style.textAlign = \'center\';' +
          'var h = document.createElement(\'h3\');' +
          'h.style.color = ok ? \'#2c7a4b\' : \'#e74c3c\';' +
          'h.textContent = ok ? \'Success!\' : \'Error\';' +
          'var p = document.createElement(\'p\');' +
          'p.textContent = msg;' +
          'card.appendChild(h); card.appendChild(p);' +
          'document.body.innerHTML = \'\'; document.body.appendChild(card);' +
        '}' +
      '</script>' +
    '</body>' +
    '</html>';
  return HtmlService.createHtmlOutput(html).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function handleSubmitConfirmedExpense(params) {
  // Same lock as handleWrite — this reads a pending row, appends an
  // expense, then deletes the pending row, which must not interleave
  // with other writes.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { status: 'error', message: 'Server busy — please try again in a moment.' };
  }
  try {
    return handleSubmitConfirmedExpenseInner_(params);
  } finally {
    lock.releaseLock();
  }
}

function handleSubmitConfirmedExpenseInner_(params) {
  var id = toStr(params.id);
  var status = toStr(params.status);
  var exp = toStr(params.exp);
  var sig = toStr(params.sig);
  if (!verifyApprovalToken_(id, exp, sig)) {
    return { status: 'error', message: 'Invalid or expired approval link' };
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pendingSheet = ss.getSheetByName('PendingExpenses');
  if (!pendingSheet) return { status: 'error', message: 'PendingExpenses sheet not found' };
  var vals = pendingSheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < vals.length; i++) {
    if (toStr(vals[i][0]) === id) { rowIdx = i + 1; break; }
  }
  if (rowIdx === -1) return { status: 'error', message: 'This transaction was already processed' };

  // Amount + date always come from the pending row (bank alert), not the form.
  var sheetDateStr = toStr(vals[rowIdx - 1][1]);
  var sheetAmount  = parseFloat(vals[rowIdx - 1][4]) || 0;
  var sheetNote    = toStr(vals[rowIdx - 1][5]);

  if (status === 'approve') {
    var desc = toStr(params.desc) || sheetNote;
    if (desc.length > 200) desc = desc.substring(0, 200);
    var account = toStr(params.account) || 'Family';
    if (account !== 'Family' && account !== 'Personal Account') account = 'Family';
    var category = toStr(params.category) || toStr(vals[rowIdx - 1][3]) || 'Misc';
    if (category.length > 100) category = category.substring(0, 100);
    var expSheet = ss.getSheetByName('Expenses');
    if (!expSheet) { expSheet = ss.insertSheet('Expenses'); expSheet.appendRow(['Timestamp', 'Date', 'Account', 'Category', 'Amount', 'Note']); }
    var parsedDate = parseEventDate(sheetDateStr, '');
    expSheet.appendRow([new Date(), parsedDate, account, category, sheetAmount, desc]);
    pendingSheet.deleteRow(rowIdx);
    return { status: 'ok', message: 'Expense of $' + sheetAmount.toFixed(2) + ' logged to ' + category + '!' };
  } else {
    pendingSheet.deleteRow(rowIdx);
    return { status: 'ok', message: 'Expense dismissed.' };
  }
}

// ---- TEST FUNCTIONS ----
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
                   "2. Clear Soft TPU Phone Case for iPhone 15\n" +
                   "Variation: Transparent\n" +
                   "Quantity: 2\n" +
                   "Price: S$12.00\n\n" +
                   "3. USB-C Cable 1m Braided\n" +
                   "Quantity: 1\n" +
                   "Price: S$5.50\n\n" +
                   "Merchandise Subtotal: S$60.50\n" +
                   "Shipping Fee: S$0.00\n" +
                   "Total Payment: S$42.50\n\n" +
                   "PAYMENT DETAILS\n" +
                   "Payment Method: Mari Credit Card Instant Checkout\n" +
                   "Payment Date: 09 Jun 2026 14:54:39\n" +
                   "Amount Paid: S$42.50";

  console.log('=== TEST: PAYLAH ===');
  var parsed = parsePayLah(mockPayLah);
  if (parsed) console.log('PayLah: ' + parsed.merchant + ' $' + parsed.amount + (parsed.txRef ? ' Ref: ' + parsed.txRef : ''));
  else console.log('PayLah: failed');

  console.log('=== TEST: TRUST ===');
  var parsed2 = parseTrust(mockTrust);
  if (parsed2) console.log('Trust: ' + parsed2.merchant + ' $' + parsed2.amount + (parsed2.txRef ? ' Ref: ' + parsed2.txRef : ''));
  else console.log('Trust: failed');

  console.log('=== TEST: SHOPEE (multi-item) ===');
  var parsed3 = parseShopee(mockShopee);
  if (parsed3) {
    console.log('Shopee amount (must be 42.50 paid total, NOT first Price 31.00): $' + parsed3.amount);
    console.log('Shopee items: ' + (parsed3.itemCount || 0) + ' → ' + parsed3.merchant);
    console.log('Shopee ref: ' + (parsed3.txRef || ''));
    if (Math.abs(parsed3.amount - 42.50) > 0.01) console.log('FAIL: amount should be order total 42.50');
    if ((parsed3.itemCount || 0) < 3) console.log('FAIL: should detect 3 line items');
  } else {
    console.log('Shopee: failed');
  }
}

function testVerifyToken() {
  console.log('Run testVerifyToken with a real token from browser console.');
}

// ============================================================
// 9. ADD APPROVED TRIPS (unchanged)
// ============================================================
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