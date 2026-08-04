#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"

DEFAULT_UPSTREAM_REPO="https://github.com/QuantumNous/new-api.git"
UPSTREAM_REPO="${UPSTREAM_REPO:-$DEFAULT_UPSTREAM_REPO}"
UPSTREAM_REF="${UPSTREAM_REF:-}"
BUILD_ROOT="${BUILD_ROOT:-${SERVICE_DIR}/.local-source}"
CACHE_DIR="${CACHE_DIR:-}"
WORKTREE_DIR="${WORKTREE_DIR:-}"
PATCH_DIR="${PATCH_DIR:-${SERVICE_DIR}/src-patch}"
SOURCE_DIR="${SOURCE_DIR:-}"
SKIP_FETCH=0
PRINT_PATH=0
RUN_COMMAND=()

usage() {
  cat <<'EOF'
Usage:
  services/shenxiang-new-api/scripts/prepare-local-source.sh [options] [-- command...]

Prepare a complete local New API source tree by cloning/fetching upstream
New API, then overlaying services/shenxiang-new-api/src-patch on top.

Options:
  --repo URL          Upstream git repo. Default: https://github.com/QuantumNous/new-api.git
  --ref REF           Branch, tag, or commit to check out after fetch.
  --source-dir DIR    Use an existing complete New API source dir instead of git clone/fetch.
  --build-root DIR    Root for generated cache/worktree. Default: services/shenxiang-new-api/.local-source
  --cache-dir DIR     Upstream git cache dir. Default: BUILD_ROOT/upstream
  --worktree-dir DIR  Generated complete source dir. Default: BUILD_ROOT/worktree
  --patch-dir DIR     Patch overlay dir. Default: services/shenxiang-new-api/src-patch
  --skip-fetch        Reuse the existing upstream cache without fetching.
  --print-path        Print only the prepared worktree path at the end.
  -h, --help          Show this help.

Examples:
  services/shenxiang-new-api/scripts/prepare-local-source.sh
  services/shenxiang-new-api/scripts/prepare-local-source.sh --ref main -- go test ./service -run TestMonthlyCard -count=1
  SOURCE_DIR=/path/to/new-api services/shenxiang-new-api/scripts/prepare-local-source.sh -- go test ./...

Notes:
  - This script writes only under BUILD_ROOT by default.
  - It does not touch production, Docker, MySQL, Redis, or /opt/shenxiang-new-api.
  - The generated worktree is disposable and ignored by git.
EOF
}

info() {
  printf '[prepare-local-source] %s\n' "$*"
}

die() {
  printf '[prepare-local-source] ERROR: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

abs_existing_dir() {
  [ -d "$1" ] || die "directory does not exist: $1"
  (cd "$1" && pwd -P)
}

abs_creatable_dir() {
  local path="$1"
  local parent base parent_abs
  parent="$(dirname "$path")"
  base="$(basename "$path")"
  mkdir -p "$parent"
  parent_abs="$(cd "$parent" && pwd -P)"
  printf '%s/%s\n' "$parent_abs" "$base"
}

quote_args() {
  local arg
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
}

ensure_under_build_root() {
  local name="$1"
  local path="$2"
  case "$path" in
    "$BUILD_ROOT_ABS"/*) ;;
    *) die "$name must be under BUILD_ROOT ($BUILD_ROOT_ABS): $path" ;;
  esac
  [ "$path" != "$BUILD_ROOT_ABS" ] || die "$name must not equal BUILD_ROOT"
}

checkout_upstream_ref() {
  local ref="$1"
  if git -C "$CACHE_DIR_ABS" rev-parse --verify --quiet "origin/${ref}^{commit}" >/dev/null; then
    git -C "$CACHE_DIR_ABS" checkout -B "$ref" "origin/$ref"
    git -C "$CACHE_DIR_ABS" reset --hard "origin/$ref"
    return
  fi
  git -C "$CACHE_DIR_ABS" checkout --force "$ref"
}

checkout_default_ref() {
  local default_ref
  default_ref="$(git -C "$CACHE_DIR_ABS" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
  if [ -n "$default_ref" ] && git -C "$CACHE_DIR_ABS" rev-parse --verify --quiet "origin/${default_ref}^{commit}" >/dev/null; then
    git -C "$CACHE_DIR_ABS" checkout -B "$default_ref" "origin/$default_ref"
    git -C "$CACHE_DIR_ABS" reset --hard "origin/$default_ref"
    return
  fi
  if git -C "$CACHE_DIR_ABS" rev-parse --abbrev-ref HEAD >/dev/null 2>&1; then
    git -C "$CACHE_DIR_ABS" pull --ff-only || true
  fi
}

prepare_upstream_cache() {
  if [ -n "$SOURCE_DIR" ]; then
    SOURCE_DIR_ABS="$(abs_existing_dir "$SOURCE_DIR")"
    [ -f "${SOURCE_DIR_ABS}/go.mod" ] || die "--source-dir is not a complete Go module: ${SOURCE_DIR_ABS}/go.mod not found"
    info "using existing source: $SOURCE_DIR_ABS"
    return
  fi

  need_cmd git
  if [ -e "$CACHE_DIR_ABS" ] && [ ! -d "${CACHE_DIR_ABS}/.git" ]; then
    die "cache dir exists but is not a git repo: $CACHE_DIR_ABS"
  fi

  if [ ! -d "${CACHE_DIR_ABS}/.git" ]; then
    info "cloning upstream: $UPSTREAM_REPO"
    git clone "$UPSTREAM_REPO" "$CACHE_DIR_ABS"
  elif [ "$SKIP_FETCH" -eq 0 ]; then
    info "fetching upstream updates"
    git -C "$CACHE_DIR_ABS" fetch --tags --prune origin
  else
    info "skip fetch enabled; reusing upstream cache"
  fi

  if [ -n "$UPSTREAM_REF" ]; then
    info "checking out ref: $UPSTREAM_REF"
    checkout_upstream_ref "$UPSTREAM_REF"
  elif [ "$SKIP_FETCH" -eq 0 ]; then
    checkout_default_ref
  fi

  if [ -f "${CACHE_DIR_ABS}/.gitmodules" ]; then
    info "updating submodules"
    git -C "$CACHE_DIR_ABS" submodule update --init --recursive
  fi

  [ -f "${CACHE_DIR_ABS}/go.mod" ] || die "upstream cache is not a complete Go module: ${CACHE_DIR_ABS}/go.mod not found"
  SOURCE_DIR_ABS="$CACHE_DIR_ABS"
}

overlay_patch() {
  need_cmd rsync
  [ -d "$PATCH_DIR_ABS" ] || die "patch dir does not exist: $PATCH_DIR_ABS"

  info "rebuilding generated worktree"
  mkdir -p "$WORKTREE_DIR_ABS"
  rsync -a --delete --exclude='.git/' "${SOURCE_DIR_ABS}/" "${WORKTREE_DIR_ABS}/"

  info "overlaying src-patch"
  rsync -a "${PATCH_DIR_ABS}/" "${WORKTREE_DIR_ABS}/"
  printf 'generated by %s\n' "$0" > "${WORKTREE_DIR_ABS}/.generated-by-prepare-local-source"

  [ -f "${WORKTREE_DIR_ABS}/go.mod" ] || die "prepared worktree is missing go.mod: $WORKTREE_DIR_ABS"
}

prepare_go_embed_assets() {
  local theme dist_dir index_file
  for theme in default classic; do
    dist_dir="${WORKTREE_DIR_ABS}/web/${theme}/dist"
    index_file="${dist_dir}/index.html"
    if [ ! -f "$index_file" ]; then
      mkdir -p "$dist_dir"
      printf '<!doctype html><title>New API test embed placeholder</title>\n' > "$index_file"
    fi
  done
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      [ "$#" -ge 2 ] || die "--repo requires a value"
      UPSTREAM_REPO="$2"
      shift 2
      ;;
    --ref)
      [ "$#" -ge 2 ] || die "--ref requires a value"
      UPSTREAM_REF="$2"
      shift 2
      ;;
    --source-dir)
      [ "$#" -ge 2 ] || die "--source-dir requires a value"
      SOURCE_DIR="$2"
      shift 2
      ;;
    --build-root)
      [ "$#" -ge 2 ] || die "--build-root requires a value"
      BUILD_ROOT="$2"
      shift 2
      ;;
    --cache-dir)
      [ "$#" -ge 2 ] || die "--cache-dir requires a value"
      CACHE_DIR="$2"
      shift 2
      ;;
    --worktree-dir)
      [ "$#" -ge 2 ] || die "--worktree-dir requires a value"
      WORKTREE_DIR="$2"
      shift 2
      ;;
    --patch-dir)
      [ "$#" -ge 2 ] || die "--patch-dir requires a value"
      PATCH_DIR="$2"
      shift 2
      ;;
    --skip-fetch)
      SKIP_FETCH=1
      shift
      ;;
    --print-path)
      PRINT_PATH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      RUN_COMMAND=("$@")
      break
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[ -n "$CACHE_DIR" ] || CACHE_DIR="${BUILD_ROOT}/upstream"
[ -n "$WORKTREE_DIR" ] || WORKTREE_DIR="${BUILD_ROOT}/worktree"

BUILD_ROOT_ABS="$(abs_creatable_dir "$BUILD_ROOT")"
mkdir -p "$BUILD_ROOT_ABS"
BUILD_ROOT_ABS="$(cd "$BUILD_ROOT_ABS" && pwd -P)"
CACHE_DIR_ABS="$(abs_creatable_dir "$CACHE_DIR")"
WORKTREE_DIR_ABS="$(abs_creatable_dir "$WORKTREE_DIR")"
PATCH_DIR_ABS="$(abs_existing_dir "$PATCH_DIR")"

ensure_under_build_root "CACHE_DIR" "$CACHE_DIR_ABS"
ensure_under_build_root "WORKTREE_DIR" "$WORKTREE_DIR_ABS"
printf 'generated cache root for prepare-local-source.sh\n' > "${BUILD_ROOT_ABS}/.prepare-local-source-root"

prepare_upstream_cache
overlay_patch
prepare_go_embed_assets

if [ "$PRINT_PATH" -eq 1 ]; then
  printf '%s\n' "$WORKTREE_DIR_ABS"
else
  info "prepared complete source: $WORKTREE_DIR_ABS"
  info "example: cd \"$WORKTREE_DIR_ABS\" && go test ./service -run TestMonthlyCard -count=1"
fi

if [ "${#RUN_COMMAND[@]}" -gt 0 ]; then
  info "running command in prepared worktree:$(quote_args "${RUN_COMMAND[@]}")"
  (cd "$WORKTREE_DIR_ABS" && "${RUN_COMMAND[@]}")
fi
