# Dify Custom Tool Import

## Import

1. Open Dify admin.
2. Go to `Tools` / `Custom Tool`.
3. Create a custom tool.
4. Choose OpenAPI Schema import.
5. Use one of:
   - `https://voice-api.shenxiang.school/openapi.json`
   - Paste `openapi/dify-openapi.yaml`
6. Authentication: API Key.
7. Header name: `X-API-Key`.
8. Value: `<VOICE_GATEWAY_API_KEY>`.

## Test createEssayCommentary

```json
{
  "student_grade": "初中",
  "essay_title": "那一刻，我长大了",
  "essay_text": "这里放学生作文",
  "grading_report": "这里放作文批改报告",
  "voice_id": "teacher_female_01",
  "sync": true
}
```

The response returns JSON. Dify should read `audio_url` and pass it back to the user or to shenxiang.school.

## Suggested Workflow

1. Node 1: essay grading LLM.
2. Node 2: rewrite grading output into a natural spoken commentary script.
3. Node 3: call `createEssayCommentary` or `createTTS`.
4. Node 4: return `audio_url` to the user.

For long jobs, use `sync: false`, then poll `getJobStatus` with the returned `job_id`.

