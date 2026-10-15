# Loading measurements

Performance improvement #1 adds measurements, not an infrastructure migration or a claim that a particular service is slow.

## See a normal-use sample

As a parent, open **More → Loading check** in either app. Use **Measure refresh** a few times or use the app normally, then reopen Loading check to include later Calendar completions. Calendar loads independently after the overview; the report is a snapshot of completed measurements. The view shows successful sample counts, median (p50), slower (p95) time and failed requests. Expand a breakdown for individual stages and rows scanned. **Download measurements** exports the current tab’s numbers-only JSON.

The last 200 samples stay in memory. Account/session changes clear them; a full browser reload starts a new collection. Startup timing comes from this navigation’s browser performance entries and can include warm/offline caches. It is separate from overview/calendar readiness. No analytics service, new database collection, scheduled sampling job or storage queue is introduced.

Do not conclude that a p95 from one or two samples is a stable baseline. Collect at least 20 successful requests per endpoint where practical. Compare desktop and phone separately; keep cold startup, warm in-app refresh, slow networks and offline recovery as separate scenarios. No production authenticated baseline existed before this change; browser fixtures and local Node timing are not production latency evidence.

## What is measured

- Browser: token acquisition, request round trip to response headers, response-body reading/JSON parsing, initial overview/calendar render, first memory snapshot/render, page startup and the local Firebase SDK download window.
- Backend: Firebase token verification, forwarding, write/preparation lock waits, calendar reading/reconciliation, tasks, habit definitions/history, companion/reward reads, school notices/health, activity, and parent finance/private reads.
- Workload: existing sheet-read calls, fetched rows/cells (including narrow date/metadata columns, headers and repeated reads), plus native ID-search calls and cells in their search ranges; Calendar pages and events. Stage row counts are inclusive of nested calls. Startup also records local resource count and transferred bytes; browser caching can report zero bytes.

Nested timings overlap: neither stage medians nor browser and backend times should be added. The browser `network` phase already includes backend processing. Client-visible server timing is captured before response JSON serialization; the final server log includes serialization. Neither includes the platform time before Apps Script begins executing. A large round trip with small server processing suggests network/platform/redirect/queue overhead, not proof of which component caused it. A large server stage with many repeated rows scanned points to that stage’s data-access work.

Instrumentation reads no extra sheet ranges. Existing reads go through a counter that returns the same values, and timers wrap the existing operations. Metadata adds a small response/log payload for parents. Diagnostic collection failures must not block a response. Children and unauthorized callers do not receive backend diagnostics.

## Aggregate reports

For a downloaded Loading check:

```sh
node scripts/performance-report.cjs /path/to/loading-check.json
```

For more requests across sessions, Apps Script logs one `nest.performance` JSON event per POST execution. Use the owner’s Apps Script execution logs or the linked project’s Cloud Logging access to export **only** these events as JSON/JSONL. The report accepts raw events and Cloud Logging `jsonPayload`, `textPayload` or `message` wrappers:

```sh
node scripts/performance-report.cjs /path/to/timing-events.jsonl
```

The report groups by browser/server, family/parent runtime and a fixed endpoint name, with nearest-rank p50/p95, failure counts, stage percentiles and workload percentiles. Use one source dataset at a time; do not merge a browser export’s server samples with overlapping server log events, since no per-request identity is collected for deduplication. Failure durations remain in raw timing samples; successful percentiles exclude failures and should always be read with failure counts.

Without an input file, the report prints current source asset byte counts and gzip estimates, keeping app JavaScript, CSS and bundled Firebase SDKs separate. These are static sizes, not observed network transfer sizes or loading durations. `performance-assets-2026-10-15.json` records this release’s footprint.

## Privacy and next decisions

Diagnostic objects allow only fixed service/endpoint/stage labels, finite durations and numeric counts. They contain no account/member names, IDs, tokens, URLs, dates, message text, file contents, amounts, error text or household records. Unknown keys are discarded both by browser collection and the report reader. Existing application error/activity logs are separate from these new timing events.

Before another migration, compare real samples: token time, round trip versus measured server work, lock wait, Calendar pages, sheet-read/row amplification, rendering and startup assets. Optimize the stage with evidence, then repeat the same scenario and compare p50/p95 plus error rates.

In v49, compare `cells_read` alongside `rows_scanned`: a date-only pass plus a small selected record range can return more rows while fetching substantially fewer cells and historical notes. `sheet_searches` and `search_cells` count native lookup calls/search range sizes; they are not measurements of Google’s internal indexing. Loading check shows median fetched cells, and the JSON/report retains all three counters.
