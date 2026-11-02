#!/usr/bin/env python3
"""Regression checks for the final essay grader output cap."""

import importlib.util
import sys
from pathlib import Path


sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location(
    "essay_limit", Path(__file__).with_name("repair-dify-essay-grading-output-limit.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

graph = {"nodes": [{"id": module.FINAL_GRADER_ID, "data": {
    "type": "llm", "model": {"completion_params": {"max_tokens": module.OLD_LIMIT}},
}}]}
patched = module.patch_graph(graph)
assert patched["nodes"][0]["data"]["model"]["completion_params"]["max_tokens"] == 8192
assert module.NEW_LIMIT < 32768
try:
    module.patch_graph(patched)
except RuntimeError:
    pass
else:
    raise AssertionError("Second patch should refuse to change an unknown graph")
print("essay grading output limit checks passed")
