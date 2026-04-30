import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createServer } from '@/services/essay-ai-suite/src/server';
import { loadConfig } from '@/services/essay-ai-suite/src/config';
import { EssayGrader } from '@/services/essay-ai-suite/src/grader';
import { BatchQueue } from '@/services/essay-ai-suite/src/queue';
import { JobStorage } from '@/services/essay-ai-suite/src/storage';
import type { EssayInput, GradeOptions } from '@/services/essay-ai-suite/src/types';
import { normalizeBatchRequest, normalizeSingleRequest } from '@/services/essay-ai-suite/src/validation';

describe('essay-ai-suite MVP', () => {
  it('normalizes a single essay request', () => {
    const request = normalizeSingleRequest({
      essay_id: '001',
      student_name: '张三',
      text: '今天我去了公园，看到了很多春天的景象。',
      grade_level: '小学',
      genre: '记叙文',
    });

    expect(request.essay_id).toBe('001');
    expect(request.text).toContain('公园');
  });

  it('rejects batches above the configured limit', () => {
    expect(() =>
      normalizeBatchRequest(
        {
          essays: [
            { text: '第一篇作文内容很完整。' },
            { text: '第二篇作文内容也很完整。' },
          ],
        },
        1,
      ),
    ).toThrow('Batch size exceeds limit 1.');
  });

  it('grades a single essay with the local draft provider when LLM config is absent', async () => {
    const config = loadConfig();
    const grader = new EssayGrader({
      ...config,
      llmApiBaseUrl: undefined,
      llmApiKey: undefined,
      llmModel: undefined,
    });

    const result = await grader.grade({
      essay_id: 'essay_local',
      text: '今天我去了公园。\n我看见树叶慢慢变绿，也听见孩子们在远处笑。',
    });

    expect(result.status).toBe('success');
    expect(result.provider).toBe('local-draft');
    expect(result.prompt_version).toBe('essay-grading-v1');
    expect(result.model).toBeNull();
    expect(result.markdown_report).toContain('作文批改报告');
  });

  it('calls an OpenAI-compatible LLM endpoint when configured', async () => {
    const requests: unknown[] = [];
    const llmServer = http.createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        requests.push(JSON.parse(body));
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          model: 'test-model',
          choices: [
            {
              message: {
                content: '### 作文批改报告\n- **综合评分**：88/100',
              },
            },
          ],
        }));
      });
    });

    try {
      const baseUrl = await listen(llmServer);
      const grader = new EssayGrader({
        ...loadConfig(),
        llmApiBaseUrl: baseUrl,
        llmApiKey: 'test-key',
        llmModel: 'test-model',
      });

      const result = await grader.grade({
        essay_id: 'essay_llm',
        text: '今天我去了公园。\n我看见树叶慢慢变绿，也听见孩子们在远处笑。',
      });

      expect(result.status).toBe('success');
      expect(result.provider).toBe('llm');
      expect(result.model).toBe('test-model');
      expect(result.prompt_version).toBe('essay-grading-v1');
      expect(result.markdown_report).toContain('综合评分');
      expect(JSON.stringify(requests[0])).toContain('输出必须是 Markdown');
    } finally {
      await close(llmServer);
    }
  });

  it('persists batch job results', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'essay-ai-suite-'));
    try {
      const config = {
        ...loadConfig(),
        dataDir,
        workerConcurrency: 1,
        llmApiBaseUrl: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
      };
      const storage = new JobStorage(dataDir);
      await storage.init();
      const queue = new BatchQueue(storage, new EssayGrader(config), 1, 1, 1000);

      const job = await queue.enqueue([
        {
          essay_id: '001',
          text: '今天我写了一篇作文。\n我想把事情讲清楚，也想让语言更生动。',
        },
      ]);

      await waitFor(async () => {
        const stored = await storage.getJob(job.job_id);
        return stored?.status === 'success';
      });

      const stored = await storage.getJob(job.job_id);
      expect(stored?.completed).toBe(1);
      expect(stored?.progress).toBe(100);
      expect(stored?.events.some((event) => event.type === 'finished')).toBe(true);
      expect(stored?.results[0]?.essay_id).toBe('001');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('retries failed essays without failing the whole batch', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'essay-ai-suite-'));
    try {
      const storage = new JobStorage(dataDir);
      await storage.init();
      const flakyGrader = new FlakyGrader();
      const queue = new BatchQueue(storage, flakyGrader as unknown as EssayGrader, 1, 1, 1000);

      const job = await queue.enqueue([
        {
          essay_id: 'retry-me',
          text: '这是一篇需要重试的作文内容。',
        },
      ]);

      await waitFor(async () => {
        const stored = await storage.getJob(job.job_id);
        return stored?.status === 'success';
      });

      const stored = await storage.getJob(job.job_id);
      expect(stored?.results[0]?.attempts).toBe(2);
      expect(stored?.events.some((event) => event.type === 'essay_retry')).toBe(true);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('requires an API token when configured', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'essay-ai-suite-'));
    let server: http.Server | undefined;
    try {
      server = await createServer({
        ...loadConfig(),
        dataDir,
        port: 0,
        apiToken: 'secret-token',
        llmApiBaseUrl: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
      });
      const baseUrl = await listen(server);

      const unauthorized = await fetch(`${baseUrl}/api/jobs/missing`);
      expect(unauthorized.status).toBe(401);

      const authorized = await fetch(`${baseUrl}/api/jobs/missing`, {
        headers: {
          Authorization: 'Bearer secret-token',
        },
      });
      expect(authorized.status).toBe(404);
    } finally {
      if (server) {
        await close(server);
      }
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('extracts document text through the shared document endpoint', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'essay-ai-suite-'));
    let server: http.Server | undefined;
    try {
      server = await createServer({
        ...loadConfig(),
        dataDir,
        port: 0,
        llmApiBaseUrl: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
      });
      const baseUrl = await listen(server);

      const response = await fetch(`${baseUrl}/api/doc/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: 'doc-1',
          file_name: 'essay.txt',
          text: ' 第一段作文内容。\n\n\n第二段作文内容。 ',
        }),
      });

      const payload = await response.json() as { ok: boolean; result: { text: string; char_count: number } };
      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.result.text).toBe('第一段作文内容。\n\n第二段作文内容。');
      expect(payload.result.char_count).toBeGreaterThan(0);
    } finally {
      if (server) {
        await close(server);
      }
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('supports OCR passthrough and batch failure reporting', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'essay-ai-suite-'));
    let server: http.Server | undefined;
    try {
      server = await createServer({
        ...loadConfig(),
        dataDir,
        port: 0,
        llmApiBaseUrl: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
      });
      const baseUrl = await listen(server);

      const single = await fetch(`${baseUrl}/api/ocr/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: 'image-1',
          text: '手写作文识别结果',
        }),
      });
      const singlePayload = await single.json() as { ok: boolean; result: { text: string; provider: string } };
      expect(single.status).toBe(200);
      expect(singlePayload.result.provider).toBe('passthrough');
      expect(singlePayload.result.text).toBe('手写作文识别结果');

      const batch = await fetch(`${baseUrl}/api/ocr/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: [
            { image_id: 'ok', text: '第一张' },
            { image_id: 'missing' },
          ],
        }),
      });
      const batchPayload = await batch.json() as { ok: boolean; failed: number; results: Array<{ status: string }> };
      expect(batch.status).toBe(200);
      expect(batchPayload.ok).toBe(false);
      expect(batchPayload.failed).toBe(1);
      expect(batchPayload.results[1]?.status).toBe('failed');
    } finally {
      if (server) {
        await close(server);
      }
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('calls an OpenAI-compatible vision provider for OCR', async () => {
    const requests: { authorization?: string; body: unknown }[] = [];
    const ocrProvider = http.createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        requests.push({
          authorization: request.headers.authorization,
          body: JSON.parse(body),
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          choices: [
            {
              message: {
                content: '识别出的作文正文',
              },
            },
          ],
        }));
      });
    });

    try {
      const baseUrl = await listen(ocrProvider);
      const dataDir = await mkdtemp(join(tmpdir(), 'essay-ai-suite-'));
      let server: http.Server | undefined;
      try {
        server = await createServer({
          ...loadConfig(),
          dataDir,
          port: 0,
          ocrApiBaseUrl: baseUrl,
          ocrApiKey: 'ocr-key',
          ocrModel: 'vision-model',
          llmApiBaseUrl: undefined,
          llmApiKey: undefined,
          llmModel: undefined,
        });
        const appUrl = await listen(server);

        const response = await fetch(`${appUrl}/api/ocr/image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_id: 'img-provider',
            file_name: 'essay.png',
            image_base64: 'aW1hZ2U=',
          }),
        });

        const payload = await response.json() as { ok: boolean; result: { text: string; provider: string } };
        expect(response.status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(payload.result.provider).toBe('openai-compatible-vision');
        expect(payload.result.text).toBe('识别出的作文正文');
        expect(requests[0]?.authorization).toBe('Bearer ocr-key');
        expect(JSON.stringify(requests[0]?.body)).toContain('data:image/png;base64,aW1hZ2U=');
      } finally {
        if (server) {
          await close(server);
        }
        await rm(dataDir, { recursive: true, force: true });
      }
    } finally {
      await close(ocrProvider);
    }
  });

  it('calls an external document extraction provider when local text is unavailable', async () => {
    const requests: { authorization?: string; body: unknown }[] = [];
    const docProvider = http.createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        requests.push({
          authorization: request.headers.authorization,
          body: JSON.parse(body),
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          text: '外部解析出的文档正文',
        }));
      });
    });

    try {
      const providerUrl = `${await listen(docProvider)}/extract`;
      const dataDir = await mkdtemp(join(tmpdir(), 'essay-ai-suite-'));
      let server: http.Server | undefined;
      try {
        server = await createServer({
          ...loadConfig(),
          dataDir,
          port: 0,
          docExtractApiUrl: providerUrl,
          docExtractApiKey: 'doc-key',
          llmApiBaseUrl: undefined,
          llmApiKey: undefined,
          llmModel: undefined,
        });
        const appUrl = await listen(server);

        const response = await fetch(`${appUrl}/api/doc/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document_id: 'doc-provider',
            file_name: 'essay.pdf',
            mime_type: 'application/pdf',
            content_base64: 'cGRm',
          }),
        });

        const payload = await response.json() as { ok: boolean; result: { text: string; provider: string } };
        expect(response.status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(payload.result.provider).toBe('external');
        expect(payload.result.text).toBe('外部解析出的文档正文');
        expect(requests[0]?.authorization).toBe('Bearer doc-key');
        expect(JSON.stringify(requests[0]?.body)).toContain('essay.pdf');
      } finally {
        if (server) {
          await close(server);
        }
        await rm(dataDir, { recursive: true, force: true });
      }
    } finally {
      await close(docProvider);
    }
  });
});

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2000) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for condition.');
}

class FlakyGrader {
  private calls = 0;

  async grade(input: EssayInput, _options?: GradeOptions) {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        essay_id: input.essay_id ?? 'essay',
        status: 'failed' as const,
        attempts: 1,
        score: null,
        level: null,
        summary: '',
        problems: [],
        polished_text: '',
        markdown_report: '',
        provider: 'local-draft' as const,
        model: null,
        prompt_version: 'essay-grading-v1',
        error: 'temporary failure',
        duration_ms: 1,
        created_at: new Date().toISOString(),
      };
    }

    return {
      essay_id: input.essay_id ?? 'essay',
      status: 'success' as const,
      attempts: 1,
      score: 80,
      level: '黄金',
      summary: 'ok',
      problems: [],
      polished_text: '',
      markdown_report: 'ok',
      provider: 'local-draft' as const,
      model: null,
      prompt_version: 'essay-grading-v1',
      error: null,
      duration_ms: 1,
      created_at: new Date().toISOString(),
    };
  }
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server did not bind to a TCP port.');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
