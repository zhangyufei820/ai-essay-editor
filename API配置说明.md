# API配置说明

## 聚合API配置（当前使用）

您的聚合API服务：**vivaapi.cn**

### 环境变量配置

请在 Vercel 项目的环境变量中添加以下配置：

\`\`\`
CUSTOM_OPENAI_API_KEY=sk-diaycftqfopXhIAf5gm7G35xSndFo0VzMi0PyRpHQGz4voxG......
CUSTOM_OPENAI_BASE_URL=https://www.vivaapi.cn/v1
\`\`\`

### 配置步骤

1. 登录 Vercel Dashboard
2. 进入您的项目
3. 点击 Settings → Environment Variables
4. 添加上述两个环境变量
5. 重新部署项目

### 如何在 v0 中添加环境变量

1. 点击聊天界面左侧的侧边栏
2. 选择 "Vars"（变量）选项
3. 点击 "Add Variable"（添加变量）
4. 依次添加：
   - 变量名：`CUSTOM_OPENAI_API_KEY`
   - 值：`sk-diaycftqfopXhIAf5gm7G35xSndFo0VzMi0PyRpHQGz4voxG......`
   
   - 变量名：`CUSTOM_OPENAI_BASE_URL`
   - 值：`https://www.vivaapi.cn/v1`

5. 保存后重新部署

### 验证配置

配置完成后，系统会自动使用您的聚合API密钥。您可以在聊天界面发送消息测试。

### 支持的模型

通过 vivaapi 聚合服务，您可以使用：
- GPT-4o
- GPT-4o-mini
- GPT-4
- GPT-3.5-turbo
- Claude 系列
- 其他聚合服务支持的模型

系统会自动将请求发送到 `https://www.vivaapi.cn/v1/chat/completions`
