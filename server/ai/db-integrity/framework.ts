// === OBSERVABILITY PLANE — db-integrity framework ===
// Questo modulo APPARTIENE all'observability plane: esegue i check di integrità,
// li misura e produce risultati; non modifica lo stato del sistema. L'alerting e
// la slice di salute "db-integrity" sono gestiti a valle (runner.ts → aggregator),
// con l'Health Arbiter (server/lib/health-arbiter.ts) come unica fonte di verità.
//
// Task #2536 — Framework: esegue un IntegrityCheck con timeout, cattura errori,
// produce un risultato uniforme. Non scrive sul DB (lo fa il runner).
import type { IntegrityCheck, CheckResult, IntegrityCheckContext } from "./types";
import { createHash } from "crypto";

const DEFAULT_TIMEOUT_MS = 30_000;

export async function executeCheck(
  check: IntegrityCheck,
  ctx: IntegrityCheckContext,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ result: CheckResult; durationMs: number; error?: string }> {
  const started = Date.now();
  try {
    const result = await withTimeout(check.query(ctx), timeoutMs);
    return { result, durationMs: Date.now() - started };
  } catch (err) {
    const msg = (err as Error).message?.slice(0, 300) ?? "unknown";
    return {
      result: { ok: true, count: 0, sample: [], details: { error: msg } },
      durationMs: Date.now() - started,
      error: msg,
    };
  }
}

export async function executeAutofix(
  check: IntegrityCheck,
  ctx: IntegrityCheckContext,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  if (!check.autofix) {
    return { applied: false, affected: 0, summary: "no-autofix", details: undefined as Record<string, unknown> | undefined };
  }
  // Enforcement allow-list a livello framework (oltre alle guard interne ai check).
  const a = check.autofix;
  if (a.operation === "delete") {
    for (const t of a.targetTables) {
      if (!DELETE_SAFE_TABLES.has(t)) {
        return { applied: false, affected: 0, summary: `BLOCCATO: DELETE su ${t} non in allow-list framework` };
      }
    }
  } else if (a.operation === "update") {
    for (const t of a.targetTables) {
      if (!UPDATE_SAFE_TABLES.has(t)) {
        return { applied: false, affected: 0, summary: `BLOCCATO: UPDATE su ${t} non in allow-list framework` };
      }
    }
  } else if (a.operation !== "enqueue" && a.operation !== "noop") {
    return { applied: false, affected: 0, summary: `BLOCCATO: operation autofix non riconosciuta` };
  }
  try {
    return await withTimeout(check.autofix.run(ctx), timeoutMs);
  } catch (err) {
    return { applied: false, affected: 0, summary: (err as Error).message?.slice(0, 200) ?? "autofix-error" };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export function hashViolation(checkId: string, result: CheckResult): string {
  // Hash stabile: checkId + count + primi PK del sample (ordinati).
  const pks = result.sample.map((s) => s.pk ?? JSON.stringify(s.data)).sort().slice(0, 20).join("|");
  return createHash("sha256").update(`${checkId}::${result.count}::${pks}`).digest("hex").slice(0, 32);
}

// Allow-list di tabelle su cui un autofix safe può cancellare righe (audit-log only).
export const DELETE_SAFE_TABLES = new Set<string>([
  "ai_watchdog_log",
  "ai_suggestions_log",
  "anomaly_events",
  "moderator_digests",
  "system_signals",
  "system_health_snapshot",
  "db_integrity_runs",            // solo cleanup di vecchi run
  "db_integrity_violations",      // solo cleanup di vecchie violazioni risolte
  "tag_assignments",              // orphan-only (verificato dal check)
  "match_feedback",               // orphan-only
  "ai_watchdog_log",              // soft-delete cleanup retention
  "ai_suggestions_log",
  "system_signals",
]);

// Allow-list di tabelle target per UPDATE safe (contatori, backfill).
export const UPDATE_SAFE_TABLES = new Set<string>([
  "users",
  "matches",
  "biker_zavorrina_matches",
  "biker_biker_matches",
  "reports",
  "match_preferences",
  "embeddings",
  "tag_assignments",
  "db_integrity_violations",
  // tabelle target di backfill-updated-at:
  "rides",
  "events",
  "planned_routes",
]);
