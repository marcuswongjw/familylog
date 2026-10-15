# Verification and controlled release

Run `npm ci`, then:

- `npm test` — checks generated deployment configuration, then runs backend and client regressions, including ownership, idempotent writes, calendar reconciliation, input boundaries and the actual selected family/parent packages. After editing `config/project.json`, run `npm run config:generate` and review its generated files.
- `npx playwright install chromium` and `npm run test:browser` — the production client with isolated mock services. Exercises failed forms, Undo and failed deletion, late account responses, shared habits, photo metadata recovery, keyboard focus, offline writes and reduced motion. Failures retain traces under `test-results/`.
- With Java 21 on PATH, `npm run test:rules` — actual Firestore and Storage rule evaluation on the `demo-familylog` emulators. It cannot contact production services. Covers ownership and immutable owners, own-account settings, server-only device writes, photo owner/size/type constraints, immutable parent school originals and retired Chat writes.

Browser mocks establish client behavior, not production availability. Emulator tests establish rules for the checked-in source, not confirmation that those rules were deployed. Existing unit tests do not replace either suite.

In v54, `tests/browser/transport.spec.cjs` retains the production `gasRequest` implementation and intercepts only the configured remote HTTP boundary. Fake account tokens and explicit fixture service selection pass reads/writes through the actual family/parent backend entry points. It checks endpoint selection, POST/body authentication, child ownership, reminder setup routing and HTTP/JSON failure recovery. Other failure tests retain the simpler mock transport for focused scenarios. All external Google/Firebase services remain mocked; no browser test writes production data.

`tests/browser/timezone.spec.cjs` uses fixed New Year instants in Singapore, Los Angeles and Kiritimati. Family Home, habits, selected calendar day, Today navigation, week and year markers must agree on the Singapore date. GAS fixtures run with the script’s Singapore timezone; explicit formatter tests cover time-only values, quoted literals and US daylight-saving transitions. Native lookup semantics follow [Google’s Calendar documentation](https://developers.google.com/apps-script/reference/calendar/calendar#getEventById(String)), and the formatter subset follows [Utilities.formatDate](https://developers.google.com/apps-script/reference/utilities/utilities#formatDate(Date,String,String)). These helpers model only used APIs and reject unsupported formatting tokens rather than pretending to support the complete Google runtime.

## Controlled live contracts

Run `npm run check:live` explicitly, or dispatch **Check deployed read-only contracts** (`.github/workflows/check-live.yml`) on main. This workflow is separate from push/PR tests and deployment. It needs no credentials. Nine fixed probes check family Sheets/Calendar readiness, anonymous read rejection on both Apps Script endpoints, and anonymous read denial for deployed Firestore memories/users/retired Chat and Storage memories/school/retired Chat paths. Firebase probes use valid, fixed probe names and require permission errors; missing resources, Google login HTML, API errors and network failures fail the check. Requests have 45-second deadlines. Output is fixed check names and pass/fail only; no private records or response bodies are printed. No create/update/delete or calendar-reconciliation request is sent.

These probes verify deployed reachability and anonymous denial, **not** authenticated family/parent ownership, successful production mutations or full equivalence with checked-in Firebase rules. Emulator rules tests retain the role/owner/schema checks. Real authenticated mutation tests require an isolated authorized production test fixture and are not part of this command.

## Continuous integration

`.github/workflows/verify.yml` runs all three suites on every push and pull request. Its reusable workflow is also required by production deployment. Node 22 and Java 21 match the required runtimes. Browser failure traces are uploaded for seven days. Test tools are development dependencies and are not bundled into the PWA.

## Controlled deployment

`.github/workflows/deploy.yml` is manually dispatched on main, reruns verification, serializes releases and uses the `production` GitHub environment. Configure Pages to use **GitHub Actions**, so pushing a branch does not publish the app. The Pages artifact contains only the public client, icons and assets.

The default dispatch deploys only the client. Enable its backend option only after configuring these production environment secrets:

- `CLASP_CREDENTIALS` (the existing clasp OAuth JSON, stored only as an encrypted secret). Optional legacy `CLASP_SCRIPT_ID` must agree with the canonical parent script identity; it does not overwrite project configuration.
- `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` for Google workload identity federation. Grant that account the scoped Firebase deployment roles and ensure the provider trusts this repository/environment. Google authorization stays outside browser files.

Backend deployment builds explicit, fresh staging packages using `scripts/backend-package.cjs`. It rolls the configured family deployment first, checks its spreadsheet/Calendar readiness, and then rolls the original parent deployment. The family package omits private-parent/finance/bank/email modules and their Gmail/mail scopes. It then deploys Firebase functions and rules to the configured Firebase project. No automatic push-triggered deployment occurs. Environment branch policy restricts production to main; required human reviewers can be added in repository settings if desired. If backend credentials are absent or configured identities disagree, the explicit backend option fails before uploading anything.

Local emergency release remains possible through the existing authorized CLI tools after the same checks. It is intentionally separate from automatic CI; record the deployed commit and service versions. Installed clients use network-first shell caching and the release cache version in `firebase-messaging-sw.js`.

## Family and parent domains

`npm run build` creates `public-site/index.html` (family) and `public-site/parents/index.html` (parent), separate manifests/workers, and public assets only. Pages production deployment runs this build after verification. Future client releases update both subdomains automatically through their static Cloudflare mappings.

Hosting configuration changes only: with the existing authorized Cloudflare login, run `npx wrangler@4 deploy --config hosting/family.wrangler.toml` and the matching `parents.wrangler.toml`. These Workers only fetch allowlisted static files from the Pages build; private API requests remain direct to Firebase/GAS. No Cloudflare token is checked in or required by the normal client CI release. Changing domains also requires a preserving append to Firebase authorized domains. Family notifications and installed PWA shortcuts must be enabled/added on the new origin.


Loading diagnostics use the same checks and deployment gates. `node scripts/performance-report.cjs` reports source bytes; passing a numbers-only Loading check export or timing-event JSONL reports endpoint/stage p50/p95. The UI is parent-only under More and its modal exists in both builds. Backend diagnostics require `gas/performance.js`, automatically included in both Apps Script packages. See [measurement guide](performance-measurements.md).

## Shared-device regression coverage (v55)

The sign-in browser suite covers longer parent passwords and existing numeric passwords, child PIN validation, explicit personal-device persistence, logout/account switching, normalised restored identities, rejected non-family/child identities, failed persistence and visible cache-cleanup retry. Unit checks gate restored-account observation behind persistence setup and cover lazy-load/reset races. An isolated browser check uses the actual bundled Firebase App/Auth/Firestore 9.23.0 libraries with Firestore network access blocked: it seeds an old persistent cache, clears it through the production loader, and verifies fresh memory-only instances after session reset. This local check writes no production data and sends no real credentials. Other browser authentication/transport checks use fixtures; these checks do not prove successful live credential authentication or change account passwords.
