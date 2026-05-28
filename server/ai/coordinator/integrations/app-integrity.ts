// Task #2654 — Adapter App Integrity → AI Coordinator (b).
import { getCoordinator } from "../index";

const AI_NAME = "app-integrity";

type Sev = "debug" | "info" | "warn" | "critical";

export async function emitAppViolation(args: {
  runId: string;
  checkId: string;
  checkName: string;
  family: string;
  count: number;
  severity: "low" | "medium" | "high" | "critical";
  correlationId?: string;
}): Promise<void> {
  try {
    const c = getCoordinator();
    await c.emit({
      aiName: AI_NAME,
      eventType: "violation_detected",
      payload: {
        runId: args.runId,
        checkId: args.checkId,
        checkName: args.checkName,
        family: args.family,
        count: args.count,
        originalSeverity: args.severity,
      },
      severity: mapSeverity(args.severity),
      correlationId: args.correlationId ?? `app-int-${args.runId.slice(0, 12)}`,
    });
  } catch (err) {
    console.warn(`[coordinator/app-integrity] emit violation fallback:`, (err as Error).message);
  }
}

export async function emitAppAutofix(args: {
  runId: string;
  checkId: string;
  applied: boolean;
  affected: number;
  summary: string;
  correlationId?: string;
}): Promise<void> {
  try {
    const c = getCoordinator();
    await c.emit({
      aiName: AI_NAME,
      eventType: args.applied ? "autofix_applied" : "autofix_rejected",
      payload: {
        runId: args.runId,
        checkId: args.checkId,
        affected: args.affected,
        summary: args.summary,
      },
      severity: args.applied ? "info" : "warn",
      correlationId: args.correlationId ?? `app-int-${args.runId.slice(0, 12)}`,
    });
  } catch (err) {
    console.warn(`[coordinator/app-integrity] emit autofix fallback:`, (err as Error).message);
  }
}

function mapSeverity(s: string): Sev {
  switch ((s ?? "").toLowerCase()) {
    case "critical": return "critical";
    case "high": return "warn";
    case "medium": return "info";
    case "low": return "debug";
    default: return "info";
  }
}

export function wireAppIntegrityToCoordinator(): void {
  console.log("[INIT] AI Coordinator wire app-integrity");
}
