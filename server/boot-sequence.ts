// overflow di server/index.ts — sequenza di boot estratta per ridurre le dimensioni
import { initState, markDegraded } from "./init-state";
import { startMatchingEngine } from "./matching-engine";
import {
  autoSeedEssentialUsers,
  autoSeedFakeUsers,
  seedAppleReviewerAccount,
  seedGooglePlayReviewerAccount,
  ensureBikerLinkOfficialOnBoot,
} from "./auto-seed";
import { seedTranslationKeys } from "./routes/admin/translations";
import { seedTagsAtStartup } from "./seed-tags-runtime";
import { seedMotoclubs, seedClubMembershipsOnBoot } from "./routes/motoclubs/seed";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { initUptimeTracking, startMetroMonitor } from "./uptime";
import { runMigrations } from "./migrate";
import { addBootLog, bootOk } from "./lib/boot-log";
import { startAliveBeacon } from "./lib/alive-beacon";
import { initMissingClubConversations, ensureCompetitorAnalysisPdf } from "./init-helpers";
import { enrichBikerMatchBreakdowns } from "./matching/enrich-breakdowns";
import { bootJobQueue } from "./lib/boot-job-queue";
import { runBootPhase3DbInit } from "./boot-phase3-db-init";
import { resetCrashBackoff, applyCrashBackoff } from "./lib/crash-backoff";
import type { Server } from "http";

// ── Phase timeout helper ─────────────────────────────────────────────────────
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

// Numero di fasi del boot loggate (1..5). Modulo-level perché lo usa anche
// runPostReady() per la fase 5 (schedulers), ora eseguita post-READY.
const TOTAL_PHASES = 5;

const BOOT_START = Date.now();

function bootLog(n: number, total: number, step: string, msg: string) {
  const elapsed = ((Date.now() - BOOT_START) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] [${n}/${total}] ${step} — ${elapsed}s | ${msg}`);
  const ok = msg === "done" ? true : msg === "start" ? null : null;
  addBootLog(`[${n}/${total}] ${step}`, msg, ok);
}

// ── DB readiness pre-flight ───────────────────────────────────────────────────
// Task #5123 — Chiarimento sulla natura di questo pre-flight: NON è un gate
// bloccante. È un "latency smoother" best-effort: prova ad aprire una connessione
// e fare SELECT 1 con qualche retry, così nel caso comune (DB pronto in 1-2
// tentativi) la Phase 2 (Migrations) parte su un pool già caldo, evitando un
// primo errore rumoroso. Se dopo tutti i tentativi il DB resta irraggiungibile,
// NON abortiamo né blocchiamo: si prosegue comunque e la Phase 2 — che è FATAL e
// gestisce il proprio errore con process.exit + crash-backoff — diventa l'unico
// vero gate sul DB. In sintesi: questo pre-flight può solo ridurre la latenza/i
// falsi errori al boot, mai impedire l'avvio.
const DB_READY_MAX_ATTEMPTS = 10;
const DB_READY_INTERVAL_MS = 3_000;

async function waitForDatabaseReady(): Promise<void> {
  for (let attempt = 1; attempt <= DB_READY_MAX_ATTEMPTS; attempt++) {
    let client: import("pg").PoolClient | null = null;
    try {
      client = await pool.connect();
      await client.query("SELECT 1");
      if (attempt > 1) {
        console.log(`[BOOT][DB-READY] DB disponibile al tentativo ${attempt} — proseguo con le migration.`);
      }
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === DB_READY_MAX_ATTEMPTS) {
        console.warn(
          `[BOOT][DB-READY] DB non raggiungibile dopo ${DB_READY_MAX_ATTEMPTS} tentativi (ultimo errore: ${msg}) — procedo comunque, Phase 2 gestirà l'errore.`,
        );
        return;
      }
      console.warn(
        `[BOOT][DB-READY] Tentativo ${attempt}/${DB_READY_MAX_ATTEMPTS} fallito (${msg}) — riprovo tra ${DB_READY_INTERVAL_MS / 1000}s...`,
      );
      await new Promise<void>((res) => setTimeout(res, DB_READY_INTERVAL_MS));
    } finally {
      try { client?.release(); } catch { /* ignore */ }
    }
  }
}

export async function runBootSequence(server: Server, errorHandlersReady: Promise<void>): Promise<void> {
  const TOTAL = TOTAL_PHASES;

  let needsFakeSeed = false;

  await errorHandlersReady;

  // ── Phase 1: HTTP Listen (FIRST) ──────────────────────────────────────────
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

  // ── DragonflyDB TCP bridge (cloudflared access tcp) — Task #5261 ────────────────
  // Apre il path privato TCP verso il DragonflyDB del ThinkCentre se configurato
  // (REDIS_TUNNEL_HOSTNAME). No-op se non configurato (usa TC_DRAGONFLY_URL diretto).
  // Non bloccante e MAI fatale: il monitor TC farà reInitRedis quando la probe
  // DragonflyDB passa, anche se il listener non è ancora pronto qui.
  try {
    const { startRedisTunnel } = await import("./cache/redis-tunnel");
    await startRedisTunnel();
  } catch (e) {
    console.warn("[BOOT] avvio redis-tunnel fallito (non-fatal):", e);
  }

  // ── DB readiness pre-flight (prima di Phase 2) ────────────────────────────
  await waitForDatabaseReady();

  // ── Phase 2: Migrations (FATAL — gira dopo il listen) ─────────────────────
  bootLog(2, TOTAL, "Migrations", "start");
  try {
    await withPhaseTimeout("Migrations", runMigrations(), MIGRATION_TIMEOUT_MS);
    bootLog(2, TOTAL, "Migrations", "done");
    // Schema + tabella session pronti: il gate /api/* può ora lasciar passare
    // le rotte auth essenziali (login, me, logout) anche se initializing=true,
    // così gli utenti non vedono "Server occupato" durante la finestra di boot.
    initState.dbReady = true;
  } catch (err) {
    console.error("[startup] FATAL — Migrations failed, aborting:", err);
    applyCrashBackoff("migrations-fatal");
    process.exit(1);
  }

  // ── Phase 2b: Registry ↔ Migration structural drift guard (FATAL) ──────────
  try {
    const { runDriftCheck } = await import("./scripts/check-schema-migration-drift");
    const drift = runDriftCheck();
    if (!drift.ok) {
      console.error("──────────────────────────────────────────────────────────────");
      console.error("[BOOT] FATAL — Registry ↔ Migration drift rilevato al pre-boot.");
      console.error("──────────────────────────────────────────────────────────────");
      if (drift.newTables.length) {
        console.error(`  [FORWARD] Tabelle senza migration (${drift.newTables.length}):`);
        for (const t of drift.newTables) console.error(`    • ${t}`);
      }
      if (drift.newColumns.length) {
        console.error(`  [FORWARD] Colonne senza migration (${drift.newColumns.length}):`);
        for (const c of drift.newColumns) console.error(`    • ${c}`);
      }
      if (drift.newUniqueIndexes?.length) {
        console.error(`  [FORWARD] uniqueIndex() senza migration (${drift.newUniqueIndexes.length}):`);
        for (const u of drift.newUniqueIndexes) console.error(`    • ${u}`);
      }
      if (drift.removedTables?.length) {
        console.error(`  [INVERSE] Tabelle rimosse dal registry senza migration (${drift.removedTables.length}):`);
        for (const t of drift.removedTables) console.error(`    • ${t}`);
      }
      if (drift.droppedColumns?.length) {
        console.error(`  [INVERSE] Colonne rimosse dal registry senza DROP COLUMN (${drift.droppedColumns.length}):`);
        for (const c of drift.droppedColumns) console.error(`    • ${c}`);
      }
      console.error("  Azione: crea il file migrations/NNNN_*.sql con le DDL mancanti e riavvia.");
      applyCrashBackoff("drift-fatal");
      process.exit(1);
    }
    const baselineNote = drift.knownHits.length > 0
      ? ` (${drift.knownHits.length} drift noti in baseline ignorati)`
      : "";
    console.log(`[BOOT] Registry ↔ Migration: OK — nessun nuovo drift${baselineNote}.`);
  } catch (e) {
    // Task #5123 — Distinzione importante: questo catch NON significa "drift
    // rilevato". Lo scenario di drift VERO (forward/inverse) è già gestito sopra
    // come FATAL (process.exit). Qui finiamo solo se il drift-checker STESSO ha
    // lanciato (errore interno del tooling: parser, lettura file, ecc.).
    //
    // Policy (non-fatale, ma VISIBILE): un errore interno del checker non è una
    // prova di schema incoerente, quindi NON facciamo process.exit — renderlo
    // fatale qui rischierebbe un crash-loop su un bug del tooling, non su un
    // problema reale di schema. Lo marchiamo però come degraded così lo stato
    // è visibile su /api/health (prima era un warning silenzioso ignorato) e
    // db-integrity ricontrolla comunque il drift a runtime.
    console.warn(
      "[BOOT] Registry ↔ Migration check NON eseguito — errore interno del checker " +
      "(non-fatal, non è un drift; db-integrity ricontrolla a runtime):",
      (e as Error).message,
    );
    markDegraded("drift-check-unavailable");
  }

  // ── Phase 3: DB Init (estratta in boot-phase3-db-init.ts) ─────────────────
  bootLog(3, TOTAL, "DB Init", "start");
  await runBootPhase3DbInit();
  bootLog(3, TOTAL, "DB Init", "done");

  // ── Phase 4: Seed + Core services (FATAL — timeout → process.exit) ────────
  bootLog(4, TOTAL, "Seed + Engine", "start");
  try {
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
      needsFakeSeed = true;
    }

    const isDeployedProd = process.env.REPLIT_DEPLOYMENT === "1";
    if (!skipSeed || !isDeployedProd) {
      await withPhaseTimeout("autoSeedEssentialUsers", autoSeedEssentialUsers(), 90_000);
    } else {
      console.log("[INIT] Phase 4: skipSeed=true in production — skipping autoSeedEssentialUsers");
    }
    await withPhaseTimeout("ensureBikerLinkOfficialOnBoot", ensureBikerLinkOfficialOnBoot(), 90_000);

    // IMPORTANTE: registriamo THUNK (() => Promise), non promise già avviate.
    // Costruire l'array con `seedTagsAtStartup()` ecc. avvierebbe TUTTE le seed
    // in parallelo subito: se una (es. seedTagsAtStartup) rejecta mentre il loop
    // sta ancora awaitando una precedente, nessun handler è attaccato → diventa
    // una `unhandledRejection` non gestita → process.exit(1) (la firma di crash
    // osservata). Con i thunk ogni seed parte solo quando il loop la raggiunge,
    // sempre dentro il try/catch + withPhaseTimeout.
    for (const [name, makeFn] of [
      ["seedAppleReviewerAccount", seedAppleReviewerAccount],
      ["seedGooglePlayReviewerAccount", seedGooglePlayReviewerAccount],
      ["seedTranslationKeys", seedTranslationKeys],
      ["seedTagsAtStartup", seedTagsAtStartup],
    ] as [string, () => Promise<unknown>][]) {
      try {
        await withPhaseTimeout(name, makeFn(), 60_000);
      } catch (e) {
        console.warn(`[INIT] Phase 4: ${name} failed (non-fatal):`, e);
      }
    }

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
    try {
      const { attachDiagnosticWS } = await import("./diagnostic-ws");
      attachDiagnosticWS(server);
    } catch (e) {
      console.warn("[INIT] diagnostic WS attach failed (non-fatal):", e);
    }
  } catch (err) {
    console.error("[INIT] FATAL — Phase 4 failed:", err);
    applyCrashBackoff("phase4-fatal");
    process.exit(1);
  }
  bootLog(4, TOTAL, "Seed + Engine", "done");

  // Job pesanti post-boot: registrati nel bootJobQueue (initial delay 4 min,
  // gap 45s) PRIMA della Phase 5, perché è la Phase 5 (runPhase5Schedulers) a
  // chiamare bootJobQueue.sealAndStart() — registrarli dopo la sigillatura
  // lancerebbe un errore (coda sealed) invece di essere persi in silenzio.
  // Così questi UPDATE/insert non competono col DB Init e appaiono nei log solo
  // dopo 4+ minuti dal boot.
  bootJobQueue.register("InitMissingClubConversations", async () => {
    await initMissingClubConversations();
  });
  bootJobQueue.register("EnrichBikerMatchBreakdowns", async () => {
    const r = await enrichBikerMatchBreakdowns();
    console.log(
      `[BootJobQueue] enrichBikerMatchBreakdowns — done` +
      ` bb_updated=${r.bbUpdated} bb_cleared=${r.bbCleared}` +
      ` bz_updated=${r.bzUpdated} bz_cleared=${r.bzCleared}`,
    );
  });

  // ── READY ─────────────────────────────────────────────────────────────────
  // Critical path completo (listen → migrations → drift guard → DB init → seed +
  // matching engine + WS): il server può servire richieste ORA. Schedulers,
  // warmup, analytics, index-drift e fake-seed NON bloccano più il READY: girano
  // in runPostReady() in modo asincrono e NON fatale (nessun process.exit
  // post-READY → niente crash-loop dopo aver già servito traffico).
  initState.initializing = false;
  // Boot riuscito: azzera il conteggio crash recenti così un crash isolato dopo
  // un periodo sano attende solo il delay base, senza ereditare un backoff alto
  // di una raffica passata (vedi lib/crash-backoff.ts).
  resetCrashBackoff();
  bootOk("READY", `Critical phases completed in ${((Date.now() - BOOT_START) / 1000).toFixed(1)}s — server is READY`);
  startAliveBeacon();
  const totalElapsed = ((Date.now() - BOOT_START) / 1000).toFixed(1);
  console.log(`[INIT] Critical startup phases completed in ${totalElapsed}s — server is READY (schedulers + warmup run post-READY)`);

  console.log(
    `[INIT][SUMMARY] ── Boot task summary ──────────────────────────\n` +
    `[INIT][SUMMARY]   FOREGROUND (ran before READY):\n` +
    `[INIT][SUMMARY]     autoSeedEssentialUsers   : ${needsFakeSeed ? "ran" : "skipped (DB already seeded)"}\n` +
    `[INIT][SUMMARY]     seedAppleReviewerAccount : ran\n` +
    `[INIT][SUMMARY]     seedGooglePlayReviewerAccount : ran\n` +
    `[INIT][SUMMARY]     ensureBikerLinkOfficialOnBoot : ran\n` +
    `[INIT][SUMMARY]     seedMotoclubs / seedClubMembershipsOnBoot / startMatchingEngine : ran\n` +
    `[INIT][SUMMARY]   POST-READY (async, non-blocking, non-fatal):\n` +
    `[INIT][SUMMARY]     schedulers (vacuum/mapMatch/curvyScore/OTA/zeroMatchSnapshot) : post-READY\n` +
    `[INIT][SUMMARY]     index-drift check / embedding-coverage check / competitor-PDF : post-READY\n` +
    `[INIT][SUMMARY]   BACKGROUND (fire-and-forget after READY):\n` +
    `[INIT][SUMMARY]     runPlaylistSnapshot / saveSchemaSnapshot / initMissingClubConversations : scheduled\n` +
    `[INIT][SUMMARY]     enrichBikerMatchBreakdowns (back-fill affinity chips) : scheduled\n` +
    `[INIT][SUMMARY]     backfillBioEmbeddings (back-fill missing/stale bio embeddings) : scheduled\n` +
    `[INIT][SUMMARY]     autoSeedFakeUsers        : ${needsFakeSeed ? "scheduled" : "skipped (needsFakeSeed=false)"}\n` +
    `[INIT][SUMMARY] ────────────────────────────────────────────────`
  );

  // Post-READY: asincrono, non bloccante, non fatale. Il .catch() finale è
  // OBBLIGATORIO — una rejection non gestita qui diventerebbe unhandledRejection
  // → crashExit() → restart, ricreando il crash-loop che vogliamo evitare.
  void runPostReady(needsFakeSeed).catch((err) => {
    console.warn("[BOOT][POST-READY] errore non gestito (non-fatale):", err);
    markDegraded("post-ready-error");
  });
}

// ── Post-READY ────────────────────────────────────────────────────────────────
// Tutto ciò che NON è sul path critico del boot. Gira dopo che il server è già
// in ascolto e ha dichiarato READY. È asincrono, non bloccante e NON fatale:
// nessun ramo qui chiama process.exit, così un problema post-READY non riavvia
// un processo che sta già servendo richieste. Un guard anti doppia esecuzione
// evita che schedulers/seed partano due volte.
let postReadyStarted = false;

async function runPostReady(needsFakeSeed: boolean): Promise<void> {
  if (postReadyStarted) {
    console.warn("[BOOT][POST-READY] già avviato — skip per evitare doppia esecuzione.");
    return;
  }
  postReadyStarted = true;

  // ── Phase 5: Schedulers + maintenance jobs (post-READY, NON fatale) ────────
  // Prima era FATAL (process.exit(1)) sul path critico: un errore degli scheduler
  // riavviava il server. Ora si logga e si marca degraded; il server resta su.
  bootLog(5, TOTAL_PHASES, "Schedulers", "start");
  try {
    const { runPhase5Schedulers } = await import("./boot-phase5-schedulers");
    await runPhase5Schedulers();
    bootLog(5, TOTAL_PHASES, "Schedulers", "done");
  } catch (err) {
    console.error("[INIT] Phase 5 (schedulers) failed (non-fatal, post-READY):", err);
    markDegraded("schedulers-init-failed");
  }

  ensureCompetitorAnalysisPdf();

  // Push model→agent map to the ai-hub (fire-and-forget, never markDegraded).
  void (async () => {
    try {
      const { pushAgentModelMapToHub } = await import("./lib/ai-hub-map-push");
      await pushAgentModelMapToHub();
    } catch (err) {
      console.warn("[BOOT][POST-READY] ai-hub map push unexpected error (non-fatal):", err);
    }
  })();

  await runIndexDriftCheckPostReady();
  await runEmbeddingCoveragePostReady();

  // initMissingClubConversations + enrichBikerMatchBreakdowns sono registrati nel
  // bootJobQueue (vedi runBootSequence, prima del READY): partono dopo 4+ minuti.

  // One-time idempotent migration: move pre-bucket wishlist photos from the
  // ephemeral uploads/wishlist/ dir into object storage and update DB URLs.
  void (async () => {
    try {
      const { migrateWishlistPhotosToBucket } = await import("./scripts/migrate-wishlist-photos-to-bucket");
      await migrateWishlistPhotosToBucket();
    } catch (err) {
      console.warn("[BOOT][POST-READY] wishlist photo migration unexpected error (non-fatal):", err);
    }
  })();

  if (needsFakeSeed) {
    console.log("[INIT][BG] Starting autoSeedFakeUsers...");
    autoSeedFakeUsers()
      .then(() => console.log("[INIT][BG] autoSeedFakeUsers — done"))
      .catch((err) => {
        console.warn("[INIT][BG] autoSeedFakeUsers error:", err);
      });
  }
}

// Index-drift check post-READY. NB: in passato il mode=block faceva
// applyCrashBackoff()+process.exit(1) DOPO il READY → riavviava un server che
// aveva già servito richieste (crash-loop). Ora né block né warn terminano il
// processo: entrambi loggano; block marca anche lo stato degraded di /api/health,
// così l'operatore vede il problema senza che il processo muoia.
async function runIndexDriftCheckPostReady(): Promise<void> {
  try {
    const { storage: s } = await import("./storage");
    const modeSetting = await s.getAppSetting("index_drift_check_mode");
    const VALID_MODES = ["warn", "block", "disabled"] as const;
    type DriftMode = typeof VALID_MODES[number];
    const rawMode = (modeSetting?.value ?? "warn").trim().toLowerCase();
    const mode: DriftMode = (VALID_MODES as readonly string[]).includes(rawMode)
      ? rawMode as DriftMode
      : (() => {
          console.warn(
            `[BOOT][INDEX-DRIFT] Valore AppSetting non riconosciuto (index_drift_check_mode="${rawMode}") — fallback a "warn".`,
          );
          return "warn" as DriftMode;
        })();

    if (mode === "disabled") {
      console.log("[BOOT][INDEX-DRIFT] Check disabilitato via AppSetting (index_drift_check_mode=disabled).");
      return;
    }

    const { runIndexDriftCheck } = await import("../scripts/check-index-drift");
    const result = await runIndexDriftCheck();

    if (result.exitCode === 1) {
      const summary = result.issues.slice(0, 3).join("; ") +
        (result.issues.length > 3 ? ` (+${result.issues.length - 3} altri)` : "");

      const severity = mode === "block" ? "DEGRADED (mode=block)" : "CRITICAL (mode=warn)";
      console.error(
        `[BOOT][INDEX-DRIFT] ${severity} — drift rilevato post-READY (${result.issues.length} problema/i): ${summary}. ` +
        `Correggere con migration o fix schema TS prima del prossimo deploy.`,
      );
      if (mode === "block") {
        markDegraded(`index-drift (${result.issues.length} issue/i)`);
      }
      // Push alert solo in produzione per evitare rumore in ambienti di sviluppo.
      if (process.env.NODE_ENV === "production") {
        try {
          const { sendSystemAlertPushToAdmins } = await import("./push-notifications");
          await sendSystemAlertPushToAdmins(
            "🔴 Index Drift rilevato al boot",
            `${result.issues.length} indice/i speciale/i non allineato/i col DB. Correzione richiesta. ${summary}`,
            { type: "index_drift_boot", issueCount: result.issues.length },
          );
        } catch (alertErr) {
          console.warn("[BOOT][INDEX-DRIFT] Invio push alert fallito (non-fatal):", alertErr);
        }
      }
    } else if (result.exitCode === 2) {
      console.warn(
        "[BOOT][INDEX-DRIFT] DB non raggiungibile durante il check post-boot — verifica skippata.",
      );
    } else {
      console.log("[BOOT][INDEX-DRIFT] OK — nessun drift di indici speciali rilevato.");
    }
  } catch (err) {
    console.warn("[BOOT][INDEX-DRIFT] Check fallito (non-fatal):", err);
  }
}

// Embedding coverage check post-READY (solo log/warn, mai fatale).
async function runEmbeddingCoveragePostReady(): Promise<void> {
  try {
    const { pool: pgPool } = await import("./db");
    const { storage: s } = await import("./storage");
    const thresholdSetting = await s.getAppSetting("embedding_coverage_threshold");
    const threshold = (() => {
      const raw = thresholdSetting?.value;
      if (!raw) return 80;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 80;
    })();
    const client = await pgPool.connect();
    try {
      const [activeRes, covRes] = await Promise.all([
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM users WHERE status = 'active'`,
        ),
        client.query<{ with_embedding: string }>(
          `SELECT COUNT(DISTINCT e.entity_id) AS with_embedding
           FROM embeddings e
           JOIN users u ON u.id = e.entity_id AND u.status = 'active'
           WHERE e.entity_type = 'user' AND e.field = 'bio'`,
        ),
      ]);
      const activeUsers = parseInt(activeRes.rows[0]?.total ?? "0", 10);
      const withEmbedding = parseInt(covRes.rows[0]?.with_embedding ?? "0", 10);
      const pct = activeUsers > 0
        ? Math.round((withEmbedding / activeUsers) * 100 * 10) / 10
        : 100;
      if (pct < threshold) {
        console.warn(
          `[INIT][EMBED] Coverage WARNING: only ${pct}% of active users have a 'bio' embedding` +
          ` (${withEmbedding}/${activeUsers}, threshold=${threshold}%).` +
          ` Match quality may be degraded for users without embeddings.`,
        );
      } else {
        console.log(
          `[INIT][EMBED] Coverage OK: ${pct}% of active users have a 'bio' embedding` +
          ` (${withEmbedding}/${activeUsers}).`,
        );
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn("[INIT][EMBED] Coverage check failed (non-fatal):", err);
  }
}
