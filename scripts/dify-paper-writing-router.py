"""Dify code node for the dedicated paper-writing application's routing output."""

import json
import re


PAPER_SKILLS = {
    "thesis-helper",
    "academic-thesis-review",
    "mba-thesis-advisor",
    "thu-thesis",
    "dissertation-workflow-core",
}
FAILURE_REPLY = "论文写作暂时无法处理这次请求，请重试。"


def main(router_text):
    text = re.sub(r"^\s*<think>[\s\S]*?</think>", "", str(router_text or ""), flags=re.I).strip()
    fenced = re.fullmatch(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.I)
    candidate = fenced.group(1) if fenced else text
    try:
        data = json.loads(candidate)
    except ValueError:
        data = None

    if isinstance(data, dict):
        skill = data.get("skill")
        query = data.get("query")
        if isinstance(skill, str) and skill in PAPER_SKILLS and isinstance(query, str) and query.strip():
            return {
                "route": "skill",
                "agent_query": json.dumps({"skill": skill, "query": query}, ensure_ascii=False),
                "reply": "",
            }

    internal_output = (
        not text
        or bool(fenced)
        or text.lower().startswith(("{", "[", "<think>", "```json"))
        or re.search(r'"(?:skill|query)"\s*:', data if isinstance(data, str) else text, re.I)
    )
    return {"route": "reply", "agent_query": "", "reply": FAILURE_REPLY if internal_output else text}
