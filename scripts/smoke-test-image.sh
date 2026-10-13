#!/usr/bin/env bash
# Smoke-test a built production image, as CI does before publishing: run
# migrations inside it, start the app, then check the probes and the SPA.
#
# Usage: scripts/smoke-test-image.sh <image> <expected commit>
#
# Runs compose.yaml's `image` profile as a separate Compose project, so it
# gets its own empty database and never touches your dev one. Free host ports
# are picked, so it can run alongside the dev stack. Everything it creates is
# removed on exit.
set -euo pipefail

cd "$(dirname "$0")/.."

export APP_IMAGE=$1 POSTGRES_PORT=0 APP_PORT=0
commit=$2

# .env.example rather than your .env: known credentials for a throwaway database.
compose() {
  docker compose --project-name anvil-smoke --env-file .env.example --profile image "$@"
}

cleanup() { compose down --volumes --remove-orphans > /dev/null 2>&1 || true; }
cleanup # leftovers from an interrupted run
trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  compose logs migrate app >&2
  exit 1
}

# Waits for the database, runs migrations to completion, then starts the app.
compose up --detach --wait || fail "compose up (database, migrations or app start)"

base="http://$(compose port app 8000)"
echo "App running at $base"

live=$(curl -sf --retry 30 --retry-all-errors --retry-delay 1 "$base/api/health/live") \
  || fail "/api/health/live"
echo "live: $live"
[ "$(jq -r .commit <<< "$live")" = "$commit" ] \
  || fail "live reports commit $(jq -r .commit <<< "$live"), expected $commit"
curl -sf "$base/api/health/ready" > /dev/null || fail "/api/health/ready"
curl -sf "$base/" | grep -q '<div id="root">' || fail "/ doesn't serve the SPA"

echo "Smoke test passed."
