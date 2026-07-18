#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Sequence


DEFAULT_APP_DIR = Path("/opt/shenxiang-new-api")
DEFAULT_REPO_URL = "https://github.com/zhangyufei820/ai-essay-editor.git"
DEFAULT_BRANCH = "production/new-api"
DEFAULT_TEST_IMAGE = (
    "golang:1.26.1-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039"
)
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")
LABELS = {
    "commit": "org.opencontainers.image.revision",
    "source": "org.opencontainers.image.source",
    "branch": "io.shenxiang.new-api.branch",
    "upstream": "io.shenxiang.new-api.upstream-revision",
    "patch": "io.shenxiang.new-api.patch-sha256",
    "policy": "io.shenxiang.new-api.policy-sha256",
    "schema": "io.shenxiang.new-api.release-schema",
}


class ReleaseError(RuntimeError):
    pass


def run(
    command: Sequence[str],
    *,
    cwd: Path | None = None,
    input_text: str | None = None,
    capture: bool = False,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    print("+ " + " ".join(command), flush=True)
    result = subprocess.run(
        list(command),
        cwd=str(cwd) if cwd else None,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise ReleaseError(detail or f"command failed with exit code {result.returncode}")
    return result


def output(command: Sequence[str], *, cwd: Path | None = None) -> str:
    return run(command, cwd=cwd, capture=True).stdout.strip()


def validate_sha(value: str, name: str) -> str:
    normalized = value.strip().lower()
    if not SHA_PATTERN.fullmatch(normalized):
        raise ReleaseError(f"{name} must be a full 40-character Git SHA")
    return normalized


def validate_hash(value: str, name: str) -> str:
    normalized = value.strip().lower()
    if not HASH_PATTERN.fullmatch(normalized):
        raise ReleaseError(f"{name} must be a 64-character SHA-256")
    return normalized


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path: Path, content: bytes, mode: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temporary.write_bytes(content)
    if mode is not None:
        temporary.chmod(mode)
    os.replace(temporary, path)


def atomic_copy(source: Path, target: Path) -> None:
    mode = stat.S_IMODE(source.stat().st_mode)
    atomic_write(target, source.read_bytes(), mode)


def replace_compose_image(content: str, image: str) -> str:
    lines = content.splitlines(keepends=True)
    service_seen = False
    image_replaced = False
    for index, line in enumerate(lines):
        if line.startswith("  shenxiang-new-api:"):
            service_seen = True
            continue
        if service_seen and re.match(r"^  [^\s].*:\s*$", line):
            break
        if service_seen and re.match(r"^    image:\s*", line):
            ending = "\n" if line.endswith("\n") else ""
            lines[index] = f"    image: {image}{ending}"
            image_replaced = True
            break
    if not service_seen or not image_replaced:
        raise ReleaseError("cannot locate shenxiang-new-api image in docker-compose.yml")
    return "".join(lines)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ReleaseError(f"cannot read release manifest: {error}") from error
    if not isinstance(value, dict):
        raise ReleaseError("release manifest must be a JSON object")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    content = (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()
    atomic_write(path, content, 0o644)


class Release:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.app_dir = args.app_dir.resolve()
        self.state_dir = args.state_dir.resolve()
        self.repo_git = self.state_dir / "repository.git"
        self.checkouts_dir = self.state_dir / "checkouts"
        self.build_root = self.state_dir / "build"
        self.rollback_dir = self.state_dir / "rollback"
        self.manifest_path = self.app_dir / "release-manifest.json"
        self.compose_path = self.app_dir / "docker-compose.yml"
        self.container = "shenxiang-new-api"
        self.candidate = ""
        self.checkout = Path()
        self.policy_hash = ""
        self.upstream_commit = ""
        self.patch_hash = ""
        self.image = ""
        self.image_id = ""
        self.source_dir = Path()

    def execute(self) -> None:
        self.require_commands()
        self.ensure_repository()
        self.candidate = self.remote_candidate()
        self.checkout = self.ensure_checkout(self.candidate)
        self.validate_policy()
        manifest = self.load_or_bootstrap_manifest()
        self.validate_current_state(manifest)
        self.validate_ancestry(manifest)
        self.load_release_identity()
        if self.is_current_release(manifest):
            print(f"release already active: {self.candidate} {self.image}")
            return
        self.prepare_source()
        self.run_tests()
        self.build_image()
        self.verify_candidate_image()
        self.check_active_media_tasks()
        self.validate_current_state(manifest)
        if self.args.preflight_only:
            print(f"candidate preflight passed: {self.candidate} {self.image}")
            return
        self.switch(manifest)

    def require_commands(self) -> None:
        for command in ("curl", "docker", "git", "jq", "node", "python3", "rsync"):
            if shutil.which(command) is None:
                raise ReleaseError(f"missing required command: {command}")
        if not self.app_dir.is_dir():
            raise ReleaseError(f"application directory does not exist: {self.app_dir}")
        if not self.compose_path.is_file():
            raise ReleaseError(f"Compose file does not exist: {self.compose_path}")
        if shutil.disk_usage(self.app_dir).free < 12 * 1024 * 1024 * 1024:
            raise ReleaseError("less than 12 GiB is available; release build refused")

    def git(self, arguments: Sequence[str], *, capture: bool = True) -> str:
        command = ["git", f"--git-dir={self.repo_git}", *arguments]
        return output(command) if capture else run(command).stdout or ""

    def ensure_repository(self) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        if not self.repo_git.exists():
            run(["git", "clone", "--bare", "--filter=blob:none", self.args.repo_url, str(self.repo_git)])
        elif not (self.repo_git / "HEAD").is_file():
            raise ReleaseError(f"release repository is invalid: {self.repo_git}")
        refspec = f"+refs/heads/{self.args.branch}:refs/remotes/origin/{self.args.branch}"
        run(["git", f"--git-dir={self.repo_git}", "fetch", "--prune", "origin", refspec])

    def remote_candidate(self) -> str:
        candidate = validate_sha(
            self.git(["rev-parse", f"refs/remotes/origin/{self.args.branch}"]),
            "candidate commit",
        )
        if self.args.candidate and validate_sha(self.args.candidate, "requested candidate") != candidate:
            raise ReleaseError(f"requested candidate is not origin/{self.args.branch}: {candidate}")
        return candidate

    def ensure_checkout(self, commit: str) -> Path:
        checkout = self.checkouts_dir / commit
        if not checkout.exists():
            checkout.parent.mkdir(parents=True, exist_ok=True)
            run(["git", f"--git-dir={self.repo_git}", "worktree", "add", "--detach", str(checkout), commit])
        actual = output(["git", "rev-parse", "HEAD"], cwd=checkout)
        if actual != commit:
            raise ReleaseError(f"release checkout has unexpected commit: {actual}")
        dirty = output(["git", "status", "--porcelain"], cwd=checkout)
        if dirty:
            raise ReleaseError(f"release checkout is dirty: {checkout}")
        return checkout

    def validate_policy(self) -> None:
        policy = self.checkout / "services/shenxiang-new-api/docs/RELEASE-GOVERNANCE.md"
        if not policy.is_file():
            raise ReleaseError("candidate is missing RELEASE-GOVERNANCE.md")
        self.policy_hash = sha256_file(policy)
        acknowledgement = validate_hash(self.args.policy_ack, "release policy acknowledgement")
        if acknowledgement != self.policy_hash:
            raise ReleaseError(
                "release policy acknowledgement is stale; reread RELEASE-GOVERNANCE.md and use its current SHA-256"
            )

    def load_or_bootstrap_manifest(self) -> dict[str, Any]:
        if self.manifest_path.exists():
            return read_json(self.manifest_path)
        if not self.args.bootstrap_current_commit or not self.args.bootstrap_upstream_commit:
            raise ReleaseError("release manifest is missing; explicit bootstrap commits are required")
        current_commit = validate_sha(self.args.bootstrap_current_commit, "bootstrap current commit")
        current_upstream = validate_sha(self.args.bootstrap_upstream_commit, "bootstrap upstream commit")
        self.git(["cat-file", "-e", f"{current_commit}^{{commit}}"])
        current_image, current_image_id = self.active_image()
        if current_commit[:8] not in current_image:
            raise ReleaseError("running image tag does not identify the requested bootstrap commit")
        manifest = {
            "schema_version": 1,
            "branch": self.args.branch,
            "repo_commit": current_commit,
            "upstream_commit": current_upstream,
            "patch_sha256": self.compute_patch_hash(current_commit),
            "policy_sha256": "",
            "image": current_image,
            "image_id": current_image_id,
            "deployed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "bootstrapped": True,
        }
        write_json(self.manifest_path, manifest)
        print(f"bootstrapped release manifest from {current_commit} {current_image}")
        return manifest

    def active_image(self) -> tuple[str, str]:
        image = output(["docker", "inspect", self.container, "--format", "{{.Config.Image}}"])
        image_id = output(["docker", "inspect", self.container, "--format", "{{.Image}}"])
        if not image or not image_id.startswith("sha256:"):
            raise ReleaseError("cannot identify the running New API image")
        return image, image_id

    def validate_current_state(self, manifest: dict[str, Any]) -> None:
        current_image, current_image_id = self.active_image()
        if current_image != manifest.get("image") or current_image_id != manifest.get("image_id"):
            raise ReleaseError(
                "production changed after the manifest was read; release refused until the current production baseline is reconciled"
            )

    def validate_ancestry(self, manifest: dict[str, Any]) -> None:
        current_commit = validate_sha(str(manifest.get("repo_commit", "")), "manifest repo commit")
        result = run(
            ["git", f"--git-dir={self.repo_git}", "merge-base", "--is-ancestor", current_commit, self.candidate],
            check=False,
        )
        if result.returncode != 0:
            raise ReleaseError(
                f"candidate {self.candidate} does not contain production commit {current_commit}; merge origin/{self.args.branch} first"
            )

    def compute_patch_hash(self, commit: str) -> str:
        tree = self.git(["ls-tree", "-r", commit, "--", "services/shenxiang-new-api/src-patch"])
        if not tree:
            raise ReleaseError(f"commit has no New API patch tree: {commit}")
        return hashlib.sha256((tree + "\n").encode()).hexdigest()

    def load_release_identity(self) -> None:
        upstream_file = self.checkout / "services/shenxiang-new-api/release/upstream-ref"
        if not upstream_file.is_file():
            raise ReleaseError("candidate is missing the pinned upstream ref")
        self.upstream_commit = validate_sha(upstream_file.read_text(), "upstream commit")
        self.patch_hash = self.compute_patch_hash(self.candidate)
        self.image = f"shenxiang-new-api-codex:release-{self.candidate}"

    def expected_labels(self) -> dict[str, str]:
        return {
            LABELS["commit"]: self.candidate,
            LABELS["source"]: self.args.repo_url,
            LABELS["branch"]: self.args.branch,
            LABELS["upstream"]: self.upstream_commit,
            LABELS["patch"]: self.patch_hash,
            LABELS["policy"]: self.policy_hash,
            LABELS["schema"]: "1",
        }

    def image_labels(self, image: str) -> dict[str, str] | None:
        result = run(
            ["docker", "image", "inspect", image, "--format", "{{json .Config.Labels}}"],
            capture=True,
            check=False,
        )
        if result.returncode != 0:
            return None
        value = json.loads(result.stdout or "null")
        return value if isinstance(value, dict) else {}

    def is_current_release(self, manifest: dict[str, Any]) -> bool:
        if manifest.get("repo_commit") != self.candidate or manifest.get("image") != self.image:
            return False
        labels = self.image_labels(self.image)
        return labels is not None and all(labels.get(key) == value for key, value in self.expected_labels().items())

    def prepare_source(self) -> None:
        service = self.checkout / "services/shenxiang-new-api"
        prepare = service / "scripts/prepare-local-source.sh"
        candidate_root = self.build_root / "candidates" / self.candidate
        self.source_dir = candidate_root / "source"
        run(
            [
                str(prepare),
                "--ref",
                self.upstream_commit,
                "--build-root",
                str(self.build_root),
                "--cache-dir",
                str(self.build_root / "upstream"),
                "--worktree-dir",
                str(self.source_dir),
                "--patch-dir",
                str(service / "src-patch"),
            ]
        )
        actual_upstream = output(["git", "rev-parse", "HEAD"], cwd=self.build_root / "upstream")
        if actual_upstream != self.upstream_commit:
            raise ReleaseError(f"prepared source used unexpected upstream commit: {actual_upstream}")
        if not (self.source_dir / "go.mod").is_file() or not (self.source_dir / "Dockerfile").is_file():
            raise ReleaseError("prepared candidate source is incomplete")

    def run_tests(self) -> None:
        module_cache = self.build_root / "go-mod-cache"
        build_cache = self.build_root / "go-build-cache"
        module_cache.mkdir(parents=True, exist_ok=True)
        build_cache.mkdir(parents=True, exist_ok=True)
        run(
            [
                "docker",
                "run",
                "--rm",
                "-e",
                "CGO_ENABLED=0",
                "-e",
                "GOMODCACHE=/go/pkg/mod",
                "-e",
                "GOCACHE=/root/.cache/go-build",
                "-v",
                f"{self.source_dir}:/src:ro",
                "-v",
                f"{module_cache}:/go/pkg/mod",
                "-v",
                f"{build_cache}:/root/.cache/go-build",
                "-w",
                "/src",
                self.args.test_image,
                "sh",
                "-lc",
                "/usr/local/go/bin/go test ./middleware ./relay/channel/task/sora ./service",
            ]
        )

    def build_image(self) -> None:
        labels = self.image_labels(self.image)
        expected = self.expected_labels()
        if labels is not None:
            if all(labels.get(key) == value for key, value in expected.items()):
                print(f"reusing immutable candidate image: {self.image}")
                self.image_id = output(["docker", "image", "inspect", self.image, "--format", "{{.Id}}"])
                return
            raise ReleaseError(f"immutable image tag already exists with different provenance: {self.image}")
        command = ["docker", "build", "--pull=false"]
        for key, value in expected.items():
            command.extend(["--label", f"{key}={value}"])
        command.extend(["-t", self.image, str(self.source_dir)])
        run(command)
        self.image_id = output(["docker", "image", "inspect", self.image, "--format", "{{.Id}}"])

    def verify_candidate_image(self) -> None:
        labels = self.image_labels(self.image)
        if labels is None:
            raise ReleaseError("candidate image is missing after build")
        for key, value in self.expected_labels().items():
            if labels.get(key) != value:
                raise ReleaseError(f"candidate image label mismatch: {key}")
        markers = self.checkout / "services/shenxiang-new-api/release/image-contract-markers.txt"
        if not markers.is_file():
            raise ReleaseError("candidate is missing image-contract-markers.txt")
        marker_values = [line.strip() for line in markers.read_text(encoding="utf-8").splitlines() if line.strip()]
        if not marker_values:
            raise ReleaseError("candidate image contract is empty")
        run(
            [
                "docker",
                "run",
                "--rm",
                "--entrypoint",
                "sh",
                "-v",
                f"{markers}:/release-contract-markers:ro",
                self.image,
                "-lc",
                "while IFS= read -r marker; do [ -z \"$marker\" ] || grep -aFq -- \"$marker\" /new-api || { echo \"missing candidate marker: $marker\" >&2; exit 1; }; done < /release-contract-markers",
            ]
        )

    def check_active_media_tasks(self) -> None:
        sql = """SET NAMES utf8mb4;
SELECT COUNT(*)
FROM tasks
WHERE platform IN ('playground_image', 'playground_video')
  AND status NOT IN ('FAILURE', 'SUCCESS');
"""
        result = run(
            [
                "docker",
                "exec",
                "-i",
                "shenxiang-new-api-mysql",
                "sh",
                "-lc",
                'mysql --default-character-set=utf8mb4 --batch --skip-column-names -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"',
            ],
            input_text=sql,
            capture=True,
        )
        count_text = re.sub(r"\D", "", result.stdout)
        count = int(count_text or "0")
        if count:
            raise ReleaseError(f"{count} media-workshop tasks are still active; release refused")

    def compose(self, *arguments: str) -> None:
        run(["docker", "compose", "-f", str(self.compose_path), *arguments], cwd=self.app_dir)

    def wait_for_health(self, expected_image: str, timeout_seconds: int = 180) -> None:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            result = run(
                [
                    "docker",
                    "inspect",
                    self.container,
                    "--format",
                    "{{.Config.Image}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
                ],
                capture=True,
                check=False,
            )
            if result.returncode == 0 and result.stdout.strip() == f"{expected_image}|running|healthy":
                return
            time.sleep(2)
        raise ReleaseError(f"container did not become healthy with image {expected_image}")

    def verify_live(self) -> None:
        curl = ["curl", "-fsS", "--connect-timeout", "10", "--max-time", "30"]
        run([*curl, "http://127.0.0.1:3120/api/status"], capture=True)
        run([*curl, "https://api.aiphui.top/api/status"], capture=True)
        run([*curl, "https://shenxiang.school/api/health"], capture=True)
        runtime_check = self.checkout / "services/shenxiang-new-api/scripts/check-media-playground-runtime.mjs"
        run(
            [
                "node",
                str(runtime_check),
                "--base-url",
                "http://127.0.0.1:3120",
                "--mysql-container",
                "shenxiang-new-api-mysql",
            ]
        )

    def sync_governance_files(self) -> None:
        service = self.checkout / "services/shenxiang-new-api"
        relative_files = (
            "docs/RELEASE-GOVERNANCE.md",
            "release/upstream-ref",
            "release/image-contract-markers.txt",
            "scripts/release-new-api.sh",
            "scripts/release_new_api.py",
            "scripts/new-api-task-start.sh",
            "scripts/check-new-api-release-state.sh",
            "scripts/deploy.sh",
            "scripts/codex_entry_guard.sh",
        )
        for relative in relative_files:
            source = service / relative
            if not source.is_file():
                raise ReleaseError(f"candidate governance file is missing: {relative}")
            atomic_copy(source, self.app_dir / relative)

    def switch(self, previous_manifest: dict[str, Any]) -> None:
        timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.rollback_dir.mkdir(parents=True, exist_ok=True)
        compose_backup = self.rollback_dir / f"docker-compose.{timestamp}.yml"
        manifest_backup = self.rollback_dir / f"release-manifest.{timestamp}.json"
        shutil.copy2(self.compose_path, compose_backup)
        shutil.copy2(self.manifest_path, manifest_backup)
        compose_changed = False
        switch_attempted = False
        try:
            candidate_compose = replace_compose_image(self.compose_path.read_text(encoding="utf-8"), self.image)
            atomic_write(self.compose_path, candidate_compose.encode(), stat.S_IMODE(self.compose_path.stat().st_mode))
            compose_changed = True
            self.compose("config", "-q")
            switch_attempted = True
            self.compose("up", "-d", "--no-deps", "--force-recreate", "shenxiang-new-api")
            self.wait_for_health(self.image)
            self.verify_live()
            self.image_id = output(["docker", "image", "inspect", self.image, "--format", "{{.Id}}"])
            current_image, current_image_id = self.active_image()
            if current_image != self.image or current_image_id != self.image_id:
                raise ReleaseError("running container does not match candidate image identity")
            manifest = {
                "schema_version": 1,
                "branch": self.args.branch,
                "repo_commit": self.candidate,
                "upstream_commit": self.upstream_commit,
                "patch_sha256": self.patch_hash,
                "policy_sha256": self.policy_hash,
                "image": self.image,
                "image_id": self.image_id,
                "deployed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "previous_repo_commit": previous_manifest.get("repo_commit", ""),
                "previous_image": previous_manifest.get("image", ""),
                "bootstrapped": False,
            }
            self.sync_governance_files()
            write_json(self.manifest_path, manifest)
            run([str(self.app_dir / "scripts/check-new-api-release-state.sh")])
            print(f"release completed: {self.candidate} {self.image}")
        except Exception as release_error:
            if compose_changed:
                print("release failed; restoring previous application state", file=sys.stderr, flush=True)
                try:
                    atomic_copy(compose_backup, self.compose_path)
                    atomic_copy(manifest_backup, self.manifest_path)
                    self.compose("config", "-q")
                    if switch_attempted:
                        self.compose("up", "-d", "--no-deps", "--force-recreate", "shenxiang-new-api")
                        self.wait_for_health(str(previous_manifest["image"]))
                        run(
                            [
                                "curl",
                                "-fsS",
                                "--connect-timeout",
                                "10",
                                "--max-time",
                                "30",
                                "http://127.0.0.1:3120/api/status",
                            ],
                            capture=True,
                        )
                except Exception as rollback_error:
                    raise ReleaseError(
                        f"release failed: {release_error}; automatic rollback also failed: {rollback_error}"
                    ) from rollback_error
            raise


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Guarded New API production release")
    parser.add_argument("--app-dir", type=Path, default=Path(os.environ.get("APP_DIR", DEFAULT_APP_DIR)))
    parser.add_argument("--state-dir", type=Path)
    parser.add_argument("--repo-url", default=os.environ.get("NEW_API_RELEASE_REPO_URL", DEFAULT_REPO_URL))
    parser.add_argument("--branch", default=os.environ.get("NEW_API_RELEASE_BRANCH", DEFAULT_BRANCH))
    parser.add_argument("--candidate", default="")
    parser.add_argument(
        "--policy-ack",
        default=os.environ.get("NEW_API_RELEASE_POLICY_ACK", ""),
    )
    parser.add_argument("--test-image", default=os.environ.get("NEW_API_RELEASE_TEST_IMAGE", DEFAULT_TEST_IMAGE))
    parser.add_argument("--bootstrap-current-commit", default="")
    parser.add_argument("--bootstrap-upstream-commit", default="")
    parser.add_argument("--preflight-only", action="store_true")
    args = parser.parse_args(argv)
    if args.branch != DEFAULT_BRANCH:
        parser.error(f"only {DEFAULT_BRANCH} may be released")
    if args.repo_url != DEFAULT_REPO_URL:
        parser.error(f"only the canonical repository may be released: {DEFAULT_REPO_URL}")
    if args.test_image != DEFAULT_TEST_IMAGE:
        parser.error("the pinned New API release test image cannot be overridden")
    if not args.policy_ack:
        parser.error("NEW_API_RELEASE_POLICY_ACK or --policy-ack is required")
    if args.state_dir is None:
        args.state_dir = Path(os.environ.get("NEW_API_RELEASE_STATE_DIR", args.app_dir / "release-state"))
    return args


def main(argv: Sequence[str] | None = None) -> int:
    def abort_release(signum: int, _frame: Any) -> None:
        raise ReleaseError(f"received {signal.Signals(signum).name}; release aborted")

    for signum in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, abort_release)
    try:
        Release(parse_args(argv or sys.argv[1:])).execute()
    except ReleaseError as error:
        print(f"release refused: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
