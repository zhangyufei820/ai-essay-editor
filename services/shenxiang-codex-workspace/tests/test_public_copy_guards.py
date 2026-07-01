from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_COPY_FILES = [
    ROOT / "web" / "assets" / "app-xingren-logo.js",
    ROOT / "web" / "assets" / "app.js",
    ROOT / "web" / "index.html",
    ROOT / "docs" / "third_party_api_keys.md",
]


def test_public_copy_hides_upstream_supplier_names() -> None:
    forbidden = [
        "Geek2API",
        "Grok",
        "Gemini",
        "Banana",
        "Seedance",
        "MoonApiX",
        "Moonapix",
        "Provider",
        "供应商",
        "上游",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in PUBLIC_COPY_FILES)

    for word in forbidden:
        assert word not in combined


def test_public_copy_is_inline_preview_first_for_generated_artifacts() -> None:
    combined = "\n".join(path.read_text(encoding="utf-8") for path in PUBLIC_COPY_FILES)

    assert "renderGeneratedArtifact" in combined
    assert "<iframe" in combined
    assert "生成后请立即下载" not in combined
    assert "只保留一小时" not in combined
    assert "保存在哪里" not in combined
