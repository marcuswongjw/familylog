function schoolSheet_(ss) {
  var sheet = ss.getSheetByName('SchoolAnnouncements');
  if (!sheet) { sheet = ss.insertSheet('SchoolAnnouncements'); sheet.appendRow(['ID', 'Status', 'Revision', 'Plan JSON', 'Calendar ID', 'Updated At', 'Updated By']); }
  return sheet;
}
// Damaged rows remain in Sheets for repair; exclude them from active reads.
function schoolStoredPlan_(row) {
  var raw = JSON.parse(row[3]);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.id !== row[0]) throw new Error('Invalid stored plan');
  var plan = schoolValidatePlan_(raw, '');
  if (plan.id !== raw.id || ['draft','publishing','published'].indexOf(row[1]) < 0 || !Number.isInteger(Number(row[2])) || Number(row[2]) < 1) throw new Error('Invalid stored plan');
  plan.status = row[1]; plan.revision = Number(row[2]); plan.calendarId = toStr(row[4]);
  return plan;
}
function schoolStoredRows_(ss) {
  var sheet = ss.getSheetByName('SchoolAnnouncements');
  return sheet ? perfReadRows_(sheet).slice(1).filter(function(r){return r[0];}) : [];
}
function schoolRecordWarnings_Measured_(ss, adult, storedRows) {
  if (!adult) return [];
  var count = 0;
  (storedRows || schoolStoredRows_(ss)).forEach(function(r){try { schoolStoredPlan_(r); } catch (err) { count++; }});
  return count ? [count + ' school record(s) could not load. Other family data is available. Ask a parent to repair the SchoolAnnouncements records.'] : [];
}
function schoolReadPlans_Measured_(ss, adult, storedRows) {
  if (!adult) return [];
  var plans = [];
  (storedRows || schoolStoredRows_(ss)).forEach(function(r){try { plans.push(schoolStoredPlan_(r)); } catch (err) { console.log('Skipped damaged school record row'); }});
  return plans.reverse();
}
function schoolEventLinks_() {
  var links = {};
  schoolStoredRows_(appSpreadsheet_()).forEach(function(r){
    if (!r[4]) return;
    try {
      var p = schoolStoredPlan_(r), calId = toStr(r[4]);
      links[calId] = {child:p.child,sourceId:p.id};
      if (calId.indexOf('@') !== -1) links[calId.split('@')[0]] = {child:p.child,sourceId:p.id};
    } catch (err) {
      // Retain ownership protection even when the notice cannot supply display tags.
      var calId = toStr(r[4]);
      links[calId] = {child:'',sourceId:toStr(r[0])};
      if (calId.indexOf('@') !== -1) links[calId.split('@')[0]] = links[calId];
      console.log('Skipped damaged school calendar link details');
    }
  });
  return links;
}
function schoolValidatePlan_(raw, email) {
  var VALID_TARGETS = ['Mikaela', 'Meaghan', 'Marcus', 'Eleanor', 'Family', 'Everyone'];
  if (!raw || VALID_TARGETS.indexOf(raw.child) === -1) throw new Error('Choose who this notice or message is for (Mikaela, Meaghan, Marcus, Eleanor, or Family).');
  var p = {
    title: schoolText_(raw.title, 200, true), child: raw.child,
    sourceText: schoolText_(raw.sourceText || '', 20000, false), sourcePath: schoolText_(raw.sourcePath || '', 250, false),
    event: null, tasks: [], warnings: []
  };
  if (p.sourcePath && !/^school\/(marcuswongjw@gmail\.com|eleanor\.jiamin@gmail\.com)\/[a-f0-9]{64}$/.test(p.sourcePath)) throw new Error('Invalid source image.');
  if (!p.sourceText && !p.sourcePath) throw new Error('Keep the original message or screenshot with this plan.');
  p.id = 'school_' + schoolHash_(p.child + '\n' + (p.sourcePath ? p.sourcePath.split('/').pop() : p.sourceText.replace(/\s+/g, ' ').trim()));
  var ev = raw.event || {};
  p.event = { enabled: ev.enabled === true, title: schoolText_(ev.title || p.title, 200, true), date: schoolText_(ev.date || '', 10, false),
    time: schoolText_(ev.time || '', 5, false), endTime: schoolText_(ev.endTime || '', 5, false),
    location: schoolText_(ev.location || '', 200, false), evidence: schoolText_(ev.evidence || '', 1500, false) };
  if (!Array.isArray(raw.tasks) || raw.tasks.length > 30) throw new Error('Use up to 30 tasks per message.');
  raw.tasks.forEach(function(t, i) {
    var kind = t.kind;
    if (['packing', 'homework', 'consent', 'payment', 'other'].indexOf(kind) === -1) throw new Error('Invalid task type.');
    if (FAMILY_MEMBERS.indexOf(t.assignee) === -1) throw new Error('Choose a task owner.');
    p.tasks.push({ id: p.id + '_' + i, title: schoolText_(t.title, 200, true), kind: kind, assignee: t.assignee,
      due: schoolDate_(t.due || '', true), evidence: schoolText_(t.evidence || '', 1500, false) });
  });
  if (Array.isArray(raw.warnings)) p.warnings = raw.warnings.slice(0, 20).map(function(w) { return schoolText_(w, 1000, false); });
  if (JSON.stringify(p).length > 45000) throw new Error('Split this message into smaller announcements.');
  return p;
}
function schoolValidatePublication_(p) {
  if (!p.tasks.length && !p.event.enabled) throw new Error('Add an event or at least one task.');
  var ev = p.event;
  if (!ev.enabled) return;
  schoolDate_(ev.date, false);
  if (ev.time) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(ev.time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(ev.endTime) || ev.endTime <= ev.time) {
      throw new Error('Confirm start and end times (same day), or save without the event.');
    }
  } else if (ev.endTime) throw new Error('Choose a start time or clear the end time for an all-day event.');
}
// A deterministic Calendar REST ID makes retries safe even if the create succeeds
// but the response or subsequent Sheets write fails. No duplicate event on retry.
function schoolPublishEvent_(p) {
  var ev = p.event;
  var eventId = 'fl' + schoolHash_(p.id);
  var url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(CALENDAR_ID) + '/events';
  var event = { id: eventId, summary: ev.title, location: ev.location,
    description: 'Wong’s Nest plan: ' + p.title,
    extendedProperties: { private: { familylogSourceId: p.id, child: p.child, member: p.child } }, reminders: { useDefault: false } };
  if (ev.time) {
    event.start = { dateTime: ev.date + 'T' + ev.time + ':00+08:00', timeZone: 'Asia/Singapore' };
    event.end = { dateTime: ev.date + 'T' + ev.endTime + ':00+08:00', timeZone: 'Asia/Singapore' };
  } else {
    var next = new Date(ev.date + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
    event.start = { date: ev.date }; event.end = { date: next.toISOString().slice(0, 10) };
  }
  var options = { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify(event), muteHttpExceptions: true };
  var response = UrlFetchApp.fetch(url + '?sendUpdates=none', options);
  if (response.getResponseCode() === 409) response = UrlFetchApp.fetch(url + '/' + eventId, { headers: options.headers, muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Calendar could not save the event. The draft is safe; retry publication.');
  var saved = JSON.parse(response.getContentText());
  if (saved.status === 'cancelled') throw new Error('This calendar event was deleted. Restore it in Calendar before retrying.');
  return saved.iCalUID || eventId + '@google.com';
}
function schoolHandleWrite_(data, ss, email, user) {
  try {
    if (!isAdultEmail_(email)) throw new Error('Only parents can review and publish announcements.');
    var sheet = schoolSheet_(ss);
    var rows = perfReadRows_(sheet);
    if (data.note === 'save_school_draft') {
      var p = schoolValidatePlan_(data.plan, email);
      var index = rows.findIndex(function(r) { return r[0] === p.id; });
      if (index > 0) {
        if (rows[index][1] !== 'draft') return { status: 'ok', id: p.id, state: rows[index][1], revision: Number(rows[index][2]), duplicate: true };
        if (Number(data.revision) !== Number(rows[index][2])) return { status: 'error', message: 'This message already has a saved draft. Reopen it from Home to review the latest version.' };
      }
      var revision = index > 0 ? Number(rows[index][2]) + 1 : 1;
      var values = [p.id, 'draft', revision, JSON.stringify(p), '', new Date(), user];
      if (index > 0) sheet.getRange(index + 1, 1, 1, 7).setValues([values]); else sheet.appendRow(values);
      return { status: 'ok', id: p.id, state: 'draft', revision: revision };
    }
    var rowIndex = rows.findIndex(function(r) { return r[0] === data.source_id; });
    if (rowIndex < 1) throw new Error('Draft not found.');
    var row = rows[rowIndex]; var plan = JSON.parse(row[3]);
    if (row[1] === 'published') return { status: 'ok', id: plan.id, state: 'published' };
    if (Number(data.revision) !== Number(row[2])) throw new Error('Draft changed. Reopen it before publishing.');
    schoolValidatePublication_(plan);
    // Freeze the reviewed plan before creating any external records.
    sheet.getRange(rowIndex + 1, 2).setValue('publishing'); SpreadsheetApp.flush();
    var calendarId = toStr(row[4]);
    if (plan.event.enabled && !calendarId) {
      calendarId = schoolPublishEvent_(plan);
      sheet.getRange(rowIndex + 1, 5).setValue(calendarId); SpreadsheetApp.flush();
    }
    var todos = ensureTodoIds_(ss);
    var ids = perfReadRows_(todos).map(function(r) { return r[7]; });
    plan.tasks.forEach(function(t) {
      if (ids.indexOf(t.id) !== -1) return;
      todos.appendRow([new Date(), schoolCell_(t.title), t.assignee, t.due ? new Date(t.due + 'T12:00:00+08:00') : '', user, 'Open', '', t.id, plan.id, t.kind, plan.child, schoolCell_(t.evidence)]);
      ids.push(t.id);
    });
    sheet.getRange(rowIndex + 1, 2).setValue('published');
    sheet.getRange(rowIndex + 1, 6, 1, 2).setValues([[new Date(), user]]);
    var eventTitle = (plan.event && plan.event.title) ? plan.event.title : (plan.tasks[0] ? plan.tasks[0].title : 'School notice');
    recordActivity_(ss, user, 'school_published', 'School', user + ' published school notice: "' + eventTitle + '"' + (plan.child ? ' for ' + plan.child : ''), plan.tasks.length + ' task(s) created');
    return { status: 'ok', id: plan.id, state: 'published' };
  } catch (e) { return { status: 'error', message: e.message }; }
}

// Parent app reads only private-parent domains; no Calendar/reconciliation/family reads.
