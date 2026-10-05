# Wong’s Nest app review — 5 October 2026

Reviewed the client shell, dashboard, tasks, habits, rewards, calendar/schedules, school capture, expenses, memories, parents’ features, Apps Script handlers, Firebase functions/rules, service worker, documentation and existing tests. This is a code review of the current checkout, not an audit of deployed Firebase rules, cloud configuration, spreadsheet permissions or trigger installation. No production data was changed. All 62 existing tests pass.

## High-priority remediation

The four high-priority findings below have been addressed in the client: account/session and request guards, immediate private-state clearing, authoritative private lists, confirmed-save checks, and deferred calendar deletion with failure recovery. Regression tests cover the original failure cases. Findings 6–8 have also been implemented: scheduled/editable habits with archive and restore, individual shared progress and parent-assisted logging, a compact child checklist with next steps, completion persistence and parent-selected family milestones. Other recommendations remain future work.

## Original findings

### 1. Guard every dashboard response by account and request generation — high priority

`js/app.js:526–609`: `loadData()` applies the result unconditionally. A request started by a parent can finish after logout and a child login. `applyDashboardPayload()` trusts that response’s `isAdult`, so the old response can restore parent data and access state in the child session. Older refreshes can also overwrite a newer save. The rewards mutation path already checks its originating account; dashboard loading needs the equivalent protection plus a monotonically increasing request/session generation. Clear email/token/data and parent DOM state immediately on sign-out, including the auth listener’s signed-out branch. Add tests for late responses across logout, account switching and overlapping refreshes.

### 2. Stop merging private parent data into child responses — high priority

`js/app.js:561–596`: `mergeIntimacyLogs()` unions every prior entry with the new server list. A child response containing `intimacyLog: []` therefore does not clear existing parent records. A direct execution of the merge/apply functions confirmed one private entry remained after an empty child response. This is client retention; the backend correctly returns empty parent-only fields to children. Normal explicit logout clears data, but the late-response race above can repopulate it. Resolve caller access before merging, clear parent-only fields for children, and reconcile only explicitly pending same-account writes. Otherwise server-deleted entries can also survive indefinitely in the parent view.

### 3. Make save success depend on server success — high priority

`js/app.js:2053–2055, 2116–2177, 2218–2236`: task creation, birthdays, budgets, recurring expenses, expenses, trips and schedule creation commonly await `gPost()` but do not inspect its return value. `gasRequest()` returns null or an error object rather than throwing. These forms then clear inputs, close and announce success after a failed save. Pull-to-refresh similarly announces “Refreshed” because `loadData()` resolves even on errors. Use a consistent success result or typed failure, retain form values on failure and test offline/server-error paths. Schedule creation should also report partial failure when the event succeeds but its preparation tasks fail.

### 4. Implement persistent calendar Undo — high priority

`js/app.js:1985–1994`: deleting an event removes it locally and sends a backend deletion. Undo only pushes the old object back into the local array. It does not restore Google Calendar; refresh removes it again. Backend failures also leave the local deletion visible until refresh. Prefer a delayed, cancellable deletion or an explicit server restore operation; reconcile failures. Test delete/undo/reload and protected school-event deletion.

### 5. Reconcile automatic preparation tasks safely — medium priority

`Code.js:1551–1552, 1681–1732`: dashboard reads call `syncCalendarEventTasks_()`, which appends sailing tasks outside the write lock. Concurrent refreshes can both observe a missing source ID and create duplicates. Existing source IDs suppress new tasks but their stored due dates are never updated when training moves; cancelled events do not retire their tasks. Move synchronization to a locked operation or scheduled job and reconcile date changes/cancellations while preserving completed work. Keep stable event-to-task links. Current tests cover sequential deduplication, not concurrent or rescheduled events.

## Improve everyday use

### 6. Give habits a schedule and lifecycle

Current definitions have ID, member, name, emoji, creator and creation time. Every habit appears daily; there is no edit, selected weekdays, pause or archive flow. Add “daily / selected days / weekly target”, edit and archive while retaining history and earned stars. This lets sailing, ballet and music practices reflect actual family routines. Display only habits due on the selected day. Validate member names and text lengths server-side; `add_habit` currently lacks these bounds and uses raw cell text instead of the safe cell helper.

### 7. Include shared habits consistently

`js/school.js:520–524`: Home filters habits by exact child name, so Everyone habits available in the Habits tab are missing from each child’s daily plan. Include applicable shared habits and calculate completion by habit + actual child + date. Parent logging of a shared habit currently credits the parent caller; an explicit, validated “log for member” control would let a parent assist a younger child without awarding the wrong account.

### 8. Make child Home an actionable short list

Keep the day’s schedule, habits due, packing and homework together. Add a calm “next thing”, a large completion button and accessible feedback. Meaghan can have an assisted mode while Mikaela gets independent preparation. Build progress around scheduled opportunities rather than strict daily streaks. Preserve the existing no-penalty help action. Companions can react to real progress and offer several family-selected goals beyond the fixed 40-star garden; avoid pushing unrelated parent features into the child experience.

### 9. Bring reminders into the current product

`index.js:23–124` sends push notifications for a removed Chat feature. The reviewed code has morning/night-before email digests but no corresponding active task/habit push pipeline. Add opt-in reminders for preparation, overdue consent/payment and a child’s scheduled habits, with parent/child targeting, quiet hours and deduplication. Confirm deployed triggers and notification delivery separately. Retire the dormant chat function and obsolete rules once migration compatibility is no longer needed. Account/notification preferences should be scoped to the signed-in member on shared devices.

### 10. Handle retries and photo-save failures

Rewards and school publishing already have strong deterministic IDs. Other create operations generate a new ID/row on each retry: if a response is lost after a write, retrying can create duplicates. Add client-generated operation IDs to task/event/expense/trip/birthday creation and return the original result on retry. For memories, `submitMemory()` uploads a file and clears its preview before Firestore metadata succeeds; a subsequent failure can leave an orphan file and make a retry lose the photo. Retain the upload reference/path until metadata saves and provide cleanup. Add archive pagination: the current memories listener retrieves only the latest 100 entries.

## Maintainability and verification

### 11. Strengthen the automated checks around real failures

The current 62 tests are useful, especially ownership, publishing and reward retries. Add browser/error tests for failed forms, calendar Undo, account switching, shared habits and photos; backend tests for calendar task reconciliation and input bounds; Firebase emulator checks for memories/users/storage rules. Add CI running the existing suite on every push and a separate controlled deployment step. A passing unit suite currently cannot establish that those user flows or deployed rules are correct.

### 12. Reduce coupling and improve recovery/accessibility

`js/app.js` and `Code.js` are each over 3,000 lines. Extract account/session handling, API client, calendar, money and memories incrementally, keeping backend ownership unchanged. Add bounded request timeouts and a clear offline/last-refreshed status; avoid silently queuing reward completions offline. Review keyboard focus trapping, Escape and focus restoration across the generic modals; the global overlay click handler currently only removes the open class. Keep reduced-motion companion behavior. Update the architecture documentation’s stale Chat references and child navigation description as modules change.

## Recommended implementation order

1. Account isolation and private-data clearing.
2. Honest save/refresh feedback and persistent calendar Undo.
3. Locked event-to-task reconciliation and retry IDs.
4. Scheduled, editable, archivable habits with consistent shared-member logging.
5. Opt-in reminders and a simpler child daily checklist.
6. Photo recovery, archive pagination, CI and incremental module extraction.

The existing backend identity verification, parent-only calendar/money/private-feature gates, reviewed school publishing, deterministic reward ledger and reduced-motion celebrations are useful foundations to retain.

## Findings 9–10 implemented

- Opt-in, account-scoped daily reminders for preparation, due/overdue actions and scheduled habits; parent/child targeting, quiet hours, account/day server receipts and device deduplication. Parent first opt-in connects the signed GAS bridge. The live Chat push trigger was removed and its write rules retired.
- Stable create IDs recover retries for tasks, Calendar events, expenses, trips and birthdays, including lost responses after resource/ledger writes. Memory retries retain and reuse photos; discard checks prevent deleting committed photos; scheduled orphan cleanup uses generation preconditions. The archive loads older pages beyond the latest 50.
- Verification covers recipient privacy, quiet hours, schedule completion, lost responses, upload reuse, uncertain metadata, account reset and archive pagination. Browser fixture confirmed saved reminder hour, child-only controls and 50→80 memories with no errors. Actual personal-device push receipt remains an opt-in device check.

## Findings 11–12 implemented (6 October 2026)

Added Chromium failure/accessibility tests, real Firebase emulator security checks, push/PR CI and a separately dispatched production deployment. Rule tests exposed and fixed memory owner transfer and school-source overwrite gaps. Backend checks cover stable reconciliation after rescheduling/cancellation, completion history and input bounds.

Extracted client session, API, calendar, money and modal modules, plus Apps Script auth/calendar/tasks/money/rewards modules; memories remain exclusively Firebase-owned. Added offline/last-refreshed status, bounded authentication/transport, refusal to queue offline reward writes, named generic dialogs, Tab trapping, Escape/backdrop dismissal and focus restoration. Selection chips are keyboard-operable buttons, and reduced-motion behavior remains intact. See `testing-and-deployment.md` for the distinction between unit, mocked browser, emulator and actual deployed behavior.
