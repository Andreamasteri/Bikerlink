// Task #2654 — Adapter Watchdog → AI Coordinator (b).
import { getCoordinator } from "../index";

const AI_NAME = "watchdog";

interface ProblemLike {
  id: string;
  title: string;
  severity: string; // accetta sia watchdog Severity (info/warn/high/critical) sia integrity (low/medium/high/critical)
  suggestion?: string;
}

export async function emitWatchdogAlert(args: {
  problem: ProblemLike;
  score: number;
  status: "green" | "yellow" | "orange" | "red";
  correlationId?: string;
}): Promise<void> {
  try {
    const c = getCoordinator();
    await c.emit({
      aiName: AI_NAME,
      eventType: "alert",
      payload: {
        problemId: args.problem.id,
        title: args.problem.title,
        suggestion: args.problem.suggestion ?? null,
        snapshotScore: args.score,
        snapshotStatus: args.status,
      },
      severity: mapSeverity(args.problem.severity),
      correlationId: args.correlationId ?? `watchdog-${args.problem.id.slice(0, 24)}`,
    });
  } catch (err) {
    console.warn(`[coordinator/watchdog] emit alert fallback:`, (err as Error).message);
  }
}

export async function emitWatchdogStatusChange(args: {
  status: "green" | "yellow" | "orange" | "red";
  score: number;
  topProblem: string | null;
  correlationId?: string;
}): Promise<void> {
  if (args.status === "green" || args.status === "yellow") return; // niente rumore
  try {
    const c = getCoordinator();
    await c.emit({
      aiName: AI_NAME,
      eventType: "status_change",
      payload: { status: args.status, score: args.score, topProblem: args.topProblem },
      severity: args.status === "red" ? "critical" : "warn",
      correlationId: args.correlationId,
    });
  } catch (err) {
    console.warn(`[coordinator/watchdog] emit status fallback:`, (err as Error).message);
  }
}

export async function emitWatchdogKillSwitch(args: {
  enabled: boolean;
  triggeredBy?: string;
  reason?: string;
}): Promise<void> {
  try {
    const c = getCoordinator();
    await c.emit({
      aiName: AI_NAME,
      eventType: "kill_switch",
      payload: { enabled: args.enabled, triggeredBy: args.triggeredBy ?? null, reason: args.reason ?? null },
      severity: "critical",
      correlationId: `killswitch-${Date.now().toString(36)}`,
    });
  } catch (err) {
    console.warn(`[coordinator/watchdog] emit kill_switch fallback:`, (err as Error).message);
  }
}

function mapSeverity(s: string): "debug" | "info" | "warn" | "critical" {
  switch ((s ?? "").toLowerCase()) {
    case "critical": return "critical";
    case "high": return "warn";
    case "warn": return "warn";
    case "medium": return "info";
    case "info": return "info";
    case "low": return "debug";
    case "debug": return "debug";
    default: return "info";
  }
}

export function wireWatchdogToCoordinator(): void {
  console.log("[INIT] AI Coordinator wire watchdog");
}
