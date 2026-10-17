#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
  echo "Expected one PackageCare Lambda handler." >&2
  exit 1
fi
# Runtime client v4 consumes the handler through the environment, not argv.
export _HANDLER="$1"
export LAMBDA_TASK_ROOT="${LAMBDA_TASK_ROOT:-/var/task}"
exec /usr/local/bin/node /var/task/node_modules/aws-lambda-ric/index.mjs
