# Separating the parent app from Wong’s Nest

## Scope

Move Expenses, Budgets, Recurring costs, Just us and Wellbeing into a parent-only app. Keep family planning, school messages, habits, companions, stars, memories and the parent controls needed to manage the children in Wong’s Nest. Confirm this boundary before starting: removing all parent functions would prevent parents from assigning tasks, reviewing notices and configuring rewards.

## Recommended sequence

1. Create a separate parent web app with its own URL, manifest, service-worker cache and navigation. Reuse Firebase sign-in and the existing parent email allowlist. Each app manages its own login/session state; account-switch guards still apply.
2. Extract the parent UI out of app.js and move finance/Us/Wellbeing screens into that app. Keep the current Apps Script endpoint and spreadsheet during this first phase; do not copy records into two editable stores.
3. Introduce an authenticated parent dashboard endpoint containing only parent domains. Remove those domains from the family dashboard response and family UI. Keep server-side parent authorization on every read and write, not just hidden navigation. Decouple parent activity history from family activity history to avoid leaking private descriptions.
4. Verify existing row IDs, expense categories, household/personal splits, budgets, recurring entries and private-parent records. Test denied child access, account changes, writes/retries, and both apps at desktop/mobile sizes.
5. Deploy the parent app first, verify against the existing data, then remove the old parent screens and link to the new app from parent navigation. Existing users keep their history and sign-in identities.
6. If independent data/hosting is desired, make a later backend migration: copy the exact parent-owned sheets and schemas to a dedicated spreadsheet/service, preserve identifiers and operation-id retry semantics, move scheduled finance jobs/integrations, briefly pause parent writes for final reconciliation, switch the parent endpoint, and verify totals/row counts before retiring the old routes. Keep a rollback copy with one active writer. Do not move shared family task/habit/reward or reminder infrastructure accidentally.

The first phase separates the user experience with minimal data migration. Moving the data and backend later provides stronger isolation, but adds authentication, deployment, scheduled-job and reconciliation work. A separate frontend alone does not speed up Family Home until its dashboard request stops fetching parent domains.

## Current boundaries

- GAS/Sheets own finance, private-parent records, tasks, calendar, habits and rewards.
- Firebase owns sign-in, memories/photos, school extraction and reminder preferences/delivery.
- Finance rendering is already partly extracted into `js/money.js` and `gas/money.js`; private-parent rendering and handlers remain substantially in `js/app.js` and `Code.js`.

## Implemented — 14 October 2026

The interface split is live at `family.marcusw.xyz` and `parents.marcusw.xyz`. The parent app is called Parents’ Corner. Both builds come from the same repository through `scripts/build-apps.cjs`; reviewed Pages releases publish family assets at the artifact root and parent assets under `parents/`. Two Cloudflare Workers map the requested hostnames to the corresponding static artifact paths and forward no cookies, authorization headers, request bodies or personal query parameters to the static origin. Custom domains manage DNS/TLS without changing the apex website.

Family uses `get_family_dashboard`, which skips finance/private-parent reads and excludes private activity categories. Parent uses `get_parent_dashboard`, which verifies the parent allowlist and performs no family Calendar, reconciliation, task, habit or reward reads. `get_all` remains a compatibility endpoint for old authorized clients.

The parent app has two login choices, independent origin/session/PWA cache, Auth-only Firebase SDK loading, and no family memories/reminder initialization. Both requested hostnames are authorized in Firebase. Old Pages entries check reachability with an unauthenticated HEAD request before redirecting to the corresponding new domain; if DNS is cached negatively or the host is unavailable, the old app remains usable. installed PWAs should be added again from the new URLs because their origins changed.

No records were copied or moved: both apps still use the existing authoritative spreadsheet and Firebase identities. Backend/data separation remains the optional later phase above.
