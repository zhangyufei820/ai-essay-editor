#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-new-api}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3120}"
MANIFEST="${NEW_API_RELEASE_MANIFEST:-${APP_DIR}/release-manifest.json}"

[ -r "${MANIFEST}" ] || { printf 'release manifest missing: %s\n' "${MANIFEST}" >&2; exit 1; }

RELEASE_COMMIT="$(jq -er '.repo_commit | select(type == "string" and test("^[0-9a-f]{40}$"))' "${MANIFEST}")"
CHECKOUT="${APP_DIR}/release-state/checkouts/${RELEASE_COMMIT}"
GUARD_SCRIPT="${CHECKOUT}/services/shenxiang-new-api/scripts/ensure_codex_entry.py"

"${APP_DIR}/scripts/check-new-api-release-state.sh"

if [ "$(git -C "${CHECKOUT}" rev-parse HEAD)" != "${RELEASE_COMMIT}" ]; then
  printf 'release checkout does not match manifest commit %s\n' "${RELEASE_COMMIT}" >&2
  exit 1
fi
if [ -n "$(git -C "${CHECKOUT}" status --porcelain)" ]; then
  printf 'release checkout is dirty: %s\n' "${CHECKOUT}" >&2
  exit 1
fi
[ -f "${GUARD_SCRIPT}" ] || { printf 'release Codex guard script missing: %s\n' "${GUARD_SCRIPT}" >&2; exit 1; }

python3 "${GUARD_SCRIPT}" \
  --app-root "${APP_DIR}" \
  --check-source \
  --sync-db \
  --check-url "${BASE_URL}" \
  --strict
