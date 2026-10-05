# Wong’s Nest

A personal family hub PWA: school + daily/weekly logistics, budgets & expenses, calendar/tasks, travel map, memories, and a parents-only **Us** sanctuary.

**Live app:** [GitHub Pages](https://marcuswongjw.github.io/familylog/)  
**Repo:** [marcuswongjw/familylog](https://github.com/marcuswongjw/familylog)

---

## Architecture

**Full ownership rules:** [ARCHITECTURE.md](ARCHITECTURE.md) (Sheets vs Firebase — what lives where and why).

```mermaid
flowchart LR
  PWA[PWA: index.html + css/ + js/] -->|POST JSON + Firebase ID token| GAS[Google Apps Script Code.js]
  GAS --> Sheets[(Google Sheets)]
  GAS --> GCal[Google Calendar]
  GAS --> Gmail[Gmail bank alerts]
  PWA -->|Auth / Memories / FCM| FB[Firebase]
  FB --> FS[(Firestore)]
  FB --> ST[(Storage)]
```

| Layer | Tech | Role |
|--------|------|------|
| **Frontend** | `index.html`, `css/styles.css`, `js/app.js` | UI; routes each feature to the correct backend |
| **Firebase** | Auth, Firestore, Storage, FCM | **Owns:** login, memories, photos, push tokens |
| **GAS + Sheets** | `Code.js` + spreadsheet | **Owns:** money, tasks, calendar, travel, Us/fertility logs; Gmail bank scan |
| **Functions** | `index.js` | School announcement extraction |
| **Hosting** | GitHub Pages | Static frontend |

**Do not dual-write.** Memories never go through Sheets. Expenses and Us data never go through Firestore. Kids never receive money payloads.

---

## Features

### Family
- **Home dashboard** — school copilot, today/tomorrow logistics, member overview  
- **Calendar / Tasks / Schedules** — Google Calendar + Sheets todos (week view first)  
- **Expenses & budgets** — ledger, categories, gauges; Gmail bank-alert scanner (parents only)  
- **Travel map** — Leaflet pins by trip  
- **Memories** — photos + notes (Firestore + Storage)  
- **Birthdays / recurring expenses**

### Parents only (Us + Fertility)
- **Us sanctuary** — battery check-ins, appreciation jar (Friday reveal), bucket list, spark roulette  
- **Intimacy log** — private log when you make love (date, notes, optional 1–5 hearts); adults only  
- **Fertility tracker** — period / ovulation / symptoms; adaptive cycle estimates  

Kids’ accounts cannot open Us/Fertility (UI + server empty payloads / write deny).

---

## Project layout

```
ARCHITECTURE.md         # Sheets vs Firebase ownership (read this first)
index.html              # Shell markup + third-party CDN scripts
css/styles.css          # All app styles
js/app.js               # Client: Firebase memories/auth + GAS for Sheets data
Code.js                 # Apps Script: Sheets/Calendar/Gmail only (deploy separately)
firebase-messaging-sw.js
index.js                # Cloud Functions (school extraction)
firestore.rules
storage.rules
manifest.json
FIREBASE_SETUP.md
```

After editing frontend files, commit and push to `main` for GitHub Pages.  
After editing `Code.js`, run `./scripts/deploy-gas.sh` (clasp push + existing web app deployment). One-time setup: `npx @google/clasp@2.5.0 login` and a `.clasp.json` with the Apps Script project ID.

---

## Security model

1. **Firebase Auth** — each member has an account (email + 6-digit PIN password).  
2. **GAS API** — every `POST` must include a Firebase `idToken`; server verifies via Identity Toolkit and checks **ALLOWED_EMAILS**.  
3. **Identity** — write actions use email→name mapping server-side; client `user` field is not trusted.  
4. **Adult-only notes** — `add_intimacy`, Us, fertility, bucket list enforced in `ADULT_ONLY_NOTES`.  
5. **Firestore / Storage rules** — family email allowlist; uploads under `memories/{email}/`.  
6. **Expense approval emails** — signed links (`id` + `exp` + HMAC); set Script Property `APPROVAL_SECRET` to a long random string.

---

## Setup (short)

### Firebase
See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for Auth, family users, FCM, and rules deploy.

### Apps Script
1. Bind `Code.js` to the family spreadsheet.  
2. Deploy as **Web App** (Execute as: Me, Access: Anyone).  
3. Paste the web app URL into `js/app.js` as `GAS_URL`.  
4. Triggers: inbox scanner, `dailyNotifications`, `keepAlive` as needed.  
5. Script properties (optional but recommended): `APPROVAL_SECRET`, `CALENDAR_ID`, `NOTIFY_EMAILS`, etc.

### GitHub Pages
Settings → Pages → branch `main` / root.  
App URL: `https://marcuswongjw.github.io/familylog/`

### Phone PWA
Open the site → **Add to Home Screen**.  
Updates: open the app **online** after a deploy (no App Store reinstall). Redeploy **GAS** separately when `Code.js` changes.

---

## API (client → GAS)

All app traffic uses **HTTP POST** with JSON body (no ID token in query strings):

```json
{ "action": "get_all", "idToken": "…" }
{ "action": "write", "note": "add_expense", "idToken": "…", … }
```

Email approval pages still use **GET** with signed `id` / `exp` / `sig` (no Firebase session).

---

## Pull to refresh

On the main app screens, **pull down** from the top of the scroll area (when already at scroll top) to reload dashboard data from GAS. The header 🔄 button still works too.

---

## Privacy note (Us / intimacy)

Intimacy log and fertility data are:
- Only returned for **adult** accounts in `get_all`  
- Only writable by adults  
- Stored in Google Sheets tabs `IntimacyLog` / `Fertility` (same Google account as the spreadsheet)

Treat the spreadsheet ACL carefully (share only with parents if preferred).

## Companions & stars

Home now includes an original animal companion and a shared family garden. Open **Nest → Companions & stars** to choose a fox, rabbit, bear or cat, name it, and spend earned stars on accessories. Parents see every habit under **Companions**, enter a whole number from 0 to 100 stars for each, and save them together. Task rewards use the existing 0, 1, 3 or 5 star choices. Activities start with no rewards until a parent selects them.

Tasks reward the assignee once; an Everyone task rewards its first completer. Habits reward once per member per Singapore calendar day, after the save succeeds. Older entries earn no stars. Removing an entry keeps earned stars, and logging it again cannot earn more. Spending stars keeps lifetime family progress toward the 40-star garden. Animations are brief and respect reduced-motion settings.

Deploy the updated `Code.js` web app **before** publishing the frontend. `RewardRules`, `RewardLedger` and `Companions` sheets are created automatically on their first write; the ToDo sheet gains a `Reward Member` column for reliable completion retries. No Firebase rules or functions change is needed. A frontend connected to the old backend shows an update message on the companions screen.

Validation: `npm test`. For an isolated browser preview, run `node tests/preview-server.cjs --rewards-demo` and open `http://127.0.0.1:4173`. The preview uses the real frontend and Apps Script handlers with in-memory Sheets and mocked external services; it never writes production family data.

## Wong’s Nest redesign

The app now uses a nest emblem, lavender/apricot paper surfaces, Nunito headings and DM Sans body text. Desktop has a permanent sidebar; phones have Home, Plan, Tasks, Nest and More for parents; children have Habits in place of Plan and see only their own or shared plans and habits. More includes every additional family destination and the adult-only parent tools. Login, page headings, cards, forms, dark mode, companions, app icons, notification defaults and email digest names share the new identity.

`css/nest.css` is the current design layer, and `js/nest.js` owns icons, headings and navigation presentation. See `BRAND.md`. Existing family accounts, backend addresses, stored preferences, permissions and reward rules are retained. Publish the Apps Script changes before the frontend. The new PWA cache version refreshes the app shell; operating systems may refresh an already installed home-screen icon separately.


## Everyday routines

Habits support daily practice, selected weekdays, or a weekly target of 1–7 distinct days. Existing habits remain active and daily. Parents can pause, archive and restore habits; editing keeps the same ID, history and earned stars. Archived habits live in the parent Habits archive, and each shared habit has separate progress for every member. Parents can choose whom to log for, including from each child’s daily Home card. Stars are awarded on eligible scheduled days, once per member/day; additional weekly completions after the target do not earn stars.

Children’s Home combines the selected day’s scheduled habits, packing and homework. A large next-step button, gentle help prompts and scheduled-day progress replace strict streaks. Completed ordinary tasks remain in the daily checklist after refreshing. Meaghan receives assisted wording, while Mikaela’s view supports independent preparation. Companions celebrate completed work with reduced-motion support, including activities without stars. Parents can choose a shared garden, reading-corner or picnic milestone in Companions; lifetime earned stars carry forward and are not spent on goals.

### Opt-in reminders and safe retries

Open the header **bell** to enable a daily preparation, due-task and scheduled-habit digest. Each account chooses a Singapore-time reminder hour and quiet hours. Parents can include their children; child reminders exclude siblings and consent/payment tasks. A parent’s first enable securely connects the Apps Script family plan using the server-only `REMINDER_BRIDGE_SECRET`. Login never requests notification permission. A shared device receives reminders only for its active account. The retired Chat push trigger is removed.

Task, event, expense, trip and birthday creates reuse an account-scoped operation ID until the server confirms success. Retrying an interrupted save returns the original record. Memory drafts retain their photo after a metadata failure, reuse one upload and document ID, and check the server before discarding an upload. **Load older memories** pages beyond the latest 50. A daily Firebase job removes unreferenced UUID uploads older than 48 hours, preserving legacy uploads and committed memories.

Deployment includes Apps Script, Firebase Functions and Firestore/Storage rules, plus GitHub Pages. Actual device push delivery requires enabling reminders on a signed-in device with browser permission; automated tests use mocked delivery and do not send family test notifications.

### Failure testing, recovery and releases

Run `npm test`, `npm run test:browser`, and (with Java 21) `npm run test:rules`. CI runs these on pushes/PRs; production publishing is a separate manually dispatched workflow after verification. See [testing and deployment](docs/testing-and-deployment.md) for mock/emulator boundaries, failure traces and backend credential setup.

Session reset, API requests, calendar/money views, memories and modal behavior now live in separate client modules. Apps Script has separate auth, calendar, tasks, money and rewards files under `gas/`; deploy them together. The header status shows offline/last-refreshed state, and offline reward writes are refused rather than queued. Generic modals trap keyboard focus, close with Escape/backdrop and return focus to their opener.
