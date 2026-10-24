import importlib.util
import pathlib
import unittest


source = pathlib.Path(__file__).with_name("remove-dify-knowledge-retrieval.py")
spec = importlib.util.spec_from_file_location("remove_retrieval", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def node(node_id, kind, context=None):
    data = {"type": kind, "title": kind}
    if context is not None:
        data["context"] = context
    return {"id": node_id, "data": data}


def edge(source, target, source_handle="source"):
    return {
        "id": f"{source}-{source_handle}-{target}-target", "source": source,
        "target": target, "sourceHandle": source_handle, "targetHandle": "target",
        "data": {"sourceType": "start", "targetType": "knowledge-retrieval"},
    }


class RetrievalRemovalTests(unittest.TestCase):
    def test_rewires_branch_and_clears_context(self):
        graph = {
            "nodes": [
                node("start", "start"), node("lookup", "knowledge-retrieval"),
                node("left", "llm", {"enabled": True, "variable_selector": ["lookup", "result"]}),
                node("right", "llm", {"enabled": False, "variable_selector": []}),
            ],
            "edges": [edge("start", "lookup", "true"), edge("lookup", "left"), edge("lookup", "right")],
        }
        updated, removed = module.patch_graph(graph)
        self.assertEqual(removed, ["lookup"])
        self.assertEqual(len(updated["nodes"]), 3)
        self.assertEqual({e["target"] for e in updated["edges"]}, {"left", "right"})
        self.assertTrue(all(e["source"] == "start" and e["sourceHandle"] == "true" for e in updated["edges"]))
        self.assertEqual(updated["nodes"][1]["data"]["context"], {"enabled": False, "variable_selector": []})
        self.assertEqual(graph["nodes"][2]["data"]["context"]["enabled"], True)

    def test_rejects_direct_reference_outside_context(self):
        graph = {
            "nodes": [node("start", "start"), node("lookup", "knowledge-retrieval"),
                      {"id": "reply", "data": {"type": "answer", "answer": "{{#lookup.result#}}"}}],
            "edges": [edge("start", "lookup"), edge("lookup", "reply")],
        }
        with self.assertRaisesRegex(ValueError, "still referenced"):
            module.patch_graph(graph)

    def test_no_retrieval_is_unchanged(self):
        graph = {"nodes": [node("start", "start")], "edges": []}
        self.assertEqual(module.patch_graph(graph), (graph, []))


if __name__ == "__main__":
    unittest.main()
