function toStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).valueOf();
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

function annualEventDate_(year, month, day) {
  var d = new Date(year, month, day);
  if (month === 1 && day === 29 && d.getMonth() !== 1) d = new Date(year, 1, 28);
  return d;
}

function parseEventDateStrict(dateStr, timeStr) {
  dateStr = toStr(dateStr).trim(); timeStr = toStr(timeStr).trim();
  // Normalize Unicode spaces from some locale formatters
  dateStr = dateStr.replace(/[\u00a0\u202f]/g, ' ');
  if (!dateStr) return null;
  var now = new Date(); var year = now.getFullYear(); var parsed = null;
  // ISO yyyy-MM-dd (preferred from HTML date inputs)
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

function schoolHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function schoolCell_(s) { return /^[\s\u0000-\u001f]*[=+@-]/.test(s) ? "'" + s : s; }
function schoolDate_(value, optional) {
  if (!value && optional) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a full date including the year.');
  var date = new Date(value + 'T00:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date.');
  return value;
}
function schoolText_(value, limit, required) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error('Missing or overly long text.');
  return value.trim();
}
// ---- Helper validation functions ----
function writeValidateDate_(d) {
  if (!d) return true;
  // Uses the strict parser: the lenient parseEventDate falls back to
  // "today" on garbage input, which made this check always pass and
  // silently logged wrong dates.
  return parseEventDateStrict(d, '') !== null;
}
function writeValidateString_(s, maxLen) {
  maxLen = maxLen || 500;
  return s.length <= maxLen;
}

function fullNumber_(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return NaN;
  var number = Number(value); return Number.isFinite(number) ? number : NaN;
}
function birthdayDate_(value, year) {
  if (!/^\d{2}-\d{2}$/.test(value) || (year && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2100))) return false;
  var iso = (year || '2000') + '-' + value, date = new Date(iso+'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0,10) === iso;
}

function emptyExpensesPayload_() {
  return {
    rows: [], total: 0, byCategory: {}, byAccount: {}, history: [], lastMonthTotal: 0,
    familyTotal: 0, personalTotal: 0, familyByCategory: {}, personalByCategory: {},
    familyHistory: [], personalHistory: [], lastMonthFamilyTotal: 0, lastMonthPersonalTotal: 0
  };
}

