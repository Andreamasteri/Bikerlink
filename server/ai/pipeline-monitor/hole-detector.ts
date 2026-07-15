import { db, withDbRetry } from "../../db";
import { pipelineFlowEvents } from "@shared/db";
import { writeWatchdogLog } from "../watchdog/log";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { withJobGate } from "../coordinator/gated-job";

export interface PipelineHole {
  id: string;
  pipeline: string;
  traceId: string;
  lastCheckpoint: string;
  ageMs: number;
  detectedAt: string;
  resolved: boolean;
}

export interface HolesResult {
  active: PipelineHole[];
  recent: PipelineHole[];
}

// Thresholds (ms) per pipeline beyond which an unresolved trace is a "hole"
const PIPELINE_TIMEOUTS: Record<string, number> = {
  telemetry_ride:   5 * 60_000,   // 5 min
  telemetry_maps:   5 * 60_000,
  matching:         90 * 60_000,  // 90 min (cycle is hourly)
  notifications:    30 * 60_000,
  gps:              4 * 60 * 60_000, // 4h
  chat:             10 * 60_000,
  road_hazards:     5 * 60_000,
  embedding_bio:    25 * 60 * 60_000, // 25h
  embedding_music:  25 * 60 * 60_000,
};
const DEFAULT_TIMEOUT_MS = 30 * 60_000;

let _lastHoles: HolesResult = { active: [], recent: [] };

export function getLastHoles(): HolesResult {
  return _lastHoles;
}

export async function detectPipelineHoles(): Promise<HolesResult> {
  try {
    // Active: traces not resolved and older than their pipeline threshold
    const now = new Date();

    // Lettura full-table ricorrente (ogni 5 min): passa dal budget connessioni
    // dei job in background così non compete col traffico utente e ritenta i blip
    // transitori invece di emettere rumore a ogni tick.
    const rows = await withBgDbSlot(() => withDbRetry(() => db.select().from(pipelineFlowEvents)));
    const active: PipelineHole[] = [];
    const recent: PipelineHole[] = [];

    // Group by (pipeline, traceId) — take latest checkpoint per trace
    const traceMap = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      const key = `${row.pipeline}|${row.traceId}`;
      const existing = traceMap.get(key);
      if (!existing || row.ts > existing.ts) {
        traceMap.set(key, row);
      }
    }

    for (const [, row] of traceMap) {
      if (row.resolved) continue;
      const timeout = PIPELINE_TIMEOUTS[row.pipeline] ?? DEFAULT_TIMEOUT_MS;
      const ageMs = now.getTime() - row.ts.getTime();
      if (ageMs > timeout) {
        active.push({
          id: row.id,
          pipeline: row.pipeline,
          traceId: row.traceId,
          lastCheckpoint: row.checkpoint,
          ageMs,
          detectedAt: new Date().toISOString(),
          resolved: false,
        });
      }
    }

    // Recent: all unresolved in last 48h (raw last checkpoint per trace)
    const cutoff48h = new Date(now.getTime() - 48 * 60 * 60_000);
    for (const [, row] of traceMap) {
      if (!row.resolved && row.ts >= cutoff48h) {
        const timeout = PIPELINE_TIMEOUTS[row.pipeline] ?? DEFAULT_TIMEOUT_MS;
        const ageMs = now.getTime() - row.ts.getTime();
        if (ageMs > timeout) {
          recent.push({
            id: row.id,
            pipeline: row.pipeline,
            traceId: row.traceId,
            lastCheckpoint: row.checkpoint,
            ageMs,
            detectedAt: new Date().toISOString(),
            resolved: false,
          });
        }
      }
    }

    // Sort active by age descending
    active.sort((a, b) => b.ageMs - a.ageMs);
    recent.sort((a, b) => b.ageMs - a.ageMs);
    const recentSlice = recent.slice(0, 50);

    _lastHoles = { active, recent: recentSlice };

    if (active.length > 0) {
      await writeWatchdogLog({
        kind: "signal",
        scope: "pipeline-holes",
        status: "warn",
        summary: `${active.length} pipeline hole/i attivi rilevati`,
        details: { active: active.slice(0, 10) },
      });
    }

    return _lastHoles;
  } catch (err) {
    console.warn("[pipeline-monitor] hole-detector error:", err);
    return _lastHoles;
  }
}

export function startHoleDetectorScheduler(): void {
  const FIVE_MIN = 5 * 60_000;
  const _gatedDetect = withJobGate("pipeline-hole-detector", () => {
    detectPipelineHoles().catch((e) => console.warn("[hole-detector] interval run error:", e));
  });
  setTimeout(() => {
    detectPipelineHoles().catch((e) => console.warn("[hole-detector] initial run error:", e));
    setInterval(_gatedDetect, FIVE_MIN);
  }, 60_000);
}
