function emptyExpensesPayload_() {
  return {
    rows: [], total: 0, byCategory: {}, byAccount: {}, history: [], lastMonthTotal: 0,
    familyTotal: 0, personalTotal: 0, familyByCategory: {}, personalByCategory: {},
    familyHistory: [], personalHistory: [], lastMonthFamilyTotal: 0, lastMonthPersonalTotal: 0
  };
}

function getExpensesData(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var expSheet = ss.getSheetByName('Expenses');
  if (!expSheet) return emptyExpensesPayload_();
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
