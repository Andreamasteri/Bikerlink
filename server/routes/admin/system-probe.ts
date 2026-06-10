/**
 * GET /api/admin/system-probe
 *
 * Lightweight-to-call endpoint that returns live dot status for every
 * System Health indicator.
 *
 * Cache behaviour:
 *  - Cold cache (updatedAt === 0): probe runs inline so the first response
 *    contains real data instead of grey "unknown" dots.
 *  - Warm cache: cached snapshot is returned immediately (fast-path) and a
 *    background probe is fired to refresh it for the next caller.
 *
 * ThinkCentre services (graphhopper, valhalla, nominatim, ollama, whisper,
 * ufw, redis, postgres, pgadmin, nginx, uptimeKuma, thinkcentre overall) →
 *   parallel HTTP probes via probeThinkCentreStatusSnapshot().
 *
 * routing  → derived from in-memory routing counters (no network call).
 * matching → derived from in-memory matching state  (no network call).
 */

import { Router, type Request, type Response } from "express";
import { probeThinkCentreStatusSnapshot } from "./thinkcentre-health";
import { getRoutingCounters } from "../../routing/routing-metrics";
import { getLastCycleOutcome, getMatchingLockState } from "../../matching/scheduler";
import { getRecentErrorCount } from "../../matching/match-log-buffer";
import { updateSystemStatus, getSystemStatus, type DotStatus } from "../../lib/system-status-cache";

const router = Router();

let _probeInFlight = false;

async function runProbe(): Promise<void> {
  if (_probeInFlight) return;
  _probeInFlight = true;
  try {
    const [tcSnap] = await Promise.all([
      probeThinkCentreStatusSnapshot(),
    ]);

    const counters = getRoutingCounters();
    const routingTotal = counters.successes + counters.fallbacks + counters.failures;
    const routing: DotStatus =
      routingTotal === 0 ? "unknown" :
      counters.failures > 0 ? "offline" :
      counters.fallbacks > 0 ? "degraded" : "ok";

    const lockLocal = getMatchingLockState();
    const lastOutcome = getLastCycleOutcome();
    const recentErrors = getRecentErrorCount(5 * 60 * 1000);
    const cycleStatus = lockLocal.isRunning ? "running" : lastOutcome === "error" ? "error" : "idle";
    const matching: DotStatus =
      cycleStatus === "error" || recentErrors > 0 ? "degraded" : "ok";

    updateSystemStatus({ ...tcSnap, routing, matching });
  } finally {
    _probeInFlight = false;
  }
}

/**
 * Called once at server boot (via setImmediate in boot-sequence.ts) to
 * populate the in-memory cache before the first admin request arrives.
 * Only runs when the cache is still at its cold-boot default (updatedAt === 0).
 */
export async function warmUpSystemStatusCache(): Promise<void> {
  if (getSystemStatus().updatedAt !== 0) return;
  try {
    await runProbe();
    console.log("[system-probe] warm-up probe complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[system-probe] warm-up probe failed (non-fatal):", msg);
  }
}

router.get("/system-probe", async (_req: Request, res: Response) => {
  const cached = getSystemStatus();

  if (cached.updatedAt === 0) {
    // Cold cache: probe inline so the very first response has real data.
    try {
      await runProbe();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[admin/system-probe] cold-cache inline probe error:", msg);
    }
    return res.json(getSystemStatus());
  }

  // Warm cache: return immediately, refresh in background for the next caller.
  runProbe().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/system-probe] background probe error:", msg);
  });
  return res.json(cached);
});

export default router;
