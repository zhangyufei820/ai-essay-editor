import http from 'node:http';
import { URL } from 'node:url';

import type { AppConfig } from './types';
import { DocumentExtractor } from './document-extractor';
import { EssayGrader } from './grader';
import { OcrService } from './ocr-service';
import { BatchQueue } from './queue';
import { JobStorage } from './storage';
import {
  normalizeDocumentBatchInput,
  normalizeDocumentInput,
  normalizeOcrBatchInput,
  normalizeOcrInput,
} from './capability-validation';
import { normalizeBatchRequest, normalizeSingleRequest } from './validation';

interface Dependencies {
  config: AppConfig;
  storage: JobStorage;
  grader: EssayGrader;
  queue: BatchQueue;
  documentExtractor: DocumentExtractor;
  ocrService: OcrService;
}

export async function createServer(config: AppConfig): Promise<http.Server> {
  const storage = new JobStorage(config.dataDir);
  await storage.init();
  const grader = new EssayGrader(config);
  const documentExtractor = new DocumentExtractor(config);
  const ocrService = new OcrService(config);
  const queue = new BatchQueue(
    storage,
    grader,
    config.workerConcurrency,
    config.maxRetries,
    config.jobTimeoutSeconds * 1000,
  );
  const deps: Dependencies = { config, storage, grader, queue, documentExtractor, ocrService };

  return http.createServer((request, response) => {
    handleRequest(request, response, deps).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(response, status, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  deps: Dependencies,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'essay-ai-suite',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  requireAuth(request, deps.config);

  if (request.method === 'POST' && url.pathname === '/api/essay/grade-single') {
    const body = await readJson(request);
    const input = normalizeOrBadRequest(() => normalizeSingleRequest(body));
    const result = await deps.grader.grade(input, input.options);
    sendJson(response, result.status === 'success' ? 200 : 502, {
      ok: result.status === 'success',
      result,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/essay/grade-batch') {
    const body = await readJson(request);
    const input = normalizeOrBadRequest(() => normalizeBatchRequest(body, deps.config.maxBatchSize));
    const job = await deps.queue.enqueue(input.essays, input.options);
    sendJson(response, 202, {
      ok: true,
      job_id: job.job_id,
      status: job.status,
      total: job.total,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/doc/extract') {
    const body = await readJson(request);
    const input = normalizeOrBadRequest(() => normalizeDocumentInput(body));
    const result = await deps.documentExtractor.extract(input);
    sendJson(response, result.status === 'success' ? 200 : 422, {
      ok: result.status === 'success',
      result,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/doc/batch-extract') {
    const body = await readJson(request);
    const inputs = normalizeOrBadRequest(() => normalizeDocumentBatchInput(body));
    const results = await Promise.all(inputs.map((input, index) => deps.documentExtractor.extract(input, index)));
    sendJson(response, 200, {
      ok: results.every((result) => result.status === 'success'),
      total: results.length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/ocr/image') {
    const body = await readJson(request);
    const input = normalizeOrBadRequest(() => normalizeOcrInput(body));
    const result = await deps.ocrService.recognize(input);
    sendJson(response, result.status === 'success' ? 200 : 422, {
      ok: result.status === 'success',
      result,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/ocr/batch') {
    const body = await readJson(request);
    const inputs = normalizeOrBadRequest(() => normalizeOcrBatchInput(body));
    const results = await Promise.all(inputs.map((input, index) => deps.ocrService.recognize(input, index)));
    sendJson(response, 200, {
      ok: results.every((result) => result.status === 'success'),
      total: results.length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    });
    return;
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === 'GET' && jobMatch) {
    const job = await deps.storage.getJob(jobMatch[1]);
    if (!job) {
      sendJson(response, 404, { ok: false, error: 'Job not found.' });
      return;
    }
    const { results: _results, ...summary } = job;
    sendJson(response, 200, { ok: true, job: summary });
    return;
  }

  const resultsMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/results$/);
  if (request.method === 'GET' && resultsMatch) {
    const job = await deps.storage.getJob(resultsMatch[1]);
    if (!job) {
      sendJson(response, 404, { ok: false, error: 'Job not found.' });
      return;
    }
    sendJson(response, 200, {
      ok: true,
      job_id: job.job_id,
      status: job.status,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      results: job.results,
    });
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: 'Route not found.',
  });
}

async function readJson(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function requireAuth(request: http.IncomingMessage, config: AppConfig): void {
  if (!config.apiToken) {
    return;
  }

  const authorization = request.headers.authorization;
  const expected = `Bearer ${config.apiToken}`;
  if (authorization === expected) {
    return;
  }

  const apiToken = request.headers['x-api-token'];
  if (apiToken === config.apiToken) {
    return;
  }

  throw new HttpError(401, 'Unauthorized.');
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function normalizeOrBadRequest<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error));
  }
}
