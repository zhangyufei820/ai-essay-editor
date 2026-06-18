from __future__ import annotations

import mimetypes
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import quote


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v"}
PDF_EXTENSIONS = {".pdf"}
TEXT_EXTENSIONS = {".md", ".markdown", ".txt", ".csv", ".json"}
PRESENTATION_EXTENSIONS = {".pptx", ".ppt"}
DOCUMENT_EXTENSIONS = {".docx", ".doc", ".odt", ".rtf"}
SPREADSHEET_EXTENSIONS = {".xlsx", ".xlsm", ".xls", ".ods"}
SUPPORTED_EXTENSIONS = (
    IMAGE_EXTENSIONS
    | VIDEO_EXTENSIONS
    | PDF_EXTENSIONS
    | TEXT_EXTENSIONS
    | PRESENTATION_EXTENSIONS
    | DOCUMENT_EXTENSIONS
    | SPREADSHEET_EXTENSIONS
)

MAX_ARTIFACTS = 40
MAX_PREVIEWS_PER_ARTIFACT = 12
PREVIEW_DIR_NAME = "_artifact_previews"
SKIPPED_DIRS = {
    ".agents",
    ".git",
    ".pytest_cache",
    "__pycache__",
    "bin",
    "input",
    "node_modules",
}
SKIPPED_FILENAMES = {
    "prompt.txt",
    "result.md",
    "stderr.txt",
    "stdout.txt",
    "status.json",
}


def collect_task_artifacts(
    task: dict[str, Any],
    public_base_url: str,
    *,
    generate_previews: bool = False,
) -> list[dict[str, Any]]:
    task_id = str(task.get("task_id") or "").strip()
    workspace_value = str(task.get("workspace") or "").strip()
    if not task_id or not workspace_value:
        return []
    workspace = Path(workspace_value).expanduser()
    try:
        workspace_root = workspace.resolve()
    except OSError:
        return []
    if not workspace_root.is_dir():
        return []

    files = [path for path in workspace_root.rglob("*") if is_user_visible_file(workspace_root, path)]
    files.sort(key=artifact_sort_key)
    used_preview_paths: set[str] = set()
    artifacts: list[dict[str, Any]] = []

    for path in files:
        relative = path.relative_to(workspace_root).as_posix()
        if relative in used_preview_paths:
            continue
        kind = artifact_kind(path)
        if not kind:
            continue
        artifact = artifact_payload(task_id, public_base_url, workspace_root, path, kind)
        if kind in {"presentation", "document", "spreadsheet"}:
            previews = preview_payloads_for_file(
                task_id,
                public_base_url,
                workspace_root,
                path,
                files,
                generate_previews=generate_previews,
            )
            artifact["previews"] = previews
            used_preview_paths.update(item["path"] for item in previews)
        artifacts.append(artifact)
        if len(artifacts) >= MAX_ARTIFACTS:
            break

    return artifacts


def is_user_visible_file(workspace_root: Path, path: Path) -> bool:
    try:
        resolved = path.resolve()
    except OSError:
        return False
    if not resolved.is_file() or resolved.is_symlink():
        return False
    if resolved != workspace_root and not str(resolved).startswith(str(workspace_root) + "/"):
        return False
    try:
        relative = resolved.relative_to(workspace_root)
    except ValueError:
        return False
    if not relative.parts:
        return False
    parts = [part.lower() for part in relative.parts]
    if any(part in SKIPPED_DIRS for part in parts[:-1]):
        return False
    if any(part.startswith(".") for part in parts[:-1] if part != PREVIEW_DIR_NAME):
        return False
    if parts[-1] in SKIPPED_FILENAMES:
        return False
    return resolved.suffix.lower() in SUPPORTED_EXTENSIONS


def artifact_payload(
    task_id: str,
    public_base_url: str,
    workspace_root: Path,
    path: Path,
    kind: str,
) -> dict[str, Any]:
    relative = path.relative_to(workspace_root).as_posix()
    payload: dict[str, Any] = {
        "path": relative,
        "name": path.name,
        "kind": kind,
        "size_bytes": safe_file_size(path),
        "mime_type": media_type_for_path(path),
    }
    if kind in {"image", "video", "pdf", "text"}:
        payload["url"] = artifact_url(public_base_url, task_id, relative)
    return payload


def preview_payloads_for_file(
    task_id: str,
    public_base_url: str,
    workspace_root: Path,
    source: Path,
    visible_files: list[Path],
    *,
    generate_previews: bool,
) -> list[dict[str, Any]]:
    candidates = companion_preview_files(source, visible_files)
    if generate_previews:
        generated = ensure_office_pdf_preview(workspace_root, source)
        if generated and is_user_visible_file(workspace_root, generated):
            candidates.insert(0, generated)
    if not candidates:
        candidates = global_preview_files(source, visible_files)

    payloads: list[dict[str, Any]] = []
    seen: set[str] = set()
    for path in candidates:
        if not is_user_visible_file(workspace_root, path):
            continue
        relative = path.relative_to(workspace_root).as_posix()
        if relative in seen:
            continue
        kind = artifact_kind(path)
        if kind not in {"image", "video", "pdf", "text"}:
            continue
        seen.add(relative)
        payloads.append(
            {
                "path": relative,
                "name": path.name,
                "kind": kind,
                "url": artifact_url(public_base_url, task_id, relative),
                "mime_type": media_type_for_path(path),
                "size_bytes": safe_file_size(path),
            }
        )
        if len(payloads) >= MAX_PREVIEWS_PER_ARTIFACT:
            break
    return payloads


def companion_preview_files(source: Path, visible_files: list[Path]) -> list[Path]:
    parent = source.parent
    stem = source.stem.lower()
    candidates: list[Path] = []
    for path in visible_files:
        if path.parent != parent:
            continue
        name = path.name.lower()
        if artifact_kind(path) not in {"image", "video", "pdf", "text"}:
            continue
        if name.startswith("preview.") or name.startswith(f"{stem}.") or "preview" in name:
            candidates.append(path)
    return sorted(candidates, key=preview_sort_key)


def global_preview_files(source: Path, visible_files: list[Path]) -> list[Path]:
    candidates = [
        path
        for path in visible_files
        if path != source
        and artifact_kind(path) in {"image", "video", "pdf", "text"}
        and looks_like_preview(path)
    ]
    return sorted(candidates, key=preview_sort_key)


def looks_like_preview(path: Path) -> bool:
    text = path.as_posix().lower()
    name = path.name.lower()
    if "preview" in name or "contact" in name or "thumbnail" in name:
        return True
    return "/svg_output/" in text or "/pages/" in text


def ensure_office_pdf_preview(workspace_root: Path, source: Path) -> Path | None:
    if artifact_kind(source) not in {"presentation", "document", "spreadsheet"}:
        return None
    soffice = shutil.which("soffice")
    if not soffice:
        return None
    relative_parent = source.parent.relative_to(workspace_root).as_posix()
    safe_parent = re.sub(r"[^a-zA-Z0-9_.-]+", "_", relative_parent).strip("_") or "root"
    preview_dir = workspace_root / PREVIEW_DIR_NAME / safe_parent
    preview_path = preview_dir / f"{source.stem}.pdf"
    try:
        if preview_path.is_file() and preview_path.stat().st_mtime >= source.stat().st_mtime:
            return preview_path
        preview_dir.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(preview_dir), str(source)],
            check=False,
            capture_output=True,
            timeout=90,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return preview_path if preview_path.is_file() else None


def artifact_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in IMAGE_EXTENSIONS:
        return "image"
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in PDF_EXTENSIONS:
        return "pdf"
    if suffix in TEXT_EXTENSIONS:
        return "text"
    if suffix in PRESENTATION_EXTENSIONS:
        return "presentation"
    if suffix in DOCUMENT_EXTENSIONS:
        return "document"
    if suffix in SPREADSHEET_EXTENSIONS:
        return "spreadsheet"
    return ""


def media_type_for_path(path: Path) -> str:
    if path.suffix.lower() == ".svg":
        return "image/svg+xml"
    if path.suffix.lower() == ".pdf":
        return "application/pdf"
    detected, _ = mimetypes.guess_type(path.name)
    return detected or "application/octet-stream"


def artifact_url(public_base_url: str, task_id: str, relative_path: str) -> str:
    base = public_base_url.rstrip("/")
    return f"{base}/api/tasks/{quote(task_id, safe='')}/files/{quote(relative_path, safe='/')}"


def artifact_sort_key(path: Path) -> tuple[int, str]:
    kind = artifact_kind(path)
    priority = {
        "presentation": 0,
        "pdf": 1,
        "image": 2,
        "video": 3,
        "document": 4,
        "spreadsheet": 5,
        "text": 6,
    }.get(kind, 9)
    return (priority, path.as_posix().lower())


def preview_sort_key(path: Path) -> tuple[int, int, str]:
    text = path.as_posix().lower()
    name = path.name.lower()
    if PREVIEW_DIR_NAME in text:
        priority = 0
    elif name.startswith("preview.") or "preview" in name:
        priority = 1
    elif "contact" in name or "thumbnail" in name:
        priority = 2
    elif "/svg_output/" in text:
        priority = 3
    else:
        priority = 4
    return (priority, len(path.parts), text)


def safe_file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0
