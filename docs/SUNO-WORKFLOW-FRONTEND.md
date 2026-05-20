# Suno 服务器网关调用器前端接入

本页面入口：`/suno`

前端只调用本站接口：

```text
POST /api/suno/run
```

浏览器不会携带或看到：

- `DIFY_API_KEY`
- `SUNO_GATEWAY_API_KEY`
- ViVaAPI Token

## 服务端环境变量

```env
DIFY_BASE_URL=https://api.dify.ai/v1
SUNO_DIFY_API_KEY=your_dify_workflow_app_key
DIFY_WORKFLOW_USER=website-user
SUNO_GATEWAY_BASE_URL=http://vivaapi-suno-gateway:8000
SUNO_GATEWAY_API_KEY=your_suno_gateway_key
```

`SUNO_DIFY_API_KEY` 必须填写 Dify Workflow「Suno 服务器网关调用器」应用的 App API Key。不要复用聊天助手、Agent 或文本生成应用的 Key，否则 Dify 会返回“应用模式和接口不匹配”。

Suno 前端不会回退使用默认 `DIFY_API_KEY`。如果没有配置 `SUNO_DIFY_API_KEY`，页面会提示“音乐工作流未配置”，这是为了避免误把聊天应用 Key 发到 Workflow 接口。

自托管 Dify 推荐在服务器内网使用：

```env
DIFY_INTERNAL_URL=http://docker-api-1:5001/v1
```

## 工作流输入

`/api/suno/run` 会把浏览器提交的音乐参数转换为 Dify `inputs`，并自动注入：

```text
gateway_base_url = process.env.SUNO_GATEWAY_BASE_URL
gateway_api_key = process.env.SUNO_GATEWAY_API_KEY
```

布尔值会转为 `"true"` / `"false"`，数字会转为字符串，未使用字段传空字符串。

## 文件上传

包含 `audio_file` 的请求使用 `multipart/form-data` 提交到 `/api/suno/run`。服务端会先调用 Dify `/files/upload`，拿到 `upload_file_id` 后再把文件变量注入 Workflow。

如果 Dify 文件变量格式调整，只需要修改 `lib/suno-dify-client.ts` 的 adapter。

## 页面功能

- 创作歌曲：灵感、自定义、纯音乐
- 续写 / Cover：续写、persona、cover
- 上传音频二创：一键上传并二创、只上传生成 clip_id、已有 clip_id 二创
- 歌词 / 拼接：歌词、concat、stitch submit
- 查询结果：fetch task、batch、wav、timing、feed
- 高级调试：raw、callbacks recent、health

高级 raw 默认隐藏，普通用户不需要手写 `params_json`。

## 计费

`/api/suno/run` 已复用旧版 Suno 的站内积分逻辑：

- 生成类操作会先检查 trial 额度、问卷门禁和真实积分余额。
- Dify 工作流成功返回后扣除 `suno-v5` 的基础音乐生成积分。
- 如果 blocking 响应中带有 Dify usage，会继续记录 `suno_llm_token` 补扣审计。
- 查询、WAV、Timing、Feed、Raw、回调查看等调试/查询类操作不扣费。
