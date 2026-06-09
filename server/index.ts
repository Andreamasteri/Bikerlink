import express from "express";
import type { Request, Response } from "express";
import { createServer } from "http";
import { initState } from "./init-state";
import { startMatchingEngine, stopMatchingEngine } from "./matching-engine";
import { autoSeedEssentialUsers, autoSeedFakeUsers, seedAppleReviewerAccount, seedGooglePlayReviewerAccount, ensureBikerLinkOfficialOnBoot } from "./auto-seed";
import { seedTranslationKeys } from "./routes/admin/translations";
import { seedTagsAtStartup } from "./seed-tags-runtime";
import { seedMotoclubs, seedClubMembershipsOnBoot } from "./routes/motoclubs/seed";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { initUptimeTracking, startMetroMonitor, stopMetroMonitor } from "./uptime";
import { matchEnrichmentSemaphore, MATCH_ENRICHMENT_GLOBAL_LIMIT } from "./lib/concurrency";
import { runMigrations } from "./migrate";
import { setupMiddleware, setupStaticRoutes } from "./middleware";
import { registerAllRoutes } from "./route-mounter";
import { setupErrorHandler } from "./error-handler";
import { initMissingClubConversations, ensureCompetitorAnalysisPdf } from "./init-helpers";
import { initSentry, attachSentryErrorHandler } from "./sentry";

// ── Phase timeout helper ─────────────────────────────────────────────────────
// Fatal phases: timeout rejects → propagates → process.exit(1)
const BOOT_PHASE_TIMEOUT_MS = Number(process.env.BOOT_PHASE_TIMEOUT_MS) || 30_000;
const MIGRATION_TIMEOUT_MS = Number(process.env.MIGRATION_TIMEOUT_MS) || 600_000;

function withPhaseTimeout<T>(label: string, promise: Promise<T>, timeoutMs = BOOT_PHASE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[BOOT] Timeout ${timeoutMs}ms exceeded in phase: ${label}`));
    }, timeoutMs);
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

// Task #2789 — Gate: 503 su /api/* mentre initState.initializing=true.
// Eccezioni: /api/health (initializing-aware) e /api/metrics (montato sopra, fuori gate).
app.use("/api", (req: Request, res: Response, next) => {
  if (!initState.initializing) return next();
  if (req.path === "/health") return next();
  return res.status(503).json({ status: "initializing", initializing: true });
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
  import("./jobs/thinkcentre-monitor").then(({ stopThinkCentreMonitor }) => stopThinkCentreMonitor()).catch(() => {});
  import("./jobs/valhalla-monitor").then(({ stopValhallaMonitor }) => stopValhallaMonitor()).catch(() => {});

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
  // ── FASE 4/4 del deploy/publish: avvio del container in produzione ──────────
  // Le fasi 1-3 (copia dev→prod DB, build script, creazione Autoscale) sono già
  // avvenute prima che questo processo partisse e sono loggate nel pannello
  // Publish. Da qui in poi siamo nella FASE 4: i TOTAL step sotto (bootLog n/5)
  // sono i sotto-step interni di QUESTA fase, e [migrate] mostra le migrazioni.
  console.log(
    `[${new Date().toISOString()}] ════════ FASE 4/4 DEPLOY — Runtime: avvio container (${TOTAL} step interni) ════════`,
  );
  // Tracks whether the initial DB seed was skipped (already populated).
  // Read by the post-boot fire-and-forget block to decide if autoSeedFakeUsers should run.
  let needsFakeSeed = false;

  // Task #2527 — await Sentry init + error handler chain prima di accettare traffico.
  await errorHandlersReady;

  // ── Phase 1: HTTP Listen (FIRST) ──────────────────────────────────────────
  // Task #2789 — apriamo la porta HTTP PRIMA di migrazioni e seed. Lo startup
  // probe di Replit autoscale colpisce `GET /`, che risponde 200 subito (la
  // landing page degrada a {} se il DB non è ancora pronto). Tutte le rotte
  // applicative reali restano gated da initState.initializing (503) finché le
  // fasi successive non sono completate. Così la promote non va più in timeout
  // aspettando che migrazioni/seed bloccanti finiscano prima del listen.
  const PORT = parseInt(process.env.PORT ?? "5000", 10);
  bootLog(1, TOTAL, "HTTP Listen", `binding 0.0.0.0:${PORT}`);
  await new Promise<void>((resolve) => {
    server.listen(PORT, "0.0.0.0", () => {
      const formattedDate = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
      console.log(`[${formattedDate}] Server started on 0.0.0.0:${PORT} (initializing...)`);
      bootLog(1, TOTAL, "HTTP Listen", "ready — health returns 503 until boot completes");
      resolve();
    });
  });

  initUptimeTracking();
  startMetroMonitor();

  // ── Phase 2: Migrations (FATAL — gira dopo il listen) ─────────────────────
  // Il fallimento reale resta fatale (process.exit(1)) e visibile, ma ora gira
  // FUORI dal percorso critico dello startup probe: la porta è già aperta.
  bootLog(2, TOTAL, "Migrations", "start");
  try {
    await withPhaseTimeout("Migrations", runMigrations(), MIGRATION_TIMEOUT_MS);
    bootLog(2, TOTAL, "Migrations", "done");
  } catch (err) {
    console.error("[startup] FATAL — Migrations failed, aborting:", err);
    process.exit(1);
  }

  // ── Phase 3: DB Init (non-fatal sub-steps) ────────────────────────────────
  bootLog(3, TOTAL, "DB Init", "start");

  // Task #2838 — Email bootstrap: se le credenziali Gmail non sono nel DB,
  // le legge dai Replit secrets e le scrive in app_settings. Questo garantisce
  // che dopo un reset del DB le email funzionino senza intervento manuale.
  // Il DB ha sempre priorità: se l'admin sovrascrive dal pannello, queste vincono.
  try {
    const { storage } = await import("./storage");
    const [gmailUserSetting, gmailPassSetting] = await Promise.all([
      storage.getAppSetting("gmail_user"),
      storage.getAppSetting("gmail_app_password"),
    ]);
    const envUser = process.env.GMAIL_USER;
    const envPass = process.env.GMAIL_APP_PASSWORD;
    if (envUser && !gmailUserSetting?.value) {
      await storage.upsertAppSetting("gmail_user", envUser);
      console.log("[EMAIL BOOTSTRAP] gmail_user scritto in app_settings da secret env");
    }
    if (envPass && !gmailPassSetting?.value) {
      await storage.upsertAppSetting("gmail_app_password", envPass);
      console.log("[EMAIL BOOTSTRAP] gmail_app_password scritto in app_settings da secret env");
    }
    if (!envUser && !gmailUserSetting?.value) {
      console.warn("[EMAIL BOOTSTRAP] GMAIL_USER non trovato né in env né in DB — email non funzionerà");
    }
    if (!envPass && !gmailPassSetting?.value) {
      console.warn("[EMAIL BOOTSTRAP] GMAIL_APP_PASSWORD non trovato né in env né in DB — email non funzionerà");
    }

    // Verifica SMTP live — non bloccante, eseguita in background.
    // Se le credenziali sono valide stampa ✅, altrimenti ⚠️ con l'errore.
    setImmediate(async () => {
      try {
        const { createTransporter, maskEmail } = await import("./email/templates");
        const t = await createTransporter();
        if (!t) {
          console.warn("[EMAIL] ⚠️  SMTP verify skipped — credenziali non configurate");
          return;
        }
        await t.transporter.verify();
        console.log(`[EMAIL] ✅ Credenziali Gmail OK — SMTP auth verificata (${maskEmail(t.creds.user)}, source=${t.creds.source})`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[EMAIL] ⚠️  CREDENZIALI GMAIL NON VALIDE — verifica SMTP fallita, controllare GMAIL_APP_PASSWORD. Errore: ${msg.slice(0, 120)}`);
      }
    });
  } catch (e) {
    console.warn("[INIT] Phase 3: email bootstrap failed (non-fatal):", e);
  }

  // Task #2817 — Ripristina il cooldown quota AI provider persistito prima del riavvio.
  try {
    const { initProviderHealth } = await import("./ai/moderation/provider");
    await initProviderHealth();
  } catch (e) {
    console.warn("[INIT] Phase 3: initProviderHealth failed (non-fatal):", e);
  }

  // Ensure maps_telemetry_events table exists even if the migration was skipped
  // in older prod deployments. Using IF NOT EXISTS makes this idempotent.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "maps_telemetry_events" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar(36),
        "event" varchar(40) NOT NULL,
        "renderer" varchar(30),
        "component" varchar(60),
        "engine" varchar(30),
        "duration_ms" integer,
        "error_message" varchar(500),
        "platform" varchar(20),
        "app_version" varchar(30),
        "details" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "maps_telemetry_event_created_idx"
        ON "maps_telemetry_events" ("event", "created_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "maps_telemetry_renderer_created_idx"
        ON "maps_telemetry_events" ("renderer", "created_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "maps_telemetry_created_idx"
        ON "maps_telemetry_events" ("created_at")
    `);
    console.log("[INIT] maps_telemetry_events: table/index check OK");
  } catch (e) {
    console.warn("[INIT] Phase 3: maps_telemetry_events ensure failed (non-fatal):", e);
  }

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
      // autoSeedFakeUsers is non-essential (bulk fake users) — moved to fire-and-forget below
      needsFakeSeed = true;
    }

    // Essential users (admin/moderatore/mendo/smoke) must be synced on EVERY boot,
    // regardless of DB user count — the function is idempotent (guards on existing rows).
    await withPhaseTimeout("autoSeedEssentialUsers", autoSeedEssentialUsers());

    // Reviewer accounts and BikerLink official are fast and required before serving traffic
    await withPhaseTimeout("seedAppleReviewerAccount", seedAppleReviewerAccount());
    await withPhaseTimeout("seedGooglePlayReviewerAccount", seedGooglePlayReviewerAccount());
    await withPhaseTimeout("ensureBikerLinkOfficialOnBoot", ensureBikerLinkOfficialOnBoot());
    await withPhaseTimeout("seedTranslationKeys", seedTranslationKeys());
    // Task #2713 — Idempotent tag seed: garantisce che categorie + tag canonici
    // siano sempre presenti in qualsiasi nuovo deployment / DB reset.
    await withPhaseTimeout("seedTagsAtStartup", seedTagsAtStartup());
    await withPhaseTimeout("seedMotoclubs", seedMotoclubs(), 60_000);
    await withPhaseTimeout("seedClubMembershipsOnBoot", seedClubMembershipsOnBoot(), 60_000);
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
      } catch (e) { console.warn("[SNAPSHOT] runPlaylistSnapshot error:", e); }
    };
    const safeRunPlaylistSnapshot = () =>
      runPlaylistSnapshot().catch((e) => console.warn("[SNAPSHOT] runPlaylistSnapshot (interval) error:", e));
    // runPlaylistSnapshot iterates every user's tracks — non-essential at boot, fire-and-forget
    setImmediate(() => {
      console.log("[INIT][BG] Starting runPlaylistSnapshot...");
      runPlaylistSnapshot()
        .then(() => console.log("[INIT][BG] runPlaylistSnapshot — done"))
        .catch((e) => console.warn("[INIT][BG] runPlaylistSnapshot error:", e));
    });
    setInterval(safeRunPlaylistSnapshot, SIX_HOURS_MS);

    const { cleanupOrphanedAdImages } = await import("./routes/ads");
    setTimeout(async () => {
      await cleanupOrphanedAdImages();
      setInterval(cleanupOrphanedAdImages, 24 * 60 * 60 * 1000);
    }, 5 * 60 * 1000);

    setImmediate(async () => {
      try {
        const { runAdImageHealthCheck } = await import("./routes/admin/advertisements.next");
        await runAdImageHealthCheck();
      } catch (e) {
        console.warn("[INIT][BG] runAdImageHealthCheck error:", e);
      }
    });

    const { scheduleNightlyVacuum } = await import("./vacuum-service");
    scheduleNightlyVacuum();

    const { scheduleLogRetention } = await import("./jobs/log-retention");
    scheduleLogRetention();

    const { scheduleNightlyMapMatching } = await import("./map-matching-job");
    scheduleNightlyMapMatching();

    const { scheduleWeeklyCurvyScoreUpdate } = await import("./curvy-score-job");
    scheduleWeeklyCurvyScoreUpdate();

    const { scheduleDailyUserTimeProfileJob } = await import("./matching/time-profile");
    scheduleDailyUserTimeProfileJob();

    const { scheduleMonthlyReset: scheduleMapboxQuotaReset } = await import("./routing/mapbox/quota-guard");
    scheduleMapboxQuotaReset(); console.log("[INIT] Mapbox quota monthly reset scheduled");

    const { scheduleDailyReset: scheduleTomTomQuotaReset } = await import("./routing/tomtom/quota-guard");
    scheduleTomTomQuotaReset(); console.log("[INIT] TomTom quota daily reset scheduled");

    // Valhalla — startup validation, fire-and-forget.
    setImmediate(() => void import("./routing/valhalla-startup").then(m => m.validateValhallaStartup()));
    const { saveSchemaSnapshot } = await import("./scripts/snapshot-schema");
    // saveSchemaSnapshot is a dev/maintenance utility — non-essential at boot, fire-and-forget
    setImmediate(() => {
      console.log("[INIT][BG] Starting saveSchemaSnapshot...");
      saveSchemaSnapshot()
        .then(() => console.log("[INIT][BG] saveSchemaSnapshot — done"))
        .catch((e) => console.warn("[INIT][BG] saveSchemaSnapshot error:", e));
    });

    setImmediate(() => void import("./ai/db-integrity/boot-schema-check").then((m) => m.runBootSchemaDriftCheck()).catch((e) => console.warn("[INIT][BG] boot schema drift check error:", e)));
    // OTA sync cron — ogni 15 min, sincronizza branch EAS `production` nel DB (distribuzione via EAS).
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

    // Task #2532 — Co-Pilot AI moderazione: anomaly + digest scheduler.
    try {
      const { startAnomalyScheduler } = await import("./ai/moderation/anomalies");
      startAnomalyScheduler();
      const { startDigestScheduler } = await import("./ai/moderation/digest");
      startDigestScheduler();
      const { startUnbanScheduler } = await import("./ai/moderation/unban");
      startUnbanScheduler();
      console.log("[INIT] AI moderation schedulers (anomalies + digest + unban) started");
    } catch (e) {
      console.warn("[INIT] AI moderation schedulers failed (non-fatal):", e);
    }

    // Task #2548 — Critical reports notifier (ogni 5 min).
    try {
      const { startCriticalReportsNotifier } = await import("./jobs/critical-reports-notifier");
      startCriticalReportsNotifier();
      console.log("[INIT] Critical reports notifier started");
    } catch (e) {
      console.warn("[INIT] Critical reports notifier failed (non-fatal):", e);
    }

    // Hydrate probe log + error history ring-buffers from DB (survives backend restarts).
    try {
      const { hydrateProbeLog, hydrateErrorHistory } = await import("./routes/admin/thinkcentre-health-utils");
      await Promise.all([hydrateProbeLog(), hydrateErrorHistory()]);
    } catch (e) {
      console.warn("[INIT] Ring-buffer hydration failed (non-fatal):", e);
    }

    // Monitors — push admin quando i servizi self-hosted o Valhalla vanno offline.
    try {
      const [{ startThinkCentreMonitor, checkMotorcycleProfile }, { startValhallaMonitor }] = await Promise.all([
        import("./jobs/thinkcentre-monitor"),
        import("./jobs/valhalla-monitor"),
      ]);
      startThinkCentreMonitor();
      startValhallaMonitor();
      setTimeout(() => { void checkMotorcycleProfile(); }, 30_000); // verifica profilo motorcycle al boot (30s delay)
    } catch (e) {
      console.warn("[INIT] Service monitors failed (non-fatal):", e);
    }

    try {
      const { startWatchdogScheduler } = await import("./ai/watchdog/scheduler");
      startWatchdogScheduler();
      console.log("[INIT] AI Watchdog scheduler started");
    } catch (e) {
      console.warn("[INIT] AI Watchdog scheduler failed (non-fatal):", e);
    }

    try {
      const { startCampaignsSelfCheckScheduler } = await import("./ai/watchdog/campaigns-self-check");
      startCampaignsSelfCheckScheduler();
      console.log("[INIT] Campagne self-check scheduler started");
    } catch (e) {
      console.warn("[INIT] Campagne self-check scheduler failed (non-fatal):", e);
    }

    try {
      const { scheduleMemoryPruner } = await import("./ai/assistant/memory-pruner");
      scheduleMemoryPruner();
    } catch (e) {
      console.warn("[INIT] Memory pruner scheduler failed (non-fatal):", e);
    }

    try {
      const { startCoordinatorCleanupScheduler } = await import("./ai/coordinator/cleanup");
      startCoordinatorCleanupScheduler();
      console.log("[INIT] AI Coordinator cleanup scheduler started");
    } catch (e) {
      console.warn("[INIT] AI Coordinator cleanup scheduler failed (non-fatal):", e);
    }

    try {
      const { wireOtaToCoordinator } = await import("./ai/coordinator/integrations/ota");
      const { wireModerationToCoordinator } = await import("./ai/coordinator/integrations/moderation");
      const { wireWatchdogToCoordinator } = await import("./ai/coordinator/integrations/watchdog");
      const { wireDbIntegrityToCoordinator } = await import("./ai/coordinator/integrations/db-integrity");
      const { wireAppIntegrityToCoordinator } = await import("./ai/coordinator/integrations/app-integrity");
      const { wireConsoleToCoordinator } = await import("./ai/coordinator/integrations/console");
      wireOtaToCoordinator();
      wireModerationToCoordinator();
      wireWatchdogToCoordinator();
      wireDbIntegrityToCoordinator();
      wireAppIntegrityToCoordinator();
      wireConsoleToCoordinator();
      console.log("[INIT] AI Coordinator integrations wired (6 sottosistemi)");
    } catch (e) {
      console.warn("[INIT] AI Coordinator integrations wire failed (non-fatal):", e);
    }

    // Task #2536 — AI DB Integrity scheduler + worker BullMQ.
    try {
      const { startDbIntegrityScheduler } = await import("./ai/db-integrity/scheduler");
      startDbIntegrityScheduler();
      const { startDbIntegrityWorker } = await import("./ai/db-integrity/worker");
      startDbIntegrityWorker();
      console.log("[INIT] AI DB Integrity scheduler + worker started");
    } catch (e) {
      console.warn("[INIT] AI DB Integrity scheduler failed (non-fatal):", e);
    }

    // Task #2537 — AI App Integrity scheduler (nightly 04:00 cheap, Sun 05:00 expensive).
    try {
      const { startAppIntegrityScheduler } = await import("./ai/integrity/scheduler");
      startAppIntegrityScheduler();
      console.log("[INIT] AI App Integrity scheduler started");
    } catch (e) {
      console.warn("[INIT] AI App Integrity scheduler failed (non-fatal):", e);
    }

    // Zero-match daily snapshot scheduler (nightly 03:00).
    import("./jobs/zero-match-snapshot-job")
      .then(({ startZeroMatchSnapshotScheduler }) => startZeroMatchSnapshotScheduler())
      .catch((e) => console.warn("[INIT] Zero-match snapshot scheduler failed (non-fatal):", e));

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
  console.log(
    `[INIT][SUMMARY] ── Boot task summary ──────────────────────────\n` +
    `[INIT][SUMMARY]   FOREGROUND (ran before READY):\n` +
    `[INIT][SUMMARY]     autoSeedEssentialUsers   : ${needsFakeSeed ? "ran" : "skipped (DB already seeded)"}\n` +
    `[INIT][SUMMARY]     seedAppleReviewerAccount : ran\n` +
    `[INIT][SUMMARY]     seedGooglePlayReviewerAccount : ran\n` +
    `[INIT][SUMMARY]     ensureBikerLinkOfficialOnBoot : ran\n` +
    `[INIT][SUMMARY]     seedMotoclubs / seedClubMembershipsOnBoot / startMatchingEngine : ran\n` +
    `[INIT][SUMMARY]     schedulers (vacuum/mapMatch/curvyScore/OTA/zeroMatchSnapshot) : scheduled\n` +
    `[INIT][SUMMARY]   BACKGROUND (fire-and-forget after READY):\n` +
    `[INIT][SUMMARY]     runPlaylistSnapshot / saveSchemaSnapshot / initMissingClubConversations : scheduled\n` +
    `[INIT][SUMMARY]     autoSeedFakeUsers        : ${needsFakeSeed ? "scheduled" : "skipped (needsFakeSeed=false)"}\n` +
    `[INIT][SUMMARY] ────────────────────────────────────────────────`
  );
  // Fire-and-forget background jobs (non bloccano il boot).
  ensureCompetitorAnalysisPdf();

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
