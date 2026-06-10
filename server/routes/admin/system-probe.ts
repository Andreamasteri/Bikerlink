/**
 * GET /api/admin/system-probe
 *
 * Lightweight-to-call endpoint that returns live dot status for every
 * System Health indicator.  It runs its own probes on each request so
 * dots stay fresh even when the SystemHealthContainer body is collapsed
 * and the heavy dashboard cards are not polling.
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

router.get("/system-probe", async (_req: Request, res: Response) => {
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

    return res.json(getSystemStatus());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/system-probe] error:", msg);
    return res.json(getSystemStatus());
  }
});

export default router;
