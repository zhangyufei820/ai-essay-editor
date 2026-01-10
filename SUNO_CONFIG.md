# Suno V5 音乐生成配置指南

## 📋 问题描述

如果遇到 "Suno API 错误: 400" 错误，说明 Suno API 配置缺失或不正确。

## ✅ 解决方案

### 1. 本地开发环境配置

在项目根目录的 `.env.local` 文件中添加以下配置：

```bash
# 🎵 Suno V5 音乐生成配置
SUNO_API_BASE_URL=http://43.154.111.156/v1
SUNO_GENERATE_API_KEY=app-aUM5wY1ACN5M0zHkMdijZCcC
SUNO_QUERY_API_KEY=app-XenDdavZwSjiEHd2SyiTfECc
```

### 2. Vercel 生产环境配置

在 Vercel 项目设置中添加环境变量：

1. 进入 Vercel 项目 → Settings → Environment Variables
2. 添加以下三个环境变量：

| 变量名 | 值 |
|--------|-----|
| `SUNO_API_BASE_URL` | `http://43.154.111.156/v1` |
| `SUNO_GENERATE_API_KEY` | `app-aUM5wY1ACN5M0zHkMdijZCcC` |
| `SUNO_QUERY_API_KEY` | `app-XenDdavZwSjiEHd2SyiTfECc` |

3. 选择环境：Production, Preview, Development（全选）
4. 点击 Save
5. 重新部署项目

### 3. 验证配置

配置完成后，重启开发服务器或重新部署：

```bash
# 本地开发
npm run dev

# 或者
pnpm dev
```

然后访问 Suno V5 模型，测试音乐生成功能。

## 🔍 配置说明

- **SUNO_API_BASE_URL**: Suno API 的基础 URL
- **SUNO_GENERATE_API_KEY**: 用于提交音乐生成任务的 API Key（Agent A）
- **SUNO_QUERY_API_KEY**: 用于查询任务状态的 API Key（Agent B）

## 📝 相关文件

- `lib/suno-config.ts` - Suno 配置常量
- `lib/suno-service.ts` - Suno 服务层
- `app/api/suno/route.ts` - Suno API 代理
- `components/chat/enhanced-chat-interface.tsx` - 聊天界面（包含 Suno 集成）

## 🚨 注意事项

1. **安全性**: `.env.local` 文件已被 `.gitignore` 忽略，不会提交到 Git 仓库
2. **环境隔离**: 本地和生产环境需要分别配置
3. **重启服务**: 修改环境变量后需要重启开发服务器或重新部署

## ✅ 完成标志

配置成功后，使用 Suno V5 模型生成音乐时：
- 不再出现 400 错误
- 能够正常提交音乐生成任务
- 能够查询任务状态并播放音乐

---

**最后更新**: 2026/1/11
