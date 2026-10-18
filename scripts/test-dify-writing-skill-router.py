import importlib.util
import pathlib
import unittest


source = pathlib.Path(__file__).with_name("dify-writing-skill-router.py")
spec = importlib.util.spec_from_file_location("writing_router", source)
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)


class RouterTests(unittest.TestCase):
    def test_malformed_essay_json_keeps_selected_skill(self):
        raw = '''```json
{"intent":"highschool_argumentative_upgrade","skill":"shenxiang-gaozhong-lunshuowen","params":{"source_material":"他说"和"，这破坏了JSON"}}
```'''
        result = router.main(raw, "【指定技能】shenxiang-gaozhong-lunshuowen\n\n【用户要求】" + "作文" * 500)
        self.assertEqual(result["skill"], "shenxiang-gaozhong-lunshuowen")
        self.assertEqual(result["params_json"], "{}")

    def test_explicit_skill_overrides_router_guess(self):
        raw = '{"intent":"smalltalk","skill":"direct_reply","reply":"你好"}'
        result = router.main(raw, "【指定技能】shenxiang-zuowen-shengge\n\n【用户要求】请升格")
        self.assertEqual(result["skill"], "shenxiang-zuowen-shengge")

    def test_short_non_skill_greeting_stays_direct_reply(self):
        result = router.main('{"intent":"smalltalk","skill":"direct_reply"}', "你好")
        self.assertEqual(result["skill"], "direct_reply")


if __name__ == "__main__":
    unittest.main()
