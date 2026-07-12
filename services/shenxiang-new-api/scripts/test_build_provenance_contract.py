from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[3]
SERVICE_DIR = REPOSITORY / "services" / "shenxiang-new-api"


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
                "source_digest",
            },
        )

    def test_compose_build_has_immutable_image_and_oci_provenance_labels(self) -> None:
        compose = (SERVICE_DIR / "docker-compose.yml").read_text(encoding="utf-8")

        self.assertIn("context: ${NEW_API_BUILD_CONTEXT:-.local-source/worktree}", compose)
        self.assertIn("image: ${NEW_API_IMAGE_REPOSITORY:-shenxiang-new-api-codex}:${NEW_API_IMAGE_TAG:?", compose)
        for label, variable in {
            "org.opencontainers.image.source": "NEW_API_SOURCE_REPOSITORY",
            "org.opencontainers.image.revision": "NEW_API_REPOSITORY_COMMIT",
            "org.opencontainers.image.version": "NEW_API_SOURCE_DIGEST",
            "io.shenxiang.new-api.upstream-revision": "NEW_API_UPSTREAM_COMMIT",
            "io.shenxiang.new-api.upstream-repository": "NEW_API_UPSTREAM_REPOSITORY",
            "io.shenxiang.new-api.patch-sha256": "NEW_API_PATCH_SHA256",
            "io.shenxiang.new-api.source-digest": "NEW_API_SOURCE_DIGEST",
        }.items():
            self.assertRegex(compose, rf"{re.escape(label)}:\s+\$\{{{variable}:\?")

    def test_ci_is_path_scoped_read_only_and_pins_actions(self) -> None:
        workflow = (REPOSITORY / ".github" / "workflows" / "new-api.yml").read_text(encoding="utf-8")

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
