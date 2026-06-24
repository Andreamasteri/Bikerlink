// Task #4825 — Runner del Health Check: esegue i checker selezionati con timeout
// per-checker, classifica i fix (deterministico) e aggrega il report.
import { CHECKERS } from "./index";
import { annotateSafety } from "./classify";
import type {
  CheckerResult,
  HealthCheckReport,
  HealthCheckSummary,
  AiProviderChoice,
} from "./types";

const CHECKER_TIMEOUT_MS = 200_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout ${label} dopo ${ms}ms`)), ms),
    ),
  ]);
}

export interface RunOptions {
  checkerIds: string[];
  mode: "analysis" | "fix";
  aiProvider: AiProviderChoice | null;
  onProgress?: (checkerId: string, status: CheckerResult["status"], durationMs: number) => void;
}

function emptySummary(): HealthCheckSummary {
  return { critical: 0, warning: 0, info: 0, skipped: 0 };
}

export async function runHealthCheck(opts: RunOptions): Promise<HealthCheckReport> {
  const start = Date.now();
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const selected = CHECKERS.filter((c) => opts.checkerIds.includes(c.id));
  const checkers: CheckerResult[] = [];
  const summary = emptySummary();

  for (const checker of selected) {
    const t0 = Date.now();
    try {
      const raw = await withTimeout(checker.run(), CHECKER_TIMEOUT_MS, checker.id);
      const results = annotateSafety(raw);
      for (const r of results) summary[r.severity]++;
      const cr: CheckerResult = {
        id: checker.id,
        status: "ok",
        durationMs: Date.now() - t0,
        results,
      };
      checkers.push(cr);
      opts.onProgress?.(checker.id, "ok", cr.durationMs);
    } catch (err) {
      summary.skipped++;
      const cr: CheckerResult = {
        id: checker.id,
        status: "error",
        durationMs: Date.now() - t0,
        error: (err as Error).message ?? "errore sconosciuto",
        results: [],
      };
      checkers.push(cr);
      opts.onProgress?.(checker.id, "error", cr.durationMs);
    }
  }

  return {
    runId,
    runAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    checkersRun: selected.map((c) => c.id),
    mode: opts.mode,
    aiProvider: opts.aiProvider,
    summary,
    checkers,
    aiAnalysis: null,
    aiAnalysisStatus: opts.mode === "fix" || opts.aiProvider ? "pending" : "skipped",
  };
}
