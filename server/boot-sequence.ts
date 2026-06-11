// overflow di server/index.ts — sequenza di boot estratta per ridurre le dimensioni
import { initState } from "./init-state";
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
import { initMissingClubConversations, ensureCompetitorAnalysisPdf } from "./init-helpers";
import { enrichBikerMatchBreakdowns } from "./matching/enrich-breakdowns";
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

const BOOT_START = Date.now();

function bootLog(n: number, total: number, step: string, msg: string) {
  const elapsed = ((Date.now() - BOOT_START) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] [${n}/${total}] ${step} — ${elapsed}s | ${msg}`);
}

export async function runBootSequence(server: Server, errorHandlersReady: Promise<void>): Promise<void> {
  const TOTAL = 5;
  // ── FASE 4/4 del deploy/publish: avvio del container in produzione ──────────
  // Le fasi 1-3 (copia dev→prod DB, build script, creazione Autoscale) sono già
  // avvenute prima che questo processo partisse e sono loggate nel pannello
  // Publish. Da qui in poi siamo nella FASE 4: i TOTAL step sotto (bootLog n/5)

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

  // pgvector extension — garanzia permanente a ogni avvio del server.
  // Gira PRIMA di qualsiasi altra init DB: anche se la migration 0039 o 0095
  // è stata saltata o ha fallito silenziosamente in produzione, l'estensione
  // viene attivata qui. Non-fatal: se il provider non supporta pgvector logga
  // un warning ma non blocca il boot.
  try {
    const client = await pool.connect();
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      console.log("[boot] pgvector extension ensured");
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[boot] pgvector extension ensure failed (non-fatal) — findSimilar userà full-scan:", e);
  }

  // HNSW index self-heal — if the index was dropped or never created (e.g. on
  // a fresh DB restore), attempt to rebuild it at boot. CONCURRENTLY lets
  // reads/writes proceed during the build so this is safe in production.
  // Non-fatal: if it fails the server still boots, but findSimilar() will
  // emit a runtime warning on the first call.
  try {
    const client = await pool.connect();
    try {
      const idxCheck = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND tablename = 'embeddings'
             AND indexname = 'embeddings_vec_hnsw_cosine_idx'
         ) AS exists`,
      );
      const idxExists = idxCheck.rows[0]?.exists ?? false;
      if (!idxExists) {
        console.warn(
          "[boot] HNSW index 'embeddings_vec_hnsw_cosine_idx' mancante — tento self-heal con CREATE INDEX CONCURRENTLY...",
        );
        // CREATE INDEX CONCURRENTLY must run outside a transaction block.
        await client.query(
          `CREATE INDEX CONCURRENTLY IF NOT EXISTS "embeddings_vec_hnsw_cosine_idx"
             ON "embeddings" USING hnsw ("embedding" vector_cosine_ops)`,
        );
        console.log("[boot] HNSW index creato con successo (self-heal)");
      } else {
        console.log("[boot] HNSW index verificato OK");
      }
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn(
      "[boot] HNSW index self-heal fallito (non-fatal) — findSimilar userà sequential scan alla prima chiamata:",
      e,
    );
  }

  // Task #2838 — Email bootstrap
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

  // APK download URL bootstrap — imposta il link Google Drive se non già presente
  try {
    const { storage: apkStorage } = await import("./storage");
    const apkSetting = await apkStorage.getAppSetting("apk_download_url");
    const APK_DRIVE_URL = "https://drive.google.com/uc?export=download&id=15teG0lCIWFi6YuXtcfIMPjuWcctPc5cH";
    if (!apkSetting?.value?.trim()) {
      await apkStorage.upsertAppSetting("apk_download_url", APK_DRIVE_URL);
      console.log("[APK BOOTSTRAP] apk_download_url scritto in app_settings");
    } else {
      console.log("[APK BOOTSTRAP] apk_download_url già presente in app_settings — nessuna modifica");
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: APK URL bootstrap failed (non-fatal):", e);
  }

  // Support contact settings bootstrap
  try {
    const { storage: supportStorage } = await import("./storage");
    const [supportEmailSetting, supportWhatsappSetting] = await Promise.all([
      supportStorage.getAppSetting("support_email"),
      supportStorage.getAppSetting("support_whatsapp"),
    ]);
    if (!supportEmailSetting) {
      await supportStorage.upsertAppSetting("support_email", "bikerlinkapp@gmail.com");
      console.log("[SUPPORT BOOTSTRAP] support_email impostato al default");
    }
    if (!supportWhatsappSetting) {
      await supportStorage.upsertAppSetting("support_whatsapp", "");
      console.log("[SUPPORT BOOTSTRAP] support_whatsapp inizializzato vuoto");
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: support settings bootstrap failed (non-fatal):", e);
  }

  // Task #2817 — Ripristina il cooldown quota AI provider
  try {
    const { initProviderHealth } = await import("./ai/moderation/provider");
    await initProviderHealth();
  } catch (e) {
    console.warn("[INIT] Phase 3: initProviderHealth failed (non-fatal):", e);
  }

  // Ensure maps_telemetry_events table exists
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

  // Pre-warm ad image cache so images survive restarts without first-request fetch
  setImmediate(async () => {
    try {
      const { warmupAdImageCache } = await import("./routes/ads");
      await warmupAdImageCache();
    } catch (e) {
      console.warn("[INIT][BG] warmupAdImageCache error:", e);
    }
  });

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

    await withPhaseTimeout("autoSeedEssentialUsers", autoSeedEssentialUsers());
    await withPhaseTimeout("seedAppleReviewerAccount", seedAppleReviewerAccount());
    await withPhaseTimeout("seedGooglePlayReviewerAccount", seedGooglePlayReviewerAccount());
    await withPhaseTimeout("ensureBikerLinkOfficialOnBoot", ensureBikerLinkOfficialOnBoot());
    await withPhaseTimeout("seedTranslationKeys", seedTranslationKeys());
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
    const { runPhase5Schedulers } = await import("./boot-phase5-schedulers");
    await runPhase5Schedulers();
  } catch (err) {
    console.error("[INIT] FATAL — Phase 5 failed:", err);
    process.exit(1);
  }
  bootLog(5, TOTAL, "Schedulers", "done");

  // ── Boot complete ─────────────────────────────────────────────────────────
  initState.initializing = false;
  const totalElapsed = ((Date.now() - BOOT_START) / 1000).toFixed(1);
  console.log(`[INIT] All startup phases completed in ${totalElapsed}s — server is READY`);

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
    `[INIT][SUMMARY]     enrichBikerMatchBreakdowns (back-fill affinity chips) : scheduled\n` +
    `[INIT][SUMMARY]     backfillBioEmbeddings (back-fill missing/stale bio embeddings) : scheduled\n` +
    `[INIT][SUMMARY]     autoSeedFakeUsers        : ${needsFakeSeed ? "scheduled" : "skipped (needsFakeSeed=false)"}\n` +
    `[INIT][SUMMARY] ────────────────────────────────────────────────`
  );

  ensureCompetitorAnalysisPdf();

  setImmediate(() => {
    // ── Embedding coverage check (non-fatal) ──────────────────────────────────
    // Logs a warning when the fraction of active users with a 'bio' embedding
    // drops below 80 %.  Threshold configurable via AppSetting
    // `embedding_coverage_threshold` (integer 0–100, default 80).
    (async () => {
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
    })();

    console.log("[INIT][BG] Starting initMissingClubConversations...");
    initMissingClubConversations()
      .then(() => console.log("[INIT][BG] initMissingClubConversations — done"))
      .catch((err) => {
        console.warn("[INIT][BG] initMissingClubConversations error:", err);
      });

    console.log("[INIT][BG] Starting enrichBikerMatchBreakdowns (back-fill affinity chips)...");
    enrichBikerMatchBreakdowns()
      .then((r) =>
        console.log(
          `[INIT][BG] enrichBikerMatchBreakdowns — done` +
          ` bb_music=${r.bbMusicUpdated} bb_telem=${r.bbTelemetryUpdated}` +
          ` bz_music=${r.bzMusicUpdated} bz_telem=${r.bzTelemetryUpdated}`
        )
      )
      .catch((err) => {
        console.warn("[INIT][BG] enrichBikerMatchBreakdowns error:", err);
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
}
