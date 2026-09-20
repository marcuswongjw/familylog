---
name: deploy-gas
description: After any edit to FamilyLog Code.js, push and redeploy the Apps Script web app with clasp. Use when Code.js changes, GAS needs a new version, or the user says deploy Apps Script / deploy Code.js / update the spreadsheet backend.
---

# Deploy FamilyLog Apps Script

`Code.js` is not live until clasp push + deploy. GitHub Pages only hosts the PWA. After you change `Code.js`, deploy in the same turn. Do not tell the user to open **Deploy → New version**.

## Deploy

From the familylog repo root:

```bash
./scripts/deploy-gas.sh
```

That uploads only `Code.js` (see `.claspignore`) and updates the existing web app deployment so `GAS_URL` in `js/app.js` does not change.

## If it fails

**Missing `.clasp.json`:** ask for the script ID from the editor URL `https://script.google.com/home/projects/<SCRIPT_ID>/edit`. Copy `.clasp.json.example` to `.clasp.json`, put that ID in `scriptId`, commit `.clasp.json`.

**Not logged in** (`~/.clasprc.json` missing, or clasp says login required): ask the user to run this once in a terminal and finish the browser prompt:

```bash
npx @google/clasp@2.5.0 login
```

Then rerun `./scripts/deploy-gas.sh`. Do not paste tokens.

**Apps Script API disabled:** tell the user to enable it at https://script.google.com/home/usersettings and retry.

## Do not

- Upload `index.html`, `js/`, or other PWA files to Apps Script.
- Create a new web app deployment (that would mint a new `/exec` URL).
- Invent a new `appsscript.json`. The checked-in file was pulled from the bound project (Gmail/Calendar scopes). Only edit it if scopes must change.
