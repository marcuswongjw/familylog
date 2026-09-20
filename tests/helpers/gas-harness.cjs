const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
// Model the actual Sheets/Calendar boundaries, including a lost response AFTER an
// external write, so retries are tested rather than just successful code paths.
function harness() {
  class Sheet {
    constructor(rows = []) { this.rows = rows; this.failAppendAfter = false; }
    appendRow(row) { this.rows.push([...row]); if (this.failAppendAfter) { this.failAppendAfter = false; throw new Error('Lost Sheets response'); } }
    getDataRange() { return { getValues: () => this.rows.map(r => [...r]) }; }
    getRange(row, col, height = 1, width = 1) {
      return { setValue: value => this.getRange(row, col).setValues([[value]]), setValues: values => {
        for (let i = 0; i < height; i++) for (let j = 0; j < width; j++) { this.rows[row + i - 1] ||= []; this.rows[row + i - 1][col + j - 1] = values[i][j]; }
      } };
    }
  }
  const sheets = {};
  const ss = { getSheetByName: name => sheets[name] || null, insertSheet: name => sheets[name] = new Sheet() };
  const calendar = new Map();
  let failCalendarAfter = false;
  const c = vm.createContext({ console: { log() {} }, Date, JSON, PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({}) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Singapore' }, ScriptApp: { getOAuthToken: () => 'test-token' },
    Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()],
      formatDate: (date, zone, format) => format === 'yyyy-MM-dd' ? new Date(date).toISOString().slice(0, 10) : new Date(date).toDateString() },
    UrlFetchApp: { fetch: (url, opts) => {
      let code, saved;
      if (opts.method === 'post') {
        const event = JSON.parse(opts.payload);
        if (calendar.has(event.id)) { code = 409; saved = {}; }
        else { code = 200; saved = { ...event, iCalUID: event.id + '@google.com' }; calendar.set(event.id, saved); if (failCalendarAfter) { failCalendarAfter = false; throw new Error('Lost Calendar response'); } }
      } else { saved = calendar.get(url.split('/').pop()); code = saved ? 200 : 404; }
      return { getResponseCode: () => code, getContentText: () => JSON.stringify(saved) };
    } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../../Code.js'), 'utf8'), c);
  return { c, ss, sheets, calendar, Sheet, failCalendar: () => { failCalendarAfter = true; }, write: (payload, email = 'marcuswongjw@gmail.com') => c.handleWrite({ ...payload, _verifiedEmail: email }) };
}

module.exports = { harness };
