from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[3]
SERVICE_DIR = REPOSITORY / "services" / "shenxiang-new-api"
WORKFLOW = REPOSITORY / ".github" / "workflows" / "new-api.yml"


def workflow_steps(workflow: str) -> list[tuple[str, str]]:
    matches = list(re.finditer(r"^      - name: (.+)$", workflow, re.MULTILINE))
    return [
        (
            match.group(1).strip(),
            workflow[match.start() : matches[index + 1].start() if index + 1 < len(matches) else len(workflow)],
        )
        for index, match in enumerate(matches)
    ]


def assert_secure_build_sequence(test: unittest.TestCase, workflow: str) -> None:
    steps = workflow_steps(workflow)
    names = [name for name, _ in steps]
    required = [
        "Rebuild locked source before image build",
        "Verify immutable build context",
        "Validate Compose provenance",
        "Build traceable New API image",
    ]
    positions = []
    for name in required:
        test.assertEqual(names.count(name), 1, f"workflow must contain exactly one {name!r} step")
        positions.append(names.index(name))
    test.assertEqual(positions, sorted(positions), "secure build steps must remain ordered")
    rebuild, verify, compose, build = positions
    test.assertEqual(build - rebuild, 3, "no steps may be inserted into the sealed build sequence")
    test.assertIn("prepare-local-source.sh --skip-fetch", steps[rebuild][1])
    test.assertIn("verify-build-context.py", steps[verify][1])
    test.assertIn(".local-source/worktree/build.env", steps[compose][1])
    test.assertIn("config --quiet", steps[compose][1])
    for _, body in steps[verify:build]:
        test.assertNotRegex(body, r"(?m)\b(?:touch|cp|mv|rm|tee)\b|(?:^|\s)(?:>>?|sed\s+-i)(?:\s|$)")


class BuildProvenanceContractTest(unittest.TestCase):
    def test_manifest_schema_requires_every_provenance_component(self) -> None:
        schema = json.loads((SERVICE_DIR / "BUILD-MANIFEST.schema.json").read_text(encoding="utf-8"))

        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(
            set(schema["required"]),
            {
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
            },
        )
        self.assertEqual(schema["properties"]["schema_version"]["const"], 2)
        self.assertEqual(schema["properties"]["checksum_file"]["const"], "BUILD-CHECKSUMS.sha256")

    def test_compose_build_has_immutable_image_and_oci_provenance_labels(self) -> None:
        compose = (SERVICE_DIR / "docker-compose.yml").read_text(encoding="utf-8")

        self.assertIn("context: .local-source/worktree", compose)
        self.assertNotIn("NEW_API_BUILD_CONTEXT", compose)
        self.assertIn("image: ${NEW_API_IMAGE_REPOSITORY:-shenxiang-new-api-codex}:${NEW_API_IMAGE_TAG:?", compose)
        for label, variable in {
            "org.opencontainers.image.source": "NEW_API_SOURCE_REPOSITORY",
            "org.opencontainers.image.revision": "NEW_API_REPOSITORY_COMMIT",
            "org.opencontainers.image.version": "NEW_API_SOURCE_DIGEST",
            "io.shenxiang.new-api.upstream-revision": "NEW_API_UPSTREAM_COMMIT",
            "io.shenxiang.new-api.upstream-repository": "NEW_API_UPSTREAM_REPOSITORY",
            "io.shenxiang.new-api.patch-sha256": "NEW_API_PATCH_SHA256",
            "io.shenxiang.new-api.worktree-sha256": "NEW_API_WORKTREE_SHA256",
            "io.shenxiang.new-api.source-digest": "NEW_API_SOURCE_DIGEST",
        }.items():
            self.assertRegex(compose, rf"{re.escape(label)}:\s+\$\{{{variable}:\?")
        for variable in (
            "NEW_API_REPOSITORY_COMMIT",
            "NEW_API_MANIFEST_SHA256",
            "NEW_API_SOURCE_DIGEST",
            "NEW_API_SOURCE_REPOSITORY",
            "NEW_API_UPSTREAM_COMMIT",
            "NEW_API_UPSTREAM_REPOSITORY",
            "NEW_API_PATCH_SHA256",
            "NEW_API_WORKTREE_FILE_COUNT",
            "NEW_API_WORKTREE_SHA256",
        ):
            self.assertRegex(compose, rf"(?m)^\s{{8}}{variable}: \$\{{{variable}:\?")

    def test_builder_verifies_checksums_manifest_env_and_args_before_compile(self) -> None:
        dockerfile = (SERVICE_DIR / "src-patch" / "Dockerfile").read_text(encoding="utf-8")
        verification = dockerfile.index("sha256sum -c BUILD-CHECKSUMS.sha256")
        compile_step = dockerfile.index("go build ")

        self.assertLess(verification, compile_step)
        self.assertIn("cmp -s BUILD-MANIFEST.json common/build-manifest.json", dockerfile)
        self.assertIn("sha256sum BUILD-CHECKSUMS.sha256", dockerfile)
        self.assertIn("build.env", dockerfile[verification:compile_step])
        self.assertIn("source_digest does not match build args", dockerfile[verification:compile_step])
        self.assertNotIn("ADD go.mod go.sum", dockerfile)

    def test_dockerignore_keeps_provenance_files_in_build_context(self) -> None:
        dockerignore = (SERVICE_DIR / "src-patch" / ".dockerignore").read_text(encoding="utf-8")

        for required in ("BUILD-MANIFEST.json", "BUILD-CHECKSUMS.sha256", "build.env"):
            self.assertNotRegex(dockerignore, rf"(?m)^/?{re.escape(required)}$")

    def test_ci_is_path_scoped_read_only_and_pins_actions(self) -> None:
        workflow = WORKFLOW.read_text(encoding="utf-8")

        self.assertIn("contents: read", workflow)
        self.assertIn("services/shenxiang-new-api/**", workflow)
        self.assertIn("python3 -m unittest discover", workflow)
        self.assertIn("prepare-local-source.sh", workflow)
        self.assertIn("docker compose", workflow)
        self.assertIn("docker image inspect", workflow)
        uses = re.findall(r"uses:\s*([^\s]+)", workflow)
        self.assertGreaterEqual(len(uses), 2)
        for action in uses:
            self.assertRegex(action, r"^[^@]+@[0-9a-f]{40}$")

    def test_ci_reseals_and_verifies_the_default_context_immediately_before_build(self) -> None:
        assert_secure_build_sequence(self, WORKFLOW.read_text(encoding="utf-8"))

    def test_ci_contract_rejects_deleted_reprepare_step(self) -> None:
        workflow = WORKFLOW.read_text(encoding="utf-8")
        start = workflow.index("      - name: Rebuild locked source before image build")
        end = workflow.index("      - name:", start + 7)

        with self.assertRaises(AssertionError):
            assert_secure_build_sequence(self, workflow[:start] + workflow[end:])

    def test_ci_contract_rejects_inserted_worktree_write_step(self) -> None:
        workflow = WORKFLOW.read_text(encoding="utf-8")
        marker = "      - name: Validate Compose provenance"
        injected = (
            "      - name: Tamper with sealed build context\n"
            "        run: touch services/shenxiang-new-api/.local-source/worktree/tampered.go\n\n"
        )

        with self.assertRaises(AssertionError):
            assert_secure_build_sequence(self, workflow.replace(marker, injected + marker, 1))

    def test_compose_passes_configurable_media_quota_limits(self) -> None:
        compose = (SERVICE_DIR / "docker-compose.yml").read_text(encoding="utf-8")

        for name, default in {
            "PLAYGROUND_MEDIA_USER_MAX_MB": "2048",
            "PLAYGROUND_MEDIA_TOTAL_MAX_MB": "20480",
            "PLAYGROUND_MEDIA_MAX_FILES_PER_USER": "200",
            "PLAYGROUND_MEDIA_CLEANUP_INTERVAL_MINUTES": "30",
            "PLAYGROUND_MEDIA_CACHE_REQUEST_MAX_MB": "32",
            "PLAYGROUND_IMAGE_TASK_REQUEST_MAX_MB": "32",
            "PLAYGROUND_IMAGE_TASK_MAX_PENDING_PER_USER": "32",
            "PLAYGROUND_IMAGE_TASK_MAX_WORKERS": "32",
        }.items():
            self.assertIn(f"{name}: ${{{name}:-{default}}}", compose)


if __name__ == "__main__":
    unittest.main()
