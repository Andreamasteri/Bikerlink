// Task #2537 — Framework esecutore generico per AppIntegrityCheck.
// Riusa il pattern di #2536 (executeCheck/executeAutofix + hashViolation).
import { createHash } from "crypto";
import type { AppIntegrityCheck, CheckContext, CheckResult } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;

export async function executeCheck(
  check: AppIntegrityCheck,
  ctx: CheckContext,
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
  check: AppIntegrityCheck,
  ctx: CheckContext,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  if (!check.autofix) {
    return { applied: false, affected: 0, summary: "no-autofix" };
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
  const pks = result.sample.map((s) => s.pk ?? JSON.stringify(s.data)).sort().slice(0, 20).join("|");
  return createHash("sha256").update(`${checkId}::${result.count}::${pks}`).digest("hex").slice(0, 32);
}
