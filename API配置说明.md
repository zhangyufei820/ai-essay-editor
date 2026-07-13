# API 配置说明

## 聚合 API 配置

服务端通过环境变量读取聚合 API 配置。真实密钥不得写入仓库、文档、测试、日志或前端环境变量。

```dotenv
CUSTOM_OPENAI_API_KEY=<set-in-server-secret-manager>
CUSTOM_OPENAI_BASE_URL=https://www.vivaapi.cn/v1
```

配置要求：

1. 仅在本地 `.env.local` 或生产环境的密钥管理界面填写真实值。
2. 不得使用 `NEXT_PUBLIC_` 前缀保存服务端密钥。
3. 轮换密钥后重新构建并部署应用。
4. 运行 `npm run security:secrets`，确认仓库中没有疑似凭据。
5. 通过服务端健康检查或最小模型请求验证配置，不得在输出中打印密钥。

当前代码使用的请求地址为 `${CUSTOM_OPENAI_BASE_URL}/chat/completions`。
