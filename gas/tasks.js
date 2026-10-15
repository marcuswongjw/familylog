function getTodosMeasured_(ss, verifiedEmail, includeDone) {
  ss = ss || appSpreadsheet_();
  var tdSheet = ss.getSheetByName('ToDo');
  var tdVals = tdSheet ? perfReadRows_(tdSheet) : [];
  var needsMigration = !tdVals[0] || tdVals[0][7] !== 'ID' || tdVals[0][12] !== 'Reward Member' || tdVals.some(function(row, i) { return i > 0 && row[1] && !row[7]; });
  if (needsMigration) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try { tdSheet = ensureTodoIds_(ss); tdVals = perfReadRows_(tdSheet); } finally { lock.releaseLock(); }
  }
  var tz     = Session.getScriptTimeZone();
  var result = [];
  for (var i = 1; i < tdVals.length; i++) {
    var row = tdVals[i];
    if (!row[1] || toStr(row[5]).toLowerCase() === 'deleted' || (!includeDone && toStr(row[5]).toLowerCase() === 'done')) continue;
    if (verifiedEmail && !isAdultEmail_(verifiedEmail) && row[2] !== memberNameFromEmail_(verifiedEmail) && row[2] !== 'Everyone') continue;
    result.push({
      id: toStr(row[7]), sourceId: toStr(row[8]), kind: toStr(row[9]), child: toStr(row[10]),
      rowNum:   i + 1,
      task:     toStr(row[1]),
      assignee: toStr(row[2]) || 'Everyone',
      due:      row[3] ? Utilities.formatDate(new Date(row[3]), tz, 'dd MMM yyyy') : '',
      dueRaw:   row[3] ? Utilities.formatDate(new Date(row[3]), tz, 'yyyy-MM-dd') : '',
      completedRaw: row[6] ? Utilities.formatDate(new Date(row[6]), tz, 'yyyy-MM-dd') : '',
      completedAt: row[6] ? (row[6] instanceof Date ? row[6].toISOString() : (new Date(row[6]).toISOString())) : '',
      completedBy: toStr(row[12]) || '',
      createdAt: row[0] ? (row[0] instanceof Date ? row[0].toISOString() : (new Date(row[0]).toISOString())) : '',
      addedBy:  toStr(row[4]),
      status:   toStr(row[5]) || 'Open'
    });
  }
  return result;
}

function ensureTodoIds_(ss) {
  var sheet = ss.getSheetByName('ToDo');
  if (!sheet) {
    sheet = ss.insertSheet('ToDo');
    sheet.appendRow(['Date Added', 'Task', 'Assignee', 'Due Date', 'Added By', 'Status', 'Completed At', 'ID', 'Source ID', 'Kind', 'Child', 'Evidence', 'Reward Member']);
    return sheet;
  }
  var headers = ['ID', 'Source ID', 'Kind', 'Child', 'Evidence'];
  var rows = perfReadRows_(sheet);
  if (rows[0] && rows[0][12] !== 'Reward Member') sheet.getRange(1, 13).setValue('Reward Member');
  if (!rows || rows.length === 0 || rows[0].length < 8 || rows[0][7] !== 'ID') {
    sheet.getRange(1, 8, 1, headers.length).setValues([headers]);
  }
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] && !rows[i][7]) sheet.getRange(i + 1, 8).setValue(Utilities.getUuid());
  }
  return sheet;
}

// Stable keyset pagination: ownership filtering happens in getTodos before this helper.
// Re-read authoritative rows on each page; no cached household records or positional offsets.
function completedTaskPage_(todos, cursor) {
  var before = null;
  if (cursor != null && cursor !== '') {
    if (typeof cursor !== 'string' || cursor.length > 512) throw new Error('Invalid history cursor');
    before = JSON.parse(cursor);
    if (!before || typeof before.at !== 'string' || typeof before.id !== 'string' || before.at.length > 40 || !before.id || before.id.length > 200) throw new Error('Invalid history cursor');
  }
  var key = function(t){return t.completedAt || t.completedRaw || '';};
  var rows = todos.filter(function(t){return t.status.toLowerCase() === 'done';});
  rows.sort(function(a,b){var x=key(a),y=key(b);return x===y ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : x<y ? 1 : -1;});
  if (before) rows=rows.filter(function(t){return key(t)<before.at || (key(t)===before.at && t.id<before.id);});
  var items=rows.slice(0,50),last=items[items.length-1];
  return {items:items,nextCursor:rows.length>50 ? JSON.stringify({at:key(last),id:last.id}) : null};
}
