# New API Classic Theme Only

本文件是 New API 前端维护强制规则。

## 结论

New API 生产 UI 只维护 `classic` 主题。

除非用户明确提出并确认切换方案、回滚方案和验证范围，否则不要维护、同步、优化或修复 `default` 主题。

## 必须遵守

1. 首页、控制台、媒体工坊、钱包、导航、文档入口等用户可见 UI 改动，默认只改：

   ```text
   services/shenxiang-new-api/src-patch/web/classic/**
   ```

2. 不要为了“主题一致性”把同一改动复制到：

   ```text
   services/shenxiang-new-api/src-patch/web/default/**
   ```

3. 任何 New API 首页任务，先检查 `classic` 首页：

   ```text
   services/shenxiang-new-api/src-patch/web/classic/src/pages/Home/index.jsx
   services/shenxiang-new-api/src-patch/web/classic/src/index.css
   ```

4. 部署验证必须确认运行主题是 `classic`：

   ```bash
   curl -fsS http://127.0.0.1:3120/api/status
   curl -fsS https://api.aiphui.top/api/status
   ```

   期望响应包含：

   ```json
   "theme":"classic"
   ```

5. 如果发现公网加载了 `default` 主题，先修正运行时主题和部署基线，不要转头维护 `default`。

## 禁止事项

- 禁止在没有用户明确确认时把生产主题切到 `default`。
- 禁止用“两个主题都改一遍”替代主题边界判断。
- 禁止把 `default` 当作当前产品的长期维护面。
- 禁止因为 `default` 页面表现异常而偏离本文件，除非用户明确要求处理 `default` 本身。

## 例外流程

只有当用户明确说“切换到 default”或“这次维护 default”时，才允许触碰 `default`。执行前必须先说明：

- 为什么需要切换或维护 `default`。
- 会影响哪些页面和构建产物。
- 如何回滚到 `classic`。
- 如何验证公网实际主题。

没有以上确认，继续按 `classic` 执行。
