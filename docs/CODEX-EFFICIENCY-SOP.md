# Codex 高效协作 SOP

适用范围：跨线程、跨项目使用 Codex 时的入口判断、证据链、运营查询、Provider 验收和内容生产。本 SOP 不替代 `docs/CODEX-SKILL-SOP.md`、`docs/PROJECT-ARCHITECTURE.md`、`docs/RUNBOOK.md`、`docs/OPERATIONS.md`，而是作为所有任务进入具体 SOP 前的路由层。

## 适用关系

| 文档 | 负责内容 | 本 SOP 如何配合 |
|---|---|---|
| `docs/CODEX-SKILL-SOP.md` | 项目总流程、skill 调用、安全红线、八步作业流 | 本 SOP 先判断目标栈，再回到总 SOP 选择任务流程 |
| `docs/PROJECT-ARCHITECTURE.md` | 主站系统边界、请求链路、关键代码地图 | 目标栈涉及主站时，用它确认请求会经过哪些层 |
| `docs/RUNBOOK.md` | 线上故障、回滚、监控异常的处理顺序 | 只要涉及生产故障或回滚，必须一起读取 |
| `docs/OPERATIONS.md` | 上线前检查、部署后巡检、关键页面 | 主站改动测试通过后，用它做部署和巡检闭环 |
| `docs/SERVER-CLEANUP-SOP.md` | 磁盘、Docker 缓存、日志、内存治理 | 服务器清理类任务必须进入该 SOP 的安全边界 |
| `services/codex-skill-gateway/README.md` | 主站 Codex Skill Gateway 的接口、配置、安全边界 | 安装主站 skill 或验证生成物预览时必须对齐 |

## 0. 核心原则

Codex 提效的关键不是写更长的 prompt，而是减少三类返工：

1. 目标栈判断错误：主站、新 API、Codex Gateway、Cowart、本地内容项目混在一起。
2. 验证证据不完整：只看健康检查、页面截图或 `/v1/models`，没有跑真实链路。
3. 高频任务从零开始：运营查询、供应商验收、内容生产每天重新搭流程。

每个任务先用“目标栈路由卡”定边界，再套对应的验证模板。

## 1. 目标栈路由卡

任何非简单问答任务开始前，先填这张卡。若用户已经明确指定目标，以用户最新描述为准；若描述和路径冲突，先按路径和生产边界复核。

```text
目标栈：
任务类型：
生产影响：
允许触碰：
禁止触碰：
需要读取：
验证方式：
是否部署：
交付物：
```

### 1.1 目标栈速查

| 目标栈 | 常见路径/域名 | 允许范围 | 禁止范围 | 完成证据 |
|---|---|---|---|---|
| 主站 `shenxiang.school` | `/Users/aixingren/ai-essay-editor`, `/data/ai-essay-editor`, `shenxiang.school` | Next.js、Dify 主站调用、Supabase 只读/受控写入、主站容器 | 不改 New API 独立栈，不动 1Panel/OpenResty/持久化数据 | 本地测试、生产健康、真实用户路径、任务/扣费记录 |
| 主站 Codex Skill Gateway | `services/codex-skill-gateway`, `/chat/super-all-in-one-agent` | gateway skills、registry、主站技能选择器、inline preview | 不改 `services/shenxiang-codex-workspace`，不改 New API | `/skills`、`/v1/models`、主站页面可见、生成物 inline |
| 独立 New API | `/opt/shenxiang-new-api`, `api.aiphui.top`, `127.0.0.1:3120` | New API 应用、独立 MySQL/Redis、渠道、模型、文档中心 | 不改 `/data/ai-essay-editor`、Supabase、主站配置、OpenResty 主配置 | 容器 healthy、loopback 3120、公网域名、MySQL `logs` |
| New API 云 Codex workspace | `services/shenxiang-codex-workspace`, `/codex/` | 独立 workspace skills、artifact gallery、New API 内工作台 | 不当成主站超级全能智能体 | workspace health、artifact inline、对应页面 smoke |
| Cowart 本地工具 | `/Users/aixingren/Documents/Codex/**`, Cowart canvas | 本地 wrapper、dry-run、无真实扣费验证 | 不改主站/生产容器，真实生图前必须确认 | `--dry-run` endpoint、invalid-model probe、远端日志 |
| 内容项目 | `/Users/aixingren/Documents/New project 2` | 公众号、小红书、图片提示词、Claude/Codex 分工 | 不把内容稿写进主站代码 | 正文、发布包、审计稿、图片提示词 |
| 第三方 Provider 验收 | 外部 `/v1` base url、模型 key | 只读模型枚举、少量真实 smoke、延迟/usage 报告 | 不直接接入生产配置，除非用户要求 | live call、usage、错误分类、是否可售卖判断 |

### 1.2 栈冲突处理

如果任务里同时出现类似“New API”“主站超级全能智能体”“Codex skill”“api.aiphui.top”“shenxiang.school”，先做边界确认，不直接改文件。

固定判断句：

```text
我先确认目标栈：这次是要改 [目标栈]，不是 [相近但错误的栈]。
本轮不会触碰：[禁止范围]。
```

## 2. 主站生产问题证据链

主站 AI 应用、Dify、积分、历史记录、生成物展示等问题，不能只看页面或健康检查。必须按问题类型选择证据层。

### 2.1 Dify/AI 回复异常

固定证据链：

```text
用户入口/截图/时间
-> `ai_task_runs` 最近记录
-> raw Dify answer 或 workflow 节点输出
-> 主站 `/api/dify-chat` SSE
-> `credit_transactions`
-> 浏览器真实页面路径
```

完成条件：

1. raw Dify 输出确认不是空、控制 JSON 或错误节点。
2. 主站 SSE 有可展示正文，且没有被清洗为空。
3. `ai_task_runs.status`、`has_received_content`、`response_length` 与前端一致。
4. 需要扣费时有对应 `credit_transactions`；失败不应扣费。
5. 修复后用真实登录态或等价授权路径验证。

### 2.2 主站运营统计

适用问题：

- 花了多少 token/积分/人民币。
- 哪个应用调用最多。
- 哪个应用故障率最高。
- 某个用户刚才调用了哪个模型/Provider。

默认证据：

```text
public.ai_task_runs
credit_transactions.billing_metadata
OpenResty access/error logs
shenxiang-nextjs logs
```

输出格式：

```text
时间窗口：
统计口径：
总调用：
成功/失败/未终态：
token/积分/人民币：
Top 应用：
最高故障率：
证据来源：
导出文件：
```

注意：

- `/api/health` 正常不代表业务 API 正常。
- `queued/running` 历史残留应单列为未终态，不直接算明确故障。
- 用户内容、完整提示词、回答正文默认不导出。

### 2.3 部署后真实验证

主站改动通过本地测试后，除非用户明确暂停，应继续部署和线上验证。

最低验证：

```text
本地：npm run build 或目标测试
服务器：git pull --ff-only 或可追踪同步
容器：shenxiang-nextjs healthy
接口：https://shenxiang.school/api/health
页面：真实入口打开
业务：点击/上传/提交/等待/结果/积分或历史记录
工作区：本地和服务器 git status 可解释
```

不要把容器 healthy、首页 200 或构建通过当最终结论。

## 3. New API 运营与 Provider 验收

### 3.1 New API 边界

独立 New API 的生产边界：

```text
目录：/opt/shenxiang-new-api
域名：https://api.aiphui.top
监听：127.0.0.1:3120
数据库：独立 MySQL
缓存：独立 Redis
```

禁止默认触碰：

- `/data/ai-essay-editor`
- `shenxiang.school` 主站代码或 Supabase
- 1Panel/OpenResty 主配置
- 无关容器、Docker daemon、生产卷
- 上游真实 key、用户 key、SMTP 密码输出到聊天或文档

### 3.2 New API 事故查询模板

适用问题：

- 某个用户几分钟前用了什么。
- 某个模型/渠道为什么失败。
- 是否扣费、扣了多少。
- 云 Codex 做了哪些 skill，有哪些异常。

固定证据层：

```text
New API MySQL logs 表
New API 容器 stdout/stderr
workspace `/run` 或任务日志
前端页面请求日志
```

输出格式：

```text
时间窗口：
用户/key/model：
request_id/task_id：
channel_id：
HTTP status：
耗时：
consume/usage：
错误类型：
是否用户可见：
是否需要补偿：
证据来源：
```

SQL 查询优先使用 heredoc/stdin，避免复杂引号被 shell 吃掉。

### 3.3 Provider 接入验收模板

不要把 `GET /v1/models` 成功当成供应商可用证明。每个新 Provider 或关键模型至少跑以下验收：

```text
1. GET /v1/models，保存原始 data[].id
2. 无鉴权请求应返回 401 或等价鉴权错误
3. chat completions 非流式最小请求
4. chat completions 流式最小请求
5. responses API 最小请求，如果供应商声称支持
6. 连续 3-5 次延迟样本
7. usage/token 口径记录
8. 错误分类：quota、auth、model_not_found、timeout、provider_error
9. 完整响应体或 New API logs 交叉验证
10. 给出可售卖/备用/不接入判断
```

输出格式：

```text
Provider：
Base URL：
模型列表：
可调用模型：
不可调用模型：
stream：
responses：
延迟：
usage/token：
计费风险：
稳定性风险：
建议：
```

判断规则：

- `/v1/models` 只能说明“列表可见”，不能说明“模型可用”。
- 如果同一短 prompt 在 OpenAI-compatible 和 native protocol token 差异巨大，先解释兼容层/hidden prefix/template 可能性，不直接下“恶意刷 token”结论。
- 图像/视频模型要下载或解析实际文件，确认尺寸、格式、张数、URL 可访问性。

### 3.4 Channel-locked 验证

需要判断某个渠道是否可靠时，必须锁定渠道或用等价机制测试，不能只看默认池。

记录：

```text
channel_id：
model：
request body：
HTTP status：
elapsed：
data_count：
usage：
真实输出尺寸/文件类型：
New API logs row：
是否适合主路由：
```

如果某渠道有长尾延迟，应作为 fallback，而不是默认主链路。

## 4. Codex Skill 安装与生成物预览

### 4.1 安装前确认目标

Codex skill 相关任务必须先确认是哪个栈：

```text
主站超级全能智能体：services/codex-skill-gateway
New API 云工作台：services/shenxiang-codex-workspace
本机 Codex：~/.codex/skills 或 ~/.agents/skills
```

主站 skill 链路：

```text
Next.js `/chat/super-all-in-one-agent`
-> `/api/dify-chat`
-> Dify workflow
-> `services/codex-skill-gateway`
-> skill registry / worker
-> inline generated-file preview
```

### 4.2 Skill 安装验收

必查：

```text
SKILL.md 完整
registry 已注册
内部 id ASCII-safe
中文 display_name/UI label
Docker/runtime 依赖
自然语言路由
测试覆盖
生成物 inline preview
生产 `/skills`
生产 `/v1/models`
真实页面可见
```

生成物展示默认应该是 inline preview。下载只能作为显式 `download=1` 或辅助入口。

### 4.3 缓存与浏览器验证

如果代码、测试和容器都正确，但页面仍旧：

1. 检查是否是 Cloudflare/浏览器缓存。
2. 检查静态 chunk 或 bundle 是否包含新文案。
3. 使用 Playwright 或真实浏览器路径验证，不只看 `curl`。
4. GET 路由用 GET 验证 header；不要用 HEAD 误判。

## 5. Cowart 与本地图像工具

Cowart/New API 图片编辑或生成前，先做非扣费验证。

固定流程：

```text
1. 确认 wrapper 路径和当前 project/canvas。
2. `--dry-run` 打印实际 endpoint。
3. endpoint 必须是预期路径，例如 `/v1/images/edits`。
4. 用 invalid-model probe 做非生成请求。
5. 在远端日志确认请求打到 New API。
6. 只有路由确认后，才允许真实生图或编辑。
```

判断规则：

- `403 invalid model` 不一定是失败；如果远端日志证明请求到了正确 route，它可以作为路由成功信号。
- 不要只看 wrapper 代码，要看实际请求路径。
- 旧 CCAPI 路径保留为 rollback 时，应在输出里明确区分。

## 6. 内容生产流水线

适用项目：`/Users/aixingren/Documents/New project 2`。

目标：每天稳定产出公众号 + 小红书，而不是每次重新想方向。

### 6.1 日产输入卡

```text
今日主题：
读者是谁：
读者痛点：
商业插入点：
参考资料：
需要官方验证的命令/事实：
是否交给 Claude 初稿：
Codex 审计重点：
最终交付：
```

### 6.2 固定流程

```text
痛点判断
-> 商业插入点
-> 官方文档/本地命令验证
-> 公众号结构
-> Claude 情绪稿或润色
-> Codex 事实审计
-> 公众号发布稿
-> 小红书拆条/标题
-> 图片提示词
```

### 6.3 内容原则

- 面向 AI 生图/视频用户，不默认他们是开发者。
- Codex 是解决实际交付问题的工具，不是每篇文章的主角。
- API Key、中转 API、多模型、成本、稳定性要自然出现，不能硬广。
- `AGENTS.md` 应写成项目协作规则，不写成绝对安全防火墙。
- 图片提示词优先“一图一隐喻”，少字或无字；中文大标题可以后期加。
- 每篇文章要对照 `bozhouDev/codex-orange-book` 和既有蓝皮书结构，保证系列感。

## 7. 子代理使用规则

适合用子代理的场景：

- 跨线程/跨项目审计。
- 同时比较主站、New API、内容项目。
- 多 Provider 并行验收。
- 一个大任务里有独立证据层，例如日志、数据库、页面验证。

分工建议：

```text
A：主站生产/业务证据
B：New API/Provider/渠道证据
C：内容/本地工具/Cowart 证据
```

子代理只做只读分析时，主代理必须负责最终取舍和执行。不要让多个代理同时写同一目录或同一文件。

## 8. 最终交付格式

所有任务最终回答优先给结论，不先铺过程。

### 8.1 生产/运营类

```text
结论：
影响范围：
证据：
已执行：
验证：
未做/风险：
下一步：
```

### 8.2 Provider 验收类

```text
结论：
可用模型：
不可用模型：
延迟：
token/计费：
风险：
建议接入方式：
```

### 8.3 内容类

```text
建议发布版本：
标题：
读者钩子：
商业插入点：
文件：
发布注意：
```

## 9. 禁止事项

除非用户明确授权，不要做以下事：

- 为了“清理”执行 `docker system prune`、`docker volume prune`、删除生产数据。
- 把 New API 任务误改到主站，或把主站超级全能智能体误改到 New API workspace。
- 把 `/v1/models` 当作 Provider 可用性的最终证明。
- 把页面健康检查当作业务修复完成证明。
- 把真实 key、密码、连接串、用户 API key 写进仓库、文档、日志或最终回答。
- 在工作区已有脏改动时混合提交无关文件。

## 10. 快速模板

### 10.1 新任务开场模板

```text
本次我先做路由卡：
目标栈：
任务类型：
会读取：
会调用的 skill：
不会触碰：
验证方式：
```

### 10.2 真实验证模板

```text
入口：
操作：
服务端证据：
数据库证据：
用户可见结果：
计费/权益：
残余风险：
```

### 10.3 Provider 验收模板

```text
Base URL：
Key 来源：
模型列表：
测试模型：
请求类型：
样本数：
成功率：
P50/P95 或样本延迟：
usage：
异常：
建议：
```
