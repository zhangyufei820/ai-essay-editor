#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
REPO_ROOT="$(git -C "$SERVICE_DIR" rev-parse --show-toplevel)"
POLICY_FILE="${SERVICE_DIR}/docs/RELEASE-GOVERNANCE.md"
PRODUCTION_HOST="${NEW_API_PRODUCTION_HOST:-root@43.154.111.156}"
REMOTE_MANIFEST="${NEW_API_REMOTE_MANIFEST:-/opt/shenxiang-new-api/release-manifest.json}"

hash_file() {
  python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$1"
}

[ -f "$POLICY_FILE" ] || { printf 'Missing release policy: %s\n' "$POLICY_FILE" >&2; exit 1; }

cat "$POLICY_FILE"
POLICY_HASH="$(hash_file "$POLICY_FILE")"

git -C "$REPO_ROOT" fetch origin production/new-api
REMOTE_HEAD="$(git -C "$REPO_ROOT" rev-parse origin/production/new-api)"
CURRENT_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD)"

MANIFEST="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "$PRODUCTION_HOST" "test -r '$REMOTE_MANIFEST' && cat '$REMOTE_MANIFEST'")"
PRODUCTION_COMMIT="$(printf '%s' "$MANIFEST" | python3 -c 'import json,sys; print(json.load(sys.stdin)["repo_commit"])')"

git -C "$REPO_ROOT" cat-file -e "${PRODUCTION_COMMIT}^{commit}"
if ! git -C "$REPO_ROOT" merge-base --is-ancestor "$PRODUCTION_COMMIT" "$CURRENT_HEAD"; then
  printf 'Current worktree is behind production commit %s. Start from origin/production/new-api.\n' "$PRODUCTION_COMMIT" >&2
  exit 1
fi
if ! git -C "$REPO_ROOT" merge-base --is-ancestor "$PRODUCTION_COMMIT" "$REMOTE_HEAD"; then
  printf 'origin/production/new-api does not contain production commit %s. Release is blocked.\n' "$PRODUCTION_COMMIT" >&2
  exit 1
fi

printf '\nRelease policy SHA-256: %s\n' "$POLICY_HASH"
printf 'Production commit: %s\n' "$PRODUCTION_COMMIT"
printf 'origin/production/new-api: %s\n' "$REMOTE_HEAD"
printf 'Current worktree: %s\n' "$CURRENT_HEAD"
printf 'Before deployment export: NEW_API_RELEASE_POLICY_ACK=%s\n' "$POLICY_HASH"
git -C "$REPO_ROOT" status --short --branch
