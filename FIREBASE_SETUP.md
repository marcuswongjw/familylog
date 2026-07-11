# Firebase setup — Wong Family Log

Firebase is the **sole owner** of authentication, live chat, memories, photo storage, and push notifications.  
Google Sheets + Apps Script own money, tasks, calendar, travel, and Us/fertility logs — **not** chat or memories.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full ownership map. Do not dual-write the same feature to both backends.

**Current project id (this repo):** `familylog-86db6`

---

## 1. Create / open the Firebase project

1. [Firebase Console](https://console.firebase.google.com/) → create or select a project  
2. Add a **Web** app and copy the `firebaseConfig` object  
3. Enable:
   - **Authentication** → Email/Password  
   - **Firestore**  
   - **Storage**  
   - **Cloud Messaging** (for web push; generate a **Web Push certificate / VAPID** key)  
   - **Functions** (Blaze plan typically required)

---

## 2. Wire the client

In `index.html` (and the matching block in `firebase-messaging-sw.js`):

```javascript
const firebaseConfig = {
  apiKey: "…",
  authDomain: "….firebaseapp.com",
  projectId: "…",
  storageBucket: "….firebasestorage.app",  // or *.appspot.com
  messagingSenderId: "…",
  appId: "…",
  measurementId: "…"  // optional
};
const VAPID_KEY = '…';  // Cloud Messaging → Web Push certificates
```

In `index.html`, keep `MEMBERS` emails identical to Auth users:

```javascript
const MEMBERS = [
  { name: 'Marcus',  emoji: '👨', email: 'marcuswongjw@gmail.com' },
  { name: 'Eleanor', emoji: '👩', email: 'eleanor.jiamin@gmail.com' },
  { name: 'Mikaela', emoji: '👧', email: 'mikaelawonght@gmail.com' },
  { name: 'Meaghan', emoji: '👧', email: 'meaghanwongzx@gmail.com' },
];
```

Parents (Us / fertility) are also listed as `ADULT_EMAILS` in the client and in Apps Script / rules.

---

## 3. Create family users (6-digit PIN)

For **each** family member:

1. **Authentication → Users → Add user**  
2. **Email** = that member’s address in `MEMBERS`  
3. **Password** = exactly a **6-digit numeric PIN** (same rule for kids and parents)  

The login screen rejects non–6-digit passwords.

To change a PIN later: Console → user → reset password (or temporary in-app flow if you add one).

---

## 4. Security rules (required)

Rules live in the repo and must be deployed:

| File | Purpose |
|------|---------|
| [firestore.rules](firestore.rules) | Only the 4 family emails; chat R/W family, **delete own**; `users/{email}` write own only; memories own write |
| [storage.rules](storage.rules) | Images under `chat/{email}/` and `memories/{email}/` only |

```bash
cd /path/to/familylog
npm install
firebase login
firebase use familylog-86db6
firebase deploy --only firestore:rules,storage
```

Without these, chat/users may be open or uploads may fail after path changes.

---

## 5. Cloud Function (chat push)

[index.js](index.js) exports `sendChatNotification` on `chat/{messageId}` create:

- Notifies other members’ FCM tokens (matches **email**, not display name)  
- Deep link: `?open=chat#chat`  
- Prunes invalid tokens after failed sends  

```bash
firebase deploy --only functions
```

Optional env: `FAMILYLOG_APP_URL` if the PWA is not at `https://marcuswongjw.github.io/familylog/`.

---

## 6. Data model (Firebase)

| Collection / path | Contents |
|-------------------|----------|
| `chat/{id}` | `user`, `senderEmail`, `message`, `imageUrl`, `timestamp` |
| `users/{email}` | `email`, `name`, `fcmTokens[]` |
| `memories/{id}` | `loggedBy`, `loggedByEmail`, `date`, `type`, `person`, `memory`, `imageUrl`, `timestamp` |
| Storage `chat/{email}/{file}` | Chat images |
| Storage `memories/{email}/{file}` | Memory images |

**Not in Firebase:** expenses, budgets, Us appreciations/check-ins, fertility, travel pins, calendar — those are **Sheets + GAS**.

**Do not recreate a Sheets “Chat” tab** — chat is Firestore-only. Safe to delete an old Chat sheet if it still exists.

---

## 7. Apps Script + Firebase together

GAS verifies tokens with the Identity Toolkit API using `FIREBASE_API_KEY` (Script property or default in `Code.js`) and enforces `ALLOWED_EMAILS` / `ADULT_EMAILS`.

After any `Code.js` change:

1. Paste into the sheet’s Apps Script project  
2. **Deploy → Manage deployments → New version**  

Recommended Script property: `APPROVAL_SECRET` (expense approval link signing).

---

## 8. PWA & notifications

1. Deploy site via GitHub Pages  
2. On phone: open site → **Add to Home Screen**  
3. Sign in → allow notifications  
4. iOS: home-screen PWA + iOS 16.4+ for web push; force-refresh after SW cache bumps  

Service worker: **`firebase-messaging-sw.js` only** (legacy `sw.js` removed).

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Invalid email or password | Email matches `MEMBERS` exactly; PIN is **6 digits** |
| permission-denied on chat/upload | Signed in; rules deployed; path is `chat/{yourEmail}/…` |
| No push | FCM token saved under `users/{email}`; function deployed; notification permission |
| Push but no Chat on tap | Latest SW (`wong-family-v*`); deep link `?open=chat`; reinstall PWA if needed |
| GAS Unauthorized | Token present; email on allowlist; redeployed `Code.js` |
| Shopee only first item | Redeploy latest `Code.js` with multi-item `parseShopee` |

---

## Deploy cheat sheet

```bash
# Rules + push function
firebase deploy --only firestore:rules,storage,functions

# Frontend: git push origin main  (GitHub Pages)

# Backend API / scanners: paste Code.js → Apps Script → New version
```
