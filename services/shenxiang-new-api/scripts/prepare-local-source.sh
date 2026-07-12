#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"

UPSTREAM_LOCK_FILE="${UPSTREAM_LOCK_FILE:-${SERVICE_DIR}/UPSTREAM.lock}"
PATCH_BASE_FILE="${PATCH_BASE_FILE:-${SERVICE_DIR}/PATCH_BASE}"
UPSTREAM_REPO_OVERRIDE="${UPSTREAM_REPO:-}"
UPSTREAM_REF_OVERRIDE="${UPSTREAM_REF:-}"
UPSTREAM_REPO=""
UPSTREAM_REF=""
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

Prepare a complete local New API source tree from the locked upstream Git
object, then overlay services/shenxiang-new-api/src-patch on top.

Options:
  --repo URL          Must match the repository recorded in UPSTREAM.lock.
  --ref COMMIT        Must match the commit recorded in UPSTREAM.lock.
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
  services/shenxiang-new-api/scripts/prepare-local-source.sh -- go test ./service -run TestMonthlyCard -count=1
  SOURCE_DIR=/path/to/new-api services/shenxiang-new-api/scripts/prepare-local-source.sh -- go test ./...

Notes:
  - This script writes only under BUILD_ROOT by default.
  - UPSTREAM.lock and PATCH_BASE are mandatory and must name the same commit.
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

validate_build_child_path() {
  local name="$1"
  local path="$2"
  need_cmd python3
  python3 - "$name" "$BUILD_ROOT_ABS" "$path" <<'PY'
import os
import stat
import sys


name, build_root, candidate = sys.argv[1:]
build_root = os.path.realpath(os.path.abspath(build_root))
candidate_input = os.path.abspath(candidate)
candidate = os.path.join(os.path.realpath(os.path.dirname(candidate_input)), os.path.basename(candidate_input))


def fail(message: str) -> None:
    print(f"[prepare-local-source] ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


try:
    if os.path.commonpath((build_root, candidate)) != build_root or candidate == build_root:
        fail(f"{name} must be strictly under BUILD_ROOT ({build_root}): {candidate}")
except ValueError:
    fail(f"{name} must be strictly under BUILD_ROOT ({build_root}): {candidate}")

current = build_root
relative_parts = os.path.relpath(candidate, build_root).split(os.sep)
for component in relative_parts[:-1]:
    current = os.path.join(current, component)
    try:
        metadata = os.lstat(current)
    except FileNotFoundError:
        try:
            os.mkdir(current)
            metadata = os.lstat(current)
        except OSError as error:
            fail(f"cannot create {name} parent {current}: {error}")
    except OSError as error:
        fail(f"cannot inspect {name} parent {current}: {error}")
    if stat.S_ISLNK(metadata.st_mode):
        fail(f"{name} path must not contain a symbolic link: {current}")
    if not stat.S_ISDIR(metadata.st_mode):
        fail(f"{name} parent is not a directory: {current}")

try:
    metadata = os.lstat(candidate)
except FileNotFoundError:
    metadata = None
except OSError as error:
    fail(f"cannot inspect {name} path {candidate}: {error}")
if metadata is not None and stat.S_ISLNK(metadata.st_mode):
    fail(f"{name} path must not be a symbolic link: {candidate}")

physical_root = os.path.realpath(build_root)
physical_candidate = os.path.realpath(candidate)
try:
    if os.path.commonpath((physical_root, physical_candidate)) != physical_root or physical_candidate == physical_root:
        fail(f"{name} resolves outside BUILD_ROOT ({physical_root}): {physical_candidate}")
except ValueError:
    fail(f"{name} resolves outside BUILD_ROOT ({physical_root}): {physical_candidate}")

print(physical_candidate)
PY
}

load_source_contract() {
  local key value locked_repo="" locked_commit="" patch_base
  [ -f "$UPSTREAM_LOCK_FILE" ] || die "UPSTREAM.lock not found: $UPSTREAM_LOCK_FILE"
  [ -f "$PATCH_BASE_FILE" ] || die "PATCH_BASE not found: $PATCH_BASE_FILE"

  while IFS='=' read -r key value; do
    case "$key" in
      ''|'#'*) continue ;;
      UPSTREAM_REPO) locked_repo="$value" ;;
      UPSTREAM_COMMIT) locked_commit="$value" ;;
      *) die "unsupported key in UPSTREAM.lock: $key" ;;
    esac
  done < "$UPSTREAM_LOCK_FILE"

  [ -n "$locked_repo" ] || die "UPSTREAM.lock is missing UPSTREAM_REPO"
  case "$locked_commit" in
    *[!0-9a-fA-F]*|'') die "UPSTREAM.lock contains an invalid UPSTREAM_COMMIT" ;;
  esac
  [ "${#locked_commit}" -eq 40 ] || die "UPSTREAM.lock UPSTREAM_COMMIT must be a full 40-character SHA"
  locked_commit="$(printf '%s' "$locked_commit" | tr 'A-F' 'a-f')"

  patch_base="$(tr -d '[:space:]' < "$PATCH_BASE_FILE")"
  [ "$patch_base" = "$locked_commit" ] || die "PATCH_BASE ($patch_base) does not match UPSTREAM.lock ($locked_commit)"
  if [ -n "$UPSTREAM_REPO_OVERRIDE" ] && [ "$UPSTREAM_REPO_OVERRIDE" != "$locked_repo" ]; then
    die "requested repository does not match UPSTREAM.lock: $UPSTREAM_REPO_OVERRIDE"
  fi
  if [ -n "$UPSTREAM_REF_OVERRIDE" ] && [ "$UPSTREAM_REF_OVERRIDE" != "$locked_commit" ]; then
    die "requested ref does not match UPSTREAM.lock: $UPSTREAM_REF_OVERRIDE"
  fi

  UPSTREAM_REPO="$locked_repo"
  UPSTREAM_REF="$locked_commit"
}

checkout_locked_commit() {
  git -C "$CACHE_DIR_ABS" rev-parse --verify --quiet "${UPSTREAM_REF}^{commit}" >/dev/null || \
    die "locked upstream commit is unavailable: $UPSTREAM_REF"
  git -C "$CACHE_DIR_ABS" checkout --detach --force "$UPSTREAM_REF"
  local actual
  actual="$(git -C "$CACHE_DIR_ABS" rev-parse HEAD)"
  [ "$actual" = "$UPSTREAM_REF" ] || die "upstream checkout mismatch: expected $UPSTREAM_REF, got $actual"
}

prepare_upstream_cache() {
  if [ -n "$SOURCE_DIR" ]; then
    SOURCE_DIR_ABS="$(abs_existing_dir "$SOURCE_DIR")"
    [ -f "${SOURCE_DIR_ABS}/go.mod" ] || die "--source-dir is not a complete Go module: ${SOURCE_DIR_ABS}/go.mod not found"
    git -C "$SOURCE_DIR_ABS" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "--source-dir must be a git worktree"
    local source_commit
    source_commit="$(git -C "$SOURCE_DIR_ABS" rev-parse HEAD)"
    [ "$source_commit" = "$UPSTREAM_REF" ] || die "--source-dir HEAD does not match UPSTREAM.lock: $source_commit"
    [ -z "$(git -C "$SOURCE_DIR_ABS" status --porcelain --untracked-files=all)" ] || die "--source-dir must be clean"
    info "using existing source: $SOURCE_DIR_ABS"
    return
  fi

  need_cmd git
  CACHE_DIR_ABS="$(validate_build_child_path "CACHE_DIR" "$CACHE_DIR_ABS")"
  if [ -e "$CACHE_DIR_ABS" ] && [ ! -d "${CACHE_DIR_ABS}/.git" ]; then
    die "cache dir exists but is not a git repo: $CACHE_DIR_ABS"
  fi

  if [ ! -d "${CACHE_DIR_ABS}/.git" ]; then
    [ "$SKIP_FETCH" -eq 0 ] || die "--skip-fetch requires an existing upstream cache: $CACHE_DIR_ABS"
    info "cloning upstream: $UPSTREAM_REPO"
    git clone --no-checkout "$UPSTREAM_REPO" "$CACHE_DIR_ABS"
  else
    local origin_url
    origin_url="$(git -C "$CACHE_DIR_ABS" remote get-url origin)"
    [ "$origin_url" = "$UPSTREAM_REPO" ] || die "cached origin does not match UPSTREAM.lock: $origin_url"
  fi

  if [ "$SKIP_FETCH" -eq 0 ]; then
    info "fetching locked upstream commit: $UPSTREAM_REF"
    git -C "$CACHE_DIR_ABS" fetch --force --no-tags origin "$UPSTREAM_REF"
  else
    info "skip fetch enabled; reusing upstream cache"
  fi

  if ! git -C "$CACHE_DIR_ABS" rev-parse --verify --quiet "${UPSTREAM_REF}^{commit}" >/dev/null; then
    [ "$SKIP_FETCH" -eq 0 ] || die "locked upstream commit is unavailable in cache: $UPSTREAM_REF"
    die "locked upstream commit is unavailable after fetch: $UPSTREAM_REF"
  fi
  CACHE_DIR_ABS="$(validate_build_child_path "CACHE_DIR" "$CACHE_DIR_ABS")"
  info "checking out locked commit: $UPSTREAM_REF"
  checkout_locked_commit

  [ -f "${CACHE_DIR_ABS}/go.mod" ] || die "upstream cache is not a complete Go module: ${CACHE_DIR_ABS}/go.mod not found"
  SOURCE_DIR_ABS="$CACHE_DIR_ABS"
}

materialize_locked_source() {
  need_cmd git
  need_cmd rsync
  need_cmd tar

  if git -C "$SOURCE_DIR_ABS" cat-file -e "${UPSTREAM_REF}:.gitmodules" 2>/dev/null; then
    die "locked upstream uses submodules; archive materialization is not configured"
  fi

  info "materializing locked Git tree"
  rsync -a --delete --delete-excluded --exclude='*' "${SOURCE_DIR_ABS}/" "${WORKTREE_DIR_ABS}/"
  if ! git -C "$SOURCE_DIR_ABS" archive --format=tar "$UPSTREAM_REF" | tar -xf - -C "$WORKTREE_DIR_ABS"; then
    die "failed to materialize locked upstream commit: $UPSTREAM_REF"
  fi
}

write_build_provenance() {
  local repository_root repository_url repository_commit repository_dirty
  need_cmd python3
  repository_root="$(git -C "$SERVICE_DIR" rev-parse --show-toplevel 2>/dev/null)" || die "project repository root is unavailable"
  repository_url="$(git -C "$repository_root" remote get-url origin 2>/dev/null)" || die "project repository origin is unavailable"
  repository_commit="$(git -C "$repository_root" rev-parse HEAD)"
  if [ -n "$(git -C "$repository_root" status --porcelain --untracked-files=all -- "$SERVICE_DIR")" ]; then
    repository_dirty=true
  else
    repository_dirty=false
  fi

  REPOSITORY_ROOT="$repository_root" \
  REPOSITORY_URL="$repository_url" \
  REPOSITORY_COMMIT="$repository_commit" \
  REPOSITORY_DIRTY="$repository_dirty" \
  LOCKED_UPSTREAM_REPO="$UPSTREAM_REPO" \
  LOCKED_UPSTREAM_COMMIT="$UPSTREAM_REF" \
  PATCH_BASE_VALUE="$UPSTREAM_REF" \
  PATCH_DIRECTORY="$PATCH_DIR_ABS" \
  PREPARED_WORKTREE="$WORKTREE_DIR_ABS" \
    python3 - <<'PY'
import hashlib
import json
import os
import re
import stat
from pathlib import Path

patch_dir = Path(os.environ["PATCH_DIRECTORY"])
worktree = Path(os.environ["PREPARED_WORKTREE"])
generated_paths = {
    "BUILD-CHECKSUMS.sha256",
    "BUILD-MANIFEST.json",
    "build.env",
    "common/build-manifest.json",
}
safe_path = re.compile(r"^[A-Za-z0-9_@./$()+,=-]+$")


def fail(message: str) -> None:
    print(f"[prepare-local-source] ERROR: {message}", file=os.sys.stderr)
    raise SystemExit(1)


def regular_files(root: Path, *, exclude_generated: bool = False) -> list[tuple[str, Path]]:
    files: list[tuple[str, Path]] = []
    for current, directory_names, file_names in os.walk(root, topdown=True, followlinks=False):
        current_path = Path(current)
        for name in sorted(directory_names):
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if not safe_path.fullmatch(relative):
                fail(f"unsafe file name under {root}: {relative!r}")
            if path.is_symlink():
                fail(f"symbolic links are forbidden under {root}: {relative}")
        for name in sorted(file_names):
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if not safe_path.fullmatch(relative):
                fail(f"unsafe file name under {root}: {relative!r}")
            metadata = path.lstat()
            if stat.S_ISLNK(metadata.st_mode):
                fail(f"symbolic links are forbidden under {root}: {relative}")
            if not stat.S_ISREG(metadata.st_mode):
                fail(f"only regular files are allowed under {root}: {relative}")
            if exclude_generated and relative in generated_paths:
                fail(f"source tree collides with generated provenance file: {relative}")
            files.append((relative, path))
    return sorted(files)


patch_files = regular_files(patch_dir)
digest = hashlib.sha256()
for relative, path in patch_files:
    mode = stat.S_IMODE(path.lstat().st_mode)
    content = path.read_bytes()
    digest.update(relative.encode("utf-8"))
    digest.update(b"\0")
    digest.update(b"file")
    digest.update(b"\0")
    digest.update(f"{mode:o}".encode("ascii"))
    digest.update(b"\0")
    digest.update(content)
    digest.update(b"\0")

patch_sha256 = digest.hexdigest()
worktree_files = regular_files(worktree, exclude_generated=True)
checksum_lines = []
for relative, path in worktree_files:
    checksum_lines.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {relative}\n")
checksum_bytes = "".join(checksum_lines).encode("utf-8")
worktree_sha256 = hashlib.sha256(checksum_bytes).hexdigest()
identity_values = (
    os.environ["REPOSITORY_URL"],
    os.environ["REPOSITORY_COMMIT"],
    os.environ["LOCKED_UPSTREAM_REPO"],
    os.environ["LOCKED_UPSTREAM_COMMIT"],
    os.environ["PATCH_BASE_VALUE"],
    patch_sha256,
    worktree_sha256,
)
identity = "".join(f"{value}\n" for value in identity_values).encode("utf-8")
manifest = {
    "schema_version": 2,
    "repository": os.environ["REPOSITORY_URL"],
    "repository_commit": os.environ["REPOSITORY_COMMIT"],
    "repository_dirty": os.environ["REPOSITORY_DIRTY"] == "true",
    "upstream_repository": os.environ["LOCKED_UPSTREAM_REPO"],
    "upstream_commit": os.environ["LOCKED_UPSTREAM_COMMIT"],
    "patch_base": os.environ["PATCH_BASE_VALUE"],
    "patch_file_count": len(patch_files),
    "patch_sha256": patch_sha256,
    "worktree_file_count": len(worktree_files),
    "worktree_sha256": worktree_sha256,
    "checksum_file": "BUILD-CHECKSUMS.sha256",
    "source_digest": hashlib.sha256(identity).hexdigest(),
}
encoded = (json.dumps(manifest, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")
(worktree / "BUILD-CHECKSUMS.sha256").write_bytes(checksum_bytes)
(worktree / "BUILD-MANIFEST.json").write_bytes(encoded)
(worktree / "common").mkdir(parents=True, exist_ok=True)
(worktree / "common" / "build-manifest.json").write_bytes(encoded)

env_lines = {
    "NEW_API_CHECKSUM_FILE": manifest["checksum_file"],
    "NEW_API_IMAGE_TAG": manifest["source_digest"][:16],
    "NEW_API_MANIFEST_SHA256": hashlib.sha256(encoded).hexdigest(),
    "NEW_API_PATCH_SHA256": manifest["patch_sha256"],
    "NEW_API_REPOSITORY_COMMIT": manifest["repository_commit"],
    "NEW_API_SOURCE_DIGEST": manifest["source_digest"],
    "NEW_API_SOURCE_REPOSITORY": manifest["repository"],
    "NEW_API_UPSTREAM_COMMIT": manifest["upstream_commit"],
    "NEW_API_UPSTREAM_REPOSITORY": manifest["upstream_repository"],
    "NEW_API_WORKTREE_FILE_COUNT": str(manifest["worktree_file_count"]),
    "NEW_API_WORKTREE_SHA256": manifest["worktree_sha256"],
}
(worktree / "build.env").write_text(
    "".join(f"{key}={value}\n" for key, value in sorted(env_lines.items())),
    encoding="utf-8",
)
PY
}

overlay_patch() {
  local symlink_path
  need_cmd rsync
  need_cmd find
  [ -d "$PATCH_DIR_ABS" ] || die "patch dir does not exist: $PATCH_DIR_ABS"
  symlink_path="$(find "$PATCH_DIR_ABS" -type l -print -quit)"
  [ -z "$symlink_path" ] || die "patch directory must not contain symbolic links: ${symlink_path#"$PATCH_DIR_ABS"/}"

  info "rebuilding generated worktree"
  WORKTREE_DIR_ABS="$(validate_build_child_path "WORKTREE_DIR" "$WORKTREE_DIR_ABS")"
  mkdir -p "$WORKTREE_DIR_ABS"
  WORKTREE_DIR_ABS="$(validate_build_child_path "WORKTREE_DIR" "$WORKTREE_DIR_ABS")"
  [ ! -e "${WORKTREE_DIR_ABS}/.git" ] && [ ! -L "${WORKTREE_DIR_ABS}/.git" ] || \
    die "generated worktree contains forbidden .git metadata: ${WORKTREE_DIR_ABS}/.git"
  [ ! -e "${PATCH_DIR_ABS}/.git" ] && [ ! -L "${PATCH_DIR_ABS}/.git" ] || \
    die "patch directory contains forbidden .git metadata: ${PATCH_DIR_ABS}/.git"
  materialize_locked_source

  info "overlaying src-patch"
  rsync -a "${PATCH_DIR_ABS}/" "${WORKTREE_DIR_ABS}/"
  [ ! -e "${WORKTREE_DIR_ABS}/.git" ] && [ ! -L "${WORKTREE_DIR_ABS}/.git" ] || \
    die "generated worktree contains forbidden .git metadata after overlay"
  printf 'generated by services/shenxiang-new-api/scripts/prepare-local-source.sh\n' > "${WORKTREE_DIR_ABS}/.generated-by-prepare-local-source"

  write_build_provenance

  [ -f "${WORKTREE_DIR_ABS}/go.mod" ] || die "prepared worktree is missing go.mod: $WORKTREE_DIR_ABS"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      [ "$#" -ge 2 ] || die "--repo requires a value"
      UPSTREAM_REPO_OVERRIDE="$2"
      shift 2
      ;;
    --ref)
      [ "$#" -ge 2 ] || die "--ref requires a value"
      UPSTREAM_REF_OVERRIDE="$2"
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

load_source_contract
BUILD_ROOT_ABS="$(abs_creatable_dir "$BUILD_ROOT")"
mkdir -p "$BUILD_ROOT_ABS"
BUILD_ROOT_ABS="$(cd "$BUILD_ROOT_ABS" && pwd -P)"
[ -n "$CACHE_DIR" ] || CACHE_DIR="${BUILD_ROOT_ABS}/upstream"
[ -n "$WORKTREE_DIR" ] || WORKTREE_DIR="${BUILD_ROOT_ABS}/worktree"
CACHE_DIR_ABS="$(validate_build_child_path "CACHE_DIR" "$CACHE_DIR")"
WORKTREE_DIR_ABS="$(validate_build_child_path "WORKTREE_DIR" "$WORKTREE_DIR")"
PATCH_DIR_ABS="$(abs_existing_dir "$PATCH_DIR")"

ensure_under_build_root "CACHE_DIR" "$CACHE_DIR_ABS"
ensure_under_build_root "WORKTREE_DIR" "$WORKTREE_DIR_ABS"
printf 'generated cache root for prepare-local-source.sh\n' > "${BUILD_ROOT_ABS}/.prepare-local-source-root"

prepare_upstream_cache
overlay_patch

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
