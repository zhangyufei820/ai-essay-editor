# 内容创作多平台发布工作流 — 执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建可复用的内容创作工作流，用户输入主题后 AI 完成公众号+小红书+封面的全流程创作

**Architecture:** 以 dbskill + article-writing + claude-design 三个技能为核心，按顺序执行 8 个步骤，输出最终内容包

**Tech Stack:** article-writing、dbskill (dbs-diagnosis/dbs-xhs-title/dbs-content)、claude-design

---

## 前置检查

### Task 0: 验证所有技能已正确安装

**Files:**
- Check: `~/.claude/plugins/marketplaces/dontbesilent-skills/skills/`
- Check: `~/.claude/skills/article-writing/`
- Check: `~/.claude/skills/claude-design/`

- [ ] **Step 1: 确认 dbskill 安装**

Run: `ls ~/.claude/plugins/marketplaces/dontbesilent-skills/skills/ | grep dbs`
Expected: 列出 dbs、dbs-diagnosis、dbs-xhs-title、dbs-content 等 13 个技能

- [ ] **Step 2: 确认 article-writing 安装**

Run: `ls ~/.claude/skills/article-writing/`
Expected: 存在 SKILL.md 或类似主文件

- [ ] **Step 3: 确认 claude-design 安装**

Run: `ls ~/.claude/skills/claude-design/`
Expected: 存在 SKILL.md 或类似主文件

---

## 核心交付物

### Task 1: 创建工作流提示词模板

**Files:**
- Create: `docs/superpowers/content-workflow-prompt.md`

- [ ] **Step 1: 编写完整工作流提示词模板**

模板需覆盖以下 8 个步骤的完整 prompt：

```markdown
# 内容创作工作流

## 输入
主题：[你的AI技术主题]

## 执行步骤

### 步骤1：主题诊断
使用 /dbs-diagnosis 分析这个主题的受众兴趣度和竞争度，输出诊断报告。

### 步骤2：生成小红书标题
使用 /dbs-xhs-title + [你的主题]，生成3个小红书爆款标题备选。

### 步骤3：写公众号长文
使用 /article-writing 写一篇 [你的主题] 的公众号长文（1500-2500字），标题为 [选定的标题]。

### 步骤4：内容诊断
将步骤3的文章输入 /dbs-content 进行诊断，获取改写建议。

### 步骤5：改写（如需要）
根据步骤4的建议，使用 /article-writing 改写文章。

### 步骤6：改写小红书版本
将最终公众号文章输入 /dbs-content，请求改写成小红书版本（800字内，风格活泼）。

### 步骤7：生成小红书标题
使用 /dbs-xhs-title + 小红书正文，生成10+个爆款标题备选。

### 步骤8：生成封面图
使用 /claude-design 为 [公众号标题] 生成封面图设计建议或HTML页面。

## 输出
- 公众号长文
- 小红书正文 + 10+标题备选
- 封面图
```

- [ ] **Step 2: 保存模板文件**

Write to: `docs/superpowers/content-workflow-prompt.md`

---

### Task 2: 创建快速参考卡

**Files:**
- Create: `docs/superpowers/content-workflow-quickref.md`

- [ ] **Step 1: 编写一页纸快速参考**

内容需包含：
- 8 步骤概览（每步一句话）
- 每个步骤对应的技能命令
- 预估耗时
- 质量控制阈值说明

- [ ] **Step 2: 保存快速参考文件**

Write to: `docs/superpowers/content-workflow-quickref.md`

---

### Task 3: 实战验证（可选，推荐执行）

**Files:**
- Test: 使用一个真实主题跑完整流程

- [ ] **Step 1: 选择测试主题**

建议选一个真实的 AI 前沿话题，如"Flux 1.1 模型新特性"或"Midjourney V7 评测"

- [ ] **Step 2: 执行完整工作流**

按 Task 1 的模板，执行全部 8 个步骤

- [ ] **Step 3: 记录问题**

如果有任何步骤不顺畅或产出不符合预期，记录到文档中

---

## 任务依赖关系

```
Task 0 (前置检查)
    ↓
Task 1 (提示词模板) ← 独立
Task 2 (快速参考) ← 独立，可与 Task 1 并行
    ↓
Task 3 (实战验证) ← 依赖 Task 1 完成
```

---

## 预估工作量

| 任务 | 耗时 |
|------|------|
| Task 0 | 2 分钟 |
| Task 1 | 10 分钟 |
| Task 2 | 5 分钟 |
| Task 3 | 15-20 分钟 |

---

## 验收标准

- [ ] dbskill 全部 13 个技能可正常调用
- [ ] `content-workflow-prompt.md` 模板包含完整 8 步骤
- [ ] `content-workflow-quickref.md` 可作为日常使用的一页纸参考
- [ ] （可选）实战验证无阻塞性问题
