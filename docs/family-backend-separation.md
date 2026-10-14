# Separate family backend

The standalone family Apps Script service is authorized and its spreadsheet/calendar readiness check passes. Family traffic routes directly to it; the original project remains responsible for finance/private-parent records and existing mail/reminder integrations.

`docs/family-backend.json` stores public project/deployment identifiers. `scripts/build-family-backend.cjs` binds the standalone service to the existing authoritative spreadsheet without copying records. `scripts/deploy-family-gas.sh` builds outside the repository and publishes a versioned deployment. It uses only Sheets, Calendar and external-request scopes, excluding Gmail/mail scopes. The runtime denies finance actions, private-parent dashboards, reminder snapshots and GET data requests. Firebase token verification and the family/parent ownership rules remain unchanged. Public `health` returns readiness only; no household records.

Family reads and writes route directly to this service after the client release. Parent finance/private records stay on the original service. Reminder bridge setup and signed snapshots also stay there, because their settings/automation already run there. Legacy family reads/writes on the original endpoint forward using the caller's Firebase token; failures never fall back to local writes. Legacy `get_all` composes the forwarded family response with parent-only fields for authorized parents.

Family writes use the new script's lock. New retry-cache/activity writes use FamilyOperations and FamilyActivityLog; legacy retry/history rows remain readable. Existing task IDs, reward earn IDs and operation fingerprints are preserved. The original nightly digest no longer reconciles preparation tasks; family calendar hydration owns reconciliation. Original finance/Gmail schedules continue in their existing project.

Deployment order: family service, anonymous health check, original forwarding service, reviewed static client release. The original deploy script refuses to activate forwarding unless the family readiness check passes. The controlled CI backend step deploys both services in that order. If reverting, preserve one family writer; never enable simultaneous local writes on both projects.

The existing performance improvement remains live independently: get_family_core renders habits/tasks/companions before get_family_calendar fetches events and reconciles preparation tasks. The spreadsheet is still shared; independent script execution/locks do not eliminate Sheets quotas or Calendar latency.
