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

function parseDbsAlert(body, msg) {
  var toMatch = body.match(/^To:\s*(.+)$/m);
  var amtMatch = body.match(/Amount:\s*SGD\s*([\d\.,]+)/i);
  var dateMatch = body.match(/Date & Time:\s*(\d{1,2}\s+[A-Z]{3}\s+\d{2}:\d{2})/i);
  var refMatch = body.match(/Transaction Ref:\s*([A-Z0-9]+)/i);
  if (amtMatch) {
    var amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    var toVal = toMatch ? toMatch[1].trim() : 'DBS Card Transaction';
    var merchant = toVal;
    var account = null;
    var category = null;
    if (toVal.toUpperCase() === 'NETS VCC') {
      merchant = 'Top up cash card';
      account = 'Personal';
      category = 'Transportation - Auto: Service';
    }
    var dateStr = new Date().toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'});
    if (dateMatch) {
      var parts = dateMatch[1].trim().split(/\s+/);
      var day = parts[0];
      var month = parts[1];
      dateStr = day + ' ' + month + ' ' + inferYearForPastDate_(day, month);
    }
    var txRef = refMatch ? refMatch[1].trim() : null;
    return { amount: amount, merchant: merchant, dateStr: dateStr, txRef: txRef, account: account, category: category };
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
  var vals = perfReadRows_(sheet);
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
  var vals = perfReadRows_(sheet);
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
  var ss = appSpreadsheet_();
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
    { name: 'dbs_alert', query: 'from:DBSAlert@dbs.com label:inbox', parse: parseDbsAlert },
    { name: 'trust', query: 'from:from_us@trustbank.sg label:inbox', parse: parseTrust },
    { name: 'shopee', query: 'from:info@mail.shopee.sg label:inbox', parse: parseShopee },
    { name: 'expenses_label', query: 'label:inbox (label:expenses OR label:expense)', parse: function(body, msg) {
        var from = msg.getFrom().toLowerCase();
        if (from.indexOf('paylah.alert@dbs.com') !== -1) return parsePayLah(body);
        if (from.indexOf('ibanking.alert@dbs.com') !== -1) return parseDbsPayNow(body, msg);
        if (from.indexOf('dbsalert@dbs.com') !== -1) return parseDbsAlert(body, msg);
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
          var category = parsed.category || details.category;
          var account = parsed.account || details.account;

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
          pendingSheet.appendRow([id, dateStr, account, schoolCell_(category), amount, schoolCell_(note), new Date()]);
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
  var ss = appSpreadsheet_();
  var expSheet = ss.getSheetByName('Expenses');
  var category = '';
  var account = 'Family';
  if (expSheet) {
    var vals = perfReadRows_(expSheet);
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
  else if (id.indexOf('p_dbs_alert_') === 0) sourceTitle = 'DBS Alert';
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
  var ss = appSpreadsheet_();
  var sheet = ss.getSheetByName('PendingExpenses');
  if (!sheet) {
    return HtmlService.createHtmlOutput('<h3 style="font-family:sans-serif;text-align:center;margin-top:50px;color:#d9534f;">Error: PendingExpenses sheet not found.</h3>')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var vals = perfReadRows_(sheet);
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
    perfStage_('lock_wait',function(){lock.waitLock(10000);});
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
  var ss = appSpreadsheet_();
  var pendingSheet = ss.getSheetByName('PendingExpenses');
  if (!pendingSheet) return { status: 'error', message: 'PendingExpenses sheet not found' };
  var vals = perfReadRows_(pendingSheet);
  var rowIdx = -1;
  for (var i = 1; i < vals.length; i++) {
    if (toStr(vals[i][0]) === id) { rowIdx = i + 1; break; }
  }
  if (rowIdx === -1) {
    var expenses = ss.getSheetByName('Expenses'), importId='bank_'+schoolHash_(id);
    var recovered = expenses && perfReadRows_(expenses).some(function(r,i){return i > 0 && r[6] === importId;});
    return {status:recovered?'ok':'error',message:'This transaction was already processed'};
  }

  // Amount + date always come from the pending row (bank alert), not the form.
  var sheetDateStr = toStr(vals[rowIdx - 1][1]);
  var sheetAmount  = fullNumber_(vals[rowIdx - 1][4]);
  var sheetNote    = toStr(vals[rowIdx - 1][5]);

  if (status === 'approve') {
    var desc = toStr(params.desc) || sheetNote;
    if (desc.length > 200) desc = desc.substring(0, 200);
    var account = toStr(params.account) || 'Family';
    if (!financeAccount_(account)) return {status:'error',message:'Choose a valid account.'};
    var category = toStr(params.category) || toStr(vals[rowIdx - 1][3]) || 'Misc';
    if (!financeCategory_(category) || !Number.isFinite(sheetAmount) || sheetAmount < 0 || !sheetDateStr || !parseEventDateStrict(sheetDateStr,'')) return {status:'error',message:'Invalid transaction date, amount or category.'};
    var expSheet = ss.getSheetByName('Expenses');
    if (!expSheet) { expSheet = ss.insertSheet('Expenses'); expSheet.appendRow(['Timestamp', 'Date', 'Account', 'Category', 'Amount', 'Note','ID','Operation Fingerprint','Status']); }
    var parsedDate = parseEventDate(sheetDateStr, '');
    var importId = 'bank_'+schoolHash_(id);
    var imported = perfReadRows_(expSheet).some(function(r,i){return i > 0 && r[6] === importId;});
    if (!imported) expSheet.appendRow([new Date(), parsedDate, account, schoolCell_(category), sheetAmount, schoolCell_(desc),importId,'','']);
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
  var mockDbsAlert = 'Transaction Ref: EP\n' +
                     'Dear Sir/Madam,\n\n' +
                     'We refer to your card transaction dated 01 Aug. We are pleased to confirm that the transaction was completed.\n\n' +
                     'Date & Time: 01 Aug 13:53 (SGT)\n' +
                     'Amount: SGD50.00\n' +
                     'From: DBS/POSB Card ending 3717\n' +
                     'To: NETS VCC\n\n' +
                     'If unauthorised, call DBS hotline. To view transaction, please login to digibank.\n\n' +
                     'Thank you for banking with us.\n\n' +
                     'Yours faithfully\n' +
                     'DBS Bank Ltd';
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

  console.log('=== TEST: DBS ALERT ===');
  var parsed4 = parseDbsAlert(mockDbsAlert);
  if (parsed4) {
    console.log('DBS Alert: ' + parsed4.merchant + ' $' + parsed4.amount + (parsed4.txRef ? ' Ref: ' + parsed4.txRef : '') + ' Acc: ' + parsed4.account + ' Cat: ' + parsed4.category);
  } else {
    console.log('DBS Alert: failed');
  }
}

function testVerifyToken() {
  console.log('Run testVerifyToken with a real token from browser console.');
}

// ============================================================
// 9. ADD APPROVED TRIPS (unchanged)
// ============================================================
function addApprovedTrips() {
  var ss = appSpreadsheet_();
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
  var existing = perfReadRows_(sheet);
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
// ============================================================
// SCHOOL COPILOT — Sheets owns drafts/tasks; Calendar owns events.
// ============================================================
