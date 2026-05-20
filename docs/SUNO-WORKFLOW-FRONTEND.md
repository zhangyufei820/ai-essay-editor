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
DIFY_API_KEY=your_dify_workflow_app_key
DIFY_WORKFLOW_USER=website-user
SUNO_GATEWAY_BASE_URL=http://vivaapi-suno-gateway:8000
SUNO_GATEWAY_API_KEY=your_suno_gateway_key
```

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
