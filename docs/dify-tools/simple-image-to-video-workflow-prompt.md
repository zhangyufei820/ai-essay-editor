# 简易 Dify 工作流提示词：图片 / 文字生成视频

把下面这段发给另一个 AI，让它生成 Dify 工作流配置即可。

```text
你是一名 Dify 工作流工程师。请帮我创建一个最简工作流：用户上传图片或输入简单提示词，后面接一个 Codex / Agent 节点优化提示词，然后调用我服务器上的视频生成网关，返回 task_id 和 poll_url。

不要加入网站业务、作文业务、积分业务、广场业务。

目标链路：
用户输入 prompt 或 image_url
-> Codex / Agent 优化成视频生成提示词
-> 调用 createVideo 工具
-> 返回 task_id / poll_url / optimized_prompt

工作流输入变量：
- prompt: string，可选，用户输入的简单视频想法
- image_url: string，可选，用户上传图片后的公网 URL
- duration_seconds: string，默认 "5"，允许 "3" / "5" / "10"
- ratio: string，默认 "16:9"，允许 "16:9" / "9:16" / "1:1" / "4:3" / "3:4" / "21:9"
- resolution: string，默认 "720p"，允许 "720p" / "1080p"

节点 1：参数校验
- prompt 和 image_url 至少有一个。
- duration_seconds 不合法时改成 "5"。
- ratio 不合法时改成 "16:9"。
- resolution 不合法时改成 "720p"。

节点 2：Codex / Agent 优化提示词
系统提示词：
你是 AI 视频提示词导演。用户会给你一句简单想法，或者一张参考图 URL。请把它改写成适合短视频生成模型的高质量视频 prompt。输出要清晰、具体、有镜头感，但不要太长。

要求：
- 适合 3 到 10 秒短视频。
- 写清主体、场景、镜头运动、光线、风格、情绪。
- 如果有 image_url，就强调保持参考图中的主体、构图和风格。
- 不要出现违法、暴力、色情、隐私信息。
- 不要解释过程，只输出 JSON。

输出 JSON：
{
  "optimized_prompt": "",
  "negative_prompt": "low quality, blurry, distorted faces, extra limbs, text artifacts, watermark",
  "title": ""
}

节点 3：调用视频工具 createVideo
使用已经导入 Dify 的 RelayDance Video Gateway 工具，operationId 为 createVideo。

传参：
{
  "prompt": "{{ optimized_prompt }}",
  "model": "doubao-seedance-2-0-720p",
  "seconds": "{{ duration_seconds }}",
  "ratio": "{{ ratio }}",
  "resolution": "{{ resolution }}",
  "generate_audio": false,
  "watermark": false,
  "first_frame_url": "{{ image_url }}"
}

说明：
- 如果 image_url 为空，不传 first_frame_url，走文生视频。
- 如果 image_url 有值，传 first_frame_url，走图生视频。
- createVideo 只提交异步任务，不要等待视频完全生成。

节点 4：结束返回
返回 JSON：
{
  "success": true,
  "task_id": "{{ createVideo.task_id }}",
  "poll_url": "/api/media/tasks/{{ createVideo.task_id }}",
  "optimized_prompt": "{{ optimized_prompt }}",
  "title": "{{ title }}",
  "message": "视频任务已提交，前端可以开始轮询。"
}

失败时返回：
{
  "success": false,
  "error": "{{ error }}",
  "message": "视频任务提交失败，请稍后重试。"
}

需要使用的 Dify 工具：
- createVideo：提交视频生成任务。
- getVideoTask：可选，仅在 Dify 内部调试时使用；正式前端应统一轮询网站接口。
```

