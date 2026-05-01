# Codex Sprint 0 + Sprint 1 技术指令

你是 Codex，负责 shenxiang.school 项目的代码实现。Hermes 是架构师与验收负责人。你必须严格按当前 Sprint 执行，完成后停止并提交成果报告，不得继续下一 Sprint。

项目路径：/Users/aixingren/ai-essay-editor/
技术栈：Next.js / TypeScript / Tailwind / Supabase / Docker
生产站：https://shenxiang.school
服务器和部署不在本阶段范围内。不要部署生产。不要修改 .env.production。不要硬编码密钥。不要删除核心业务逻辑来通过构建。

## 总工作流

1. 你只执行 Sprint 0 和 Sprint 1。
2. 完成后必须停止，向 Hermes 提交成果。
3. 未经 Hermes 明确回复“验收合格，可以进入下一 Sprint”，禁止继续 Sprint 2。
4. 如果遇到无法确认的问题，保守处理并在报告中列出，不要擅自扩大范围。

---

# Sprint 0：基线冻结与验收环境准备

目标：在修改前记录项目状态和可验证基线。

请先执行以下检查并在最终报告中记录：

## 1. Git 基线

- 当前分支
- git status
- git diff --stat
- 最近 3 个 commit

## 2. 项目结构和关键文件定位

定位并检查：

- app/page.tsx
- app/layout.tsx
- next.config.*
- middleware.* 如存在
- lib/admin-auth.ts 如存在
- lib/rate-limit.ts 如存在
- app/api/**/route.ts 中的 POST 路由
- components 中 footer 相关文件

## 3. 本地构建基线

- 运行项目推荐构建命令，通常是 npm run build
- 如果失败，记录失败原因，不要先大规模修复无关问题

## 4. 页面和安全基线

如果本地服务容易启动，可以本地验证；如果不方便，至少检查代码配置。

重点页面：

- /
- /pricing
- /privacy
- /terms
- /refund-policy
- /ai-writing
- /payment
- /admin
- /chat
- /this-page-should-404

---

# Sprint 1：P0 安全与可用性修复

只允许处理下面 P0 范围，不要做产品文案大改、视觉重构、SEO 内容页扩展、性能大优化。

## 一、首页不能被登录墙阻断

检查并修复：

- app/page.tsx
- middleware.*
- 任何导致匿名访问 / 直接跳 /login 的逻辑

要求：

- 未登录用户访问首页应看到完整营销落地页
- 不得强制跳转 /login
- 登录只应发生在用户进入使用区、提交批改、访问个人中心或付费权益时

验收标准：

- / 返回公开首页
- 不自动跳 /login
- 首页不是空白

## 二、关键页面不能死链

检查并修复：

- /pricing
- /privacy
- /terms
- /refund-policy
- /ai-writing
- /payment
- /admin
- /chat

要求：

- 核心公开页应 200
- 废弃旧路径应 redirect 到合理位置
- 页脚、导航、按钮中不能有正式入口 href="#"

特别注意：项目可能有多个 Footer：

- components/home/HomeFooter.tsx
- components/home/Footer.tsx
- components/footer.tsx

请全部检查。

## 三、修复 robots / SEO 冲突

检查并修复：

- app/layout.tsx
- metadata 配置
- 页面级 robots
- robots.txt / sitemap 相关配置

要求：

- 首页、定价页、功能页允许 index
- login/admin 等私密页面 noindex
- 不得同时出现 noindex 和 index 的冲突
- 不得保留虚假硬编码 aggregateRating 评分，如存在请删除或改成安全合理的结构化数据

## 四、安全响应头加固

检查并修复：

- next.config.* 或 middleware

至少配置：

- Content-Security-Policy
- X-Frame-Options 或 CSP frame-ancestors
- X-Content-Type-Options: nosniff
- Referrer-Policy
- Permissions-Policy
- Strict-Transport-Security 生产环境
- 关闭 X-Powered-By

要求：

- CSP 不要误杀现有必要服务，包括本站资源、Supabase、支付、Dify/LLM 接口、图片、样式、字体等
- 不要使用过度宽松的 default-src *
- 如果必须保留 unsafe-inline，请说明原因

## 五、CORS 不能全开

检查所有 API route，重点：

- 作文批改
- AI 对话
- 支付创建
- 管理后台
- 用户积分
- 上传
- Dify / LLM 代理接口

要求：

- 不允许高成本/敏感接口返回 Access-Control-Allow-Origin: *
- 建立或复用统一 CORS 白名单工具
- 白名单至少支持：
  - https://shenxiang.school
  - https://www.shenxiang.school
  - localhost 开发环境
- 非白名单 Origin 不应获得授权跨域头
- OPTIONS 预检不能破坏正常前端请求

## 六、高风险 POST API 加限流

建立或复用：

- lib/rate-limit.ts

优先覆盖：

- 登录认证
- 管理后台登录
- 支付创建
- AI 对话
- 作文批改
- 上传
- 用户反馈
- 邀请/兑换/积分变动相关接口

建议规则：

- 普通 POST：30 次/分钟/IP
- 登录/认证：10 次/分钟/IP
- 支付：10 次/分钟/IP
- AI 批改/对话：按成本可更严格

要求：

- 超限返回 429
- 返回 JSON 格式，前端可处理
- 不要只写工具函数，必须在 route 中实际调用

## 七、管理后台鉴权风险修复

检查：

- lib/admin-auth.ts
- /api/admin/auth
- /api/admin/*
- /admin 页面

要求：

- 所有 /api/admin/* 必须服务端校验 Authorization
- 无 token 或错 token 返回 401/403
- 密码来自环境变量，不应长期依赖生产默认硬编码密码
- 不得把 admin 密码放进客户端 bundle
- 不要破坏现有管理后台功能

## 八、TypeScript / 构建配置不能掩耳盗铃

检查：

- next.config.*

要求：

- 原则上关闭 typescript.ignoreBuildErrors
- 原则上关闭 eslint.ignoreDuringBuilds
- 如果暂时无法关闭，必须在报告中列出具体阻塞错误和后续修复建议
- 不允许为了构建通过删除核心功能

---

# 最终交付格式

完成 Sprint 0 + Sprint 1 后，请停止，不要继续下一阶段。

请用中文提交报告，必须包含：

## 1. Sprint 0 基线结果

- 分支
- git status 初始状态
- 初始构建结果
- 发现的关键文件和风险点

## 2. Sprint 1 修改摘要

- 按上述 8 个模块逐条说明完成情况
- 每项列出修改文件
- 每项列出是否完成：完成 / 部分完成 / 未完成

## 3. 验证结果

- 实际运行过的命令
- 命令输出摘要
- 构建是否通过
- 如启动过本地服务，列出页面/API 验证结果

## 4. Git 改动

- git status
- git diff --stat
- 重要 diff 摘要

## 5. 风险和未完成项

- 有哪些无法完成
- 有哪些需要 Hermes 决策
- 有哪些可能影响生产

## 6. 明确停止语

最后一行必须写：

“已完成 Sprint 0 + Sprint 1，等待 Hermes 验收，不会继续下一 Sprint。”
