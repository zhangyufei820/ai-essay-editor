from __future__ import annotations

import json
import re
import shutil
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import Settings

ALLOWED_SANDBOXES = {"read-only", "workspace-write"}
SAFE_SKILL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]{2,80}$")
SKILL_FRONT_MATTER_RE = re.compile(r"^---\s*\n(?P<body>[\s\S]{0,4000}?)\n---\s*", re.MULTILINE)
ALLOWED_SKILL_FILE_PREFIXES = ("scripts/", "references/", "assets/")
ALLOWED_SKILL_FILES = {"SKILL.md", "agents/openai.yaml"}
MAX_RUNTIME_SKILL_FILE_BYTES = 500_000
MAX_RUNTIME_SKILL_TOTAL_BYTES = 2_000_000
DEFAULT_SKILL_CACHE_SECONDS = 300

_cache_lock = threading.RLock()
_registry_cache: dict[str, tuple[int, int, dict[str, "SkillDefinition"]]] = {}
_skill_list_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


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
    path = Path(settings.registry_path)
    stat = path.stat()
    cache_key = str(path.resolve())
    with _cache_lock:
        cached = _registry_cache.get(cache_key)
        if cached and cached[0] == stat.st_mtime_ns and cached[1] == stat.st_size:
            return cached[2]
    raw = json.loads(path.read_text(encoding="utf-8"))
    registry = {name: SkillDefinition.from_dict(name, data) for name, data in raw.items()}
    with _cache_lock:
        _registry_cache[cache_key] = (stat.st_mtime_ns, stat.st_size, registry)
    return registry


def get_skill(settings: Settings, skill_name: str) -> SkillDefinition | None:
    registry = load_registry(settings)
    return registry.get(skill_name)


def skill_from_user_dir(settings: Settings, user_id: str, skill_name: str) -> SkillDefinition | None:
    skill_root = user_installed_skills_root(settings, user_id) / skill_name
    manifest_path = skill_root / "skill.json"
    skill_md = skill_root / "SKILL.md"
    if not manifest_path.is_file() or not skill_md.is_file():
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    data.setdefault("name", skill_name)
    data.setdefault("display_name", skill_name)
    data.setdefault("category", "user_skill")
    data.setdefault("description", "")
    data.setdefault("queue", "fast")
    data.setdefault("timeout", 180)
    data.setdefault("cost_points", 5)
    data.setdefault("sandbox", "workspace-write")
    data.setdefault("enabled", True)
    data.setdefault("public", True)
    return SkillDefinition.from_dict(skill_name, data)


def user_installed_skills_root(settings: Settings, user_id: str) -> Path:
    safe_user_id = safe_path_segment(user_id)
    return settings.user_skills_dir / safe_user_id / "installed"


def community_skills_root(settings: Settings) -> Path:
    return settings.user_skills_dir / "community" / "installed"


def skill_from_community_dir(settings: Settings, skill_name: str) -> SkillDefinition | None:
    skill_root = community_skills_root(settings) / skill_name
    manifest_path = skill_root / "skill.json"
    skill_md = skill_root / "SKILL.md"
    if not manifest_path.is_file() or not skill_md.is_file():
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    data.setdefault("name", skill_name)
    data.setdefault("display_name", skill_name)
    data.setdefault("category", "community_skill")
    data.setdefault("description", "")
    data.setdefault("queue", "fast")
    data.setdefault("timeout", 180)
    data.setdefault("cost_points", 5)
    data.setdefault("sandbox", "workspace-write")
    data.setdefault("enabled", True)
    data.setdefault("public", True)
    return SkillDefinition.from_dict(skill_name, data)


def list_community_skills(settings: Settings) -> list[dict[str, Any]]:
    cache_key = f"community:{community_skills_root(settings)}"
    cached = _skill_list_cache_get(settings, cache_key)
    if cached is not None:
        return cached
    root = community_skills_root(settings)
    if not root.exists():
        return []
    skills: list[dict[str, Any]] = []
    for item in sorted(root.iterdir()):
        if not item.is_dir():
            continue
        skill = skill_from_community_dir(settings, item.name)
        if skill and skill.enabled and skill.public:
            data = skill.public_dict()
            data["scope"] = "community"
            skills.append(data)
    _skill_list_cache_set(settings, cache_key, skills)
    return _clone_skill_dicts(skills)


def list_user_installed_skills(settings: Settings, user_id: str) -> list[dict[str, Any]]:
    safe_user_id = safe_path_segment(user_id)
    cache_key = f"user:{safe_user_id}:{user_installed_skills_root(settings, safe_user_id)}"
    cached = _skill_list_cache_get(settings, cache_key)
    if cached is not None:
        return cached
    root = user_installed_skills_root(settings, user_id)
    if not root.exists():
        return []
    skills: list[dict[str, Any]] = []
    for item in sorted(root.iterdir()):
        if not item.is_dir():
            continue
        skill = skill_from_user_dir(settings, user_id, item.name)
        if skill and skill.enabled and skill.public:
            data = skill.public_dict()
            data["scope"] = "user"
            skills.append(data)
    _skill_list_cache_set(settings, cache_key, skills)
    return _clone_skill_dicts(skills)


def promote_runtime_installed_skills(settings: Settings, user_id: str, skill_name: str | None = None) -> list[dict[str, Any]]:
    """Persist skills that Codex installed inside recent run workspaces.

    Codex CLI installs skills into the current run's `.agents/skills` folder.
    That folder is temporary and not part of the public registry, so the web UI
    cannot discover those skills until we promote a sanitized copy into the
    user's persistent `user-skills/<user>/installed` directory.
    """
    safe_user_id = safe_path_segment(user_id)
    if not safe_user_id:
        return []
    runs_root = (settings.runs_dir / safe_user_id).resolve()
    if not runs_root.exists() or not runs_root.is_dir():
        return []
    installed_root = user_installed_skills_root(settings, safe_user_id)
    installed_root.mkdir(parents=True, exist_ok=True)
    existing_names = {item.name for item in installed_root.iterdir() if item.is_dir()} if installed_root.exists() else set()
    if len(existing_names) >= settings.max_user_skills:
        return []

    candidates = runtime_skill_candidates(runs_root, skill_name)
    promoted: list[dict[str, Any]] = []
    for source in candidates:
        name = source.name
        if name in existing_names:
            continue
        if len(existing_names) >= settings.max_user_skills:
            break
        if not is_safe_skill_name(name):
            continue
        try:
            result = promote_runtime_skill_dir(settings, source, installed_root / name, safe_user_id)
        except (OSError, ValueError):
            continue
        if result:
            existing_names.add(name)
            promoted.append(result)
    if promoted:
        invalidate_skill_caches(safe_user_id)
    return promoted


def runtime_skill_candidates(runs_root: Path, skill_name: str | None = None) -> list[Path]:
    if skill_name and not is_safe_skill_name(skill_name):
        return []
    candidates: list[Path] = []
    for run_dir in sorted(runs_root.iterdir(), key=path_mtime, reverse=True)[:80]:
        skills_root = run_dir / ".agents" / "skills"
        if not skills_root.is_dir():
            continue
        if skill_name:
            candidate = skills_root / skill_name
            if is_runtime_skill_dir(runs_root, candidate):
                candidates.append(candidate)
            continue
        for item in sorted(skills_root.iterdir(), key=path_mtime, reverse=True):
            if is_runtime_skill_dir(runs_root, item):
                candidates.append(item)
    return candidates


def is_runtime_skill_dir(runs_root: Path, path: Path) -> bool:
    try:
        resolved_root = runs_root.resolve()
        resolved = path.resolve()
    except OSError:
        return False
    if resolved != resolved_root and not str(resolved).startswith(str(resolved_root) + "/"):
        return False
    return path.is_dir() and (path / "SKILL.md").is_file() and is_safe_skill_name(path.name)


def promote_runtime_skill_dir(settings: Settings, source: Path, target: Path, user_id: str) -> dict[str, Any] | None:
    if target.exists():
        return None
    skill_md = source / "SKILL.md"
    content = skill_md.read_text(encoding="utf-8", errors="replace")
    if not content.strip():
        raise ValueError("SKILL.md is empty")
    if len(content.encode("utf-8")) > 80_000:
        raise ValueError("SKILL.md is too large")
    metadata = parse_skill_markdown_metadata(content)
    target.mkdir(parents=True, exist_ok=False)
    copied_bytes = 0
    for file in iter_safe_runtime_skill_files(source):
        relative = file.relative_to(source).as_posix()
        size = file.stat().st_size
        if size > MAX_RUNTIME_SKILL_FILE_BYTES:
            continue
        copied_bytes += size
        if copied_bytes > MAX_RUNTIME_SKILL_TOTAL_BYTES:
            break
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, destination)
    if not (target / "SKILL.md").is_file():
        (target / "SKILL.md").write_text(content, encoding="utf-8")
    manifest = runtime_skill_manifest(source.name, metadata, user_id)
    (target / "skill.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    data = SkillDefinition.from_dict(source.name, manifest).public_dict()
    data["scope"] = "user"
    return data


def publish_user_skill_to_community(
    settings: Settings,
    user_id: str,
    skill_name: str,
    owner_name: str = "",
) -> dict[str, Any]:
    if not is_safe_skill_name(skill_name):
        raise ValueError("Invalid skill name")
    source = user_installed_skills_root(settings, user_id) / skill_name
    if not source.is_dir() or not (source / "SKILL.md").is_file():
        raise FileNotFoundError("只能发布当前用户已安装的个人 Skill。")
    community_root = community_skills_root(settings)
    community_root.mkdir(parents=True, exist_ok=True)
    target = community_root / skill_name
    if target.exists():
        raise FileExistsError("社区里已经存在同名 Skill。")

    skill_md = source / "SKILL.md"
    content = skill_md.read_text(encoding="utf-8", errors="replace")
    if not content.strip():
        raise ValueError("SKILL.md is empty")
    if len(content.encode("utf-8")) > 80_000:
        raise ValueError("SKILL.md is too large")
    metadata = parse_skill_markdown_metadata(content)
    target.mkdir(parents=True, exist_ok=False)
    copied_bytes = 0
    for file in iter_safe_runtime_skill_files(source):
        relative = file.relative_to(source).as_posix()
        if relative == "skill.json":
            continue
        size = file.stat().st_size
        if size > MAX_RUNTIME_SKILL_FILE_BYTES:
            continue
        copied_bytes += size
        if copied_bytes > MAX_RUNTIME_SKILL_TOTAL_BYTES:
            break
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, destination)
    if not (target / "SKILL.md").is_file():
        (target / "SKILL.md").write_text(content, encoding="utf-8")
    manifest = runtime_skill_manifest(skill_name, metadata, user_id)
    manifest.update(
        {
            "category": "community_skill",
            "enabled": False,
            "public": False,
            "owner_name": owner_name,
            "published_from": "user_skill",
            "community_shared": False,
            "delete_allowed": False,
            "review_status": "pending_review",
            "published_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    )
    (target / "skill.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    invalidate_skill_caches(user_id)
    data = SkillDefinition.from_dict(skill_name, manifest).public_dict()
    data["scope"] = "community_pending"
    data["review_status"] = "pending_review"
    return data


def iter_safe_runtime_skill_files(source: Path):
    for file in source.rglob("*"):
        if not file.is_file():
            continue
        relative = file.relative_to(source).as_posix()
        if is_allowed_skill_file(relative):
            yield file


def is_allowed_skill_file(relative_path: str) -> bool:
    path = Path(relative_path)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        return False
    path_text = path.as_posix()
    return path_text in ALLOWED_SKILL_FILES or any(path_text.startswith(prefix) for prefix in ALLOWED_SKILL_FILE_PREFIXES)


def runtime_skill_manifest(name: str, metadata: dict[str, str], user_id: str) -> dict[str, Any]:
    display_name = metadata.get("display_name") or metadata.get("title") or metadata.get("name") or name
    description = metadata.get("description") or first_markdown_summary(metadata.get("_content", "")) or "用户安装的 Codex Skill。"
    return {
        "name": name,
        "display_name": display_name[:120],
        "description": description[:500],
        "category": "runtime_installed_skill",
        "queue": "fast",
        "timeout": 180,
        "cost_points": 5,
        "sandbox": "workspace-write",
        "enabled": True,
        "public": True,
        "owner": user_id,
        "installed_from": "codex_runtime",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "delete_allowed": False,
    }


def parse_skill_markdown_metadata(content: str) -> dict[str, str]:
    metadata: dict[str, str] = {"_content": content}
    match = SKILL_FRONT_MATTER_RE.match(content)
    if not match:
        return metadata
    for raw_line in match.group("body").splitlines():
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        key = key.strip().lower()
        value = value.strip().strip("\"'")
        if key in {"name", "display_name", "title", "description"} and value:
            metadata[key] = value[:500]
    return metadata


def first_markdown_summary(content: str) -> str:
    for line in content.splitlines():
        text = line.strip()
        if not text or text == "---" or re.match(r"^(name|description|display_name|title):", text, re.I):
            continue
        return re.sub(r"^#{1,6}\s+", "", text)[:500]
    return ""


def safe_path_segment(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", str(value or "").strip()).strip("_-")[:120]


def is_safe_skill_name(value: str) -> bool:
    return bool(SAFE_SKILL_NAME_RE.match(str(value or "")))


def path_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def validate_public_skill(skill: SkillDefinition) -> tuple[bool, str, str]:
    if not skill.enabled:
        return False, "SKILL_DISABLED", "Requested skill is not available."
    if not skill.public:
        return False, "SKILL_NOT_PUBLIC", "Requested skill is not available."
    if skill.sandbox not in ALLOWED_SANDBOXES:
        return False, "INVALID_SKILL_SANDBOX", "Requested skill is not available."
    return True, "", ""


def list_public_skills(settings: Settings) -> list[dict[str, Any]]:
    cache_key = f"public:{settings.registry_path}"
    cached = _skill_list_cache_get(settings, cache_key)
    if cached is not None:
        return cached
    skills = [
        skill.public_dict()
        for skill in load_registry(settings).values()
        if skill.enabled and skill.public
    ]
    _skill_list_cache_set(settings, cache_key, skills)
    return _clone_skill_dicts(skills)


def warm_skill_caches(settings: Settings) -> None:
    list_public_skills(settings)
    list_community_skills(settings)


def invalidate_skill_caches(user_id: str | None = None) -> None:
    safe_user_id = safe_path_segment(user_id or "")
    with _cache_lock:
        if not safe_user_id:
            _skill_list_cache.clear()
            _registry_cache.clear()
            return
        for key in list(_skill_list_cache):
            if key.startswith("community:") or key.startswith(f"user:{safe_user_id}:"):
                _skill_list_cache.pop(key, None)


def _skill_cache_seconds(settings: Settings) -> int:
    value = int(getattr(settings, "skill_cache_seconds", DEFAULT_SKILL_CACHE_SECONDS) or DEFAULT_SKILL_CACHE_SECONDS)
    return max(1, value)


def _skill_list_cache_get(settings: Settings, cache_key: str) -> list[dict[str, Any]] | None:
    now = time.monotonic()
    with _cache_lock:
        cached = _skill_list_cache.get(cache_key)
        if not cached:
            return None
        expires_at, value = cached
        if expires_at <= now:
            _skill_list_cache.pop(cache_key, None)
            return None
        return _clone_skill_dicts(value)


def _skill_list_cache_set(settings: Settings, cache_key: str, value: list[dict[str, Any]]) -> None:
    expires_at = time.monotonic() + _skill_cache_seconds(settings)
    with _cache_lock:
        _skill_list_cache[cache_key] = (expires_at, _clone_skill_dicts(value))


def _clone_skill_dicts(value: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(item) for item in value]
