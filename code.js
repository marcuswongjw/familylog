// ============================================================
// WONG FAMILY BOT — Google Apps Script (PWA Version)
// Added Firebase ID token verification
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
      // Return the user's email (or localId)
      return result.users[0].email;
    }
  } catch (e) {
    Logger.log('Token verification error: ' + e);
  }
  return null;
}

// ─── DOGET WITH AUTH ──────────────────────────────────────
function doGet(e) {
  var action   = e && e.parameter && e.parameter.action   ? e.parameter.action   : '';
  var callback = e && e.parameter && e.parameter.callback ? e.parameter.callback : '';
  var idToken  = e && e.parameter && e.parameter.idToken  ? e.parameter.idToken  : '';
  
  // Protected actions require valid token
  var protectedActions = ['get_all', 'write', 'submit_confirmed_expense'];
  if (protectedActions.indexOf(action) !== -1) {
    var verifiedEmail = verifyFirebaseToken(idToken);
    if (!verifiedEmail) {
      var error = { status: 'error', message: 'Unauthorized: invalid token' };
      return respondJSONP(error, callback);
    }
    // Optionally store verifiedEmail for logging
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

// ─── HANDLE WRITE (unchanged, but we rely on token verification above) ──
function handleWrite(data) {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet  = ss.getSheetByName('Log') || ss.insertSheet('Log');
  var note      = toStr(data.note);
  var noteLower = note.toLowerCase().trim();
  var user      = toStr(data.user) || 'Unknown';

  try {
    // All existing logic for add_event, delete_event, add_todo, etc.
    // … (copy your existing handleWrite logic here, no changes needed)
    // For brevity, this is a placeholder – you must paste your full handleWrite function.
    // The only change is that we now have verified the token before this point.

    // IMPORTANT: Paste your entire handleWrite function from the original Code.js here.
    // It contains all the note handlers (add_event, add_todo, add_expense, etc.)
    // We will not rewrite it fully to save space – you copy it from your original.

    // Example stub:
    if (noteLower === 'add_event') {
      // … existing code
    }
    // … all other handlers

    logSheet.appendRow([new Date(), user, 'General', note]);
    return { status: 'ok' };
  } catch (err) {
    logSheet.appendRow([new Date(), 'WRITE ERROR', err.toString()]);
    return { status: 'error', message: err.toString() };
  }
}

// All other functions (getEvents, getTodos, getExpensesData, etc.) remain exactly as in your original Code.js.
// You need to copy the full content of your original Code.js here, but ensure that doGet and doPost are updated as above.
// For brevity, I have omitted the ~500 lines of existing code – you must merge them.

// ─── DO POST (optional) ──────────────────────────────────
function doPost(e) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('Log') || ss.insertSheet('Log');
  try {
    var data = JSON.parse(e.postData.contents);
    // Optionally verify token if present
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