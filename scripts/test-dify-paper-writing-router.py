import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch


def load(filename):
    source = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(source.stem, source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


router = load("dify-paper-writing-router.py")
repair = load("repair-dify-paper-writing-router.py")


def node(node_id, kind, **data):
    return {"id": node_id, "position": {"x": 100, "y": 100}, "data": {"type": kind, **data}}


def edge(source, target, handle="source"):
    return {"source": source, "target": target, "sourceHandle": handle, "targetHandle": "target", "data": {}}


def graph():
    return {
        "nodes": [
            node(repair.CONTENT_ID, "code"),
            node(repair.ROUTER_ID, "llm"),
            node(repair.BRANCH_ID, "if-else", cases=[{
                "case_id": "true",
                "conditions": [{
                    "variable_selector": [repair.ROUTER_ID, "text"],
                    "comparison_operator": "contains",
                    "value": '{"skill"',
                }],
            }]),
            node(repair.AGENT_ID, "agent", agent_parameters={"query": {
                "type": "constant", "value": repair.output(repair.ROUTER_ID, "text"),
            }}),
            node(repair.REPLY_ID, "answer", answer=repair.output(repair.ROUTER_ID, "text")),
        ],
        "edges": [
            edge(repair.CONTENT_ID, repair.ROUTER_ID),
            edge(repair.ROUTER_ID, repair.BRANCH_ID),
            edge(repair.BRANCH_ID, repair.AGENT_ID, "true"),
            edge(repair.BRANCH_ID, repair.REPLY_ID, "false"),
        ],
    }


class RouterTests(unittest.TestCase):
    def test_fenced_pretty_json_routes_and_preserves_the_query(self):
        payload = {"query": '保留全文\n包括引号 "和" 文档。', "skill": "thesis-helper"}
        answer = router.main("```json\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n```")
        self.assertEqual(answer["route"], "skill")
        self.assertEqual(json.loads(answer["agent_query"]), payload)
        self.assertEqual(answer["reply"], "")

    def test_all_approved_skills_route_with_plain_json(self):
        for skill in router.PAPER_SKILLS:
            with self.subTest(skill=skill):
                result = router.main(json.dumps({"skill": skill, "query": "请求"}))
                self.assertEqual(result["route"], "skill")
                self.assertEqual(json.loads(result["agent_query"])["skill"], skill)

    def test_malformed_and_unknown_envelopes_are_never_replied_raw(self):
        for text in ('{"skill":"unknown","query":"资料"}', '{"skill": "thesis-helper","query":',
                     '结果如下：\n{"skill":"thesis-helper"}', '{"skill":"thesis-helper","query":""}',
                     '{"skill":"thesis-helper","query":["资料"]}', '', '```json\nnull\n```',
                     '```json\n输出中断', json.dumps('{"skill":"thesis-helper","query":"资料"}')):
            with self.subTest(text=text):
                self.assertEqual(router.main(text), {
                    "route": "reply", "agent_query": "", "reply": router.FAILURE_REPLY,
                })

    def test_plain_reply_and_safe_text_after_a_thought(self):
        self.assertEqual(router.main("你好，请问需要什么论文帮助？")["reply"], "你好，请问需要什么论文帮助？")
        self.assertEqual(router.main("<think>内部步骤</think>你好！")["reply"], "你好！")


class GraphRepairTests(unittest.TestCase):
    def test_patches_all_consumers_and_is_idempotent(self):
        original = graph()
        updated = repair.patch_graph(original, "sample")
        nodes = {entry["id"]: entry["data"] for entry in updated["nodes"]}
        self.assertEqual(nodes[repair.PARSER_ID]["variables"][0]["value_selector"], [repair.ROUTER_ID, "text"])
        self.assertEqual(nodes[repair.BRANCH_ID]["cases"][0]["conditions"][0]["variable_selector"], [repair.PARSER_ID, "route"])
        self.assertEqual(nodes[repair.AGENT_ID]["agent_parameters"]["query"]["value"], repair.output(repair.PARSER_ID, "agent_query"))
        self.assertEqual(nodes[repair.REPLY_ID]["answer"], repair.output(repair.PARSER_ID, "reply"))
        self.assertEqual(len(original["nodes"]), 5)
        edges = {(entry["source"], entry["target"]) for entry in updated["edges"]}
        self.assertIn((repair.ROUTER_ID, repair.PARSER_ID), edges)
        self.assertIn((repair.PARSER_ID, repair.BRANCH_ID), edges)
        self.assertNotIn((repair.ROUTER_ID, repair.BRANCH_ID), edges)
        self.assertEqual(repair.patch_graph(updated, "sample"), updated)

    def test_refuses_unexpected_graph_wiring(self):
        original = graph()
        original["edges"][2]["target"] = repair.REPLY_ID
        with self.assertRaises(RuntimeError):
            repair.patch_graph(original, "sample")

    def test_locks_then_backs_up_each_graph_before_replacing_it(self):
        targets = [{"id": "published-guid", "published": True, "draft": False},
                   {"id": "draft-guid", "published": False, "draft": True}]
        with patch.object(repair, "query") as query:
            label = repair.apply_repair("test-host", targets, [
                ("published-guid", "published-previous", "published-updated"),
                ("draft-guid", "draft-previous", "draft-updated"),
            ])
        host, sql = query.call_args.args
        self.assertEqual(host, "test-host")
        self.assertTrue(sql.strip().startswith("BEGIN;"))
        self.assertTrue(sql.strip().endswith("COMMIT;"))
        self.assertEqual(sql.count("SELECT md5(graph) INTO current_digest"), 2)
        self.assertEqual(sql.count(f"SELECT '{label}'"), 2)
        self.assertLess(sql.index("INSERT INTO codex_dify_workflow_graph_backups"), sql.index("UPDATE workflows SET graph"))


if __name__ == "__main__":
    unittest.main()
