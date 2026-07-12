from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_BUNDLE_FILES = [
    ROOT / "web" / "assets" / "app-xingren-logo.js",
    ROOT / "web" / "assets" / "app.js",
]
PUBLIC_COPY_FILES = [
    *PUBLIC_BUNDLE_FILES,
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
    assert "geek2api" not in combined.casefold()


def test_public_bundles_use_discount_image_public_alias() -> None:
    for path in PUBLIC_BUNDLE_FILES:
        copy = path.read_text(encoding="utf-8")
        assert "特价 image-2" in copy
        assert "geek2api" not in copy.casefold()


def test_public_copy_is_inline_preview_first_for_generated_artifacts() -> None:
    combined = "\n".join(path.read_text(encoding="utf-8") for path in PUBLIC_COPY_FILES)

    assert "renderGeneratedArtifact" in combined
    assert "<iframe" in combined
    assert "sandbox referrerpolicy=\"no-referrer\"" in combined
    assert "生成后请立即下载" not in combined
    assert "只保留一小时" not in combined
    assert "保存在哪里" not in combined
