/**
 * Monitor endpoints for the matching engine.
 *
 * GET /matching/monitor — aggregated snapshot (cycle state, lock, phase
 *   durations, memory, throughput per type, integrity checks).
 *   Reuses data already available in-process (no extra DB queries beyond
 *   a lightweight PostGIS index check + source availability probes).
 *
 * GET /matching/logs — recent matching / scheduler log events with optional
 *   ?level=warn|error|all filter.
 */
import { Router, type Request, type Response } from "express";
import { db } from "../../../db";
import { sql } from "drizzle-orm";
import { sendSuccess, sendError } from "../../../lib/api-response";
import { getMatchingLockState, getMatchingLockStatus, getLastCycleOutcome } from "../../../matching/scheduler";
import { getLastMatchingCycleMeta } from "../../../matching-engine";
import { getNotificationCycleStats, getLastWishlistCapStatus } from "../../../matching/run-matching";
import { getLastMusicAffinityCapStatus, getMusicAffinityRunHistory } from "../../../matching/run-music-affinity";
import { getAggregate, getRecentCycles } from "../../../matching/perf-metrics";
import { getRedisStatus } from "../../../cache/redis";
import { getLimiterStats } from "../../../lib/throttle";
import { getMatchLogs, getRecentErrorCount } from "../../../matching/match-log-buffer";
import { updateSystemStatus } from "../../../lib/system-status-cache";

const router = Router();

/** All matcher phases in stable order — used for fixed throughput rows. */
export const KNOWN_PHASES: Array<{ key: string; label: string }> = [
  { key: "proposal_matching", label: "Proposte" },
  { key: "wishlist_matching", label: "Wishlist/Garage" },
  { key: "biker_biker_matching", label: "Biker↔Biker" },
  { key: "biker_biker_type_style", label: "Biker↔Biker stile" },
  { key: "club_brand", label: "Club brand" },
  { key: "music_biker_zav", label: "Musica Biker↔Zav" },
  { key: "music_affinity", label: "Music affinity" },
  { key: "gps_based", label: "GPS zona" },
  { key: "event_matching", label: "Eventi" },
  { key: "biker_zav_base", label: "Biker↔Zav base" },
  { key: "biker_zav_type_style", label: "Biker↔Zav stile" },
  { key: "distance_matching", label: "Distanza" },
  { key: "route_type_zone", label: "Percorso zona" },
  { key: "proposal_to_profile", label: "Profilo proposta" },
  { key: "route_similarity", label: "Route similarity" },
  { key: "bio_affinity", label: "Bio affinity" },
  { key: "telemetry_affinity", label: "Telemetry affinity" },
];

type SourceStatus = "OK" | "WARN" | "NO_DATA" | "INACTIVE";

/** Lightweight source availability probe — counts prerequisite rows per matcher family. */
async function probeSourceAvailability(): Promise<Record<string, SourceStatus>> {
  const result: Record<string, SourceStatus> = {};

  try {
    const [usersRow, motorcyclesRow, wishlistsRow, tagsRow, routesRow, clubsRow, eventsRow] =
      await Promise.all([
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt FROM users
          WHERE is_fake = false AND status = 'active' AND user_type IN ('biker','coppia')
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt FROM user_motorcycles um
          JOIN users u ON u.id = um.user_id
          WHERE u.is_fake = false AND u.status = 'active' AND u.user_type IN ('biker','coppia')
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt FROM zavorrina_wishlists
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt FROM entity_tags WHERE entity_type IN ('motorcycle','user')
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt FROM routes
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt FROM moto_clubs
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt FROM event_participants
        `),
      ]);

    const activeUsers = parseInt(usersRow.rows[0]?.cnt ?? "0", 10);
    const hasMoto = parseInt(motorcyclesRow.rows[0]?.cnt ?? "0", 10) >= 2;
    const hasWishlists = parseInt(wishlistsRow.rows[0]?.cnt ?? "0", 10) > 0;
    const hasTags = parseInt(tagsRow.rows[0]?.cnt ?? "0", 10) > 0;
    const hasRoutes = parseInt(routesRow.rows[0]?.cnt ?? "0", 10) > 0;
    const hasClubs = parseInt(clubsRow.rows[0]?.cnt ?? "0", 10) > 0;
    const hasEvents = parseInt(eventsRow.rows[0]?.cnt ?? "0", 10) > 0;

    const needsUsers = activeUsers >= 2;

    result["proposal_matching"] = needsUsers && hasMoto ? "OK" : needsUsers ? "WARN" : "NO_DATA";
    result["wishlist_matching"] = needsUsers && hasWishlists ? "OK" : hasWishlists ? "WARN" : "NO_DATA";
    result["biker_biker_matching"] = needsUsers && hasMoto ? "OK" : needsUsers ? "WARN" : "NO_DATA";
    result["biker_biker_type_style"] = needsUsers && hasTags ? "OK" : needsUsers ? "WARN" : "NO_DATA";
    result["club_brand"] = hasClubs ? "OK" : "NO_DATA";
    result["music_biker_zav"] = needsUsers && hasTags ? "OK" : "NO_DATA";
    result["music_affinity"] = needsUsers && hasTags ? "OK" : "NO_DATA";
    result["gps_based"] = needsUsers ? "OK" : "NO_DATA";
    result["event_matching"] = hasEvents ? "OK" : "NO_DATA";
    result["biker_zav_base"] = needsUsers ? "OK" : "NO_DATA";
    result["biker_zav_type_style"] = needsUsers && hasWishlists && hasTags ? "OK" : hasWishlists ? "WARN" : "NO_DATA";
    result["distance_matching"] = needsUsers ? "OK" : "NO_DATA";
    result["route_type_zone"] = hasRoutes ? "OK" : "NO_DATA";
    result["proposal_to_profile"] = needsUsers ? "OK" : "NO_DATA";
    result["route_similarity"] = hasRoutes ? "OK" : "NO_DATA";
    result["bio_affinity"] = needsUsers && hasMoto ? "OK" : needsUsers ? "WARN" : "NO_DATA";
    result["telemetry_affinity"] = hasRoutes ? "OK" : "NO_DATA";
  } catch {
    for (const p of KNOWN_PHASES) result[p.key] = "NO_DATA";
  }

  return result;
}

router.get("/matching/monitor", async (_req: Request, res: Response) => {
  try {
    const lockLocal = getMatchingLockState();
    const [lockDistributed, cycleMeta, perfAgg, recentCycles, redisStatus, sourceStatus] =
      await Promise.all([
        getMatchingLockStatus().catch(() => null),
        Promise.resolve(getLastMatchingCycleMeta()),
        Promise.resolve(getAggregate()),
        Promise.resolve(getRecentCycles(50)),
        Promise.resolve(getRedisStatus()),
        probeSourceAvailability(),
      ]);

    const lastCycle = recentCycles[recentCycles.length - 1] ?? null;
    const rssBytes = process.memoryUsage().rss;

    let usesGistIndex: boolean | null = null;
    try {
      const idxRes = await db.execute<{ cnt: string }>(sql`
        SELECT COUNT(*)::text AS cnt FROM pg_indexes
        WHERE indexname LIKE '%geom_gist%'
      `);
      usesGistIndex = parseInt(idxRes.rows[0]?.cnt ?? "0", 10) > 0;
    } catch {
      usesGistIndex = null;
    }

    const limiterStats = getLimiterStats();
    const rateLimiterOk = Object.values(limiterStats).every((s) => {
      const counts = s as { QUEUED?: number; RUNNING?: number };
      return (counts.QUEUED ?? 0) < 100;
    });

    const lastOutcome = getLastCycleOutcome();
    const cycleStatus: "running" | "idle" | "error" = lockLocal.isRunning
      ? "running"
      : lastOutcome === "error"
        ? "error"
        : "idle";

    const recentErrors = getRecentErrorCount(5 * 60 * 1000);

    /** Cumulative matches per phase across all buffered cycles. */
    const cumulativeByPhase: Record<string, number> = {};
    for (const cycle of recentCycles) {
      for (const phase of cycle.phases) {
        if (typeof phase.matchesCreated === "number" && phase.matchesCreated > 0) {
          cumulativeByPhase[phase.name] = (cumulativeByPhase[phase.name] ?? 0) + phase.matchesCreated;
        }
      }
    }

    const throughputByType = KNOWN_PHASES.map((p) => {
      const lastCycleMatches = lastCycle?.phases.find((ph) => ph.name === p.key)?.matchesCreated ?? 0;
      return {
        key: p.key,
        label: p.label,
        lastCycleMatches,
        cumulativeMatches: cumulativeByPhase[p.key] ?? 0,
        sourceStatus: sourceStatus[p.key] ?? "NO_DATA",
      };
    });

    const matchingDot =
      cycleStatus === "error" || recentErrors > 0 ? "degraded" : "ok";
    updateSystemStatus({ matching: matchingDot });

    const notificationStats = getNotificationCycleStats();
    const wishlistCapStatus = getLastWishlistCapStatus();
    const musicAffinityCapStatus = getLastMusicAffinityCapStatus();

    return sendSuccess(res, {
      cycleStatus,
      lock: {
        local: lockLocal,
        distributed: lockDistributed,
      },
      lastCycleMeta: cycleMeta,
      lastCyclePhases: lastCycle?.phases ?? [],
      perfAggregate: perfAgg,
      throughputByType,
      memory: {
        rssMb: Math.round(rssBytes / 1024 / 1024),
        rssBytes,
      },
      integrity: {
        usesGistIndex,
        dragonfly: redisStatus,
        rateLimiterOk,
      },
      recentErrorCount: recentErrors,
      lastCycleNotifications: {
        sent: notificationStats.sent,
        failed: notificationStats.failed,
        retried: notificationStats.retried,
      },
      capStatus: {
        wishlist: wishlistCapStatus,
        musicAffinity: musicAffinityCapStatus,
        capSettingKey: "matching_max_per_run",
      },
    });
  } catch (error) {
    console.error("[admin/matching/monitor] error:", error);
    return sendError(res, 500, "Errore lettura monitor matching");
  }
});

router.get("/matching/music-affinity-stats", async (_req: Request, res: Response) => {
  try {
    const capStatus = getLastMusicAffinityCapStatus();
    const runHistory = getMusicAffinityRunHistory();

    const [embeddingRow, activeUsersRow, matchCountRow] = await Promise.all([
      db.execute<{ cnt: string }>(sql`
        SELECT COUNT(*)::text AS cnt
        FROM embeddings e
        INNER JOIN users u ON u.id = e.entity_id
        WHERE e.entity_type = 'user'
          AND e.field = 'music_taste'
          AND u.is_fake = false
          AND u.status = 'active'
      `),
      db.execute<{ cnt: string }>(sql`
        SELECT COUNT(*)::text AS cnt
        FROM users
        WHERE is_fake = false AND status = 'active'
      `),
      db.execute<{ cnt: string }>(sql`
        SELECT COUNT(*)::text AS cnt FROM music_affinity_matches
      `),
    ]);

    const usersWithEmbedding = parseInt(embeddingRow.rows[0]?.cnt ?? "0", 10);
    const totalActiveUsers = parseInt(activeUsersRow.rows[0]?.cnt ?? "0", 10);
    const totalMatchesInDb = parseInt(matchCountRow.rows[0]?.cnt ?? "0", 10);
    const coveragePct = totalActiveUsers > 0
      ? Math.round((usersWithEmbedding / totalActiveUsers) * 100)
      : 0;

    const lastRun = runHistory.length > 0 ? runHistory[runHistory.length - 1] : null;

    return sendSuccess(res, {
      usersWithEmbedding,
      totalActiveUsers,
      coveragePct,
      totalMatchesInDb,
      lastRun,
      recentRuns: runHistory.slice().reverse(),
      sessionCapStatus: capStatus,
    });
  } catch (error) {
    console.error("[admin/matching/music-affinity-stats] error:", error);
    return sendError(res, 500, "Errore lettura statistiche music affinity");
  }
});

router.get("/matching/logs", (req: Request, res: Response) => {
  try {
    const rawLevel = typeof req.query.level === "string" ? req.query.level.toLowerCase() : "all";
    const level = rawLevel === "warn" || rawLevel === "error" ? rawLevel : "all";
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;

    const logs = getMatchLogs({ level, limit });
    const errorCount = getRecentErrorCount(5 * 60 * 1000);
    return sendSuccess(res, { logs, errorCount });
  } catch (error) {
    console.error("[admin/matching/logs] error:", error);
    return sendError(res, 500, "Errore lettura log matching");
  }
});

export default router;
