import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { JobRecord } from './types';

export class JobStorage {
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly dataDir: string) {
    this.filePath = join(dataDir, 'jobs.json');
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      await readFile(this.filePath, 'utf8');
    } catch {
      await writeFile(this.filePath, JSON.stringify({ jobs: [] }, null, 2));
    }
  }

  async listJobs(): Promise<JobRecord[]> {
    const data = await this.readData();
    return data.jobs;
  }

  async getJob(jobId: string): Promise<JobRecord | undefined> {
    const data = await this.readData();
    return data.jobs.find((job) => job.job_id === jobId);
  }

  async saveJob(job: JobRecord): Promise<void> {
    await this.withWriteLock(async () => {
      const data = await this.readData();
      const index = data.jobs.findIndex((item) => item.job_id === job.job_id);
      if (index >= 0) {
        data.jobs[index] = job;
      } else {
        data.jobs.push(job);
      }
      await writeFile(this.filePath, JSON.stringify(data, null, 2));
    });
  }

  private async readData(): Promise<{ jobs: JobRecord[] }> {
    const raw = await readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw) as { jobs?: JobRecord[] };
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
  }

  private async withWriteLock(action: () => Promise<void>): Promise<void> {
    this.writeChain = this.writeChain.then(action, action);
    return this.writeChain;
  }
}
