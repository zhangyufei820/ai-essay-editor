# 网站功能测试指南

## 快速开始

访问测试页面: `/test`

这个测试中心提供了完整的功能测试工具,帮助您验证网站的所有核心功能。

---

## 测试分类

### 1. API端点测试

**可立即测试的功能:**
- ✅ `/api/chat` - AI聊天对话
- ✅ `/api/essay-review` - 作文批改
- ✅ `/api/providers` - AI提供商列表
- ✅ `/api/web-search` - 网络搜索
- ✅ `/api/document-process` - 文档处理

**测试方法:**
1. 在测试输入框中输入测试内容
2. 点击"测试所有端点"或单独测试某个端点
3. 查看响应状态和响应时间

**预期结果:**
- 所有端点应返回200状态码
- 响应时间应在合理范围内(< 5秒)

---

### 2. 认证功能测试

#### 邮箱注册/登录 ✅ 可立即测试
- 访问: `/auth/sign-up` 或 `/auth/login`
- 使用真实邮箱地址注册
- 检查邮箱确认邮件
- 点击确认链接激活账户

#### 手机号验证码登录 ⚠️ 需要配置
- 访问: `/auth/phone-login`
- **需要的环境变量:**
  \`\`\`
  SMS_PROVIDER=aliyun
  SMS_ACCESS_KEY_ID=你的AccessKey
  SMS_ACCESS_KEY_SECRET=你的Secret
  \`\`\`
- **配置步骤:**
  1. 访问[阿里云短信服务](https://dysms.console.aliyun.com/)
  2. 开通短信服务并创建签名和模板
  3. 获取AccessKey并添加到环境变量

#### 微信OAuth登录 ⚠️ 需要配置
- 访问: `/auth/wechat-login`
- **需要的环境变量:**
  \`\`\`
  WECHAT_APP_ID=你的微信AppID
  WECHAT_APP_SECRET=你的微信AppSecret
  NEXT_PUBLIC_WECHAT_REDIRECT_URI=https://你的域名/api/auth/wechat/callback
  \`\`\`
- **配置步骤:**
  1. 访问[微信开放平台](https://open.weixin.qq.com/)
  2. 注册并完成企业认证(费用300元/年)
  3. 创建网站应用并获取AppID和AppSecret

---

### 3. 支付功能测试

#### Stripe支付 ✅ 可立即测试
- 访问: `/checkout/standard`
- 使用Stripe测试卡号: `4242 4242 4242 4242`
- 过期日期: 任意未来日期
- CVC: 任意3位数字

#### 支付宝支付 ⚠️ 需要配置
- **需要的环境变量:**
  \`\`\`
  ALIPAY_APP_ID=你的支付宝AppID
  ALIPAY_PRIVATE_KEY=你的应用私钥
  ALIPAY_PUBLIC_KEY=支付宝公钥
  \`\`\`
- **配置步骤:**
  1. 访问[支付宝开放平台](https://open.alipay.com/)
  2. 注册并完成企业认证
  3. 创建网页&移动应用
  4. 生成应用公私钥对
  5. 上传应用公钥,获取支付宝公钥

#### 微信支付 ⚠️ 需要配置
- **需要的环境变量:**
  \`\`\`
  WECHAT_PAY_MCH_ID=你的商户号
  WECHAT_PAY_API_KEY=你的APIv3密钥
  \`\`\`
- **配置步骤:**
  1. 访问[微信支付商户平台](https://pay.weixin.qq.com/)
  2. 注册商户账号(需要企业资质)
  3. 开通Native支付产品
  4. 在API安全中设置API密钥

---

### 4. AI提供商测试

**可立即测试的提供商:**
- ✅ OpenAI GPT-5
- ✅ Anthropic Claude Sonnet 4.5
- ✅ xAI Grok 4
- ✅ Google Gemini 2.5 Flash
- ✅ Fireworks AI Llama 4 70B

**测试方法:**
1. 输入测试提示词
2. 点击"测试所有提供商"
3. 对比不同提供商的响应速度和质量

**预期结果:**
- 所有提供商应成功返回响应
- 响应时间应在1-5秒之间
- 响应内容应符合提示词要求

---

## 数据库测试

### 运行SQL脚本

项目包含以下数据库脚本:

1. `scripts/001_create_profiles.sql` - 创建用户资料表
2. `scripts/002_profile_trigger.sql` - 创建自动触发器
3. `scripts/003_add_wechat_fields.sql` - 添加微信字段
4. `scripts/004_create_orders_table.sql` - 创建订单表

**运行方法:**
- 在v0界面中,脚本会自动执行
- 或者在Supabase控制台的SQL编辑器中手动运行

---

## 常见问题

### Q: 为什么某些功能显示"需要配置"?
A: 这些功能需要第三方服务的API密钥。您需要在相应平台申请账号并配置环境变量。

### Q: 如何添加环境变量?
A: 在v0界面的侧边栏中,点击"Vars"选项,然后添加所需的环境变量。

### Q: 测试时遇到错误怎么办?
A: 
1. 检查浏览器控制台的错误信息
2. 确认环境变量配置正确
3. 检查API密钥是否有效
4. 查看网络请求的详细信息

### Q: 可以在本地环境测试吗?
A: 可以。克隆项目后:
1. 复制`.env.example`为`.env.local`
2. 填写必要的环境变量
3. 运行`npm install`和`npm run dev`
4. 访问`http://localhost:3000/test`

---

## 测试检查清单

### 基础功能 (无需配置)
- [ ] 首页正常加载
- [ ] AI聊天功能正常
- [ ] 作文批改功能正常
- [ ] AI提供商列表正常
- [ ] 邮箱注册/登录正常
- [ ] Stripe支付测试通过

### 高级功能 (需要配置)
- [ ] 手机号验证码登录
- [ ] 微信OAuth登录
- [ ] 支付宝支付
- [ ] 微信支付
- [ ] 短信发送功能
- [ ] 文档OCR处理

---

## 性能基准

### API响应时间
- 聊天API: < 3秒
- 作文批改: < 10秒
- 文档处理: < 15秒
- 支付创建: < 2秒

### 页面加载时间
- 首页: < 2秒
- 聊天页面: < 1秒
- 支付页面: < 2秒

---

## 联系支持

如果测试过程中遇到问题:
1. 查看浏览器控制台错误
2. 检查网络请求详情
3. 访问[Vercel支持](https://vercel.com/help)获取帮助
