import express from "express";
import type { Request, Response } from "express";
import { createServer } from "http";
import { initState } from "./init-state";
import { startMatchingEngine, stopMatchingEngine } from "./matching-engine";
import { autoSeedEssentialUsers, autoSeedFakeUsers, seedAppleReviewerAccount, seedGooglePlayReviewerAccount, ensureBikerLinkOfficialOnBoot } from "./auto-seed";
import { seedTranslationKeys } from "./routes/admin/translations";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { initUptimeTracking, startMetroMonitor, stopMetroMonitor } from "./uptime";
import { matchEnrichmentSemaphore, MATCH_ENRICHMENT_GLOBAL_LIMIT } from "./lib/concurrency";
import { runMigrations } from "./migrate";
import { setupMiddleware, setupStaticRoutes } from "./middleware";
import { registerAllRoutes } from "./route-mounter";
import { setupErrorHandler } from "./error-handler";
import { initMissingClubConversations } from "./init-helpers";
import { initSentry, attachSentryErrorHandler } from "./sentry";

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

// Task #2527 — Sentry deve essere inizializzato il prima possibile (no-op se
// SENTRY_DSN non è impostato). Catena sequenziale: init → registra route →
// attachSentryErrorHandler. La promise `sentryInitPromise` viene awaited prima
// dell'attach così l'error handler è sempre montato se SENTRY_DSN è valido.
const sentryInitPromise = initSentry();

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
// Task #2527 — Catena deterministica per gli error handler:
//   init Sentry → attach Sentry handler → setup custom handler.
// Express invoca i middleware nell'ordine di .use(): senza questa catena
// (e senza l'await prima del listen) il custom handler si monterebbe per
// primo e Sentry non vedrebbe mai gli errori.
const errorHandlersReady = sentryInitPromise
  .then(() => attachSentryErrorHandler(app))
  .then(() => setupErrorHandler(app));

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
  // Tracks whether the initial DB seed was skipped (already populated).
  // Read by the post-boot fire-and-forget block to decide if autoSeedFakeUsers should run.
  let needsFakeSeed = false;

  // ── Phase 1: Migrations ───────────────────────────────────────────────────
  bootLog(1, TOTAL, "Migrations", "start");
  try {
    await withPhaseTimeout("Migrations", runMigrations());
    bootLog(1, TOTAL, "Migrations", "done");
  } catch (err) {
    console.error("[startup] FATAL — Migrations failed, aborting:", err);
    process.exit(1);
  }

  // Task #2527 — assicura che Sentry sia inizializzato, l'error handler
  // Sentry montato e poi il custom error handler montato dopo, prima di
  // accettare traffico (no-op se SENTRY_DSN non è impostato).
  await errorHandlersReady;

  // ── Phase 2: HTTP Listen ──────────────────────────────────────────────────
  const PORT = parseInt(process.env.PORT ?? "5000", 10);
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

  bootLog(3, TOTAL, "DB Init", "done");

  // ── Phase 4: Seed + Core services (FATAL — timeout → process.exit) ────────
  bootLog(4, TOTAL, "Seed + Engine", "start");
  try {
    // Fast COUNT(*) guard: skip seed if database already has users
    let skipSeed = false;
    try {
      const countResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM users`);
      const cnt = Number(((countResult.rows[0] as { cnt?: unknown })?.cnt) ?? 0);
      if (cnt > 100) {
        console.log(`[INIT] Phase 4: ${cnt} users found — skipping auto-seed`);
        skipSeed = true;
      }
    } catch (e) {
      console.warn("[INIT] Phase 4: COUNT users failed, proceeding with seed:", e);
    }

    if (!skipSeed) {
      await withPhaseTimeout("autoSeedEssentialUsers", autoSeedEssentialUsers());
      // autoSeedFakeUsers is non-essential (bulk fake users) — moved to fire-and-forget below
      needsFakeSeed = true;
    }

    // Reviewer accounts and BikerLink official are fast and required before serving traffic
    await withPhaseTimeout("seedAppleReviewerAccount", seedAppleReviewerAccount());
    await withPhaseTimeout("seedGooglePlayReviewerAccount", seedGooglePlayReviewerAccount());
    await withPhaseTimeout("ensureBikerLinkOfficialOnBoot", ensureBikerLinkOfficialOnBoot());
    await withPhaseTimeout("seedTranslationKeys", seedTranslationKeys());
    startMatchingEngine();
    try {
      const { startNotificationJobs } = await import("./matching/notifications/digest-job");
      startNotificationJobs();
    } catch (e) {
      console.warn("[INIT] notification jobs scheduling failed (non-fatal):", e);
    }
    try {
      const { attachAdminNotificationsWS } = await import("./matching/notifications/ws-server");
      attachAdminNotificationsWS(server);
    } catch (e) {
      console.warn("[INIT] admin notifications WS attach failed (non-fatal):", e);
    }
  } catch (err) {
    console.error("[INIT] FATAL — Phase 4 failed:", err);
    process.exit(1);
  }
  bootLog(4, TOTAL, "Seed + Engine", "done");

  // ── Phase 5: Schedulers + maintenance jobs ────────────────────────────────
  bootLog(5, TOTAL, "Schedulers", "start");
  try {
    try {
      const { initMatchRulesCache } = await import("./matching/rules-cache");
      await initMatchRulesCache();
    } catch (err) {
      console.warn("[INIT] match-rules cache init failed (non-fatal):", err);
    }
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const runPlaylistSnapshot = async () => {
      try {
        const { userMusicTracks: umt, userPlaylistSnapshots } = await import("@shared/db");
        const { eq: eqSnap } = await import("drizzle-orm");
        const usersWithTracks = await db.execute(sql`SELECT DISTINCT user_id FROM user_music_tracks`);
        let saved = 0;
        for (const row of usersWithTracks.rows as { user_id: string }[]) {
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
      } catch (e) { console.warn("[SNAPSHOT] runPlaylistSnapshot error:", e); throw e; }
    };
    // runPlaylistSnapshot iterates every user's tracks — non-essential at boot, fire-and-forget
    setImmediate(() => {
      console.log("[INIT][BG] Starting runPlaylistSnapshot...");
      runPlaylistSnapshot()
        .then(() => console.log("[INIT][BG] runPlaylistSnapshot — done"))
        .catch((e) => console.warn("[INIT][BG] runPlaylistSnapshot error:", e));
    });
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

    const { scheduleDailyUserTimeProfileJob } = await import("./matching/time-profile");
    scheduleDailyUserTimeProfileJob();

    const { scheduleMonthlyReset: scheduleMapboxQuotaReset } = await import("./routing/mapbox/quota-guard");
    scheduleMapboxQuotaReset();
    console.log("[INIT] Mapbox quota monthly reset scheduled");

    const { scheduleDailyReset: scheduleTomTomQuotaReset } = await import("./routing/tomtom/quota-guard");
    scheduleTomTomQuotaReset();
    console.log("[INIT] TomTom quota daily reset scheduled");

    const { saveSchemaSnapshot } = await import("./scripts/snapshot-schema");
    // saveSchemaSnapshot is a dev/maintenance utility — non-essential at boot, fire-and-forget
    setImmediate(() => {
      console.log("[INIT][BG] Starting saveSchemaSnapshot...");
      saveSchemaSnapshot()
        .then(() => console.log("[INIT][BG] saveSchemaSnapshot — done"))
        .catch((e) => console.warn("[INIT][BG] saveSchemaSnapshot error:", e));
    });

    // OTA sync cron — ogni 15 min, sincronizza il branch EAS `production` nel DB
    // per il tracking nel pannello admin. La distribuzione effettiva è gestita
    // direttamente da EAS (`u.expo.dev`), non da questo server.
    const FIFTEEN_MIN_MS = 15 * 60 * 1000;
    const { syncProductionUpdates } = await import("./routes/admin/ota");
    setImmediate(() => {
      console.log("[INIT][BG] OTA sync: first run...");
      syncProductionUpdates()
        .then(() => console.log("[INIT][BG] OTA sync: first run done"))
        .catch((e) => console.warn("[INIT][BG] OTA sync error:", e));
    });
    setInterval(() => {
      syncProductionUpdates().catch((e) => console.warn("[OTA-CRON] sync error:", e));
    }, FIFTEEN_MIN_MS);
    console.log("[INIT] OTA cron scheduled every 15 min");

    // Task #2503 — worker auto-rollback OTA (ogni 5 min). Marca come rejected le release
    // con auto_rollback_enabled=true se boot success rate < soglia con abbastanza download.
    const FIVE_MIN_MS = 5 * 60 * 1000;
    const { runOtaAutoRollback } = await import("./jobs/ota-auto-rollback");
    setInterval(() => {
      runOtaAutoRollback().catch((e) => console.warn("[OTA-AUTO-ROLLBACK] worker error:", e));
    }, FIVE_MIN_MS);
    console.log("[INIT] OTA auto-rollback worker scheduled every 5 min");

    // Motion simulator for fake users — fire-and-forget so it cannot hang boot
    import("./motion-simulator")
      .then(({ startMotionSimulator }) => startMotionSimulator())
      .catch((e) => console.warn("[INIT] Background: motion simulator error:", e));
  } catch (err) {
    console.error("[INIT] FATAL — Phase 5 failed:", err);
    process.exit(1);
  }
  bootLog(5, TOTAL, "Schedulers", "done");

  // ── Boot complete: health now returns 200 ─────────────────────────────────
  initState.initializing = false;
  const totalElapsed = ((Date.now() - BOOT_START) / 1000).toFixed(1);
  console.log(`[INIT] All startup phases completed in ${totalElapsed}s — server is READY`);

  // ── Boot summary ──────────────────────────────────────────────────────────
  console.log("[INIT][SUMMARY] ── Boot task summary ──────────────────────────");
  console.log(`[INIT][SUMMARY]   FOREGROUND (ran before READY):`);
  console.log(`[INIT][SUMMARY]     autoSeedEssentialUsers   : ${needsFakeSeed ? "ran" : "skipped (DB already seeded)"}`);
  console.log(`[INIT][SUMMARY]     seedAppleReviewerAccount : ran`);
  console.log(`[INIT][SUMMARY]     seedGooglePlayReviewerAccount : ran`);
  console.log(`[INIT][SUMMARY]     ensureBikerLinkOfficialOnBoot : ran`);
  console.log(`[INIT][SUMMARY]     startMatchingEngine      : ran`);
  console.log(`[INIT][SUMMARY]     scheduleNightlyVacuum    : scheduled`);
  console.log(`[INIT][SUMMARY]     scheduleNightlyMapMatching : scheduled`);
  console.log(`[INIT][SUMMARY]     scheduleWeeklyCurvyScoreUpdate : scheduled`);
  console.log(`[INIT][SUMMARY]     syncProductionUpdates (OTA cron) : scheduled every 15 min`);
  console.log(`[INIT][SUMMARY]   BACKGROUND (fire-and-forget after READY):`);
  console.log(`[INIT][SUMMARY]     runPlaylistSnapshot      : scheduled`);
  console.log(`[INIT][SUMMARY]     saveSchemaSnapshot       : scheduled`);
  console.log(`[INIT][SUMMARY]     initMissingClubConversations : scheduled`);
  console.log(`[INIT][SUMMARY]     autoSeedFakeUsers        : ${needsFakeSeed ? "scheduled" : "skipped (needsFakeSeed=false)"}`);
  console.log("[INIT][SUMMARY] ────────────────────────────────────────────────");

  // Fire-and-forget background jobs — run after server is READY.
  // None of these can block, timeout, or crash the boot sequence.
  setImmediate(() => {
    console.log("[INIT][BG] Starting initMissingClubConversations...");
    initMissingClubConversations()
      .then(() => console.log("[INIT][BG] initMissingClubConversations — done"))
      .catch((err) => {
        console.warn("[INIT][BG] initMissingClubConversations error:", err);
      });

    if (needsFakeSeed) {
      console.log("[INIT][BG] Starting autoSeedFakeUsers...");
      autoSeedFakeUsers()
        .then(() => console.log("[INIT][BG] autoSeedFakeUsers — done"))
        .catch((err) => {
          console.warn("[INIT][BG] autoSeedFakeUsers error:", err);
        });
    }
  });
})().catch((err) => {
  console.error("[INIT] Uncaught fatal error during startup:", err);
  process.exit(1);
});
