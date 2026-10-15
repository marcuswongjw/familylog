# Code review — 14 October 2026

**P1 update, 15 October:** Findings 1–4 have been addressed; see [implementation and migration notes](p1-fixes-2026-10-15.md). The findings below document the reviewed baseline. P2 items remain open.

Reviewed commit: `7a5893e` (family/parent backend split and selected habit members). This is a review, not a deployment or a claim that the issues below are fixed.

## Scope and evidence

Reviewed the client modules, both Apps Script runtimes and their build/deployment scripts, Firebase functions, Firestore/Storage rules, service workers, and the test fixtures. The existing 168 Node tests and 17 browser tests pass in this review. Additional isolated reproductions demonstrate the failures below without writing household records. Google’s primary API documentation was checked for Calendar identity/mutation methods and Sheets formula interpretation.

The rule emulator suite was not rerun locally: the temporary Java 21 runtime used previously is no longer present. The latest production release’s CI did pass its rules job. No production records were changed or live mutations exercised during this review. Manually installed production triggers and secret/environment values were not inventoried; findings concerning automation/configuration state are explicitly limited to repository evidence.

P1 means fix before further feature work because the issue can remove the wrong record, duplicate financial records, or change the wrong calendar event. P2 means fix next for recovery, correctness or access validation. Suggestions below are separated from confirmed bugs.

## Findings

### 1. P1 — Expense deletion still uses shifting row numbers

Evidence: [delete_expense](/Users/marcus/Documents/GitHub/familylog/Code.js:1139), [expense reads](/Users/marcus/Documents/GitHub/familylog/gas/money.js:82).

Expenses are returned with `rowNum`, and deletion calls `deleteRow(rowNum)` without checking a stable ID or record fingerprint. Avoiding sorting on insert does not solve shifts caused by another deletion or spreadsheet edits. Reproduction: load A/B/C at rows 2/3/4; delete A; send the previously loaded row 3 to delete B. C is deleted and B remains. Row 1 is also accepted, allowing the header to be deleted.

Fix: migrate every expense to a persistent ID (including legacy and bank-imported entries), resolve that ID under the parent-service lock, and reject header/out-of-range targets. Use a tombstone or stable identity for Undo. Regression: two parent sessions delete in different orders; a repeated deletion must never remove a neighbor.

### 2. P1 — Bank-alert approval can duplicate an expense after a partial failure

Evidence: [approval handler](/Users/marcus/Documents/GitHub/familylog/Code.js:2854), [append then delete](/Users/marcus/Documents/GitHub/familylog/Code.js:2887).

Approval appends to Expenses and then deletes PendingExpenses. If the append commits but throws or the pending-row deletion fails, retrying the same signed link appends again. The normal add_expense operation ledger is not used here. Reproduction with a valid-link verification stub and a simulated lost append response produced two expenses for one pending transaction.

Fix: use the bank/pending transaction ID as the destination expense’s immutable import ID. Check for that ID before appending; independently complete/repair the pending status. Regression: failure immediately after append and immediately before/after pending retirement.

### 3. P1 — Recurring events have the wrong identity for individual operations and preparation

Evidence: [returned event ID](/Users/marcus/Documents/GitHub/familylog/gas/calendar.js:66), [preparation key](/Users/marcus/Documents/GitHub/familylog/gas/calendar.js:13), [drag target](/Users/marcus/Documents/GitHub/familylog/js/calendar.js:345), [delete](/Users/marcus/Documents/GitHub/familylog/Code.js:951).

CalendarApp.getId returns an iCalUID shared across occurrences of a recurring series. The UI finds an event only by that ID, and the backend uses getEventById, which returns the first occurrence. Moving/deleting a later displayed occurrence can target a different occurrence. The preparation reconciler also keys all occurrences by the same ID: later occurrences overwrite earlier ones, and completed/deleted preparation for one occurrence can suppress future occurrences.

Reproduction: a Nat B occurrence tomorrow and another two months away with the same ID generated zero packing tasks because the distant occurrence overwrote the near one. This is a code/API identity error; it does not establish which existing production events are recurring.

Fix: carry Calendar REST instance IDs and original occurrence timestamps, retaining the series ID separately. Key preparation by occurrence and item. Migrate existing preparation sources without deleting completed history. Regression: weekly recurrence, a moved exception, completed previous week, and deletion of one future occurrence.

Google documents both [shared recurring iCalUIDs](https://developers.google.com/apps-script/reference/calendar/calendar-event#getId()) and [getEventById returning the first occurrence](https://developers.google.com/apps-script/reference/calendar/calendar#getEventById(String)).

### 4. P1 — All-day moves call a nonexistent method; overnight moves lose duration

Evidence: [date update](/Users/marcus/Documents/GitHub/familylog/Code.js:980).

The all-day branch calls `ev.setDate(newStart, newStart)`, which is not a CalendarEvent method. An isolated event exposing the real all-day API never moved and returned an error. The timed branch rebuilds the start and end on the same new date; moving a 23:00–01:00 event passed an end 22 hours before the start. Multi-day durations are similarly lost.

Fix: use setAllDayDate/setAllDayDates and preserve the original all-day span. For timed events retain the original duration when shifting the start, with an explicit timezone policy. Regression: one-day all-day event, multi-day all-day event, overnight timed event, and multi-day timed event through the actual backend handler.

The supported methods are in [Google’s CalendarEvent reference](https://developers.google.com/apps-script/reference/calendar/calendar-event#setAllDayDate(Date)).

### 5. P2 — Creating a habit is not safe to retry after an uncertain save

**Habit creation fixed 15 October 2026.** The client retains an account-scoped request ID across uncertain responses and reloads. The backend stores the ID and original request fingerprint on the habit row, recovers interrupted appends, and confirms through the operation ledger. Existing habit IDs, logs and rewards remain intact; intentional identical creates remain possible after confirmation. The other create flows noted below remain separate follow-up work.

Evidence: [create action list](/Users/marcus/Documents/GitHub/familylog/js/operations.js:3), [habit append](/Users/marcus/Documents/GitHub/familylog/Code.js:1530), [operation action list](/Users/marcus/Documents/GitHub/familylog/gas/rewards.js:141).

add_habit receives a fresh UUID on every request and is absent from both create-operation lists. Reproduction: the first habit append committed and lost its response; retrying the same form created a second habit. Each copy can have independent logs and reward rules. Recurring costs, fertility/check-ins, appreciations and bucket-item creates have similar retry gaps; those other flows were identified by code inspection, not individually reproduced.

Fix: assign a stable operation ID to all create flows and store it with the destination record so recovery does not depend solely on an operation-cache append. Regression: retry a selected-members habit after append failure; exactly one ID and one habit should remain.

### 6. P2 — A habit save during calendar loading can leave Calendar permanently “Loading”

**Fixed 15 October 2026.** Saves now restart pending calendar hydration after confirmation or failure. Only the newest request in the same account/session may update the calendar or its loading state. Replacement requests have a bounded timeout; a failed core refresh also ends the calendar loading state it invalidated. Regressions cover habit/accessory writes, overlapping saves, stale responses, account switches, failures and timeouts, plus a browser save while Calendar is pending.

Evidence: [calendar invalidation](/Users/marcus/Documents/GitHub/familylog/js/api.js:131), [write generation increments](/Users/marcus/Documents/GitHub/familylog/js/api.js:150), [habit completion](/Users/marcus/Documents/GitHub/familylog/js/app.js:2052).

Every write invalidates calendar hydration. Ignoring a stale response is correct, but no replacement calendar request is scheduled and the loading flag is not cleared. Habit completion updates its local result without calling loadData. Reproduction: core loads, calendar remains pending, habit save succeeds, calendar resolves; calendarState remains loading. The existing test checks that stale calendar data is ignored, but not that loading eventually completes.

Fix: use per-domain revisions or explicitly restart/cancel hydration after invalidation. Keep loading flags tied to active requests. Regression: log a habit or buy an accessory while Calendar is loading and verify Calendar reaches ready/error without a manual refresh.

### 7. P2 — Preparation generation depends on opening the family dashboard

Evidence: [old nightly reconciliation disabled](/Users/marcus/Documents/GitHub/familylog/Code.js:321), [browser calendar reconciliation](/Users/marcus/Documents/GitHub/familylog/Code.js:794), [read-only reminder snapshot](/Users/marcus/Documents/GitHub/familylog/gas/rewards.js:177), [standalone deployment](/Users/marcus/Documents/GitHub/familylog/scripts/deploy-family-gas.sh:1).

The old scheduled nightly digest skips reconciliation after the split. The new family service reconciles when its calendar dashboard endpoint is requested, but the repository does not install or invoke a replacement scheduled family reconciliation. If nobody opens the dashboard while an event enters the seven-day preparation window, packing tasks can be absent from digests/reminders. Manually installed triggers were not audited, so their presence cannot be ruled out.

Fix: run scheduled reconciliation through the family service as the single writer, before reminder snapshots. Regression: advance a calendar event into the window without any browser request and confirm preparation/reminders are produced.

### 8. P2 — Calendar reconciliation uses a snapshot fetched before its lock

Evidence: [snapshot then reconciliation](/Users/marcus/Documents/GitHub/familylog/Code.js:796), [one-second lock wait and retirement](/Users/marcus/Documents/GitHub/familylog/gas/calendar.js:4).

Calendar is read before obtaining the family write lock. A concurrent move/create followed by reconciliation of the earlier snapshot can restore an old preparation due date or retire a newly generated task. Separately, reconciliation waits only one second for a lock; a longer habit/reward write can make an otherwise valid calendar read fail completely. These are code-path concurrency findings, not production timing measurements.

Fix: use revision-checked snapshots or serialize the authoritative read/reconcile operation, preferably in the scheduled job. Separate event-read success from preparation-update failure and expose a recoverable status. Regression: pause a calendar read, commit a move, resume the old reconciliation; the newer task/date must win. Also test lock contention longer than one second.

### 9. P2 — One malformed school record can break the core dashboard

Evidence: [school plan parsing](/Users/marcus/Documents/GitHub/familylog/Code.js:3040), [school event links](/Users/marcus/Documents/GitHub/familylog/Code.js:3050).

Both helpers parse every stored JSON cell without isolating invalid rows. A corrupt/legacy/manual row throws out the entire request, including otherwise valid habits and companions. Reproduction: one SchoolAnnouncements row containing non-JSON text made the parent family-core request throw SyntaxError. Invalid published rows can also block event tagging and calendar reads.

Fix: validate each row separately, quarantine/report damaged records, and return healthy domains with an explicit partial-data warning. Regression: malformed draft JSON and malformed published JSON must not hide all family records.

### 10. P2 — Memory pagination loses an entry when the live page grows

Evidence: [live page replacement](/Users/marcus/Documents/GitHub/familylog/js/memories.js:50), [merge](/Users/marcus/Documents/GitHub/familylog/js/memories.js:42).

The latest 50 records are replaced on each live snapshot. An entry pushed out of that limited window is not moved into the older pages already fetched. Reproduction: load memories 100–51 plus older 50–1; insert 101; the feed has only 100 entries, with 51 missing. Older pages are also one-shot reads and do not reflect subsequent edits/deletions until reloaded.

Fix: maintain query-window boundaries explicitly; refill/requery the displaced boundary while distinguishing a window eviction from an actual deletion. Regression: insert new entries after paging, edit an older entry, delete an older entry, and verify no gaps or resurrected entries.

### 11. P2 — Memory rules validate ownership but not the record schema

Evidence: [Firestore create/update rules](/Users/marcus/Documents/GitHub/familylog/firestore.rules:35), [type-dependent renderer](/Users/marcus/Documents/GitHub/familylog/js/memories.js:75).

An allowed owner may write arbitrary field types/lengths and omit timestamp. A numeric type such as 42 passes the current ownership condition and makes the renderer throw `t.includes is not a function`, breaking the family feed. Missing timestamps also exclude records from the ordered query. Rules were inspected; the invalid-schema emulator case was not rerun locally. The renderer crash was reproduced independently.

Fix: validate required keys, types, text limits, date/type/person values, timestamp and image ownership fields. Tolerate legacy invalid rows on read instead of crashing. Regression: invalid types, missing timestamps, oversized text and inconsistent image paths, plus owner update/delete compatibility.

### 12. P2 — Partial push success prevents retries on failed devices

Evidence: [delivery state](/Users/marcus/Documents/GitHub/familylog/reminder-functions.js:43).

The account-level delivery is marked sent if any device succeeds. A transient failure on the second device is never retried because the next scheduler run skips the whole account. Retrying the whole multicast after an uncertain state write can also redeliver to successful devices. The worker’s seen-ID protection helps suppress displayed duplicates but does not recover the omitted device.

Fix: store per-device delivery results or retry only transiently failed tokens, while retaining stable notification IDs. Check the lease before finalizing its state. Regression: one success + one transient failure, then recovery; successful devices should not be resent and the failed device should receive the reminder.

### 13. P2 — Habit/task reminders unnecessarily depend on Calendar availability

Evidence: [snapshot includes Calendar](/Users/marcus/Documents/GitHub/familylog/gas/rewards.js:187), [reminder planner](/Users/marcus/Documents/GitHub/familylog/reminder-plan.js:15), [snapshot timeout](/Users/marcus/Documents/GitHub/familylog/reminder-functions.js:34).

The reminder snapshot calls getEvents, but the planner consumes only todos, habits and habitLogs. A slow or failed Calendar read blocks all reminders, including simple unfinished habits. It also repeats the broad Calendar work on the original backend despite the split.

Fix: remove unused event reads from reminder snapshots. Run required calendar reconciliation separately on the family service, then read the resulting tasks. Regression: Calendar unavailable while a valid habit/task reminder is still delivered.

### 14. P2 — Background Undo commits discard failures without confirmation

Evidence: [beacon path](/Users/marcus/Documents/GitHub/familylog/js/app.js:231).

On page hide/visibility change, pending deletion is cleared and sent with sendBeacon. Its false return and exceptions are ignored, and there is no receipt/recovery state. Offline transitions, an expired lastIdToken, a rejected request or a refused beacon can silently lose the deletion. The foreground confirmed-write path is stronger, but it is bypassed here.

Fix: retain an account-scoped unconfirmed operation and verify it on resume; do not claim success from beacon acceptance. Provide clear pending/failed feedback without silently queuing reward completions. Regression: false beacon result, thrown beacon, expired auth and resume after an uncertain commit.

### 15. P2 — The photo lightbox crashes the generic keyboard focus handler

Evidence: [lightbox markup](/Users/marcus/Documents/GitHub/familylog/index.html:328), [Tab handler](/Users/marcus/Documents/GitHub/familylog/js/modals.js:14).

The lightbox is an `.overlay` but has no `.modal`. Pressing Tab with it open makes the generic handler call querySelectorAll on null. This was reproduced with the actual focus-handler code and the lightbox’s structure. Opening the lightbox also bypasses modalOpened, so focus is not moved/restored through the standard path.

Fix: give the viewer a proper dialog container and use the shared lifecycle; guard against overlays that are not dialogs. Apply keyboard/focus handling to the mobile drawer too. Regression: open a photo with keyboard, cycle focus, Escape, and verify return to the opener without runtime errors.

### 16. P2 — Failed asset requests can receive cached HTML as JavaScript/CSS

Evidence: [family service-worker fallback](/Users/marcus/Documents/GitHub/familylog/firebase-messaging-sw.js:82), [unversioned precache](/Users/marcus/Documents/GitHub/familylog/firebase-messaging-sw.js:4), [versioned client imports](/Users/marcus/Documents/GitHub/familylog/index.html:690).

The family worker falls back to index.html for every missing app-shell request, including scripts and styles. The precache uses unversioned paths while the page requests versioned URLs. After an update or a cold offline launch, a cache miss can therefore return HTML for a script, causing parsing failures. HTTP error responses are also cached in this branch. The parent worker already distinguishes navigation fallback and checks response.ok, so the behavior is inconsistent.

Fix: restrict HTML fallback to navigations, cache only successful responses, and align asset revision keys. Define and test offline startup behavior, including external Firebase SDK availability. Regression: newly activated worker, failed versioned JS request, failed CSS request and cached HTTP error. This review identified the code path; it did not perform an installed-PWA offline production test.

### 17. P2 — Text-cell protection and input validation are inconsistent

Evidence: [fertility notes](/Users/marcus/Documents/GitHub/familylog/Code.js:1172), [appreciations](/Users/marcus/Documents/GitHub/familylog/Code.js:1307), [check-ins](/Users/marcus/Documents/GitHub/familylog/Code.js:1327), [bank approval](/Users/marcus/Documents/GitHub/familylog/Code.js:2887).

Family task/habit/companion text uses schoolCell_, but several private-parent/bank-approval text fields are appended raw. Leading '=' input is interpreted by Sheets as a formula, so text can become executable sheet content instead of being retained literally. This is an API-contract finding, not an executed formula/exfiltration test. Other bounds gaps include birthdays accepting invalid MM-DD values, financial account/category values not consistently allowlisted, and parseInt/parseFloat accepting malformed numeric strings.

Fix: centralize domain validators and literal text-cell writes; validate required dates separately from optional dates, require full finite numbers/integer days, and protect all text columns. Regression: leading '=' text, invalid birthday dates, unknown account/category, decimal day and malformed numeric input.

Google confirms formula interpretation in [the appendRow documentation](https://developers.google.com/apps-script/reference/spreadsheet/sheet#appendRow(Object)).

## Performance and architecture improvements

1. **Measure stages before another infrastructure migration.** Current local JS is about 271 KiB raw / 78 KiB gzip; CSS is 88 KiB raw / 19 KiB gzip, excluding HTML, icons and Firebase SDKs. The family HTML still eagerly loads six Firebase compat SDKs. Calendar still reads 120 days and performs per-event calls; dashboard helpers repeatedly read entire habit logs, completed tasks, reward ledgers and school plans. These are observed code paths, not measured production stage timings. Add durations/counts only, plus endpoint percentiles, before choosing the next optimization.
2. **Fetch and retain less data.** Defer Firestore/Storage/Functions/Messaging until their features are needed; stop starting the memory listener immediately after the Home navigation has stopped it. Add lazy image loading and dimensions to memory photos. Bound/paginate completed tasks, activity, habit history and old school records; reuse sheet snapshots within a request.
3. **Show progress for every selected habit member.** In the parent All view, a shared habit’s progress is based on one selected/default person. “Done for this day” can look like everyone is done while another member still needs to complete it. Show each assigned person’s completion or a labeled count and offer a direct completion target.
4. **Keep loading/freshness per domain.** Last refreshed currently advances when core loads, before Calendar completes. Show Calendar’s own refreshed/error state and an explicit retry control in every calendar view. General load success should not imply all domains are current.
5. **Extract backend domains and make configuration authoritative.** Code.js remains 3,186 lines; app.js is 2,134. The standalone builder copies private-parent/finance functions too and changes spreadsheet access via text replacement, with runtime routing as the protection. Extract backend session/routing, habits, school, private-parent and bank-import modules, and compile only the needed domains. Derive public endpoint IDs and spreadsheet/calendar configuration from one verified source instead of independent literals. Separate Apps Script projects isolate execution/locks, but still share the owner’s Google quotas and authoritative spreadsheet.
6. **Make tests model external APIs accurately.** The GAS harness lacks native getEventById mutation behavior and ignores timezone/time-only formatDate patterns. Browser tests replace gasRequest, so a green browser suite cannot verify production endpoint routing, Calendar method names or deployed Firebase rules. Retain the useful ownership/retry tests, then add the regression cases above and a controlled deployed read-only contract check. Use Singapore-date fixtures plus an overseas browser timezone case.
7. **Clarify shared-device and parent authentication policy.** The client unconditionally enables persistent Firestore caching and only clears its own in-memory state at logout. Decide whether shared browsers should retain family metadata. Reject non-family authenticated accounts before starting family listeners. Parent sign-in is forced to the same six-digit PIN shape as children, so stronger parent passwords are rejected by the UI. Supporting stronger parent credentials is a hardening improvement; this review does not claim that deployed account authentication has been compromised.

## Recommended order

First fix findings 1–4 (financial data identity/recovery and Calendar occurrence/move correctness). Then address 5–8 and 13 (habit retries, loading recovery and scheduled family reconciliation). Next handle memory integrity, reminder delivery, Undo, keyboard focus and service-worker recovery (9–12 and 14–17). Add regression coverage alongside each fix rather than expanding tests that only mirror the happy path. Stage timing and bounded reads can be introduced while those correctness fixes are underway.

The server-side parent allowlist, child ownership checks, family-only endpoint gate, separate family write lock, deterministic reward earn/purchase IDs, blocked offline reward writes and reduced-motion companion behavior are useful foundations to preserve.
