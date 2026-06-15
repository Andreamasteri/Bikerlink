import { getLastPipelineRunResult, isPipelineRunInProgress } from "./runner";
import { getLastHoles } from "./hole-detector";
import { db, pool } from "../../db";
import { aiWatchdogLog } from "@shared/db";
import { desc } from "drizzle-orm";
import { getSystemStatus } from "../../lib/system-status-cache";

export interface PoolHealthPayload {
  total: number;
  idle: number;
  waiting: number;
  max: number;
  status: "ok" | "warn" | "critical";
}

export function getPipelineStatusPayload(): unknown {
  const result = getLastPipelineRunResult();
  return {
    result,
    inProgress: isPipelineRunInProgress(),
    ts: new Date().toISOString(),
  };
}

export function getHolesPayload(): unknown {
  return { ...getLastHoles(), ts: new Date().toISOString() };
}

export async function getWatchdogLogsPayload(): Promise<unknown> {
  try {
    const rows = await db
      .select()
      .from(aiWatchdogLog)
      .orderBy(desc(aiWatchdogLog.createdAt))
      .limit(50);
    return { logs: rows, ts: new Date().toISOString() };
  } catch (err) {
    return { logs: [], error: (err as Error).message, ts: new Date().toISOString() };
  }
}

export function getPoolHealthPayload(): PoolHealthPayload {
  const opts = (pool as unknown as { options?: { max?: number } }).options;
  const max = typeof opts?.max === "number" ? opts.max : 10;
  const total = pool.totalCount;
  const idle = pool.idleCount;
  const waiting = pool.waitingCount;
  const status: PoolHealthPayload["status"] =
    waiting >= max ? "critical" : waiting > 0 ? "warn" : "ok";
  return { total, idle, waiting, max, status };
}

export function getHeartbeatPayload(): unknown {
  const s = getSystemStatus();
  return {
    backend: "ok",
    matching: s.matching,
    ota: s.uptimeKuma,
    ai: s.ollama,
    websocket: s.redis !== "offline" ? "ok" : "degraded",
    updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
    ts: new Date().toISOString(),
  };
}
