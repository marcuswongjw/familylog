#!/bin/bash
# Push Code.js and roll the existing web app deployment (GAS_URL stays the same).
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOYMENT_ID='AKfycbwQzpqQRRnK_PJRIbKWvPRhFVrQbfLEORciIRijBSwiz7WkX-7Ik2vTrZzE9VZ7Nehr'
CLASP=(npx --yes @google/clasp@2.5.0)

if [[ ! -f .clasp.json ]]; then
  echo "Missing .clasp.json. Copy .clasp.json.example and paste the script ID from the Apps Script editor URL:" >&2
  echo "  https://script.google.com/home/projects/<SCRIPT_ID>/edit" >&2
  exit 1
fi
if [[ ! -f "$HOME/.clasprc.json" ]]; then
  echo "Not logged in to clasp. Run once in a terminal:" >&2
  echo "  npx @google/clasp@2.5.0 login" >&2
  exit 1
fi

"${CLASP[@]}" push --force
"${CLASP[@]}" deploy -i "$DEPLOYMENT_ID" -d "Code.js $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Apps Script web app updated. GAS_URL is unchanged."
