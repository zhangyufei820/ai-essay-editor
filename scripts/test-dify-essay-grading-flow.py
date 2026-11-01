#!/usr/bin/env python3
"""Small regression checks for essay routing and content gathering code."""

import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location(
    "essay_flow", Path(__file__).with_name("repair-dify-essay-grading-flow.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

router_ns = {}
exec(module.ROUTER_CODE, router_ns)
route = router_ns["main"]
assert route([{"name": "a.docx", "type": "document"},
              {"name": "b.png", "type": "image"}], "批改")["type"] == "mixed"
assert route([{"name": "b.png", "type": "image"},
              {"name": "a.docx", "type": "document"}], "批改")["type"] == "mixed"
assert route([{"name": "b.png", "type": "image"}], "批改")["type"] == "image"
assert route([{"name": "a.docx", "type": "document"}], "批改")["type"] == "document"
assert route([], "作文正文" * 50)["type"] == "essay_text"
assert route([], "你好")["type"] == "text"

gather_ns = {}
exec(module.GATHER_CODE, gather_ns)
gather = gather_ns["main"]
content = gather("图片作文正文", ["文档作文正文"], "请批改")["content"]
assert "图片作文正文" in content and "文档作文正文" in content
assert gather("", ["文档作文正文"], "请批改")["content"] == "文档作文正文"
assert gather("", [], "作文正文" * 50)["content"] == "作文正文" * 50
print("essay grading flow unit checks passed")
