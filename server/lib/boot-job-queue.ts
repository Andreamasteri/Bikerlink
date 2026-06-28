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
 *   bootJobQueue.sealAndStart();
 *
 * Barriera esplicita (Task #5123): dopo sealAndStart() la coda è "sigillata" e
 * qualsiasi register() successiva LANCIA un errore invece di perdere il job in
 * silenzio. Così un job registrato troppo tardi (es. dopo che la Phase 5 ha
 * sigillato la coda) fallisce in modo rumoroso e visibile, anziché non girare
 * mai senza che nessuno se ne accorga.
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
  private sealed = false;
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
    // Barriera esplicita: dopo sealAndStart() registrare un job è un BUG (il job
    // non girerebbe mai). Lanciamo invece di perderlo in silenzio — così l'errore
    // è visibile nei log/Sentry e viene corretto, non ignorato.
    if (this.sealed) {
      throw new Error(
        `[BootJobQueue] register("${name}") chiamato dopo sealAndStart() — la coda è sigillata. ` +
        `Registra tutti i boot job PRIMA che la Phase 5 sigilli la coda.`,
      );
    }
    if (this.started) {
      console.warn(`[BootJobQueue] register("${name}") called after start() — job will NOT run`);
      return;
    }
    this.jobs.push({ name, fn });
  }

  /**
   * Sigilla la coda e la avvia (Task #5123). È il modo CANONICO di armare la
   * coda al termine dell'ultima fase di boot: dopo questa chiamata register()
   * lancia un errore esplicito. Idempotente — solo la prima chiamata ha effetto.
   */
  sealAndStart(): void {
    this.sealed = true;
    this.start();
  }

  /**
   * Arm the queue.  Safe to call multiple times — only the first call has effect.
   * Schedules the drain loop to begin after initialDelayMs.
   *
   * Preferire sealAndStart() ai chiamanti finali: arma E sigilla la coda. start()
   * resta esposto per compatibilità ma NON sigilla (register continuerebbe a
   * warnare invece di lanciare).
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
