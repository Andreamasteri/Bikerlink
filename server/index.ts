import express from "express";
import type { Request, Response } from "express";
import { createServer } from "http";
import { initState } from "./init-state";
import { startMatchingEngine, stopMatchingEngine } from "./matching-engine";
import { autoSeedEssentialUsers, autoSeedFakeUsers, seedAppleReviewerAccount, seedGooglePlayReviewerAccount, ensureBikerLinkOfficialOnBoot } from "./auto-seed";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { initUptimeTracking, startMetroMonitor, stopMetroMonitor } from "./uptime";
import { matchEnrichmentSemaphore, MATCH_ENRICHMENT_GLOBAL_LIMIT } from "./lib/concurrency";
import { storage } from "./storage";
import { runMigrations } from "./migrate";
import { setupMiddleware, setupStaticRoutes } from "./middleware";
import { registerAllRoutes } from "./route-mounter";
import { setupErrorHandler } from "./error-handler";
import { initMissingClubConversations, getOtaRetentionDays } from "./init-helpers";

// ── Phase timeout helper ─────────────────────────────────────────────────────
// Fatal phases: timeout rejects → propagates → process.exit(1)
const BOOT_PHASE_TIMEOUT_MS = Number(process.env.BOOT_PHASE_TIMEOUT_MS) || 30_000;

function withPhaseTimeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[BOOT] Timeout ${BOOT_PHASE_TIMEOUT_MS}ms exceeded in phase: ${label}`));
    }, BOOT_PHASE_TIMEOUT_MS);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

const BOOT_START = Date.now();

function bootLog(n: number, total: number, step: string, msg: string) {
  const elapsed = ((Date.now() - BOOT_START) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] [${n}/${total}] ${step} — ${elapsed}s | ${msg}`);
}

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();

setupMiddleware(app);

app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).send("ok");
});

app.get("/api/metrics", (_req: Request, res: Response) => {
  res.json({
    matchEnrichmentSemaphore: {
      activeCount: matchEnrichmentSemaphore.activeCount,
      pendingCount: matchEnrichmentSemaphore.pendingCount,
      limit: MATCH_ENRICHMENT_GLOBAL_LIMIT,
    },
  });
});

registerAllRoutes(app);
setupStaticRoutes(app);
setupErrorHandler(app);

const server = createServer(app);
const activeConnections = new Set<import("net").Socket>();

server.on("connection", (socket) => {
  activeConnections.add(socket);
  socket.once("close", () => activeConnections.delete(socket));
});

function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  initState.initializing = false;

  stopMatchingEngine();
  stopMetroMonitor();

  activeConnections.forEach((socket) => socket.destroy());
  activeConnections.clear();

  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await pool.end();
      console.log("Database pool closed.");
    } catch (err) {
      console.error("Error closing database pool:", err);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ── Sequential boot ──────────────────────────────────────────────────────────
// Every phase awaits the previous one. initState.initializing stays true until
// ALL phases complete. /api/health returns 503 during this window, so the
// orchestrator (start.sh) waits for HTTP 200 before launching the frontend.

(async () => {
  const TOTAL = 5;

  // ── Phase 1: Migrations ───────────────────────────────────────────────────
  bootLog(1, TOTAL, "Migrations", "start");
  try {
    await withPhaseTimeout("Migrations", runMigrations());
    bootLog(1, TOTAL, "Migrations", "done");
  } catch (err) {
    console.error("[startup] FATAL — Migrations failed, aborting:", err);
    process.exit(1);
  }

  // ── Phase 2: HTTP Listen ──────────────────────────────────────────────────
  const PORT = 5000;
  bootLog(2, TOTAL, "HTTP Listen", `binding 0.0.0.0:${PORT}`);
  await new Promise<void>((resolve) => {
    server.listen(PORT, "0.0.0.0", () => {
      const formattedDate = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
      console.log(`[${formattedDate}] Server started on 0.0.0.0:${PORT} (initializing...)`);
      bootLog(2, TOTAL, "HTTP Listen", "ready — health returns 503 until boot completes");
      resolve();
    });
  });

  initUptimeTracking();
  startMetroMonitor();

  // ── Phase 3: DB Init (non-fatal sub-steps) ────────────────────────────────
  bootLog(3, TOTAL, "DB Init", "start");

  // OTA event cleanup (non-fatal)
  try {
    const cleanupResult = await db.execute(sql`
      DELETE FROM ota_events 
      WHERE runtime_version IS NULL 
         OR runtime_version = ''
         OR runtime_version = 'dirty-rv'
      RETURNING id
    `);
    const deletedCount = cleanupResult.rowCount ?? 0;
    if (deletedCount > 0) {
      console.log(`[INIT] Phase 3 dirty-rv cleanup: deleted ${deletedCount} row(s)`);
    }
  } catch (e) {
    console.warn("[INIT] Phase 3 dirty-rv cleanup (non-fatal):", e);
  }

  // OTA retention seed (non-fatal)
  try {
    const existing = await storage.getAppSetting("ota_cleanup_retention_days");
    if (!existing) {
      await storage.upsertAppSetting("ota_cleanup_retention_days", "90");
      console.log("[INIT] Phase 3: ota_cleanup_retention_days seeded");
    }
  } catch (e) {
    console.warn("[INIT] Phase 3 retention seed (non-fatal):", e);
  }

  // OTA stale release cleanup (non-fatal)
  try {
    const retentionDays = await getOtaRetentionDays();
    const cleanupResult = await db.execute(sql`
      DELETE FROM ota_releases
      WHERE status IN ('superseded', 'draft')
        AND published_at < NOW() - (${String(retentionDays)} || ' days')::INTERVAL
      RETURNING id, version, status, published_at, bundle_path
    `);
    const deletedRows = cleanupResult.rows as any[];
    if (deletedRows.length > 0) {
      console.log(`[INIT] Phase 3: removed ${deletedRows.length} stale OTA release(s)`);
      const { deleteObject } = await import("./objectStorage");
      for (const row of deletedRows) {
        if (row.bundle_path) {
          try { await deleteObject(row.bundle_path); } catch {}
        }
      }
    }
  } catch (e) {
    console.warn("[INIT] Phase 3 OTA cleanup (non-fatal):", e);
  }

  bootLog(3, TOTAL, "DB Init", "done");

  // ── Phase 4: Seed + Core services (FATAL — timeout → process.exit) ────────
  bootLog(4, TOTAL, "Seed + Engine", "start");
  try {
    // Fast COUNT(*) guard: skip seed if database already has users
    let skipSeed = false;
    try {
      const countResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM users`);
      const cnt = Number((countResult.rows[0] as any)?.cnt ?? 0);
      if (cnt > 100) {
        console.log(`[INIT] Phase 4: ${cnt} users found — skipping auto-seed`);
        skipSeed = true;
      }
    } catch (e) {
      console.warn("[INIT] Phase 4: COUNT users failed, proceeding with seed:", e);
    }

    if (!skipSeed) {
      await withPhaseTimeout("autoSeedEssentialUsers", autoSeedEssentialUsers());
      await withPhaseTimeout("autoSeedFakeUsers", autoSeedFakeUsers());
      await withPhaseTimeout("seedAppleReviewerAccount", seedAppleReviewerAccount());
      await withPhaseTimeout("seedGooglePlayReviewerAccount", seedGooglePlayReviewerAccount());
    } else {
      // Still ensure reviewer accounts and BikerLink official
      await withPhaseTimeout("seedAppleReviewerAccount", seedAppleReviewerAccount());
      await withPhaseTimeout("seedGooglePlayReviewerAccount", seedGooglePlayReviewerAccount());
    }

    await withPhaseTimeout("ensureBikerLinkOfficialOnBoot", ensureBikerLinkOfficialOnBoot());
    startMatchingEngine();
    await withPhaseTimeout("initMissingClubConversations", initMissingClubConversations());
  } catch (err) {
    console.error("[INIT] FATAL — Phase 4 failed:", err);
    process.exit(1);
  }
  bootLog(4, TOTAL, "Seed + Engine", "done");

  // ── Phase 5: Schedulers + maintenance jobs ────────────────────────────────
  bootLog(5, TOTAL, "Schedulers", "start");
  try {
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const runPlaylistSnapshot = async () => {
      try {
        const { userMusicTracks: umt, userPlaylistSnapshots } = await import("@shared/schema");
        const { eq: eqSnap } = await import("drizzle-orm");
        const usersWithTracks = await db.execute(sql`SELECT DISTINCT user_id FROM user_music_tracks`);
        let saved = 0;
        for (const row of usersWithTracks.rows as any[]) {
          const tracks = await db.select().from(umt).where(eqSnap(umt.userId, row.user_id));
          if (tracks.length === 0) continue;
          const tracksJson = tracks.map((t) => ({
            lastfmTrackId: t.lastfmTrackId,
            trackName: t.trackName,
            artistId: t.artistId,
            artistName: t.artistName,
            albumName: t.albumName,
            imageUrl: t.imageUrl,
            genres: t.genres,
            popularity: t.popularity,
            provider: t.provider,
          }));
          await db.insert(userPlaylistSnapshots).values({ userId: row.user_id, tracksJson, savedAt: new Date() })
            .onConflictDoUpdate({ target: [userPlaylistSnapshots.userId], set: { tracksJson, savedAt: new Date() } });
          saved++;
        }
        console.log(`[SNAPSHOT] Playlist snapshot saved for ${saved} users`);
      } catch (e) { console.warn("[SNAPSHOT] runPlaylistSnapshot error:", e); }
    };
    await withPhaseTimeout("runPlaylistSnapshot", runPlaylistSnapshot());
    setInterval(runPlaylistSnapshot, SIX_HOURS_MS);

    const { cleanupOrphanedAdImages } = await import("./routes/ads");
    setTimeout(async () => {
      await cleanupOrphanedAdImages();
      setInterval(cleanupOrphanedAdImages, 24 * 60 * 60 * 1000);
    }, 5 * 60 * 1000);

    const { scheduleNightlyVacuum } = await import("./vacuum-service");
    scheduleNightlyVacuum();

    const { scheduleNightlyMapMatching } = await import("./map-matching-job");
    scheduleNightlyMapMatching();

    const { scheduleWeeklyCurvyScoreUpdate } = await import("./curvy-score-job");
    scheduleWeeklyCurvyScoreUpdate();

    const { saveSchemaSnapshot } = await import("./scripts/snapshot-schema");
    await withPhaseTimeout("saveSchemaSnapshot", saveSchemaSnapshot());
  } catch (err) {
    console.error("[INIT] FATAL — Phase 5 failed:", err);
    process.exit(1);
  }
  bootLog(5, TOTAL, "Schedulers", "done");

  // ── Boot complete: health now returns 200 ─────────────────────────────────
  initState.initializing = false;
  const totalElapsed = ((Date.now() - BOOT_START) / 1000).toFixed(1);
  console.log(`[INIT] All startup phases completed in ${totalElapsed}s — server is READY`);
})().catch((err) => {
  console.error("[INIT] Uncaught fatal error during startup:", err);
  process.exit(1);
});
