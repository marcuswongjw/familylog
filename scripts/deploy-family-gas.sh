#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
STAGING_DIR="$(mktemp -d /tmp/wongs-nest-family-gas.XXXXXX)"
trap 'rm -rf "$STAGING_DIR"' EXIT
node scripts/build-family-backend.cjs "$STAGING_DIR"
DEPLOYMENT_ID="$(node -e "console.log(require('./scripts/project-config.cjs').serviceConfig('family').deploymentId)")"
cd "$STAGING_DIR"
npx --yes @google/clasp@2.5.0 push --force
npx --yes @google/clasp@2.5.0 deploy -i "$DEPLOYMENT_ID" -d "Family service $(date -u +%Y-%m-%dT%H:%M:%SZ)"
