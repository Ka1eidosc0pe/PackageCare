#!/usr/bin/env bash
# Interactive CDK deploy of the PackageCare stack to us-east-2 with the pkgcare profile.
# Reads WORKSPACE_PASSWORD and SESSION_SECRET from the ignored data/aws-deploy/secrets.env.
# CDK shows the IAM/security changes and asks for confirmation before deploying.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH=/Users/adityaselvam/.aws-tooling/bin:$PATH
set -a; . data/aws-deploy/secrets.env; set +a
npx cdk deploy PackageCare --profile pkgcare --app 'node --import tsx infra/app.ts' \
  --parameters WorkspacePassword="$WORKSPACE_PASSWORD" --parameters SessionSecret="$SESSION_SECRET" \
  --outputs-file data/aws-deploy/outputs.json
