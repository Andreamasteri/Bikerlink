// Task #2537 — Wrapper safe per autofix: quarantena pre-azione, poi esegue.
import type { AppIntegrityCheck, AutoFixResult, CheckContext } from "./types";
import { quarantineFile } from "./quarantine";

export async function runOneAutofix(
  check: AppIntegrityCheck,
  opts: { dryRun?: boolean; violationId?: string | null } = {},
): Promise<AutoFixResult & { quarantinedIds?: string[] }> {
  if (!check.autofix) return { applied: false, affected: 0, summary: "no-autofix" };
  const ctx: CheckContext = { dryRun: !!opts.dryRun, projectRoot: process.cwd() };

  const quarantinedIds: string[] = [];
  if (!opts.dryRun && check.autofix.operation !== "noop" && check.autofix.targetPaths.length) {
    for (const p of check.autofix.targetPaths) {
      const q = await quarantineFile({
        family: check.family,
        filePath: p,
        reason: `pre-autofix ${check.id} (${check.autofix.kind})`,
        violationId: opts.violationId ?? null,
        ttlDays: 30,
      });
      if (q) quarantinedIds.push(q.id);
    }
  }

  try {
    const r = await check.autofix.run(ctx);
    return { ...r, quarantinedIds };
  } catch (err) {
    return { applied: false, affected: 0, summary: `autofix-error: ${(err as Error).message.slice(0, 200)}`, quarantinedIds };
  }
}
