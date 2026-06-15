import { db } from "./db";
import { sql } from "drizzle-orm";
import { bootJobQueue } from "./lib/boot-job-queue";

/**
 * Phase 5 of the boot sequence: schedulers + maintenance jobs.
 * Extracted from boot-sequence.ts to keep that file under the 600-line limit.
 *
 * Called once during runBootSequence(); receives the HTTP Server for WS attachment.
 */
export async function runPhase5Schedulers(): Promise<void> {
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
  // Registered in bootJobQueue to avoid overlapping with other heavy boot jobs.
  bootJobQueue.register("PlaylistSnapshot", async () => {
    console.log("[INIT][BG] Starting runPlaylistSnapshot...");
    await runPlaylistSnapshot();
    console.log("[INIT][BG] runPlaylistSnapshot — done");
  });
  setInterval(safeRunPlaylistSnapshot, SIX_HOURS_MS);

  const { cleanupOrphanedAdImages } = await import("./routes/ads");
  setTimeout(async () => {
    await cleanupOrphanedAdImages();
    setInterval(cleanupOrphanedAdImages, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);

  // Delay di 2 min al boot: health-check leggero ma accede al DB; evita contesa sul pool.
  setTimeout(async () => {
    try {
      const { runAdImageHealthCheck } = await import("./routes/admin/advertisements.next");
      await runAdImageHealthCheck();
    } catch (e) {
      console.warn("[INIT][BG] runAdImageHealthCheck error:", e);
    }
  }, 2 * 60_000);

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

  setImmediate(() => void import("./routing/valhalla-startup").then(m => m.validateValhallaStartup()));

  setImmediate(async () => {
    try {
      const { warmUpSystemStatusCache } = await import("./routes/admin/system-probe");
      await warmUpSystemStatusCache();
    } catch (e) {
      console.warn("[INIT][BG] warmUpSystemStatusCache error:", e);
    }
  });

  const { saveSchemaSnapshot } = await import("./scripts/snapshot-schema");
  setImmediate(() => {
    saveSchemaSnapshot()
      .then(() => console.log("[INIT][BG] saveSchemaSnapshot — done"))
      .catch((e) => console.warn("[INIT][BG] saveSchemaSnapshot error:", e));
  });

  setImmediate(() => void import("./ai/db-integrity/boot-schema-check").then((m) => m.runBootSchemaDriftCheck()).catch((e) => console.warn("[INIT][BG] boot schema drift check error:", e)));

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

  // OTA auto-rollback: cron al minuto :00 di ogni slot di 5 min → :00, :05, :10, ...
  // Slot :00 — critical-reports è a :02, unban è a :01: tutti distanziati di 60s.
  const { runOtaAutoRollback } = await import("./jobs/ota-auto-rollback");
  {
    const { Cron } = await import("croner");
    new Cron("0-59/5 * * * *", { timezone: "Europe/Rome" }, () => {
      runOtaAutoRollback().catch((e) => console.warn("[OTA-AUTO-ROLLBACK] worker error:", e));
    });
  }
  console.log("[INIT] OTA auto-rollback worker scheduled every 5 min (cron slot :00)");

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

  try {
    const { startCriticalReportsNotifier } = await import("./jobs/critical-reports-notifier");
    startCriticalReportsNotifier();
    console.log("[INIT] Critical reports notifier started");
  } catch (e) {
    console.warn("[INIT] Critical reports notifier failed (non-fatal):", e);
  }

  try {
    const { hydrateProbeLog, hydrateErrorHistory } = await import("./routes/admin/thinkcentre-health-utils");
    await Promise.all([hydrateProbeLog(), hydrateErrorHistory()]);
  } catch (e) {
    console.warn("[INIT] Ring-buffer hydration failed (non-fatal):", e);
  }

  try {
    const [{ startThinkCentreMonitor, checkMotorcycleProfile }, { startValhallaMonitor }] = await Promise.all([
      import("./jobs/thinkcentre-monitor"),
      import("./jobs/valhalla-monitor"),
    ]);
    startThinkCentreMonitor();
    startValhallaMonitor();
    setTimeout(() => { void checkMotorcycleProfile(); }, 30_000);
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
    const [{ startCoordinatorCleanupScheduler }, { scheduleSessionCrashCleanup }] = await Promise.all([
      import("./ai/coordinator/cleanup"),
      import("./jobs/session-crash-cleanup"),
    ]);
    startCoordinatorCleanupScheduler();
    scheduleSessionCrashCleanup();
    console.log("[INIT] Coordinator cleanup + session crash cleanup schedulers started");
  } catch (e) {
    console.warn("[INIT] Cleanup schedulers failed (non-fatal):", e);
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

  try {
    const { startDbIntegrityScheduler } = await import("./ai/db-integrity/scheduler");
    startDbIntegrityScheduler();
    const { startDbIntegrityWorker } = await import("./ai/db-integrity/worker");
    startDbIntegrityWorker();
    console.log("[INIT] AI DB Integrity scheduler + worker started");
  } catch (e) {
    console.warn("[INIT] AI DB Integrity scheduler failed (non-fatal):", e);
  }

  try {
    const { startAppIntegrityScheduler } = await import("./ai/integrity/scheduler");
    startAppIntegrityScheduler();
    console.log("[INIT] AI App Integrity scheduler started");
  } catch (e) {
    console.warn("[INIT] AI App Integrity scheduler failed (non-fatal):", e);
  }

  import("./jobs/zero-match-snapshot-job")
    .then(({ startZeroMatchSnapshotScheduler }) => startZeroMatchSnapshotScheduler())
    .catch((e) => console.warn("[INIT] Zero-match snapshot scheduler failed (non-fatal):", e));

  import("./motion-simulator")
    .then(({ startMotionSimulator }) => startMotionSimulator())
    .catch((e) => console.warn("[INIT] Background: motion simulator error:", e));

  // Bio embedding back-fill: runs once at boot (via bootJobQueue), then every 24h.
  // Catches users whose bio changed or whose embedding was missed due to API errors.
  // NOTE: The duplicate call in boot-sequence.ts has been removed — this is the
  // single source of truth for bio embedding back-fill scheduling.
  // Registered in bootJobQueue to avoid overlapping with other heavy boot jobs.
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const runBioBackfill = () =>
    import("./embeddings/backfill-bio")
      .then(({ backfillBioEmbeddings }) => backfillBioEmbeddings())
      .then((r) =>
        console.log(
          `[EMBED BACKFILL] Done — processed=${r.processed}` +
          ` backfilled=${r.backfilled} skipped=${r.skipped} errors=${r.errors}`,
        ),
      )
      .catch((e) => console.warn("[EMBED BACKFILL] error:", e));
  bootJobQueue.register("BioEmbeddingsBackfill", async () => {
    console.log("[INIT][BG] Starting backfillBioEmbeddings (boot-time pass)...");
    await runBioBackfill();
  });
  setInterval(runBioBackfill, TWENTY_FOUR_HOURS_MS);
  console.log("[INIT] Bio embedding back-fill scheduled (boot + every 24h)");

  try {
    const { scheduleEmbeddingDailyReport } = await import("./jobs/embedding-daily-report");
    scheduleEmbeddingDailyReport();
    console.log("[INIT] Embedding daily report job scheduled (08:15 Europe/Rome)");
  } catch (e) {
    console.warn("[INIT] Embedding daily report scheduler failed (non-fatal):", e);
  }

  try {
    const { startEmbeddingCapAlertJob } = await import("./jobs/embedding-cap-alert");
    startEmbeddingCapAlertJob();
  } catch (e) {
    console.warn("[INIT] Embedding cap alert job failed (non-fatal):", e);
  }

  try {
    const { startResourceGraphSampler } = await import("./resource-graph-sampler");
    startResourceGraphSampler();
    console.log("[INIT] Resource graph sampler started (samples when resource_graph_enabled=true)");
  } catch (e) {
    console.warn("[INIT] Resource graph sampler failed to start (non-fatal):", e);
  }

  try {
    const { startHoleDetectorScheduler } = await import("./ai/pipeline-monitor/hole-detector");
    startHoleDetectorScheduler();
    console.log("[INIT] Pipeline hole detector scheduler started (5min interval)");
  } catch (e) {
    console.warn("[INIT] Pipeline hole detector scheduler failed (non-fatal):", e);
  }

  try {
    const { runPipelineChecks } = await import("./ai/pipeline-monitor/runner");
    const SIX_HOURS_MS = 6 * 60 * 60_000;
    setTimeout(() => {
      runPipelineChecks({ triggeredBy: "scheduler" }).catch((e) =>
        console.warn("[pipeline-check] startup run failed:", e));
    }, 5 * 60_000);
    setInterval(() => {
      runPipelineChecks({ triggeredBy: "scheduler" }).catch((e) =>
        console.warn("[pipeline-check] scheduled run failed:", e));
    }, SIX_HOURS_MS);
    console.log("[INIT] Pipeline radiografia scheduler started (6h interval)");
  } catch (e) {
    console.warn("[INIT] Pipeline radiografia scheduler failed (non-fatal):", e);
  }

  // Arm the boot-job queue here — phase 5 is the last boot phase, so all
  // registrations from startMatchingEngine() and runPhase5Schedulers() are
  // guaranteed to have happened before this point.
  bootJobQueue.start();
}
