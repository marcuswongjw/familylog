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

