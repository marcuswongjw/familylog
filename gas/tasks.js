function getTodos(ss, verifiedEmail, includeDone) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var tdSheet;
  try { tdSheet = ensureTodoIds_(ss); } finally { lock.releaseLock(); }
  var tdVals = tdSheet.getDataRange().getValues();
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
  var rows = sheet.getDataRange().getValues();
  if (rows[0] && rows[0][12] !== 'Reward Member') sheet.getRange(1, 13).setValue('Reward Member');
  if (!rows || rows.length === 0 || rows[0].length < 8 || rows[0][7] !== 'ID') {
    sheet.getRange(1, 8, 1, headers.length).setValues([headers]);
  }
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] && !rows[i][7]) sheet.getRange(i + 1, 8).setValue(Utilities.getUuid());
  }
  return sheet;
}
