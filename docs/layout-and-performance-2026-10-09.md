# Layout and loading review — 9 October 2026

Home now uses constrained grid tracks, a 300px family column, and today/tomorrow cards beside each other on larger desktops. On narrow screens the daily plan precedes a compact two-column family overview. The daily lists have a bounded scroll region. Habits support cards/list and a parent person filter; shared habits use the selected person's progress and completion target. Children retain their own/shared scope. Six vector accessories extend the server-owned catalog from four to ten.

## Measured size

Local source sizes (gzip calculated locally, approximate transfer sizes):

| Resource | Uncompressed | Gzip |
| --- | ---: | ---: |
| Firebase Firestore compat SDK 9.23 | 339 KB | 101 KB |
| Firebase Auth compat SDK | 132 KB | 38 KB |
| app.js | 123 KB | 31 KB |
| styles.css | 59 KB | 12 KB |
| school.js | 40 KB | 11 KB |
| Companion illustrations, including new accessories | 6 KB | 2 KB |

All six Firebase SDKs together are approximately 588 KB raw / 175 KB gzip. Local JS/CSS together are roughly 375 KB raw / 85 KB gzip. Node dependencies are development/server tooling and are excluded from the Pages artifact; they are not downloaded by visitors. Firebase-stored memory photos are separate from these code sizes and may dominate a memory-feed session depending on uploaded image sizes.

## Loading evidence and limits

A fresh headless Chromium request to the public production login page reached DOMContentLoaded in 460ms and load in 503ms on this machine/network. This is one unthrottled sample, not mobile performance or signed-in dashboard timing. Cross-origin resource timing hides Firebase byte sizes; the table uses fetched source files and local gzip rather than interpreting zero bytes as no download.

The signed-in `get_all` handler reads a 120-day Calendar window, reconciles generated tasks, then reads tasks, habit logs, school plans, expenses, budgets and other parent data from Sheets sequentially. This is the leading candidate for long dashboard refresh waits, but no authenticated production execution trace is available to establish which individual call dominates. Previous write timeouts also cannot be explained by static asset size.

Priorities for a separate performance change:

1. Add privacy-safe server stage timings to distinguish Calendar, reconciliation and sheet reads. Record durations/counts only, never tokens or family content.
2. Split initial Home data from money/Us/archive data, fetching secondary domains when visited. Keep authorization and session guards in every endpoint.
3. Reuse sheet snapshots within a request and move reconciliation out of the critical path only after preserving event reschedule/cancellation behavior.
4. Migrate Firebase compat imports incrementally to modular/lazy loading, particularly Firestore, Storage and Messaging. Verify notification, authentication and memory flows during migration.
5. Measure photo thumbnail sizes before adding more memory-feed images.

## Verification

146 Node regressions and 10 Playwright browser checks pass. Visual fixtures inspected at 1440px and 390px; no document overflow. Fixture uses real frontend and backend handlers with mocked Google/Firebase services. Production account data and actual mobile network latency were not measured.
