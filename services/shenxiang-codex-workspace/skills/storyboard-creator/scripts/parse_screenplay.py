#!/usr/bin/env python3
"""Lightweight screenplay parser for storyboard-creator.

Reads plain text from stdin or a file and emits a simple JSON scene outline.
This is intentionally heuristic; the LLM still performs creative expansion.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict


SCENE_RE = re.compile(r"^\s*(第[一二三四五六七八九十\d]+[幕场]|scene\s+\d+|act\s+\d+|#{1,3}\s+.+)", re.I)


@dataclass
class ParsedScene:
    id: str
    heading: str
    text: str
    estimated_shots: int


def split_scenes(text: str) -> list[ParsedScene]:
    lines = text.replace("\r\n", "\n").split("\n")
    scenes: list[tuple[str, list[str]]] = []
    current_heading = "未命名场景"
    current_lines: list[str] = []

    for line in lines:
        if SCENE_RE.match(line) and current_lines:
            scenes.append((current_heading, current_lines))
            current_heading = line.strip("# ").strip()
            current_lines = []
        elif SCENE_RE.match(line):
            current_heading = line.strip("# ").strip()
        else:
            current_lines.append(line)

    if current_lines or not scenes:
        scenes.append((current_heading, current_lines))

    parsed: list[ParsedScene] = []
    for index, (heading, body_lines) in enumerate(scenes, start=1):
        body = "\n".join(body_lines).strip()
        word_like_count = max(1, len(re.findall(r"[\w\u4e00-\u9fff]+", body)))
        estimated = max(1, min(6, round(word_like_count / 80)))
        parsed.append(
            ParsedScene(
                id=f"scene_{index:03d}",
                heading=heading,
                text=body,
                estimated_shots=estimated,
            )
        )
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("file", nargs="?", help="Optional text file. Reads stdin when omitted.")
    args = parser.parse_args()

    if args.file:
        text = open(args.file, encoding="utf-8").read()
    else:
        text = sys.stdin.read()

    scenes = split_scenes(text)
    print(json.dumps({"scenes": [asdict(scene) for scene in scenes]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
