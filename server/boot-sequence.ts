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
import { runBootPhase3DbInit } from "./boot-phase3-db-init";
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

// ── DB readiness pre-flight ───────────────────────────────────────────────────
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
  const TOTAL = 5;

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
      process.exit(1);
    }
    const baselineNote = drift.knownHits.length > 0
      ? ` (${drift.knownHits.length} drift noti in baseline ignorati)`
      : "";
    console.log(`[BOOT] Registry ↔ Migration: OK — nessun nuovo drift${baselineNote}.`);
  } catch (e) {
    console.warn(
      "[BOOT] Registry ↔ Migration check fallito (non-fatal, db-integrity coprirà a runtime):",
      (e as Error).message,
    );
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
    try {
      const { attachDiagnosticWS } = await import("./diagnostic-ws");
      attachDiagnosticWS(server);
    } catch (e) {
      console.warn("[INIT] diagnostic WS attach failed (non-fatal):", e);
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
    if (process.env.NODE_ENV === "production") (async () => {
      try {
        const { runIndexDriftCheck } = await import("../scripts/check-index-drift");
        const result = await runIndexDriftCheck();
        if (result.exitCode === 1) {
          const summary = result.issues.slice(0, 3).join("; ") +
            (result.issues.length > 3 ? ` (+${result.issues.length - 3} altri)` : "");
          console.error(
            `[BOOT][INDEX-DRIFT] CRITICAL — drift rilevato al boot (${result.issues.length} problema/i): ${summary}. ` +
            `Correggere con migration o fix schema TS prima del prossimo deploy.`,
          );
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
        } else if (result.exitCode === 2) {
          console.warn(
            "[BOOT][INDEX-DRIFT] DB non raggiungibile durante il check post-boot — verifica skippata (insolito in prod).",
          );
        } else {
          console.log("[BOOT][INDEX-DRIFT] OK — nessun drift di indici speciali rilevato.");
        }
      } catch (err) {
        console.warn("[BOOT][INDEX-DRIFT] Check fallito (non-fatal):", err);
      }
    })();

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
