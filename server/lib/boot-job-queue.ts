/**
 * boot-job-queue.ts
 *
 * Lightweight sequential queue for heavy one-shot boot jobs that hit the DB.
 * Instead of each job using its own raw setTimeout (which can cause several
 * jobs to fire simultaneously if boot is slow), callers register their job
 * here and the queue runs them one at a time with a configurable gap.
 *
 * Usage:
 *   bootJobQueue.register("MyJob", async () => { ... });
 *   // At the end of the last boot phase:
 *   bootJobQueue.start();
 */

interface BootJob {
  name: string;
  fn: () => Promise<void>;
}

interface BootJobQueueOptions {
  /** Delay before the first job fires after start() is called (ms). Default: 4 min */
  initialDelayMs?: number;
  /** Pause between consecutive jobs (ms). Default: 45 s */
  gapMs?: number;
}

class BootJobQueue {
  private readonly jobs: BootJob[] = [];
  private started = false;
  private readonly initialDelayMs: number;
  private readonly gapMs: number;

  constructor(options: BootJobQueueOptions = {}) {
    this.initialDelayMs = options.initialDelayMs ?? 4 * 60_000;
    this.gapMs = options.gapMs ?? 45_000;
  }

  /**
   * Register a heavy boot job.  Must be called before start().
   * Duplicate names are allowed (each becomes a separate queue entry).
   */
  register(name: string, fn: () => Promise<void>): void {
    if (this.started) {
      console.warn(`[BootJobQueue] register("${name}") called after start() — job will NOT run`);
      return;
    }
    this.jobs.push({ name, fn });
  }

  /**
   * Arm the queue.  Safe to call multiple times — only the first call has effect.
   * Schedules the drain loop to begin after initialDelayMs.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    const count = this.jobs.length;
    const initialMin = (this.initialDelayMs / 60_000).toFixed(0);
    const gapSec = (this.gapMs / 1000).toFixed(0);
    console.log(
      `[BootJobQueue] Armed — ${count} job(s) queued, first starts in ${initialMin}min, gap ${gapSec}s between jobs`,
    );
    setTimeout(() => void this._drain(), this.initialDelayMs);
  }

  private async _drain(): Promise<void> {
    console.log(`[BootJobQueue] Drain started — ${this.jobs.length} job(s) to run`);
    for (let i = 0; i < this.jobs.length; i++) {
      const job = this.jobs[i];
      console.log(`[BootJobQueue] [${i + 1}/${this.jobs.length}] Starting: ${job.name}`);
      try {
        await job.fn();
        console.log(`[BootJobQueue] [${i + 1}/${this.jobs.length}] Done: ${job.name}`);
      } catch (err) {
        console.warn(`[BootJobQueue] [${i + 1}/${this.jobs.length}] Failed (non-fatal): ${job.name}`, err);
      }
      if (i < this.jobs.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.gapMs));
      }
    }
    console.log("[BootJobQueue] All boot jobs completed");
  }
}

export const bootJobQueue = new BootJobQueue({
  initialDelayMs: 4 * 60_000,
  gapMs: 45_000,
});
