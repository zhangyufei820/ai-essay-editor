# essay-ai-suite

`essay-ai-suite` is the first-stage shared HTTP service for Dify apps.

It keeps Dify workflows light by moving essay grading, batch job state, retries, and later OCR/document/image capabilities into a 1Panel-deployable service.

## MVP APIs

```http
GET  /health
POST /api/essay/grade-single
POST /api/essay/grade-batch
GET  /api/jobs/:jobId
GET  /api/jobs/:jobId/results
POST /api/doc/extract
POST /api/doc/batch-extract
POST /api/ocr/image
POST /api/ocr/batch
```

## Stability Controls

```env
API_TOKEN=
MAX_BATCH_SIZE=20
WORKER_CONCURRENCY=2
JOB_TIMEOUT_SECONDS=180
MAX_RETRIES=1
```

- Set `API_TOKEN` to require `Authorization: Bearer <token>` or `x-api-token`.
- Batch jobs are processed asynchronously and persist status/results to `DATA_DIR/jobs.json`.
- Each essay result records `attempts`, `duration_ms`, status, and error details.
- Job summaries include `progress`, `queued_count`, `running_count`, and event logs for troubleshooting.

## Local Run

```bash
npm install
npm run build
npm start
```

When `LLM_API_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` are configured, the grader calls an OpenAI-compatible chat completions API. Without those variables, it returns a deterministic local draft result so the service can be tested safely.

## LLM Provider

The service expects an OpenAI-compatible endpoint:

```text
POST {LLM_API_BASE_URL}/chat/completions
Authorization: Bearer ${LLM_API_KEY}
```

Set:

```env
LLM_API_BASE_URL=https://your-provider.example.com/v1
LLM_API_KEY=your-key
LLM_MODEL=your-model
```

Essay grading uses the versioned prompt template `essay-grading-v1` from `src/prompts/essay-grading-v1.ts`. API results include `provider`, `model`, and `prompt_version` so batch results can be audited later.

## Shared Capability Entrypoints

Document extraction and OCR endpoints are now available as stable public contracts for Dify apps.

Current implementation:

- Document extraction supports direct `text` and base64 text content.
- OCR supports `text` passthrough for workflow testing.
- OCR can call an OpenAI-compatible vision endpoint when `OCR_API_BASE_URL`, `OCR_API_KEY`, and `OCR_MODEL` are set.
- Document extraction can call an external parser endpoint when `DOC_EXTRACT_API_URL` and `DOC_EXTRACT_API_KEY` are set.

```env
OCR_API_BASE_URL=https://your-vision-provider.example.com/v1
OCR_API_KEY=your-ocr-key
OCR_MODEL=your-vision-model
DOC_EXTRACT_API_URL=https://your-doc-parser.example.com/extract
DOC_EXTRACT_API_KEY=your-doc-key
```
