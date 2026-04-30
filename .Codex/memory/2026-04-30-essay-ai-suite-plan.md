# essay-ai-suite 计划书：快、稳、高质量

## 核心目标

建设一个部署在 1Panel 上的公共 AI 能力套件：`essay-ai-suite`。

它负责作文批改、批量批改、OCR、文档提取、图像生成、任务队列和结果存储。Dify 只通过 HTTP 调用它，保留轻节点，避免 Dify 工作流变慢、变复杂、变不稳定。

## 最终架构

```text
Dify App
  ↓ HTTP
essay-api-gateway
  ↓
essay-grading-service
  ├── OCR 模块 / essay-ocr-service
  ├── 文档提取模块 / document-extractor-service
  ├── 图像生成模块 / image-generation-service
  ├── Redis / Job Queue
  ├── SQLite/Postgres
  └── 第三方 LLM / OCR / 图像 API
```

## 1Panel 封装形态

不是封装 4 个独立 1Panel 应用，而是封装 1 个公共应用套件：`essay-ai-suite`。

内部包含：

- `essay-api-gateway`
- `essay-grading-service`
- `essay-ocr-service`
- `document-extractor-service`
- `image-generation-service`
- `redis`
- `sqlite/postgres`

第一阶段不要过度微服务化。先用一个 API 服务承载 gateway + grading 核心能力，OCR、文档提取、图像生成先作为模块或预留接口，后续再拆。

## Dify 侧轻节点

### 单篇作文

```text
开始
  ↓
代码节点：整理 query + files
  ↓
HTTP：POST /api/essay/grade-single
  ↓
条件分支
  ↓
回答
```

### 批量作文

```text
开始
  ↓
代码节点：整理 files + params
  ↓
HTTP：POST /api/essay/grade-batch
  ↓
回答 job_id
```

### 查询批量结果

```text
开始
  ↓
HTTP：GET /api/jobs/{job_id}/results
  ↓
回答
```

### 图片生成

```text
开始
  ↓
代码节点：整理主题、风格、尺寸
  ↓
HTTP：POST /api/image/generate
  ↓
回答图片地址
```

## 第一阶段 MVP

目标：先跑通单篇作文批改和批量任务，不追求微服务完整拆分。

基础能力：

- 一个 API 服务
- 一个核心批改服务
- Redis 队列预留
- SQLite 结果存储预留
- Docker Compose 可运行

核心接口：

```http
GET  /health
POST /api/essay/grade-single
POST /api/essay/grade-batch
GET  /api/jobs/{job_id}
GET  /api/jobs/{job_id}/results
```

单篇作文流程：

- Dify 提交文本或文件
- 服务提取正文
- 调用第三方 LLM
- 返回结构化结果 + Markdown 报告

批量作文流程：

- Dify 提交多篇作文
- 返回 `job_id`
- 后台队列逐篇处理
- 每篇独立状态、独立失败、独立重试

## 稳定性要求

- 默认并发：2-3
- 单批上限：20 篇
- 单篇字数上限：建议 5000 字
- 单任务超时：120-180 秒
- 失败自动重试：1-2 次
- 单篇失败不影响整批

任务状态：

```text
queued
running
success
failed
partial_success
cancelled
```

结果结构：

```json
{
  "essay_id": "001",
  "student_name": "张三",
  "status": "success",
  "score": 86,
  "level": "黄金",
  "grade_level": "初中",
  "genre": "记叙文",
  "summary": "...",
  "problems": [],
  "polished_text": "...",
  "markdown_report": "...",
  "error": null
}
```

## 最终原则

```text
Dify = 产品界面 + 轻编排 + 对话体验
1Panel essay-ai-suite = 公共能力服务 + 稳定执行 + 批量任务
第三方 API = 模型 / OCR / 图像供应商
```

核心追求：快、稳、高质量。
