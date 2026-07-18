import { db, withDbRetry } from "./db";
import { sql } from "drizzle-orm";
import { bootJobQueue } from "./lib/boot-job-queue";
import { withBgDbSlot } from "./lib/bg-db-limiter";
import { markDegraded } from "./init-state";
import { withJobGate } from "./ai/coordinator/gated-job";

/**
 * Esegue un blocco di registrazione scheduler in ISOLAMENTO (Task #5123).
 * Un fallimento di un singolo scheduler non deve impedire agli altri di armarsi
 * (atomicità per-blocco): l'errore viene loggato e registrato come motivo di
 * degraded (`scheduler:<name>`) così /api/health lo espone esplicitamente,
 * invece di abortire silenziosamente l'intera Phase 5.
 */
async function arm(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn(`[INIT] scheduler "${name}" failed to arm (non-fatal):`, e);
    markDegraded(`scheduler:${name}`);
  }
}

/**
 * Phase 5 of the boot sequence: schedulers + maintenance jobs.
 * Extracted from boot-sequence.ts to keep that file under the 600-line limit.
 *
 * Called once during runBootSequence(); receives the HTTP Server for WS attachment.
 *
 * ATOMICITÀ (Task #5123): ogni blocco di registrazione è isolato (try/catch via
 * `arm()` o blocco dedicato) così un singolo scheduler che fallisce non blocca
 * gli altri. Il sigillo della boot-job queue (bootJobQueue.sealAndStart()) è in
 * un `finally`: viene SEMPRE eseguito, anche se un blocco lancia, così la coda
 * dei job pesanti parte comunque e nessun job resta perso.
 */
export async function runPhase5Schedulers(): Promise<void> {
  try {
  await arm("match-rules-cache", async () => {
    const { initMatchRulesCache } = await import("./matching/rules-cache");
    await initMatchRulesCache();
  });

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const runPlaylistSnapshot = async () => {
    try {
      const { userMusicTracks: umt, userPlaylistSnapshots } = await import("@shared/db");
      const { eq: eqSnap } = await import("drizzle-orm");
      // Solo la discovery passa dal budget connessioni dei job in background; il
      // loop per-utente è sequenziale (1 connessione alla volta) e non va avvolto.
      const usersWithTracks = await withBgDbSlot(() => withDbRetry(() => db.execute(sql`SELECT DISTINCT user_id FROM user_music_tracks`)));
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
  const safeRunPlaylistSnapshot = withJobGate("playlist-snapshot", () =>
    runPlaylistSnapshot().catch((e) => console.warn("[SNAPSHOT] runPlaylistSnapshot (interval) error:", e)));
  // Registered in bootJobQueue to avoid overlapping with other heavy boot jobs.
  bootJobQueue.register("PlaylistSnapshot", async () => {
    console.log("[INIT][BG] Starting runPlaylistSnapshot...");
    await safeRunPlaylistSnapshot();
    console.log("[INIT][BG] runPlaylistSnapshot — done");
  });
  setInterval(safeRunPlaylistSnapshot, SIX_HOURS_MS);

  await arm("ad-image-cleanup", async () => {
    const { cleanupOrphanedAdImages } = await import("./routes/ads");
    const gatedAdImageCleanup = withJobGate("ad-image-cleanup", () =>
      cleanupOrphanedAdImages().catch((e) => console.warn("[INIT][BG] cleanupOrphanedAdImages error:", e)));
    setTimeout(async () => {
      await gatedAdImageCleanup();
      setInterval(gatedAdImageCleanup, 24 * 60 * 60 * 1000);
    }, 5 * 60 * 1000);
  });

  // Pulizia file diagnostica su filesystem: rimuove file JSON più vecchi di 30 giorni
  setTimeout(async () => {
    try {
      const { cleanupOldDiagFiles } = await import("./routes/admin/diagnostic");
      const gatedDiagCleanup = withJobGate("diag-files-cleanup", cleanupOldDiagFiles);
      gatedDiagCleanup();
      setInterval(gatedDiagCleanup, 24 * 60 * 60 * 1000);
    } catch (e) {
      console.warn("[INIT] cleanupOldDiagFiles error:", e);
    }
  }, 7 * 60 * 1000);

  // Delay di 2 min al boot: health-check leggero ma accede al DB; evita contesa sul pool.
  setTimeout(async () => {
    try {
      const { runAdImageHealthCheck } = await import("./routes/admin/advertisements.next");
      await runAdImageHealthCheck();
    } catch (e) {
      console.warn("[INIT][BG] runAdImageHealthCheck error:", e);
    }
  }, 2 * 60_000);

  await arm("nightly-vacuum", async () => {
    const { scheduleNightlyVacuum } = await import("./vacuum-service");
    scheduleNightlyVacuum();
  });

  await arm("log-retention", async () => {
    const { scheduleLogRetention } = await import("./jobs/log-retention");
    scheduleLogRetention();
  });

  await arm("nightly-map-matching", async () => {
    const { scheduleNightlyMapMatching } = await import("./map-matching-job");
    scheduleNightlyMapMatching();
  });

  await arm("weekly-curvy-score", async () => {
    const { scheduleWeeklyCurvyScoreUpdate } = await import("./curvy-score-job");
    scheduleWeeklyCurvyScoreUpdate();
  });

  await arm("daily-time-profile", async () => {
    const { scheduleDailyUserTimeProfileJob } = await import("./matching/time-profile");
    scheduleDailyUserTimeProfileJob();
  });

  await arm("mapbox-quota-reset", async () => {
    const { scheduleMonthlyReset: scheduleMapboxQuotaReset } = await import("./routing/mapbox/quota-guard");
    scheduleMapboxQuotaReset(); console.log("[INIT] Mapbox quota monthly reset scheduled");
  });

  await arm("tomtom-quota-reset", async () => {
    const { scheduleDailyReset: scheduleTomTomQuotaReset } = await import("./routing/tomtom/quota-guard");
    scheduleTomTomQuotaReset(); console.log("[INIT] TomTom quota daily reset scheduled");
  });

  setImmediate(() => void import("./routing/valhalla-startup").then(m => m.validateValhallaStartup()).catch((e) => console.warn("[INIT][BG] validateValhallaStartup error:", e)));

  // Boot-time DB jobs scaglionati: evita saturazione pool (total=10) nei primi
  // secondi di avvio quando tutti gli scheduler sparerebbero contemporaneamente.
  // Ogni job è separato dal precedente di ~30s per dare tempo al pool di respirare.
  setTimeout(async () => {
    try {
      const { warmUpSystemStatusCache } = await import("./routes/admin/system-probe");
      await warmUpSystemStatusCache();
    } catch (e) {
      console.warn("[INIT][BG] warmUpSystemStatusCache error:", e);
    }
  }, 30_000); // +30s

  await arm("schema-snapshot", async () => {
    const { saveSchemaSnapshot } = await import("./scripts/snapshot-schema");
    setTimeout(() => {
      saveSchemaSnapshot()
        .then(() => console.log("[INIT][BG] saveSchemaSnapshot — done"))
        .catch((e) => console.warn("[INIT][BG] saveSchemaSnapshot error:", e));
    }, 60_000); // +60s
  });

  setTimeout(() => void import("./ai/db-integrity/boot-schema-check").then((m) => m.runBootSchemaDriftCheck()).catch((e) => console.warn("[INIT][BG] boot schema drift check error:", e)), 90_000); // +90s

  const FIFTEEN_MIN_MS = 15 * 60 * 1000;
  await arm("ota-sync-cron", async () => {
    const { syncProductionUpdates } = await import("./routes/admin/ota");
    const { withJobGate } = await import("./ai/coordinator/gated-job");
    // Task #9 — anche il subsystem OTA (già integrato con l'AI Coordinator
    // event-based) risponde ora al gate unico del coordinator: kill-switch/pause
    // rispettati allo stesso modo di ogni altro job schedulato.
    const gatedSync = withJobGate("ota-sync-cron", syncProductionUpdates);
    setTimeout(() => {
      console.log("[INIT][BG] OTA sync: first run...");
      gatedSync()
        .then(() => console.log("[INIT][BG] OTA sync: first run done"))
        .catch((e) => console.warn("[INIT][BG] OTA sync error:", e));
    }, 45_000); // +45s
    setInterval(() => {
      gatedSync().catch((e) => console.warn("[OTA-CRON] sync error:", e));
    }, FIFTEEN_MIN_MS);
    console.log("[INIT] OTA cron scheduled every 15 min");
  });

  // OTA auto-rollback: cron al minuto :00 di ogni slot di 5 min → :00, :05, :10, ...
  // Slot :00 — critical-reports è a :02, unban è a :01: tutti distanziati di 60s.
  await arm("ota-auto-rollback", async () => {
    const { runOtaAutoRollback } = await import("./jobs/ota-auto-rollback");
    const { withJobGate } = await import("./ai/coordinator/gated-job");
    const { Cron } = await import("croner");
    const gatedRollback = withJobGate("ota-auto-rollback", runOtaAutoRollback);
    new Cron("0-59/5 * * * *", { timezone: "Europe/Rome" }, () => {
      gatedRollback().catch((e) => console.warn("[OTA-AUTO-ROLLBACK] worker error:", e));
    });
    console.log("[INIT] OTA auto-rollback worker scheduled every 5 min (cron slot :00)");
  });

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
    markDegraded("scheduler:ai-moderation");
  }

  try {
    const { startCriticalReportsNotifier } = await import("./jobs/critical-reports-notifier");
    startCriticalReportsNotifier();
    console.log("[INIT] Critical reports notifier started");
  } catch (e) {
    console.warn("[INIT] Critical reports notifier failed (non-fatal):", e);
    markDegraded("scheduler:critical-reports-notifier");
  }

  // Ring-buffer hydration: differita di 2 minuti dal boot e avvolta in
  // withBgDbSlot, fire-and-forget. Non più sincrona in Phase 5 (competeva con il
  // DB Init per le connessioni del pool proprio mentre era già stressato).
  setTimeout(() => {
    void (async () => {
      try {
        const { hydrateProbeLog, hydrateErrorHistory } = await import("./routes/admin/thinkcentre-health-utils");
        const { withBgDbSlot } = await import("./lib/bg-db-limiter");
        await withBgDbSlot(() => hydrateProbeLog());
        await withBgDbSlot(() => hydrateErrorHistory());
      } catch (e) {
        console.warn("[INIT] Ring-buffer hydration failed (non-fatal):", e);
      }
    })();
  }, 2 * 60_000);

  try {
    const { startCoordinatorGuards } = await import("./ai/coordinator/guards");
    startCoordinatorGuards();
  } catch (e) {
    console.warn("[INIT] Coordinator guard jobs failed (non-fatal):", e);
    markDegraded("scheduler:coordinator-guards");
  }

  try {
    const { startHorusAutoLearnScheduler } = await import("./ai/coordinator/horus-auto-learn");
    startHorusAutoLearnScheduler();
  } catch (e) {
    console.warn("[INIT] Horus auto-learn scheduler failed (non-fatal):", e);
    markDegraded("scheduler:horus-auto-learn");
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
    markDegraded("scheduler:service-monitors");
  }

  try {
    const { startWatchdogScheduler } = await import("./ai/watchdog/scheduler");
    startWatchdogScheduler();
    console.log("[INIT] AI Watchdog scheduler started");
  } catch (e) {
    console.warn("[INIT] AI Watchdog scheduler failed (non-fatal):", e);
    markDegraded("scheduler:ai-watchdog");
  }

  try {
    // Task #64 — probe carico backend + cleanup retention history Database Monitor.
    // Le righe di history sono scritte dal ciclo aggregator (sopra); qui avviamo
    // solo il probe di carico backend e il timer di retention (35g, withBgDbSlot).
    const { startDbMonitorHistory } = await import("./db-monitor-history");
    startDbMonitorHistory();
    console.log("[INIT] Database Monitor history started");
  } catch (e) {
    console.warn("[INIT] Database Monitor history failed (non-fatal):", e);
    markDegraded("scheduler:db-monitor-history");
  }

  await arm("tc-metrics-sampler", async () => {
    const { startTcMetricsSampler } = await import("./jobs/tc-metrics-sampler");
    startTcMetricsSampler();
    console.log("[INIT] TC metrics sampler started (60s interval, 7d retention)");
  });

  try {
    const { startCampaignsSelfCheckScheduler } = await import("./ai/watchdog/campaigns-self-check");
    startCampaignsSelfCheckScheduler();
    console.log("[INIT] Campagne self-check scheduler started");
  } catch (e) {
    console.warn("[INIT] Campagne self-check scheduler failed (non-fatal):", e);
    markDegraded("scheduler:campaigns-self-check");
  }

  try {
    const { scheduleMemoryPruner } = await import("./ai/assistant/memory-pruner");
    scheduleMemoryPruner();
  } catch (e) {
    console.warn("[INIT] Memory pruner scheduler failed (non-fatal):", e);
    markDegraded("scheduler:memory-pruner");
  }

  await arm("assistant-auto-learn", async () => {
    const { startAutoLearnScheduler } = await import("./ai/assistant/auto-learn");
    startAutoLearnScheduler();
    console.log("[INIT] Bowie auto-learn scheduler started (local-only)");
  });

  // Task #5326 — Horus: analisi autonoma continua in background (load-aware,
  // finestre a basso carico via online-tracker), riusa db-integrity/watchdog
  // come sorgenti dati, dual-write DB + logs/horus-analysis-*.md. Nessuna
  // sovrapposizione con altri scheduler AI: gira su un proprio intervallo con
  // gate di fingerprint (skip se nulla è cambiato dall'ultimo giro).
  await arm("horus-analysis", async () => {
    const { startHorusAnalysisScheduler } = await import("./ai/assistant/horus-analyzer");
    startHorusAnalysisScheduler();
    console.log("[INIT] Horus background analysis scheduler started (load-aware)");
  });

  // Task #662 — Patch scan settimanale: domenica 02:00 Europe/Rome.
  // Rileva TODO/FIXME/@ts-ignore/workaround accumulati; push agli admin se
  // ci sono trovati CRITICO o ALTO; skip pulito se Horus è irraggiungibile.
  await arm("horus-patch-scan", async () => {
    const { scheduleHorusPatchScan } = await import("./jobs/horus-patch-scan-job");
    scheduleHorusPatchScan();
    console.log("[INIT] Horus patch scan scheduler avviato (dom 02:00 Europe/Rome)");
  });

  // Task #5322 — Poller dei job VPS (VM Google): raccoglie l'esito dei job async
  // avviati dagli admin in chat e li recapita. Cadenza 2 min, non-fatale.
  await arm("assistant-vps-poller", async () => {
    const { pollVpsJobs, reapStaleVpsJobsOnBoot } = await import("./ai/assistant/vps-ops");
    await reapStaleVpsJobsOnBoot().catch((e) => console.warn("[INIT][BG] reapStaleVpsJobsOnBoot error:", e));
    setInterval(withJobGate("assistant-vps-poller", () => {
      pollVpsJobs().catch((e) => console.warn("[vps-poller] tick error:", e));
    }), 2 * 60 * 1000);
    console.log("[INIT] Bowie VPS job poller started");
  });

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
    markDegraded("scheduler:cleanup");
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
    markDegraded("scheduler:ai-coordinator-integrations");
  }

  // Control-plane del coordinatore Horus: idrata la registry dei job dal DB
  // (ripristina pause/throttle sopravvissuti al restart) e avvia il loop.
  // Task #591: deletes legacy Quebracho directives on startup (fail-open: warns but never blocks).
  await arm("horus-coordinator-loop", async () => {
    const { hydrateRegistryFromDb, resetRunningJobsOnStartup } = await import("./ai/coordinator/job-registry");
    const { startHorusCoordinatorLoop } = await import("./ai/coordinator/horus-coordinator-loop");
    // Cleanup: remove stale Quebracho app_settings key from DB (no longer valid).
    // Note: the `directive` table and `issued_by` column on ai_coordinator_jobs never
    // existed in migrations, so only the app_settings key needs to be cleared.
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`DELETE FROM app_settings WHERE key = 'matching_coordinator_directive:quebracho'`);
      console.log("[INIT] Task #591: Quebracho app_settings cleanup complete (0 rows expected).");
    } catch (cleanupErr) {
      console.warn("[INIT] Task #591: Quebracho app_settings cleanup failed (non-fatal):", cleanupErr);
    }
    await hydrateRegistryFromDb();
    // Reset zombie: jobs still "running" in DB after hydration are reset to idle.
    const resetted = resetRunningJobsOnStartup();
    if (resetted.length > 0) {
      console.warn(`[INIT] Coordinator startup reset: ${resetted.length} zombie job(s) → idle: ${resetted.join(", ")}`);
    }
    startHorusCoordinatorLoop();
    console.log("[INIT] Horus coordinator loop started (serial control-plane)");
  });

  try {
    const { startDbIntegrityScheduler } = await import("./ai/db-integrity/scheduler");
    startDbIntegrityScheduler();
    const { startDbIntegrityWorker } = await import("./ai/db-integrity/worker");
    startDbIntegrityWorker();
    console.log("[INIT] AI DB Integrity scheduler + worker started");
  } catch (e) {
    console.warn("[INIT] AI DB Integrity scheduler failed (non-fatal):", e);
    markDegraded("scheduler:ai-db-integrity");
  }

  try {
    const { startAppIntegrityScheduler } = await import("./ai/integrity/scheduler");
    startAppIntegrityScheduler();
    console.log("[INIT] AI App Integrity scheduler started");
  } catch (e) {
    console.warn("[INIT] AI App Integrity scheduler failed (non-fatal):", e);
    markDegraded("scheduler:ai-app-integrity");
  }

  import("./jobs/zero-match-snapshot-job")
    .then(({ startZeroMatchSnapshotScheduler }) => startZeroMatchSnapshotScheduler())
    .catch((e) => console.warn("[INIT] Zero-match snapshot scheduler failed (non-fatal):", e));

  import("./fake-activity")
    .then(({ initFakeActivityOnBoot }) => initFakeActivityOnBoot())
    .catch((e) => console.warn("[INIT] Background: fake activity init error:", e));

  // Bio embedding back-fill: runs once at boot (via bootJobQueue), then every 24h.
  // Catches users whose bio changed or whose embedding was missed due to API errors.
  // NOTE: The duplicate call in boot-sequence.ts has been removed — this is the
  // single source of truth for bio embedding back-fill scheduling.
  // Registered in bootJobQueue to avoid overlapping with other heavy boot jobs.
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  // Task #393 — Il .catch() originale inghiottiva l'errore e restituiva una
  // Promise risolta, per cui withJobGate chiamava sempre markRunSuccess anche
  // in caso di fallimento. Ora l'errore viene loggato e ri-lanciato così
  // markRunFailure viene invocato correttamente e il job non resta in "running".
  const runBioBackfill = withJobGate("bio-embeddings-backfill", async () => {
    console.log("[EMBED BACKFILL] avvio backfill embeddings bio...");
    try {
      const { backfillBioEmbeddings } = await import("./embeddings/backfill-bio");
      const r = await backfillBioEmbeddings();
      console.log(
        `[EMBED BACKFILL] Done — processed=${r.processed}` +
        ` backfilled=${r.backfilled} skipped=${r.skipped} errors=${r.errors}`,
      );
    } catch (e) {
      console.warn("[EMBED BACKFILL] error:", e);
      throw e; // propaga a withJobGate → markRunFailure
    }
  });
  bootJobQueue.register("BioEmbeddingsBackfill", async () => {
    console.log("[INIT][BG] Starting backfillBioEmbeddings (boot-time pass)...");
    await runBioBackfill();
  });
  // Task #393 — Wrapper .catch() esplicito: runBioBackfill ora ri-lancia in caso
  // di errore così withJobGate può chiamare markRunFailure; passare la funzione
  // direttamente a setInterval lascerebbe le rejection non gestite → crash del processo.
  setInterval(() => { runBioBackfill().catch(() => {}); }, TWENTY_FOUR_HOURS_MS);
  console.log("[INIT] Bio embedding back-fill scheduled (boot + every 24h)");

  try {
    const { scheduleEmbeddingDailyReport } = await import("./jobs/embedding-daily-report");
    scheduleEmbeddingDailyReport();
    console.log("[INIT] Embedding daily report job scheduled (08:15 Europe/Rome)");
  } catch (e) {
    console.warn("[INIT] Embedding daily report scheduler failed (non-fatal):", e);
    markDegraded("scheduler:embedding-daily-report");
  }

  try {
    const { startEmbeddingCapAlertJob } = await import("./jobs/embedding-cap-alert");
    startEmbeddingCapAlertJob();
  } catch (e) {
    console.warn("[INIT] Embedding cap alert job failed (non-fatal):", e);
    markDegraded("scheduler:embedding-cap-alert");
  }

  // Task #75 — Nadir: reindicizzazione notturna + sonda salute ricerca (03:30 Europe/Rome).
  try {
    const { scheduleNadirNightly } = await import("./jobs/nadir-nightly");
    scheduleNadirNightly();
    console.log("[INIT] Nadir nightly reindex+health job scheduled (03:30 Europe/Rome)");
  } catch (e) {
    console.warn("[INIT] Nadir nightly scheduler failed (non-fatal):", e);
    markDegraded("scheduler:nadir-nightly");
  }

  try {
    const { startResourceGraphSampler } = await import("./resource-graph-sampler");
    startResourceGraphSampler();
    console.log("[INIT] Resource graph sampler started (samples when resource_graph_enabled=true)");
  } catch (e) {
    console.warn("[INIT] Resource graph sampler failed to start (non-fatal):", e);
    markDegraded("scheduler:resource-graph-sampler");
  }

  try {
    const { startExportScheduler } = await import("./export-service");
    await startExportScheduler();
    console.log("[INIT] Export scheduler started");
  } catch (e) {
    console.warn("[INIT] Export scheduler failed to start (non-fatal):", e);
    markDegraded("scheduler:export");
  }

  try {
    const { startHoleDetectorScheduler } = await import("./ai/pipeline-monitor/hole-detector");
    startHoleDetectorScheduler();
    console.log("[INIT] Pipeline hole detector scheduler started (5min interval)");
  } catch (e) {
    console.warn("[INIT] Pipeline hole detector scheduler failed (non-fatal):", e);
    markDegraded("scheduler:pipeline-hole-detector");
  }

  try {
    const { runPipelineChecks } = await import("./ai/pipeline-monitor/runner");
    const SIX_HOURS_MS = 6 * 60 * 60_000;
    const _gatedPipelineChecks = withJobGate("pipeline-radiografia", () => {
      runPipelineChecks({ triggeredBy: "scheduler" }).catch((e) =>
        console.warn("[pipeline-check] scheduled run failed:", e));
    });
    setTimeout(() => {
      runPipelineChecks({ triggeredBy: "scheduler" }).catch((e) =>
        console.warn("[pipeline-check] startup run failed:", e));
    }, 5 * 60_000);
    setInterval(_gatedPipelineChecks, SIX_HOURS_MS);
    console.log("[INIT] Pipeline radiografia scheduler started (6h interval)");
  } catch (e) {
    console.warn("[INIT] Pipeline radiografia scheduler failed (non-fatal):", e);
    markDegraded("scheduler:pipeline-radiografia");
  }

  await arm("ai-hub-map-repush", async () => {
    const { scheduleAgentMapRepush } = await import("./lib/ai-hub-map-push");
    scheduleAgentMapRepush();
  });

  } finally {
    // Sigilla + arma la boot-job queue qui — phase 5 è l'ultima fase di boot,
    // quindi tutte le register() da startMatchingEngine() e runPhase5Schedulers()
    // sono garantite essere avvenute prima di questo punto. Il finally garantisce
    // che la coda parta SEMPRE, anche se un blocco scheduler ha lanciato: i job
    // pesanti registrati (back-fill embeddings, conversazioni club, ecc.) non
    // restano persi. Dopo sealAndStart() ogni register() tardiva lancia (vedi
    // boot-job-queue.ts), così un job aggiunto troppo tardi è un errore visibile.
    bootJobQueue.sealAndStart();
  }
}
