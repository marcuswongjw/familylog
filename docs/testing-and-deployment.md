# Verification and controlled release

Run `npm ci`, then:

- `npm test` — backend and client regressions, including ownership, idempotent writes, calendar reconciliation and input boundaries.
- `npx playwright install chromium` and `npm run test:browser` — the production client with isolated mock services. Exercises failed forms, Undo and failed deletion, late account responses, shared habits, photo metadata recovery, keyboard focus, offline writes and reduced motion. Failures retain traces under `test-results/`.
- With Java 21 on PATH, `npm run test:rules` — actual Firestore and Storage rule evaluation on the `demo-familylog` emulators. It cannot contact production services. Covers ownership and immutable owners, own-account settings, server-only device writes, photo owner/size/type constraints, immutable parent school originals and retired Chat writes.

Browser mocks establish client behavior, not production availability. Emulator tests establish rules for the checked-in source, not confirmation that those rules were deployed. Existing unit tests do not replace either suite.

## Continuous integration

`.github/workflows/verify.yml` runs all three suites on every push and pull request. Its reusable workflow is also required by production deployment. Node 22 and Java 21 match the required runtimes. Browser failure traces are uploaded for seven days. Test tools are development dependencies and are not bundled into the PWA.

## Controlled deployment

`.github/workflows/deploy.yml` is manually dispatched on main, reruns verification, serializes releases and uses the `production` GitHub environment. Configure Pages to use **GitHub Actions**, so pushing a branch does not publish the app. The Pages artifact contains only the public client, icons and assets.

The default dispatch deploys only the client. Enable its backend option only after configuring these production environment secrets:

- `CLASP_SCRIPT_ID` and `CLASP_CREDENTIALS` (the existing clasp OAuth JSON, stored only as an encrypted secret).
- `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` for Google workload identity federation. Grant that account the scoped Firebase deployment roles and ensure the provider trusts this repository/environment. Google authorization stays outside browser files.

Backend deployment uploads `Code.js` and **all `gas/*.js`** to the same Apps Script project and rolls the existing deployment ID. It then deploys Firebase functions and rules. No automatic push-triggered deployment occurs. Environment branch policy restricts production to main; required human reviewers can be added in repository settings if desired. If backend credentials are absent, the explicit backend option fails before uploading anything.

Local emergency release remains possible through the existing authorized CLI tools after the same checks. It is intentionally separate from automatic CI; record the deployed commit and service versions. Installed clients use network-first shell caching and the release cache version in `firebase-messaging-sw.js`.
