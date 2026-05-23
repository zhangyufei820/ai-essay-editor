#!/usr/bin/env python3
"""Validate storyboard-creator JSON output."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REQUIRED_TOP_LEVEL = {
    "schema_version",
    "title",
    "orientation",
    "target_duration_seconds",
    "style",
    "characters",
    "scenes",
    "shots",
}

REQUIRED_PRODUCTION_COLUMNS = [
    "No.",
    "Frame",
    "Timecode",
    "Visual·Camera·Movement",
    "Dialog·SFX",
    "Cut·Shot Size·Movement",
    "Camera Settings",
]


def fail(message: str) -> int:
    print(json.dumps({"success": False, "error": message}, ensure_ascii=False), file=sys.stderr)
    return 1


def validate(data: dict) -> list[str]:
    warnings: list[str] = []
    missing = sorted(REQUIRED_TOP_LEVEL - set(data))
    if missing:
        raise ValueError(f"missing top-level fields: {', '.join(missing)}")

    if data["orientation"] not in {"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "2.39:1"}:
        raise ValueError("orientation must be one of 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, 2.39:1")

    shots = data.get("shots")
    if not isinstance(shots, list) or not shots:
        raise ValueError("shots must be a non-empty list")

    scene_ids = {scene.get("id") for scene in data.get("scenes", []) if isinstance(scene, dict)}
    total_duration = 0
    key_shot_count = 0
    for index, shot in enumerate(shots, start=1):
        if not isinstance(shot, dict):
            raise ValueError(f"shot {index} must be an object")
        for field in ["id", "scene_id", "duration_seconds", "shot_type", "camera_movement", "image_prompt", "video_prompt", "model_hints"]:
            if field not in shot:
                raise ValueError(f"shot {index} missing {field}")
        expected_id = f"shot_{index:03d}"
        if shot.get("id") != expected_id:
            warnings.append(f"shot {index} id should be {expected_id}")
        expected_number = f"SHOT {index:02d}"
        if shot.get("shot_number") and shot.get("shot_number") != expected_number:
            warnings.append(f"shot {shot['id']} shot_number should be {expected_number}")
        if shot["scene_id"] not in scene_ids:
            warnings.append(f"shot {shot['id']} references unknown scene_id {shot['scene_id']}")
        total_duration += int(shot.get("duration_seconds") or 0)
        if shot.get("key_shot") is True:
            key_shot_count += 1
        if len(str(shot.get("image_prompt", ""))) < 40:
            warnings.append(f"shot {shot['id']} image_prompt may be too short")
        if len(str(shot.get("video_prompt", ""))) < 40:
            warnings.append(f"shot {shot['id']} video_prompt may be too short")
        if not shot.get("camera_settings"):
            warnings.append(f"shot {shot['id']} missing camera_settings")
        if not shot.get("timecode"):
            warnings.append(f"shot {shot['id']} missing timecode")

    target = int(data.get("target_duration_seconds") or 0)
    if target and total_duration != target:
        warnings.append(f"shot durations total {total_duration}s differs from target {target}s")
    if key_shot_count == 0 and len(shots) >= 4:
        warnings.append("no key_shot marked")
    if key_shot_count > 1:
        warnings.append(f"{key_shot_count} key_shot entries marked; prefer one key shot")

    production_sheet = data.get("production_sheet")
    if isinstance(production_sheet, dict):
        columns = production_sheet.get("columns")
        if columns != REQUIRED_PRODUCTION_COLUMNS:
            warnings.append("production_sheet.columns should match the seven-column Shot List Sheet contract")
        footer = production_sheet.get("footer")
        if isinstance(footer, dict):
            expected_total = f"{target:.1f}s" if target else ""
            if expected_total and footer.get("total_runtime") != expected_total:
                warnings.append(f"production_sheet.footer.total_runtime should be {expected_total}")
    return warnings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("file", nargs="?", help="Optional JSON file. Reads stdin when omitted.")
    args = parser.parse_args()

    try:
        raw = Path(args.file).read_text(encoding="utf-8") if args.file else sys.stdin.read()
        data = json.loads(raw)
        warnings = validate(data)
    except Exception as exc:
        return fail(str(exc))

    print(json.dumps({"success": True, "warnings": warnings}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
