from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import Settings

ALLOWED_SANDBOXES = {"read-only", "workspace-write"}


@dataclass(frozen=True)
class SkillDefinition:
    name: str
    display_name: str
    category: str
    description: str
    queue: str
    timeout: int
    cost_points: int
    sandbox: str
    enabled: bool
    public: bool

    @classmethod
    def from_dict(cls, name: str, data: dict[str, Any]) -> "SkillDefinition":
        return cls(
            name=data.get("name", name),
            display_name=data.get("display_name", name),
            category=data.get("category", "general"),
            description=data.get("description", ""),
            queue=data.get("queue", "fast"),
            timeout=int(data.get("timeout", 120)),
            cost_points=int(data.get("cost_points", 1)),
            sandbox=data.get("sandbox", "read-only"),
            enabled=bool(data.get("enabled", False)),
            public=bool(data.get("public", False)),
        )

    def public_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "display_name": self.display_name,
            "category": self.category,
            "description": self.description,
            "cost_points": self.cost_points,
            "enabled": self.enabled,
        }

    def task_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "display_name": self.display_name,
            "category": self.category,
            "description": self.description,
            "queue": self.queue,
            "timeout": self.timeout,
            "cost_points": self.cost_points,
            "sandbox": self.sandbox,
            "enabled": self.enabled,
            "public": self.public,
        }


def load_registry(settings: Settings) -> dict[str, SkillDefinition]:
    raw = json.loads(Path(settings.registry_path).read_text(encoding="utf-8"))
    return {name: SkillDefinition.from_dict(name, data) for name, data in raw.items()}


def get_skill(settings: Settings, skill_name: str) -> SkillDefinition | None:
    registry = load_registry(settings)
    return registry.get(skill_name)


def validate_public_skill(skill: SkillDefinition) -> tuple[bool, str, str]:
    if not skill.enabled:
        return False, "SKILL_DISABLED", "Requested skill is not available."
    if not skill.public:
        return False, "SKILL_NOT_PUBLIC", "Requested skill is not available."
    if skill.sandbox not in ALLOWED_SANDBOXES:
        return False, "INVALID_SKILL_SANDBOX", "Requested skill is not available."
    return True, "", ""


def list_public_skills(settings: Settings) -> list[dict[str, Any]]:
    return [
        skill.public_dict()
        for skill in load_registry(settings).values()
        if skill.enabled and skill.public
    ]
