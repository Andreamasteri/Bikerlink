// Task #2536 — Auto-fix engine. Esegue SOLO autofix.safe=true.
// Tutte le altre richiedono click admin via endpoint apply-fix.
import type { IntegrityCheck, AutoFixResult } from "./types";
import { executeAutofix } from "./framework";

export async function runSafeAutofixes(
  checks: IntegrityCheck[],
  ctx: { dryRun: boolean },
): Promise<Map<string, AutoFixResult>> {
  const out = new Map<string, AutoFixResult>();
  for (const c of checks) {
    if (!c.autofix?.safe) continue;
    const res = await executeAutofix(c, ctx);
    out.set(c.id, res);
  }
  return out;
}

export async function runOneAutofix(
  check: IntegrityCheck,
  ctx: { dryRun: boolean },
): Promise<AutoFixResult> {
  if (!check.autofix) return { applied: false, affected: 0, summary: "no-autofix" };
  return executeAutofix(check, ctx);
}
