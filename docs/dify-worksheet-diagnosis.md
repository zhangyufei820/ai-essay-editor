# Dify 工作流：错题诊断海报

网站端模型标识：`worksheet-diagnosis`

生产环境变量：

```bash
DIFY_WORKSHEET_DIAGNOSIS_API_KEY=app-xxx
DIFY_WORKSHEET_DIAGNOSIS_TIMEOUT_MS=120000
```

## Dify 输入变量

在 Dify Workflow 应用里创建以下输入变量：

| 变量名 | 类型 | 说明 |
| --- | --- | --- |
| `worksheet_images` | File list / Image | 试卷或作业图片，1-6 张 |
| `subject` | Text | 学科，默认数学 |
| `grade` | Text | 年级，可为空 |
| `report_style` | Text | `parent`、`teacher`、`student` |
| `extra_context` | Paragraph | 用户补充信息 |
| `output_schema_version` | Text | 当前为 `worksheet-diagnosis-v1` |
| `output_contract` | Paragraph | 网站端传入的输出约束 |

## Dify 输出变量

优先输出 `diagnosis_json`，值必须是严格 JSON。也兼容 `diagnosis`、`result`、`output`、`text`、`answer`。

```json
{
  "schema_version": "worksheet-diagnosis-v1",
  "subject": "数学",
  "grade_hint": "小学高年级",
  "overall_summary": "孩子基础不差，主要问题集中在审题和计算稳定性。",
  "main_issues": ["审题漏条件", "计算过程不够稳定"],
  "evidence": [
    {
      "question": "第3题",
      "reason": "漏看单位换算条件",
      "quote": "题目要求先换算单位"
    }
  ],
  "solutions": ["做题前圈出关键词", "复杂计算分步验算"],
  "training_plan": [
    {
      "title": "审题三步",
      "action": "圈条件、标单位、写关系式",
      "frequency": "每天 5 题"
    }
  ],
  "parent_message": "孩子已经具备解题基础，接下来重点训练审题流程和验算习惯。",
  "cautions": ["仅基于本次上传图片判断，不能代替长期学习评估。"]
}
```

## 推荐节点链路

1. Start：接收图片和基础信息。
2. Vision/OCR 节点：识别卷面文字、错题、批改痕迹。
3. LLM 诊断节点：按 `output_contract` 输出 JSON。
4. End：把 JSON 放到 `diagnosis_json`。

第一版先不要在 Dify 里直接生成图片。网站端会拿到 `diagnosis_json` 后生成 `renderPrompt`，再交给现有 GPT Image 2 链路生成海报，这样便于确认诊断草稿、控制积分和失败退款。
