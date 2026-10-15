// ============================================================
// WONG’S NEST — shared Apps Script configuration
// with Firebase ID token verification
// Deployment defaults are generated from config/project.json.
//
// DATA OWNERSHIP (see ARCHITECTURE.md)
// ─────────────────────────────────────
// THIS FILE (Sheets + Calendar + Gmail) owns:
//   expenses, budgets, recurring, todos, birthdays, travel,
//   fertility, Us (appreciations, check-ins, intimacy, bucket list),
//   calendar events, bank-email scan, digests / approval mail.
//
// FIREBASE owns (do NOT persist here):
//   auth, memories, photo storage, FCM tokens (Chat is retired).
// Reject add_chat_message / add_memory. get_all must not return chat/memories.
// ============================================================

// ─── SHARED DEFAULTS (existing Script Property overrides preserved) ───
var DEFAULT_CALENDAR_ID    = deploymentSettings_().calendarId;
var DEFAULT_WEB_APP_URL    = deploymentSettings_().parentsUrl;
var DEFAULT_NOTIFY_EMAILS  = ["marcuswongjw@gmail.com"];
var DEFAULT_FIREBASE_API_KEY = deploymentSettings_().firebaseApiKey;
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
var CACHED_PROPERTIES_ = null;
try {
  CACHED_PROPERTIES_ = PropertiesService.getScriptProperties().getProperties();
} catch (e) { /* ignore */ }

function getScriptProperty(key, defaultValue) {
  if (CACHED_PROPERTIES_ && typeof CACHED_PROPERTIES_ === 'object') {
    var val = CACHED_PROPERTIES_[key];
    if (val !== undefined && val !== null) return val;
  }
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
  'add_intimacy', 'delete_intimacy', 'add_event', 'delete_event', 'update_event_date',
  'configure_reminder_bridge', 'add_expense', 'delete_expense', 'set_budget', 'delete_budget', 'add_recurring', 'delete_recurring'
];


// Explicit authoritative data binding in both runtimes; never rewrite source at build time.
function appSpreadsheet_() { return SpreadsheetApp.openById(deploymentSettings_().spreadsheetId); }
