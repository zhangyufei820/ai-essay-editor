export type JobStatus = 'queued' | 'running' | 'success' | 'failed' | 'partial_success' | 'cancelled';

export interface EssayInput {
  essay_id?: string;
  student_name?: string;
  text: string;
  grade_level?: string;
  genre?: string;
  metadata?: Record<string, unknown>;
}

export interface GradeOptions {
  rewrite?: boolean;
  rubric?: string;
  style?: string;
  prompt_version?: string;
}

export interface GradeSingleRequest extends EssayInput {
  options?: GradeOptions;
}

export interface GradeBatchRequest {
  essays: EssayInput[];
  options?: GradeOptions;
}

export interface EssayGradeResult {
  essay_id: string;
  student_name?: string;
  status: 'success' | 'failed';
  attempts: number;
  score: number | null;
  level: string | null;
  grade_level?: string;
  genre?: string;
  summary: string;
  problems: string[];
  polished_text: string;
  markdown_report: string;
  provider: 'llm' | 'local-draft';
  model: string | null;
  prompt_version: string;
  error: string | null;
  duration_ms: number;
  created_at: string;
}

export interface JobEvent {
  at: string;
  type: 'queued' | 'started' | 'essay_started' | 'essay_retry' | 'essay_finished' | 'essay_failed' | 'finished' | 'failed';
  essay_id?: string;
  message: string;
}

export interface JobRecord {
  job_id: string;
  status: JobStatus;
  total: number;
  completed: number;
  failed: number;
  progress: number;
  queued_count: number;
  running_count: number;
  created_at: string;
  updated_at: string;
  results: EssayGradeResult[];
  events: JobEvent[];
  error: string | null;
}

export interface AppConfig {
  port: number;
  dataDir: string;
  maxBatchSize: number;
  workerConcurrency: number;
  jobTimeoutSeconds: number;
  maxRetries: number;
  apiToken?: string;
  llmApiBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  ocrApiBaseUrl?: string;
  ocrApiKey?: string;
  ocrModel?: string;
  docExtractApiUrl?: string;
  docExtractApiKey?: string;
}

export interface DocumentExtractInput {
  document_id?: string;
  file_name?: string;
  mime_type?: string;
  text?: string;
  content_base64?: string;
}

export interface DocumentExtractResult {
  document_id: string;
  file_name?: string;
  mime_type?: string;
  text: string;
  char_count: number;
  provider: 'local-text' | 'external';
  status: 'success' | 'failed';
  error: string | null;
}

export interface OcrImageInput {
  image_id?: string;
  file_name?: string;
  image_base64?: string;
  text?: string;
}

export interface OcrResult {
  image_id: string;
  file_name?: string;
  text: string;
  confidence: number | null;
  provider: 'passthrough' | 'openai-compatible-vision' | 'stub';
  status: 'success' | 'failed';
  error: string | null;
}
