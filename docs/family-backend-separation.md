# Separate family backend

The separate Apps Script project is staged, with its public project/deployment identifiers in `family-backend.json`. It currently contains only an access probe, returns no household records, and is not receiving client traffic. Google returned an authorization page when checking it.

Open https://script.google.com/home/projects/16wgGnyCUjE6KGpYFovkM-RJKtqOD3ZZRgBsH-V6vF9tZmN6HfTXjzWNb/edit, select `doGet`, click Run, and approve the spreadsheet/calendar permissions with the account that owns the family spreadsheet. No credentials need to be sent to Codex.

Before cutover, replace the probe with the authenticated family service; bind the standalone project to the existing spreadsheet; deny all finance actions; isolate family Operations/ActivityLog writes; forward legacy family writes from the old service to preserve a single writer; and stop reconciliation in the old nightly digest. Verify the allowlist, retries, calendar reconciliation, and reminder bridge. Keep finance/Gmail automation in the original service. Shared authoritative sheets need not be copied.

The deployed performance improvement is independent: get_family_core skips Calendar and reconciliation, then get_family_calendar hydrates events/tasks. No physical service split is claimed until the above cutover checks pass.
