# 部署指南

## 当前状态

✅ **已完成的功能**
- 响应式落地页（首页、功能介绍、定价）
- AI聊天界面（支持8家AI提供商）
- 文件上传（图片、PDF、Word）
- 作文批改系统（12位文学大师风格 + 徐贲式论述文）
- 用户认证系统（邮箱、手机号、微信登录）
- 支付系统（Stripe、支付宝、微信支付）
- 数据持久化（聊天记录、文件存储、作文批改记录）
- 测试工具页面

## 立即可用的功能

以下功能无需额外配置即可使用：

1. **落地页展示** - 完全可用
2. **邮箱注册登录** - 使用Supabase Auth（已配置）
3. **AI聊天** - 使用Vercel AI Gateway（已配置）
   - OpenAI GPT系列
   - Anthropic Claude系列
   - xAI Grok（已配置）
   - Google Gemini
   - Fireworks AI
4. **Stripe支付** - 已配置（测试模式）
5. **数据存储** - Supabase数据库（已配置）

## 需要配置的功能

### 1. 手机号验证码登录

**需要配置：**
- 短信服务商API（阿里云或腾讯云）

**环境变量：**
\`\`\`
SMS_PROVIDER=aliyun
SMS_ACCESS_KEY_ID=你的AccessKey
SMS_ACCESS_KEY_SECRET=你的Secret
SMS_SIGN_NAME=你的短信签名
SMS_TEMPLATE_CODE=你的模板代码
\`\`\`

**不配置的影响：** 用户无法使用手机号登录，但可以使用邮箱登录

---

### 2. 微信登录

**需要配置：**
- 微信开放平台企业认证（300元/年）
- 创建网站应用

**环境变量：**
\`\`\`
WECHAT_APP_ID=你的AppID
WECHAT_APP_SECRET=你的AppSecret
NEXT_PUBLIC_WECHAT_REDIRECT_URI=https://你的域名/api/auth/wechat/callback
\`\`\`

**不配置的影响：** 用户无法使用微信登录，但可以使用邮箱登录

---

### 3. 支付宝支付

**需要配置：**
- 支付宝开放平台企业认证
- 创建网页应用
- 生成应用密钥对

**环境变量：**
\`\`\`
ALIPAY_APP_ID=你的AppID
ALIPAY_PRIVATE_KEY=你的应用私钥
ALIPAY_PUBLIC_KEY=支付宝公钥
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
\`\`\`

**不配置的影响：** 用户无法使用支付宝支付，但可以使用Stripe支付

---

### 4. 微信支付

**需要配置：**
- 微信支付商户平台认证
- 开通Native支付
- 配置API密钥和证书

**环境变量：**
\`\`\`
WECHAT_PAY_MCH_ID=你的商户号
WECHAT_PAY_API_KEY=你的APIv3密钥
WECHAT_PAY_SERIAL_NO=证书序列号
\`\`\`

**不配置的影响：** 用户无法使用微信支付，但可以使用Stripe支付

---

### 5. 文件存储（可选升级）

**当前状态：** 使用Vercel Blob（已配置，有免费额度）

**可选升级：** Supabase Storage（更大存储空间）

**环境变量：**
\`\`\`
NEXT_PUBLIC_SUPABASE_URL=已配置
SUPABASE_SERVICE_ROLE_KEY=已配置
\`\`\`

---

## 部署步骤

### 方案A：最小配置部署（推荐快速上线）

**可用功能：**
- 落地页展示
- 邮箱注册登录
- AI聊天和作文批改
- Stripe支付（国际支付）
- 数据存储

**步骤：**
1. 点击v0界面右上角的"Publish"按钮
2. 选择部署到Vercel
3. 确认环境变量（Supabase、Stripe、Grok已自动配置）
4. 等待部署完成
5. 访问生成的域名

**优点：** 无需额外配置，立即可用  
**缺点：** 缺少中国本地支付方式

---

### 方案B：完整功能部署（推荐中国用户）

**额外配置：**
1. 申请短信服务商（1-3天）
2. 申请微信开放平台（3-7天）
3. 申请支付宝开放平台（3-7天）
4. 申请微信支付商户（7-15天）

**步骤：**
1. 先按方案A部署基础版本
2. 逐步申请和配置第三方服务
3. 在Vercel项目设置中添加环境变量
4. 重新部署

---

## 数据库初始化

部署后需要运行SQL脚本初始化数据库：

1. 访问 Supabase 控制台
2. 进入 SQL Editor
3. 按顺序执行以下脚本：
   - `scripts/001_create_profiles.sql` - 创建用户资料表
   - `scripts/002_profile_trigger.sql` - 创建自动触发器
   - `scripts/003_add_wechat_fields.sql` - 添加微信字段
   - `scripts/004_create_orders_table.sql` - 创建订单表
   - `scripts/005_create_chat_tables.sql` - 创建聊天记录表

或者在v0中点击"Run Script"按钮自动执行。

---

## 域名配置

### 使用Vercel默认域名
- 格式：`your-project.vercel.app`
- 自动配置HTTPS
- 无需额外设置

### 使用自定义域名
1. 在Vercel项目设置中添加域名
2. 在域名服务商处添加DNS记录
3. 等待DNS生效（通常几分钟到24小时）
4. 更新环境变量中的回调URL

---

## 测试清单

部署后访问 `/test` 页面进行功能测试：

- [ ] 首页加载正常
- [ ] 用户注册和登录
- [ ] AI聊天功能
- [ ] 文件上传
- [ ] 作文批改
- [ ] 支付流程（测试模式）
- [ ] 历史记录查看

---

## 监控和维护

### 日志查看
- Vercel Dashboard → 项目 → Logs
- 查看实时请求和错误日志

### 数据库监控
- Supabase Dashboard → 项目 → Database
- 查看表数据和查询性能

### 支付监控
- Stripe Dashboard → Payments
- 查看交易记录和退款

---

## 常见问题

**Q: 部署后AI聊天不工作？**  
A: 检查Vercel AI Gateway配置，确保API密钥正确

**Q: 用户注册后收不到确认邮件？**  
A: 检查Supabase邮件设置，可能需要配置SMTP

**Q: 支付回调失败？**  
A: 确保回调URL配置正确，且服务器可以接收POST请求

**Q: 文件上传失败？**  
A: 检查Vercel Blob配额，免费版有存储限制

---

## 成本估算

### 免费额度（足够测试和小规模使用）
- Vercel: 免费版（100GB带宽/月）
- Supabase: 免费版（500MB数据库，1GB文件存储）
- Vercel Blob: 免费版（500MB存储）
- Vercel AI Gateway: 按使用量计费

### 付费升级（生产环境推荐）
- Vercel Pro: $20/月
- Supabase Pro: $25/月
- 短信服务: 约0.05元/条
- 微信开放平台: 300元/年
- 支付手续费: 0.6%-2%

---

## 下一步

1. **立即部署** - 使用方案A快速上线
2. **测试功能** - 访问 `/test` 页面
3. **收集反馈** - 邀请用户试用
4. **逐步完善** - 根据需求添加支付方式
5. **监控优化** - 查看日志和性能数据

---

## 技术支持

- v0文档: https://v0.dev/docs
- Vercel文档: https://vercel.com/docs
- Supabase文档: https://supabase.com/docs
- Next.js文档: https://nextjs.org/docs

祝您部署顺利！🚀
