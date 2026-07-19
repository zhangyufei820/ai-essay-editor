#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-new-api}"
MANIFEST="${NEW_API_RELEASE_MANIFEST:-${APP_DIR}/release-manifest.json}"
CONTAINER="${NEW_API_CONTAINER:-shenxiang-new-api}"

[ -r "$MANIFEST" ] || { printf 'release manifest missing: %s\n' "$MANIFEST" >&2; exit 1; }

expected_image="$(jq -er '.image' "$MANIFEST")"
expected_image_id="$(jq -er '.image_id' "$MANIFEST")"
expected_commit="$(jq -er '.repo_commit' "$MANIFEST")"
expected_upstream="$(jq -er '.upstream_commit' "$MANIFEST")"
expected_patch="$(jq -er '.patch_sha256' "$MANIFEST")"
expected_policy="$(jq -er '.policy_sha256' "$MANIFEST")"
expected_model_sync_runner="${APP_DIR}/release-state/checkouts/${expected_commit}/services/shenxiang-new-api/scripts/sync_app_model_permissions.sh"

actual_image="$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')"
actual_image_id="$(docker inspect "$CONTAINER" --format '{{.Image}}')"
[ "$actual_image" = "$expected_image" ] || { printf 'release image drift: expected %s, got %s\n' "$expected_image" "$actual_image" >&2; exit 1; }
[ "$actual_image_id" = "$expected_image_id" ] || { printf 'release image ID drift\n' >&2; exit 1; }

label_commit="$(docker image inspect "$actual_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
label_upstream="$(docker image inspect "$actual_image" --format '{{index .Config.Labels "io.shenxiang.new-api.upstream-revision"}}')"
label_patch="$(docker image inspect "$actual_image" --format '{{index .Config.Labels "io.shenxiang.new-api.patch-sha256"}}')"
label_policy="$(docker image inspect "$actual_image" --format '{{index .Config.Labels "io.shenxiang.new-api.policy-sha256"}}')"

[ "$label_commit" = "$expected_commit" ] || { printf 'release commit label drift\n' >&2; exit 1; }
[ "$label_upstream" = "$expected_upstream" ] || { printf 'release upstream label drift\n' >&2; exit 1; }
[ "$label_patch" = "$expected_patch" ] || { printf 'release patch label drift\n' >&2; exit 1; }
[ "$label_policy" = "$expected_policy" ] || { printf 'release policy label drift\n' >&2; exit 1; }
[ -r "$expected_model_sync_runner" ] || { printf 'release model-permission runner missing\n' >&2; exit 1; }
cmp -s "${APP_DIR}/scripts/sync_app_model_permissions.sh" "$expected_model_sync_runner" || {
  printf 'release model-permission runner drift\n' >&2
  exit 1
}

printf 'release state verified: %s %s\n' "$expected_commit" "$expected_image"
