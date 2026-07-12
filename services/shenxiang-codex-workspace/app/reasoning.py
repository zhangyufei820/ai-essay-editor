from __future__ import annotations

from typing import Iterable, Literal


ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh"]

REASONING_BILLING_HINT = "实际输入/输出（含推理）Token 按当前模型与分组规则计费；档位越高，潜在用量与费用越高。"

_REASONING_EFFORTS_BY_MODEL: dict[str, tuple[ReasoningEffort, ...]] = {
    "gpt-5.5": ("none", "low", "medium", "high", "xhigh"),
    "gpt-5.5-openai-compact": ("none", "low", "medium", "high", "xhigh"),
    "gpt-5.6": ("none", "low", "medium", "high", "xhigh"),
    "gpt-5.6-sol": ("none", "low", "medium", "high", "xhigh"),
    "gpt-5.6-terra": ("none", "low", "medium", "high", "xhigh"),
    "gpt-5.6-luna": ("none", "low", "medium", "high", "xhigh"),
}


def reasoning_efforts_for_model(model: str) -> tuple[ReasoningEffort, ...]:
    return _REASONING_EFFORTS_BY_MODEL.get(str(model or "").strip().lower(), ())


def reasoning_effort_for_model(model: str, effort: str | None) -> ReasoningEffort | None:
    normalized = str(effort or "").strip().lower()
    for supported_effort in reasoning_efforts_for_model(model):
        if normalized == supported_effort:
            return supported_effort
    return None


def reasoning_capabilities_for_models(models: Iterable[str]) -> dict[str, dict[str, object]]:
    capabilities: dict[str, dict[str, object]] = {}
    for model in models:
        name = str(model or "").strip()
        efforts = reasoning_efforts_for_model(name)
        if efforts:
            capabilities[name] = {"efforts": list(efforts), "default": "medium"}
    return capabilities
