"""Dify code node: recover a selected writing skill even when router JSON is malformed."""

import json
import re


SKILLS = {
    "khazix-writer", "Chinese", "Grammar", "thesis-helper", "mba-thesis-advisor",
    "academic-thesis-review", "shenxiang-lunwen-shenping", "shenxiang-paper-review-v5",
    "shenxiang-chuzhong-xiuxi-piyue", "shenxiang-yi-lunwen-piyue",
    "shenxiang-lunshuowen", "shenxiang-gaozhong-lunshuowen",
    "shenxiang-zuowen-shengge", "shenxiang-zuowen-zhangxiaofeng",
    "shenxiang-xiaoxuezuowen", "shenxiang-xueweipigai-revise",
    "shenxiang-xiaoxue-zuowen-piyue", "shenxiang-xiaoxue-xiangxiang-zuowen",
    "shenxiang-xiaoxue-5grade-zhengwen", "shenxiang-gaozhong-yingyu-zuowen",
    "xueersi-english-grammar-check",
}


def main(router_text, user_query=""):
    text = str(router_text or "").strip()
    query = str(user_query or "")
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, re.I)
    candidate = fenced.group(1) if fenced else text
    data = {}
    try:
        data = json.loads(candidate)
    except (ValueError, TypeError):
        # An essay can contain quotes that the router fails to escape in
        # params.source_material. Recover only the small routing fields.
        pass
    if not isinstance(data, dict):
        data = {}

    explicit = re.match(r"^【指定技能】([A-Za-z0-9-]+)(?:\s|$)", query)
    requested_skill = explicit.group(1) if explicit else ""
    recovered_skill = re.search(r'"skill"\s*:\s*"([A-Za-z0-9-]+)"', candidate)
    parsed_skill = str(data.get("skill") or "").strip()
    skill = requested_skill if requested_skill in SKILLS else parsed_skill
    if skill not in SKILLS and skill != "direct_reply":
        skill = recovered_skill.group(1) if recovered_skill else ""
    if skill not in SKILLS:
        skill = "direct_reply"

    recovered_intent = re.search(r'"intent"\s*:\s*"([^"\\]{1,100})"', candidate)
    intent = str(data.get("intent") or "").strip() or (
        recovered_intent.group(1) if recovered_intent else "smalltalk"
    )
    if skill != "direct_reply" and intent == "smalltalk":
        intent = "writing_skill"
    try:
        confidence = float(data.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    params = data.get("params")
    if not isinstance(params, dict):
        params = {}
    return {
        "intent": intent,
        "skill": skill,
        "confidence": confidence,
        "reply": str(data.get("reply") or "你好呀，我可以帮你写公众号文章、润色中文、修改作文、处理论文或优化英语作文。你想先处理哪一类内容？").strip(),
        "params_json": json.dumps(params, ensure_ascii=False),
        "router_raw": text,
    }
