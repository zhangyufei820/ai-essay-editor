# Dify 网关工具包

这组 OpenAPI 文件用于在 Dify 的 Custom Tool 中导入常用网关，让 Agent 节点可以直接调用 `webSearch`、`createVideo`、`generateImage`、`recognizeImage`、`createCustomMusic`、`createTTS` 等工具。

## 导入顺序

1. 进入 Dify：`Tools -> Custom -> Import OpenAPI`。
2. 按需导入本目录下的 OpenAPI 文件。
3. 在 Dify 工具鉴权里只填写本网关密钥，不填写上游供应商密钥。
4. 在 Agent 节点勾选工具，让 Codex / Agent 自己决定调用哪个工具。

## 工具清单

| 文件 | 网关 | Dify 里看到的核心工具 | 鉴权 Header |
|---|---|---|---|
| `search-gateway.openapi.yaml` | 搜索网关 | `webSearch`, `webExtract` | `X-Gateway-Key` |
| `relaydance-video-gateway.openapi.yaml` | RelayDance 视频网关 | `createVideo`, `getVideoTask`, `getUploadUrl`, `createVirtualAsset` | `X-Gateway-Key` |
| `image-gateway.openapi.yaml` | 图片网关 | `generateImage`, `submitImageTask`, `getImageTask`, `uploadImageFile` | `x-gateway-token` |
| `essay-ai-suite-tools.openapi.yaml` | OCR / 文档网关 | `recognizeImage`, `recognizeImages`, `extractDocument` | `x-api-token` |
| `suno-gateway.openapi.yaml` | 音乐网关 | `createCustomMusic`, `createLyrics`, `getMusicTask` | `X-Gateway-Key` |
| `voice-gateway.openapi.yaml` | 语音网关 | `createTTS`, `getVoiceJob`, `listVoices` | `X-API-Key` |

## 建议的 Dify Agent 调用方式

- 用户要联网查资料：调用 `webSearch`，需要正文再调用 `webExtract`。
- 用户要首尾帧视频：先让 Codex 节点写分镜和视频 prompt，再把图片 URL 和 prompt 传给 `createVideo`。
- 用户要图像转视频：图片先经 Dify 直传或图片网关上传，拿到公网可访问 URL 后再调用视频网关。
- 用户要图片生成：短任务用 `generateImage`，长任务用 `submitImageTask` + `getImageTask`。
- 用户要 OCR：图片 URL 或 base64 给 `recognizeImage`；多图给 `recognizeImages`。
- 用户要音乐：调用 `createCustomMusic` 或 `createLyrics`，然后用 `getMusicTask` 轮询。
- 用户要语音：调用 `createTTS`，异步任务用 `getVoiceJob` 轮询。

## COS 说明

当前仓库里有 COS 服务端 SDK 封装，但还没有独立 `COS Gateway` 服务。Dify 现在不应直接拿腾讯云 SecretId / SecretKey。下一步若要让 Dify 操作 COS，建议单独创建 `cos-gateway`，只暴露：

- `createUploadUrl`: 创建临时上传 URL。
- `saveRemoteFile`: 把视频 / 图片临时 URL 拉取并保存到 COS。
- `deleteObject`: 删除广场过期资源。
- `createDownloadUrl`: 创建临时下载 URL。

这样 Dify 仍然只持有 `X-Gateway-Key`，不会接触腾讯云永久密钥。
