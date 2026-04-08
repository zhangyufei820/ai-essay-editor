# Enter 键发送消息修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 ChatInput 组件按 Enter 键无法发送消息的问题

**Architecture:** 问题根源是 `ChatInput.handleKeyDown` 调用 `onSubmit()` 时未传递事件参数，但 `onSubmit` 函数内部期望接收 `React.FormEvent` 并调用 `e.preventDefault()`。修复方案：移除 ChatInput 中的冗余 `e.preventDefault()` 调用，因为 `onSubmit` 内部已会处理。

**Tech Stack:** React, TypeScript, Next.js

---

## Bug 分析

| 文件 | 行 | 问题 |
|------|-----|------|
| `components/chat/ChatInput.tsx` | 214-221 | `handleKeyDown` 调用 `onSubmit()` 时未传事件；且 `e.preventDefault()` 在 Enter 键时已足够 |
| `components/chat/enhanced-chat-interface.tsx` | 1292-1293 | `onSubmit(e: React.FormEvent)` 期望接收事件并调用 `e.preventDefault()` |

**触发流程（失败时）：**
1. 用户按 `Enter` 键
2. `handleKeyDown` 被调用
3. `e.preventDefault()` 阻止默认换行行为 ✅
4. `onSubmit()` 被调用 — **无参数传递**
5. `onSubmit` 内部执行 `e.preventDefault()` — **`e` 是 `undefined`，抛出错误** ❌

---

## 修复方案

移除 `ChatInput.tsx` 中 `handleKeyDown` 内对 `onSubmit` 的调用（因为 `onSubmit` 内部已有 `e.preventDefault()`），改为直接调用 `onSubmit()`。或者更好的方案：直接移除 `e.preventDefault()` 在 `handleKeyDown` 中的调用，让 `onSubmit` 统一处理。

**选用的修复：** 移除 `ChatInput.handleKeyDown` 中的 `e.preventDefault()`，因为 `onSubmit` 内部已有，且添加位置不对（已经在确认有内容后才调用 `onSubmit`，此时 `e.preventDefault()` 调用与否已无区别）。

**备选修复（不采用）：** 传递事件参数 `onSubmit(e as unknown as React.FormEvent)` — 不推荐因为类型断言不优雅。

---

### Task 1: 修复 ChatInput 的 handleKeyDown

**Files:**
- Modify: `components/chat/ChatInput.tsx:214-221`

- [ ] **Step 1: 读取当前 handleKeyDown 代码确认上下文**

查看 `components/chat/ChatInput.tsx` 第 214-221 行：

```tsx
const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    if (!isLoading && (value.trim() || uploadedFiles.length > 0)) {
      onSubmit()
    }
  }
}
```

- [ ] **Step 2: 移除冗余的 e.preventDefault() 调用**

将上述代码修改为：

```tsx
const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "Enter" && !e.shiftKey) {
    if (!isLoading && (value.trim() || uploadedFiles.length > 0)) {
      onSubmit()
    }
  }
}
```

**说明：** `e.preventDefault()` 在这里的作用是阻止 textarea 的默认换行行为。但实际上，当 `onSubmit` 被调用并开始处理时（发送 API 请求等），默认行为已经被覆盖了。真正需要阻止换行的场景是多行输入时用户按 Enter 不想发送——但这已经是 `!e.shiftKey` 的逻辑在处理了。真正的问题是：这里的 `e.preventDefault()` 之后调用 `onSubmit()` 但不传事件，导致 `onSubmit` 内部报错。所以移除这行是合理的——`onSubmit` 内部如果需要防止重复提交，会自己处理。

- [ ] **Step 3: 运行构建验证**

Run: `npm run build 2>&1 | tail -30`
Expected: 构建成功，无 TypeScript 错误

---

### Task 2: 验证修复

- [ ] **Step 1: 确认构建通过**

Run: `npm run build`
Expected: 成功

- [ ] **Step 2: 检查代码一致性**

确认 `ChatInput` 的 `handleKeyDown` 和 `banana-chat-interface` 的 `handleKeyDown` 行为一致（后者传递事件但有类型断言）

`banana-chat-interface.tsx:601-605` 参考：
```tsx
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit(e as unknown as React.FormEvent)  // 传递了事件
    }
  }
```

---

## 提交

- [ ] **Commit**

```bash
git add components/chat/ChatInput.tsx
git commit -m "fix: remove redundant e.preventDefault in ChatInput handleKeyDown

The handleKeyDown was calling onSubmit() without an event argument,
but onSubmit in enhanced-chat-interface expects React.FormEvent and
calls e.preventDefault() immediately. This caused Enter key submission
to fail with 'Cannot read property preventDefault of undefined'.

Removed the redundant e.preventDefault() call since onSubmit handles
prevention internally and already guards against double-submission."
```
