# 网站性能基线与优化闭环

更新时间：2026-05-14

## 当前线上基线

采样方式：本机 Node `fetch` 请求 `https://shenxiang.school`，单次采样，记录响应体大小和总耗时。

| 页面 / API | 状态 | 响应大小 | 总耗时 |
|---|---:|---:|---:|
| `/` | 200 | 19,207 B | 0.543s |
| `/chat` | 200 | 16,743 B | 0.171s |
| `/chat/gemini-image` | 200 | 16,970 B | 0.193s |
| `/lab` | 200 | 270,504 B | 0.274s |
| `/pricing` | 200 | 45,229 B | 0.188s |
| `/admin` | 200 | 18,418 B | 0.170s |
| `/worksheet-diagnosis` | 200 | 32,169 B | 0.208s |
| `/api/health` | 200 | 127 B | 0.164s |

服务器本机健康检查：`http://127.0.0.1:3000/api/health` 返回 200，总耗时约 `0.007s`。

## 自检命令

```bash
npm run perf:baseline
npm run perf:baseline -- --base-url=https://shenxiang.school --iterations=3
npm run perf:baseline -- --base-url=http://127.0.0.1:3000 --routes=/,/chat,/lab,/api/health --iterations=5
```

输出为 Markdown 表格，可直接贴入周报或运维记录。

## 模块级优化方向

| 模块 | 当前观察 | 优化方向 |
|---|---|---|
| 首页 `/` | 首屏 HTML 不大，非首屏区块较多 | 保持动态导入；继续检查首屏图片和动画 JS |
| 聊天 `/chat` | 响应较轻，主要成本在客户端聊天组件和 Dify 流式链路 | 维持 `ssr:false` 的重组件加载；监控首包和流式断连 |
| Gemini 图像 `/chat/gemini-image` | 页面响应轻，实际耗时在图片网关和生成任务 | 重点看网关排队、图片代理缓存、失败重试和积分扣费链路 |
| PhET `/lab` | 响应体最大，目录卡片和实验数据容易进入首包 | 已将实验浏览器改为客户端延迟加载；后续可按分页或 API 拉取进一步压缩 |
| 价格页 `/pricing` | 中等体积 | 检查会员状态接口缓存和重复请求 |
| 后台 `/admin` | 未登录首包较轻 | 登录后关注用户/订单列表分页和 Supabase 查询 |
| 试卷诊断 `/worksheet-diagnosis` | 响应适中，重在上传和诊断耗时 | 监控上传压缩、图片代理和 Dify 超时 |
| `/api/health` | 轻量正常 | 接外部可用性监控，1-5 分钟一次 |

## 性能阈值建议

| 指标 | 目标 | 告警线 |
|---|---:|---:|
| `/api/health` 公网总耗时 | < 1s | 连续 3 次 > 3s 或非 200 |
| 关键页面 HTML 响应 | < 1s | 连续 3 次 > 3s |
| `/lab` HTML 大小 | < 80KB | > 150KB 需复查首包数据 |
| 图片网关任务创建 | < 2s | > 5s 或失败率升高 |
| Dify 首个流式 token | < 5s | > 10s |

## 优化发布流程

1. 先采样线上基线：`npm run perf:baseline -- --iterations=3`。
2. 每次只优化一个模块。
3. 本地跑 `npm run lint`、相关 Jest、`npm run build`。
4. 部署后重新采样同一批路径。
5. 如果响应变慢或错误率升高，回滚该小批次。

## 外部可用性监控

优先接入 `/api/health`：

- URL: `https://shenxiang.school/api/health`
- 频率: 1-5 分钟
- 超时: 10 秒
- 告警条件: HTTP 非 200、返回体不包含 `"ok"`、连续 2-3 次失败
- 告警对象: 站长、技术负责人、值班群

当前阶段先按 SOP 落地，不在服务器新增监控容器。后续如要接 Uptime Kuma、Sentry 或 Better Stack，先出端口和数据留存评估。
