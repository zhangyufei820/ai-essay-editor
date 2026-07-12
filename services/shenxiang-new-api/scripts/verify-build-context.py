#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path


SERVICE_DIR = Path(__file__).resolve().parents[1]
CHECKSUM_FILE = "BUILD-CHECKSUMS.sha256"
GENERATED_PATHS = {
    CHECKSUM_FILE,
    "BUILD-MANIFEST.json",
    "build.env",
    "common/build-manifest.json",
}
SAFE_PATH = re.compile(r"^[A-Za-z0-9_@./$()+,=-]+$")
LOWER_HEX_40 = re.compile(r"^[0-9a-f]{40}$")
LOWER_HEX_64 = re.compile(r"^[0-9a-f]{64}$")
EXPECTED_FIELDS = {
    "schema_version",
    "repository",
    "repository_commit",
    "repository_dirty",
    "upstream_repository",
    "upstream_commit",
    "patch_base",
    "patch_file_count",
    "patch_sha256",
    "worktree_file_count",
    "worktree_sha256",
    "checksum_file",
    "source_digest",
}


class VerificationError(Exception):
    pass


def load_json(path: Path) -> dict[str, object]:
    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise VerificationError(f"duplicate JSON key in {path.name}: {key}")
            result[key] = value
        return result

    try:
        value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=reject_duplicates)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise VerificationError(f"cannot read {path.name}: {error}") from error
    if not isinstance(value, dict):
        raise VerificationError(f"{path.name} must contain a JSON object")
    return value


def validate_safe_path(relative: str) -> None:
    if not SAFE_PATH.fullmatch(relative) or relative.startswith("/") or ".." in relative.split("/"):
        raise VerificationError(f"unsafe file name in build context: {relative!r}")


def regular_files(worktree: Path) -> dict[str, Path]:
    files: dict[str, Path] = {}
    for current, directory_names, file_names in os.walk(worktree, topdown=True, followlinks=False):
        current_path = Path(current)
        for name in sorted(directory_names):
            path = current_path / name
            relative = path.relative_to(worktree).as_posix()
            validate_safe_path(relative)
            if path.is_symlink():
                raise VerificationError(f"symbolic link in build context: {relative}")
        for name in sorted(file_names):
            path = current_path / name
            relative = path.relative_to(worktree).as_posix()
            validate_safe_path(relative)
            metadata = path.lstat()
            if stat.S_ISLNK(metadata.st_mode):
                raise VerificationError(f"symbolic link in build context: {relative}")
            if not stat.S_ISREG(metadata.st_mode):
                raise VerificationError(f"non-regular file in build context: {relative}")
            files[relative] = path
    return files


def validate_schema(schema: dict[str, object], manifest: dict[str, object]) -> None:
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        raise VerificationError("manifest schema uses an unexpected JSON Schema dialect")
    if schema.get("additionalProperties") is not False:
        raise VerificationError("manifest schema must reject additional properties")
    if set(schema.get("required", [])) != EXPECTED_FIELDS:
        raise VerificationError("manifest schema required fields do not match schema v2")
    properties = schema.get("properties")
    if not isinstance(properties, dict) or set(properties) != EXPECTED_FIELDS:
        raise VerificationError("manifest schema properties do not match schema v2")
    if properties.get("schema_version") != {"const": 2}:
        raise VerificationError("manifest schema_version contract is not v2")
    if properties.get("checksum_file") != {"const": CHECKSUM_FILE}:
        raise VerificationError("manifest checksum file contract is invalid")
    if set(manifest) != EXPECTED_FIELDS:
        raise VerificationError("BUILD-MANIFEST.json fields do not match schema v2")


def validate_manifest_values(manifest: dict[str, object]) -> None:
    if manifest["schema_version"] != 2:
        raise VerificationError("manifest schema_version must be 2")
    if manifest["checksum_file"] != CHECKSUM_FILE:
        raise VerificationError(f"manifest checksum_file must be {CHECKSUM_FILE}")
    for name in ("repository", "upstream_repository"):
        value = manifest[name]
        if not isinstance(value, str) or not value.strip() or any(char in value for char in "\r\n"):
            raise VerificationError(f"manifest {name} is invalid")
    if type(manifest["repository_dirty"]) is not bool:
        raise VerificationError("manifest repository_dirty must be boolean")
    for name in ("patch_file_count", "worktree_file_count"):
        value = manifest[name]
        if type(value) is not int or value < 1:
            raise VerificationError(f"manifest {name} must be a positive integer")
    for name in ("repository_commit", "upstream_commit", "patch_base"):
        value = manifest[name]
        if not isinstance(value, str) or not LOWER_HEX_40.fullmatch(value):
            raise VerificationError(f"manifest {name} must be 40 lowercase hexadecimal characters")
    for name in ("patch_sha256", "worktree_sha256", "source_digest"):
        value = manifest[name]
        if not isinstance(value, str) or not LOWER_HEX_64.fullmatch(value):
            raise VerificationError(f"manifest {name} must be 64 lowercase hexadecimal characters")
    if manifest["patch_base"] != manifest["upstream_commit"]:
        raise VerificationError("manifest patch_base does not match upstream_commit")


def parse_checksums(path: Path) -> tuple[bytes, dict[str, str]]:
    try:
        encoded = path.read_bytes()
        text = encoded.decode("utf-8")
    except (OSError, UnicodeError) as error:
        raise VerificationError(f"cannot read checksum manifest: {error}") from error
    if not text or not text.endswith("\n"):
        raise VerificationError("checksum manifest must be non-empty and newline terminated")
    checksums: dict[str, str] = {}
    for line in text.splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
        if match is None:
            raise VerificationError("checksum manifest contains a malformed record")
        digest, relative = match.groups()
        validate_safe_path(relative)
        if relative in GENERATED_PATHS:
            raise VerificationError(f"checksum manifest includes generated file: {relative}")
        if relative in checksums:
            raise VerificationError(f"checksum manifest contains duplicate path: {relative}")
        checksums[relative] = digest
    canonical = "".join(f"{checksums[name]}  {name}\n" for name in sorted(checksums)).encode("utf-8")
    if encoded != canonical:
        raise VerificationError("checksum manifest is not in canonical path order")
    return encoded, checksums


def parse_env(path: Path) -> dict[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise VerificationError(f"cannot read build.env: {error}") from error
    values: dict[str, str] = {}
    for line in text.splitlines():
        if not line or "=" not in line:
            raise VerificationError("build.env contains a malformed line")
        key, value = line.split("=", 1)
        if key in values:
            raise VerificationError(f"build.env contains duplicate key: {key}")
        if not re.fullmatch(r"[A-Z0-9_]+", key) or any(char in value for char in "\r\n"):
            raise VerificationError("build.env contains an unsafe key or value")
        values[key] = value
    canonical = "".join(f"{key}={value}\n" for key, value in sorted(values.items()))
    if text != canonical:
        raise VerificationError("build.env is not canonical")
    return values


def expected_source_digest(manifest: dict[str, object]) -> str:
    identity = "".join(
        f"{manifest[name]}\n"
        for name in (
            "repository",
            "repository_commit",
            "upstream_repository",
            "upstream_commit",
            "patch_base",
            "patch_sha256",
            "worktree_sha256",
        )
    ).encode("utf-8")
    return hashlib.sha256(identity).hexdigest()


def verify(worktree: Path, schema_path: Path) -> None:
    if worktree.is_symlink() or not worktree.is_dir():
        raise VerificationError(f"worktree must be an existing non-symlink directory: {worktree}")
    files = regular_files(worktree)
    missing_generated = GENERATED_PATHS - set(files)
    if missing_generated:
        raise VerificationError(f"build context is missing generated provenance files: {sorted(missing_generated)}")

    manifest_bytes = files["BUILD-MANIFEST.json"].read_bytes()
    if manifest_bytes != files["common/build-manifest.json"].read_bytes():
        raise VerificationError("embedded build manifest copy does not match BUILD-MANIFEST.json")
    schema = load_json(schema_path)
    manifest = load_json(files["BUILD-MANIFEST.json"])
    validate_schema(schema, manifest)
    validate_manifest_values(manifest)

    checksum_bytes, recorded = parse_checksums(files[CHECKSUM_FILE])
    materialized = {name: path for name, path in files.items() if name not in GENERATED_PATHS}
    if set(recorded) != set(materialized):
        missing = sorted(set(materialized) - set(recorded))
        extra = sorted(set(recorded) - set(materialized))
        raise VerificationError(f"checksum file set mismatch: missing={missing[:3]} extra={extra[:3]}")
    for relative, expected in recorded.items():
        actual = hashlib.sha256(materialized[relative].read_bytes()).hexdigest()
        if actual != expected:
            raise VerificationError(f"checksum mismatch for materialized source: {relative}")
    if manifest["worktree_file_count"] != len(materialized):
        raise VerificationError("manifest worktree_file_count does not match materialized source")
    worktree_sha256 = hashlib.sha256(checksum_bytes).hexdigest()
    if manifest["worktree_sha256"] != worktree_sha256:
        raise VerificationError("manifest worktree_sha256 does not match checksum manifest")
    source_digest = expected_source_digest(manifest)
    if manifest["source_digest"] != source_digest:
        raise VerificationError("manifest source_digest does not bind repository, upstream, patch, and worktree")

    expected_env = {
        "NEW_API_CHECKSUM_FILE": CHECKSUM_FILE,
        "NEW_API_IMAGE_TAG": source_digest[:16],
        "NEW_API_MANIFEST_SHA256": hashlib.sha256(manifest_bytes).hexdigest(),
        "NEW_API_PATCH_SHA256": str(manifest["patch_sha256"]),
        "NEW_API_REPOSITORY_COMMIT": str(manifest["repository_commit"]),
        "NEW_API_SOURCE_DIGEST": source_digest,
        "NEW_API_SOURCE_REPOSITORY": str(manifest["repository"]),
        "NEW_API_UPSTREAM_COMMIT": str(manifest["upstream_commit"]),
        "NEW_API_UPSTREAM_REPOSITORY": str(manifest["upstream_repository"]),
        "NEW_API_WORKTREE_FILE_COUNT": str(manifest["worktree_file_count"]),
        "NEW_API_WORKTREE_SHA256": worktree_sha256,
    }
    if parse_env(files["build.env"]) != expected_env:
        raise VerificationError("build.env does not match BUILD-MANIFEST.json")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify a prepared New API build context and provenance chain.")
    parser.add_argument("--worktree", type=Path, default=SERVICE_DIR / ".local-source" / "worktree")
    parser.add_argument("--schema", type=Path, default=SERVICE_DIR / "BUILD-MANIFEST.schema.json")
    args = parser.parse_args()
    try:
        verify(args.worktree, args.schema)
    except VerificationError as error:
        print(f"[verify-build-context] ERROR: {error}", file=sys.stderr)
        return 1
    print(f"[verify-build-context] verified: {args.worktree}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
