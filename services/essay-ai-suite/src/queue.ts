import type { EssayGradeResult, EssayInput, GradeOptions, JobEvent, JobRecord } from './types';
import { EssayGrader } from './grader';
import { JobStorage } from './storage';

interface QueuedJob {
  job: JobRecord;
  essays: EssayInput[];
  options?: GradeOptions;
}

export class BatchQueue {
  private readonly queue: QueuedJob[] = [];
  private active = 0;

  constructor(
    private readonly storage: JobStorage,
    private readonly grader: EssayGrader,
    private readonly concurrency: number,
    private readonly maxRetries = 1,
    private readonly timeoutMs = 180_000,
  ) {}

  async enqueue(essays: EssayInput[], options?: GradeOptions): Promise<JobRecord> {
    const now = new Date().toISOString();
    const job: JobRecord = {
      job_id: createJobId(),
      status: 'queued',
      total: essays.length,
      completed: 0,
      failed: 0,
      progress: 0,
      queued_count: essays.length,
      running_count: 0,
      created_at: now,
      updated_at: now,
      results: [],
      events: [
        createEvent('queued', `Queued ${essays.length} essay(s).`),
      ],
      error: null,
    };

    await this.storage.saveJob(job);
    this.queue.push({ job, essays, options });
    this.drain();
    return job;
  }

  private drain(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const queued = this.queue.shift();
      if (!queued) {
        return;
      }

      this.active += 1;
      this.processJob(queued)
        .catch(async (error) => {
          const failedJob = {
            ...queued.job,
            status: 'failed' as const,
            error: error instanceof Error ? error.message : String(error),
            events: [
              ...queued.job.events,
              createEvent('failed', error instanceof Error ? error.message : String(error)),
            ],
            updated_at: new Date().toISOString(),
          };
          await this.storage.saveJob(failedJob);
        })
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }

  private async processJob(queued: QueuedJob): Promise<void> {
    let job: JobRecord = {
      ...queued.job,
      status: 'running',
      events: [...queued.job.events, createEvent('started', 'Batch job started.')],
      updated_at: new Date().toISOString(),
    };
    await this.storage.saveJob(job);

    for (const essay of queued.essays) {
      job = {
        ...job,
        queued_count: Math.max(0, job.queued_count - 1),
        running_count: job.running_count + 1,
        events: [...job.events, createEvent('essay_started', `Started ${essay.essay_id ?? 'essay'}.`, essay.essay_id)],
        updated_at: new Date().toISOString(),
      };
      await this.storage.saveJob(job);

      const result = await this.gradeWithRetry(essay, queued.options, (attempt, message) => {
        job = {
          ...job,
          events: [...job.events, createEvent('essay_retry', `Attempt ${attempt}: ${message}`, essay.essay_id)],
          updated_at: new Date().toISOString(),
        };
      });
      job = {
        ...job,
        completed: job.completed + 1,
        failed: job.failed + (result.status === 'failed' ? 1 : 0),
        progress: Math.round(((job.completed + 1) / job.total) * 100),
        running_count: Math.max(0, job.running_count - 1),
        results: [...job.results, result],
        events: [
          ...job.events,
          createEvent(
            result.status === 'failed' ? 'essay_failed' : 'essay_finished',
            result.status === 'failed' ? result.error ?? 'Essay failed.' : 'Essay completed.',
            result.essay_id,
          ),
        ],
        updated_at: new Date().toISOString(),
      };
      await this.storage.saveJob(job);
    }

    job = {
      ...job,
      status: job.failed === 0 ? 'success' : job.failed === job.total ? 'failed' : 'partial_success',
      progress: 100,
      events: [...job.events, createEvent('finished', `Batch job finished with ${job.failed} failure(s).`)],
      updated_at: new Date().toISOString(),
    };
    await this.storage.saveJob(job);
  }

  private async gradeWithRetry(
    essay: EssayInput,
    options: GradeOptions | undefined,
    onRetry: (attempt: number, message: string) => void,
  ): Promise<EssayGradeResult> {
    let lastResult: EssayGradeResult | undefined;
    const maxAttempts = this.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.gradeOnce(essay, options);
      lastResult = {
        ...result,
        attempts: attempt,
      };

      if (lastResult.status === 'success') {
        return lastResult;
      }

      if (attempt < maxAttempts) {
        onRetry(attempt + 1, lastResult.error ?? 'Essay grading failed.');
      }
    }

    return lastResult as EssayGradeResult;
  }

  private async gradeOnce(essay: EssayInput, options?: GradeOptions): Promise<EssayGradeResult> {
    try {
      return await withTimeout(
        this.grader.grade(essay, options),
        this.timeoutMs,
        `Essay grading timed out after ${this.timeoutMs}ms.`,
      );
    } catch (error) {
      const now = new Date().toISOString();
      return {
        essay_id: essay.essay_id ?? `essay_${Date.now()}`,
        student_name: essay.student_name,
        status: 'failed',
        attempts: 1,
        score: null,
        level: null,
        grade_level: essay.grade_level,
        genre: essay.genre,
        summary: '',
        problems: [],
        polished_text: '',
        markdown_report: '',
        provider: 'local-draft',
        model: null,
        prompt_version: 'essay-grading-v1',
        error: error instanceof Error ? error.message : String(error),
        duration_ms: this.timeoutMs,
        created_at: now,
      };
    }
  }
}

function createJobId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 10);
  return `batch_${date}_${suffix}`;
}

function createEvent(type: JobEvent['type'], message: string, essayId?: string): JobEvent {
  return {
    at: new Date().toISOString(),
    type,
    essay_id: essayId,
    message,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
