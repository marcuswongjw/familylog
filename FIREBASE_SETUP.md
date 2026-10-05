# Firebase setup — Wong’s Nest

Firebase is the **sole owner** of authentication, memories, photo storage, and opt-in reminders.  
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
| [firestore.rules](firestore.rules) | Only the 4 family emails; historical Chat read-only; own-account settings read, server-only settings/device writes; memories own write |
| [storage.rules](storage.rules) | New images under `memories/{email}/`; historical Chat images read-only |

```bash
cd /path/to/familylog
npm install
firebase login
firebase use familylog-86db6
firebase deploy --only firestore:rules,storage
```

Deploy both rule sets with the reminder functions so account preferences and device bindings are server-validated.

---

## 5. Cloud Functions & Gemini AI (School Copilot)

[index.js](index.js) exports callable Cloud Functions for multimodal school extraction:

- `extractSchoolAnnouncement` — multimodal Gemini analysis of a school notice or screenshot (parents only)
- `getSchoolSourceImage` — authenticated fetch of the original uploaded screenshot from Storage

### Setting up the Gemini AI key

1. Generate an API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
   - Keys typically start with `AQ.` (new format) or `AIza` (legacy Google Cloud keys).
2. Store the secret in Google Cloud Secret Manager via the Firebase CLI:
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY
   # Paste your Gemini API key when prompted
   ```
3. Deploy Cloud Functions:
   ```bash
   firebase deploy --only functions
   ```
   *(Grant Secret Manager Secret Accessor permission to the App Engine / Cloud Functions service account if prompted during deploy).*

### Architecture & safeguards
- **Image downscaling:** The client downscales camera photos to max 1600px JPEG before upload, preventing upload timeouts on mobile networks.
- **Quota gating:** 30 extractions per user per day tracked in Firestore collection `schoolExtractionLimits`.
- **Model failover:** Primary model is `gemini-2.5-flash`, with automatic fallback to `gemini-3.5-flash` in case of 503 high-demand spikes.
- **Zero dual-write:** Cloud Functions only perform extraction and return a draft structure. No calendar events or tasks are written by Firebase; publishing is strictly owned by Google Sheets + Apps Script.

---

## 6. End-to-End Live Verification Checklist

Follow this checklist to verify that screenshot upload → Gemini → Sheets → Calendar operates cleanly:

1. **Screenshot Upload & AI Extraction**:
   - Open Wong’s Nest as a parent (Marcus or Eleanor).
   - Tap **School Copilot** → choose a photo or paste text → tap **Read with Gemini AI**.
   - *Verification:* Spinner should resolve within 2–5 seconds with an extracted draft (Title, Child, Event date/times, Tasks).
2. **Review & Task Owner Defaulting**:
   - Check that the detected child matches. If changed via the Child dropdown, task owners should sync to that child automatically.
   - Verify task owners default to the child of the plan.
3. **Save Draft & Publication**:
   - Check the confirmation checkbox and tap **Add to family plan**.
   - *Verification:*
     - A calendar event appears on Google Calendar.
     - Tasks are appended to the `ToDo` sheet.
     - An announcement row is recorded on `SchoolAnnouncements` sheet with status `published`.
4. **Child Readiness & Checklist Retention**:
   - Open Home as a child (Mikaela or Meaghan).
   - Tap **Today** / **Tomorrow** pills.
   - Complete an undated packing task or homework task.
   - *Verification:* The task remains visible on the daily card with a green `✓ Packed` or `✓ Done` badge, and the progress bar updates (e.g. 1 of 3 $\rightarrow$ 33%) without disappearing.

---

## 7. Data model (Firebase)

| Collection / path | Contents |
|-------------------|----------|
| `users/{email}` | `email`, `name`, `fcmTokens[]` |
| `memories/{id}` | `loggedBy`, `loggedByEmail`, `date`, `type`, `person`, `memory`, `imageUrl`, `timestamp` |
| `schoolExtractionLimits/{uid}` | `day` (`YYYY-MM-DD`), `count` (daily operational rate-limit counter) |
| Storage `memories/{email}/{file}` | Memory images |
| Storage `school/{email}/{sha256}` | Temporary school announcement screenshots |

**Not in Firebase:** expenses, budgets, Us appreciations/check-ins, fertility, travel pins, calendar, todos, school announcements — those are **Sheets + GAS**.

---

## 8. Apps Script + Firebase together

GAS verifies tokens with the Identity Toolkit API using `FIREBASE_API_KEY` (Script property or default in `Code.js`) and enforces `ALLOWED_EMAILS` / `ADULT_EMAILS`.

After any `Code.js` change, deploy via clasp:

```bash
./scripts/deploy-gas.sh
```

Or manually:
1. Paste `Code.js` into the spreadsheet's Apps Script editor (https://script.google.com).
2. **Deploy → Manage deployments → Edit active deployment → New version → Deploy**.

Recommended Script property: `APPROVAL_SECRET` (expense approval link signing).

---

## 9. PWA & notifications

1. Deploy site via GitHub Pages  
2. On phone: open site → **Add to Home Screen**  
3. Sign in → header bell → enable reminders → allow browser notifications. A parent must enable once to connect the family plan. Login does not prompt.  
4. iOS: home-screen PWA + iOS 16.4+ for web push; force-refresh after SW cache bumps  

Service worker: **`firebase-messaging-sw.js` only** (legacy `sw.js` removed).

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Invalid email or password | Email matches `MEMBERS` exactly; PIN is **6 digits** |
| permission-denied on memory upload | Signed in; rules deployed; path is `memories/{yourEmail}/…` |
| No push | Reminders enabled; browser permission; `notificationDevices` current account; parent bridge setup; chosen Singapore hour outside quiet hours |
| Notification does not open Home | Latest SW (`wongs-nest-v27`); same account still signed in; reminder targets `?open=home` |
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

## Reminder deployment

The live reminder services are `updateReminderSettings`, `sendFamilyReminders` (every 15 minutes, Singapore time) and `cleanupAbandonedMemoryUploads` (03:00 Singapore time). Configure a 64-character hexadecimal `REMINDER_BRIDGE_SECRET` in Firebase Secret Manager before deploying the first two functions. Parent opt-in passes it server-to-server into GAS Script Properties using the parent's verified identity; never put it in browser assets. Deploy `Code.js` and Firestore/Storage rules with the functions. `sendChatNotification` is retired and must not be redeployed.

Live delivery is opt-in. Automated tests validate targeting, quiet hours, duplicate receipts and worker account checks with mock FCM; actual phone receipt requires an enabled, signed-in device.
