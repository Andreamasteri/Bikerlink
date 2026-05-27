// Ring-buffer of recent matching cycle metrics. Read by /api/admin/matching/perf.

export type PhaseMetric = {
  name: string;
  durationMs: number;
  candidatesPre?: number;
  candidatesPost?: number;
  matchesCreated?: number;
  error?: string;
};

export type CycleMetric = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  phases: PhaseMetric[];
  totalMatchesCreated: number;
  trigger?: string;
};

const MAX_CYCLES = 50;
const buffer: CycleMetric[] = [];

export function recordCycle(metric: CycleMetric): void {
  buffer.push(metric);
  if (buffer.length > MAX_CYCLES) buffer.shift();
}

export function getRecentCycles(limit = MAX_CYCLES): CycleMetric[] {
  return buffer.slice(-limit);
}

export function getAggregate() {
  if (buffer.length === 0) return null;
  const total = buffer.reduce((a, c) => a + c.durationMs, 0);
  const avg = Math.round(total / buffer.length);
  const last = buffer[buffer.length - 1];
  const matchesAvg = Math.round(buffer.reduce((a, c) => a + c.totalMatchesCreated, 0) / buffer.length);
  return {
    cycleCount: buffer.length,
    avgDurationMs: avg,
    avgMatchesCreated: matchesAvg,
    lastCycle: last,
  };
}

export class PhaseRecorder {
  private start: number;
  private phases: PhaseMetric[] = [];
  private cycleStart: number;
  private trigger: string | undefined;

  constructor(trigger?: string) {
    this.cycleStart = Date.now();
    this.start = this.cycleStart;
    this.trigger = trigger;
  }

  async time<T>(name: string, fn: () => Promise<T>, extra?: Omit<PhaseMetric, "name" | "durationMs">): Promise<T> {
    const t0 = Date.now();
    try {
      const out = await fn();
      this.phases.push({ name, durationMs: Date.now() - t0, ...extra });
      return out;
    } catch (err) {
      this.phases.push({
        name,
        durationMs: Date.now() - t0,
        ...extra,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  recordPhase(p: PhaseMetric): void {
    this.phases.push(p);
  }

  updateLastPhase(extra: Partial<Omit<PhaseMetric, "name" | "durationMs">>): void {
    if (this.phases.length === 0) return;
    const last = this.phases[this.phases.length - 1];
    Object.assign(last, extra);
  }

  finish(totalMatchesCreated: number): CycleMetric {
    const completed = Date.now();
    const metric: CycleMetric = {
      startedAt: new Date(this.cycleStart).toISOString(),
      completedAt: new Date(completed).toISOString(),
      durationMs: completed - this.cycleStart,
      phases: this.phases,
      totalMatchesCreated,
      trigger: this.trigger,
    };
    recordCycle(metric);
    return metric;
  }
}
