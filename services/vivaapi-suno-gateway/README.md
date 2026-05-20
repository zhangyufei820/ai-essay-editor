# ViVaAPI Suno 音乐生成网关

这是一个独立的 FastAPI 后端服务，用来让 Dify 通过 HTTP Request 节点安全调用 ViVaAPI Suno。ViVaAPI Token 只保存在服务器环境变量里，Dify 只需要携带本服务的 `X-Gateway-Key`。

服务提供 typed endpoints、`/docs`、`/openapi.json`、分步上传、完整上传、上传后二次创作、回调接收和受限 raw 透传接口。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VIVA_BASE_URL` | `https://www.vivaapi.cn` | ViVaAPI 正式环境地址 |
| `VIVA_API_TOKEN` | 空 | ViVaAPI Token，可不带 `Bearer`，程序会自动补齐 |
| `GATEWAY_API_KEY` | 空 | Dify 调用本网关时使用的密钥 |
| `REQUEST_TIMEOUT_SECONDS` | `180` | 上游请求超时 |
| `MAX_UPLOAD_MB` | `200` | 上传音频大小限制 |
| `STRICT_MODEL_VALIDATION` | `false` | 默认只校验 `mv` 是非空字符串；设为 `true` 后启用模型 allowlist |
| `CALLBACK_PUBLIC_BASE_URL` | 空 | 可选，记录公网回调地址 |
| `S3_SEND_AUTH` | `false` | S3 上传默认不带 ViVaAPI Authorization |

## 本地或服务器启动

```bash
cd services/vivaapi-suno-gateway
cp .env.example .env
# 编辑 .env，填入 VIVA_API_TOKEN 和 GATEWAY_API_KEY
docker compose up -d --build
```

健康检查：

```bash
curl http://localhost:8000/health
```

接口文档：

- Swagger UI: `http://localhost:8000/docs`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

## Nginx 反代示例

如果公网域名是 `https://music.example.com`：

```nginx
location / {
  proxy_pass http://127.0.0.1:8000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

回调地址可以填：

```text
https://music.example.com/api/v1/suno/callback
```

## Dify HTTP Request 节点

所有业务接口都需要：

```text
Headers:
X-Gateway-Key: 你的 GATEWAY_API_KEY
Content-Type: application/json
```

Dify 中不要保存 `VIVA_API_TOKEN`。只保存 `GATEWAY_API_KEY`。

示例：生成自定义歌曲

```text
Method: POST
URL: https://music.example.com/api/v1/suno/music/custom
Headers:
  X-Gateway-Key: xxx
  Content-Type: application/json
Body:
{
  "prompt": "写一首关于夏夜海边的中文流行歌",
  "mv": "chirp-v5",
  "title": "夏夜潮汐",
  "tags": "pop, emotional",
  "negative_tags": "",
  "generation_type": "TEXT",
  "notify_hook": "https://music.example.com/api/v1/suno/callback"
}
```

## 统一响应格式

所有网关接口返回统一结构：

```json
{
  "success": true,
  "status_code": 200,
  "provider_code": "success",
  "message": "",
  "task_id": "",
  "clip_id": "",
  "upload_id": "",
  "status": "",
  "audio_urls": [],
  "image_urls": [],
  "video_urls": [],
  "wav_url": "",
  "timing": null,
  "data": null,
  "provider_response": {},
  "error": null
}
```

`provider_response` 会保留上游原始响应，Dify 优先读 `task_id`、`clip_id`、`audio_urls`、`image_urls`、`wav_url` 等平铺字段。

## Curl 示例

下面假设：

```bash
BASE=http://localhost:8000
KEY=replace-with-gateway-key
```

灵感模式：

```bash
curl -X POST "$BASE/api/v1/suno/music/inspiration" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"gpt_description_prompt":"一首动听的情歌","make_instrumental":false,"mv":"chirp-v5","prompt":"Cat Dance"}'
```

自定义模式：

```bash
curl -X POST "$BASE/api/v1/suno/music/custom" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"歌词或创作提示","mv":"chirp-v5","title":"歌曲标题","tags":"pop, emotional","negative_tags":"","generation_type":"TEXT"}'
```

续写：

```bash
curl -X POST "$BASE/api/v1/suno/music/extend" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"续写歌词","mv":"chirp-v5","continue_clip_id":"clip_xxx","continue_at":120}'
```

Persona / 歌手风格：

```bash
curl -X POST "$BASE/api/v1/suno/music/persona" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"歌词","generation_type":"TEXT","tags":"electronic, pop","mv":"chirp-v4-tau","title":"标题","persona_id":"persona_xxx","artist_clip_id":"clip_xxx"}'
```

上传后二次创作：

```bash
curl -X POST "$BASE/api/v1/suno/music/upload-extend" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"歌词","mv":"chirp-v4","title":"标题","continue_clip_id":"clip_xxx","continue_at":10}'
```

Cover：

```bash
curl -X POST "$BASE/api/v1/suno/music/cover" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"","generation_type":"TEXT","tags":"pop","mv":"chirp-v3-5-tau","title":"标题","cover_clip_id":"clip_xxx"}'
```

拼接提交：

```bash
curl -X POST "$BASE/api/v1/suno/music/stitch-submit" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"clip_id":"clip_xxx","is_infill":false}'
```

歌词：

```bash
curl -X POST "$BASE/api/v1/suno/lyrics" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"dance"}'
```

歌曲拼接：

```bash
curl -X POST "$BASE/api/v1/suno/concat" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"clip_id":"clip_xxx","is_infill":false}'
```

`/suno/generate` 灵感：

```bash
curl -X POST "$BASE/api/v1/suno/generate/inspiration" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"gpt_description_prompt":"乡愁"}'
```

`/suno/generate` 自定义：

```bash
curl -X POST "$BASE/api/v1/suno/generate/custom" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"歌词","mv":"chirp-v3-5","title":"工作","tags":"edm"}'
```

`/suno/generate` 纯音乐：

```bash
curl -X POST "$BASE/api/v1/suno/generate/instrumental" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"","tags":"heavy metal","mv":"chirp-v3-5","title":"北京"}'
```

批量查询：

```bash
curl -X POST "$BASE/api/v1/suno/tasks/batch" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"ids":["task_id_1","task_id_2"]}'
```

单任务查询：

```bash
curl -H "X-Gateway-Key: $KEY" "$BASE/api/v1/suno/tasks/task_id_1"
```

WAV：

```bash
curl -H "X-Gateway-Key: $KEY" "$BASE/api/v1/suno/clips/clip_xxx/wav"
```

Timing：

```bash
curl -H "X-Gateway-Key: $KEY" "$BASE/api/v1/suno/timing/timing_or_clip_id"
```

Feed：

```bash
curl -H "X-Gateway-Key: $KEY" "$BASE/api/v1/suno/feed/feed_or_clip_id"
```

查看最近回调：

```bash
curl -H "X-Gateway-Key: $KEY" "$BASE/api/v1/suno/callbacks/recent"
```

Raw 兜底：

```bash
curl -X POST "$BASE/api/v1/suno/raw" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"method":"POST","path":"/suno/submit/music","body":{"prompt":"x"},"query":{}}'
```

生产优先使用 typed endpoints。`/api/v1/suno/raw` 只用于 ViVaAPI 文档临时新增字段或紧急兼容；它只允许 `GET`、`POST`，且 `path` 必须以 `/suno/` 开头，禁止完整 URL。

## 上传音频完整链路

分步调用：

```bash
curl -X POST "$BASE/api/v1/suno/upload/authorize" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"extension":"mp3"}'
```

把授权接口返回的 `url` 和 `fields` 用于 S3 上传调试：

```bash
curl -X POST "$BASE/api/v1/suno/upload/s3" \
  -H "X-Gateway-Key: $KEY" \
  -F 'url=https://s3-upload-url.example' \
  -F 'fields_json={"key":"...","policy":"...","signature":"...","Content-Type":"audio/mpeg"}' \
  -F 'file=@./my_audio.mp3;type=audio/mpeg'
```

报告上传完成：

```bash
curl -X POST "$BASE/api/v1/suno/upload/upload_xxx/finish" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"upload_type":"file_upload","upload_filename":"my_audio.mp3"}'
```

轮询上传状态：

```bash
curl -H "X-Gateway-Key: $KEY" "$BASE/api/v1/suno/upload/upload_xxx/status"
```

初始化 clip：

```bash
curl -X POST "$BASE/api/v1/suno/upload/upload_xxx/initialize-clip" \
  -H "X-Gateway-Key: $KEY" -H "Content-Type: application/json" \
  -d '{}'
```

Dify 最方便的一步完整上传：

```bash
curl -X POST "$BASE/api/v1/suno/upload/full" \
  -H "X-Gateway-Key: $KEY" \
  -F "file=@./my_audio.mp3;type=audio/mpeg" \
  -F "wait_complete=true" \
  -F "poll_interval_seconds=3" \
  -F "poll_timeout_seconds=180"
```

上传并直接创建二次创作任务：

```bash
curl -X POST "$BASE/api/v1/suno/upload/full-and-create" \
  -H "X-Gateway-Key: $KEY" \
  -F "file=@./my_audio.mp3;type=audio/mpeg" \
  -F "prompt=基于这段旋律写一首中文流行歌" \
  -F "title=新的歌" \
  -F "tags=pop" \
  -F "negative_tags=" \
  -F "mv=chirp-v4" \
  -F "continue_at=10" \
  -F "task=upload_extend"
```

## Dify 工作流拆法

推荐拆成四类节点：

1. 生成任务节点：调用 `/api/v1/suno/music/custom`、`/music/inspiration` 或 `/upload/full-and-create`，保存返回的 `task_id`。
2. 等待/轮询节点：等待几秒后进入查询，或者循环调用查询节点。
3. 查询任务节点：调用 `/api/v1/suno/tasks/{task_id}`，读取 `status`、`audio_urls`、`image_urls`。
4. 返回音频 URL 节点：当 `audio_urls[0]` 存在时返回给用户；没有音频时提示任务仍在生成。

## 安全注意事项

- 不要在 Dify 里放 `VIVA_API_TOKEN`。
- Dify 只放 `GATEWAY_API_KEY`。
- 所有业务接口都校验 `X-Gateway-Key`。
- 日志会对 `Authorization`、`token`、`signature`、`policy`、`X-Gateway-Key` 做脱敏。
- 上传文件保存到临时文件，流程结束后会删除。
- S3 上传默认 `S3_SEND_AUTH=false`，不会携带 ViVaAPI Authorization。
- 创建音乐任务的 POST 默认不自动重试，避免重复扣费；确实需要时可加 query `?retry_create=true`。

## 常见错误排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `401 gateway unauthorized` | Dify 没传或传错 `X-Gateway-Key` | 检查 Dify HTTP Request Header |
| `401 provider unauthorized` | `VIVA_API_TOKEN` 错误或过期 | 在服务器 `.env` 更新 Token 后重启容器 |
| `provider task_not_exist` | 查询的 `task_id` 不存在或还没同步 | 确认提交接口返回的 `task_id`，稍后重试 |
| `upload status timeout` | S3 上传后上游处理超时 | 增大 `poll_timeout_seconds` 或稍后查 `/upload/{id}/status` |
| `S3 upload failed` | 授权字段、文件类型或 S3 URL 不匹配 | 用 `/upload/s3` 单独调试授权返回的 `url` 和 `fields` |
| 没有 `audio_url` | 任务还没完成 | 继续查询任务；无音频不代表提交失败 |

## 测试

默认测试只 mock 上游，不会真实调用 ViVaAPI：

```bash
cd services/vivaapi-suno-gateway
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pytest
```

真实调用测试默认关闭，只有显式设置才允许：

```bash
RUN_LIVE_TESTS=1 pytest
```
