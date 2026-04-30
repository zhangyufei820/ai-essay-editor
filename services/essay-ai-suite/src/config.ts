import type { AppConfig } from './types';

function readInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function loadConfig(): AppConfig {
  return {
    port: readInt('PORT', 3100),
    dataDir: readOptional('DATA_DIR') ?? './data',
    maxBatchSize: readInt('MAX_BATCH_SIZE', 20),
    workerConcurrency: readInt('WORKER_CONCURRENCY', 2),
    jobTimeoutSeconds: readInt('JOB_TIMEOUT_SECONDS', 180),
    maxRetries: readInt('MAX_RETRIES', 1),
    apiToken: readOptional('API_TOKEN'),
    llmApiBaseUrl: readOptional('LLM_API_BASE_URL'),
    llmApiKey: readOptional('LLM_API_KEY'),
    llmModel: readOptional('LLM_MODEL'),
    ocrApiBaseUrl: readOptional('OCR_API_BASE_URL'),
    ocrApiKey: readOptional('OCR_API_KEY'),
    ocrModel: readOptional('OCR_MODEL'),
    docExtractApiUrl: readOptional('DOC_EXTRACT_API_URL'),
    docExtractApiKey: readOptional('DOC_EXTRACT_API_KEY'),
  };
}
