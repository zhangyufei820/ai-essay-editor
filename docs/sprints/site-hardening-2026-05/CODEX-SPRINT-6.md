# CODEX Sprint 6 — 发布前增长转化与体验打磨（不推送、不部署）

## 背景
项目：shenxiang.school / ai-essay-editor
路径：/Users/aixingren/ai-essay-editor
技术栈：Next.js 16、TypeScript、Tailwind CSS、Supabase。

Sprint 0/1 到 Sprint 5 已经由 Hermes 验收并本地提交：
- 0d3b445 chore: harden site through sprint 5

本 Sprint 继续在本地工作区执行。不要 push，不要部署生产，不要修改 .env.production，不要越过本 Sprint 范围。

## 总目标
在不破坏已通过的安全、支付、积分、会员和运维门禁的前提下，做发布前的“增长转化 + 用户体验”小步优化，让 shenxiang.school 更像一个能投放、能成交、能自解释的正式产品。

优先级：先不破坏，再提升转化。

## 严格范围
允许修改：
- 首页/营销页/定价页/结账页/支付成功页/健康与运维说明页中与文案、CTA、信任感、用户路径有关的代码
- Footer、FAQ、退款/隐私/条款页面中的非敏感说明
- 与上述页面直接相关的组件
- 针对本 Sprint 的测试文件
- docs/sprints/site-hardening-2026-05/CODEX-SPRINT-6.md 或相关归档说明

谨慎修改：
- lib/products.ts 只允许做展示文案/标签类调整，不允许改价格公式和支付金额逻辑
- app/api/payment/*、lib/credits.ts、lib/xunhupay.ts 默认不要改；除非发现明显展示 bug，且必须解释原因

禁止修改：
- .env、.env.local、.env.production 或任何真实密钥文件
- 生产部署脚本里会自动执行部署/push 的逻辑
- Supabase schema / 数据迁移 / 真实线上数据
- .Codex/memory/* 本地记忆文件
- 不要创建新的服务目录、Docker/1Panel 发布包、GitHub workflow、大型重构

## 具体任务

### 1. 首页转化路径检查与微调
检查首页是否满足：
- 首屏清楚告诉用户：这是“AI作文批改/写作提分”工具，不要泛泛而谈
- 首屏有明确 CTA，例如“免费体验批改”、“查看价格”、“开始写作”
- CTA 链接必须指向真实存在且可用的路由
- 不强制登录才能看首页价值
- 不要使用虚假夸张数据、虚假评分、虚假名校背书

如发现 CTA 文案弱、路径不顺、死链接或过度营销，做小步修复。

### 2. 定价与购买路径打磨
检查定价页、产品卡、结账页、支付成功页：
- 价格展示与 lib/products.ts 一致
- 年付折扣/会员权益表达清楚
- 不出现“立即购买”但跳到不存在页面
- 支付成功页清楚告诉用户下一步去哪：查看积分/继续写作/联系客服
- 不改变已验收的支付金额计算与回调逻辑

### 3. 信任与客服入口
检查 Footer、隐私、条款、退款政策、运维/监控文档相关前台入口：
- support@shenxiang.school 客服入口可见
- 隐私、条款、退款政策可访问
- Footer 无 href="#" 死链接
- 不展示真实密钥、连接串、内部后台 token

### 4. SEO/索引安全复核
检查 robots/sitemap/metadata：
- 首页和公开营销页可 index
- admin、login、auth、个人积分/会员等私密页不应进入 sitemap
- sitemap 不应收录后台/登录/支付状态私密路径

### 5. 增加或更新最小回归测试
如果改了页面或组件，补充/更新测试，至少覆盖：
- 关键 CTA 链接存在并指向有效路由
- Footer 无 href="#"
- sitemap 不包含私密路径
- 定价展示的关键产品文案/价格没有脱离产品配置

## 验收命令
Codex 完成后请在报告中列出你实际运行的命令和结果。建议至少运行：

```bash
npm test -- --runInBand
npm run lint
npm run build
```

如果时间原因不能全跑，必须说明原因；但 Hermes 会最终复跑。

## 输出要求
完成后停止，不要进入下一 Sprint。报告必须包含：
1. 修改文件列表
2. 每个修改的目的
3. 是否碰过支付/API/价格核心逻辑
4. 测试/lint/build 结果
5. 风险或需要 Hermes 重点验收的点

## 禁止事项
- 不要 push
- 不要部署生产
- 不要提交 git commit（Hermes 验收后统一提交）
- 不要打印或写入任何真实密钥、token、密码、连接串
- 不要改 .env.production
