# Vercel 环境变量配置与部署指南

## ⚠️ 重要提示

**配置环境变量后必须重新部署才能生效！**

## 📋 当前问题

根据截图显示，Vercel 中已经配置了 Suno 环境变量：
- ✅ `SUNO_API_BASE_URL` = `http://43.154.111.156/v1`
- ✅ `SUNO_GENERATE_API_KEY` = `app-aUM5wY1ACN5M0zHkMdijZCcC`
- ✅ `SUNO_QUERY_API_KEY` = `app-XenDdavZwSjiEHd2SyiTfECc`

但仍然出现 "Suno API 错误: 400"，原因是：**环境变量配置后没有重新部署**。

## 🚀 解决步骤

### 方法一：通过 Vercel Dashboard 重新部署

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 进入项目 `ai-essay-editor`
3. 点击顶部的 **"Deployments"** 标签
4. 找到最新的部署记录
5. 点击右侧的 **"..."** 菜单
6. 选择 **"Redeploy"**（重新部署）
7. 确认重新部署

### 方法二：通过 Git 推送触发部署

```bash
# 在项目根目录执行
git commit --allow-empty -m "触发 Vercel 重新部署"
git push origin main
```

### 方法三：通过 Vercel CLI 部署

```bash
# 安装 Vercel CLI（如果还没安装）
npm i -g vercel

# 登录
vercel login

# 部署到生产环境
vercel --prod
```

## ✅ 验证部署成功

部署完成后（通常需要 1-3 分钟），访问生产环境：

1. 打开 https://www.shenxiang.school
2. 登录账号
3. 选择 **Suno V5** 模型
4. 输入音乐生成提示词，例如："创作一首欢快的新年歌曲"
5. 点击发送

**预期结果**：
- ✅ 不再出现 "Suno API 错误: 400"
- ✅ 显示 "正在生成音乐..."
- ✅ 返回任务 ID 和音乐卡片
- ✅ 音乐生成完成后可以播放

## 🔍 检查环境变量是否生效

### 方法一：查看 Vercel 部署日志

1. 进入 Vercel Dashboard → Deployments
2. 点击最新的部署记录
3. 查看 **"Build Logs"**
4. 搜索 "SUNO" 关键词
5. 确认环境变量已加载

### 方法二：添加调试日志

在 `app/api/suno/route.ts` 中添加日志（已存在）：

```typescript
console.log('🎵 [Suno Config] BASE_URL:', SUNO_BASE_URL)
console.log('🎵 [Suno Config] GENERATE_KEY:', SUNO_GENERATE_API_KEY?.slice(0, 10) + '...')
console.log('🎵 [Suno Config] QUERY_KEY:', SUNO_QUERY_API_KEY?.slice(0, 10) + '...')
```

然后在 Vercel Dashboard → Functions → Logs 中查看实时日志。

## 📝 环境变量配置清单

确保以下环境变量都已在 Vercel 中配置：

### Suno 音乐生成（必需）
- [x] `SUNO_API_BASE_URL` = `http://43.154.111.156/v1`
- [x] `SUNO_GENERATE_API_KEY` = `app-aUM5wY1ACN5M0zHkMdijZCcC`
- [x] `SUNO_QUERY_API_KEY` = `app-XenDdavZwSjiEHd2SyiTfECc`

### Supabase 数据库（必需）
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

### Dify AI（必需）
- [ ] `DIFY_API_KEY`
- [ ] `DIFY_BASE_URL`
- [ ] `DIFY_API_KEY_GPT5`
- [ ] `DIFY_API_KEY_CLAUDE`
- [ ] `DIFY_API_KEY_GEMINI`
- [ ] `DIFY_TEACHING_PRO_API_KEY`
- [ ] `DIFY_BANANA_API_KEY`
- [ ] `ESSAY_CORRECTION_API_KEY`
- [ ] `ESSAY_CORRECTION_BASE_URL`

### 支付系统（可选）
- [ ] `XUNHUPAY_APPID`
- [ ] `XUNHUPAY_APPSECRET`
- [ ] `XUNHUPAY_API_URL`

### 腾讯云 COS（可选）
- [ ] `TENCENT_COS_SECRET_ID`
- [ ] `TENCENT_COS_SECRET_KEY`
- [ ] `TENCENT_COS_BUCKET`
- [ ] `TENCENT_COS_REGION`
- [ ] `TENCENT_COS_CDN_DOMAIN`
- [ ] `NEXT_PUBLIC_CDN_URL`

## 🚨 常见问题

### Q1: 为什么配置环境变量后还是报错？
**A**: 必须重新部署！环境变量只在构建时注入，修改后需要触发新的部署。

### Q2: 如何确认环境变量已生效？
**A**: 查看 Vercel 部署日志，或在 API 中添加 console.log 输出到 Functions Logs。

### Q3: 本地开发环境正常，生产环境报错？
**A**: 检查 Vercel 环境变量是否与 `.env.local` 一致，确保所有必需的变量都已配置。

### Q4: 重新部署需要多久？
**A**: 通常 1-3 分钟，可以在 Vercel Dashboard 查看部署进度。

## 📞 技术支持

如果按照以上步骤操作后仍然有问题，请提供：
1. Vercel 部署日志截图
2. 浏览器控制台错误信息
3. Vercel Functions Logs 截图

---

**最后更新**: 2026/1/11
**文档版本**: 1.0
