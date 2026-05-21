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

const app = express();

// Set up middleware
setupMiddleware(app);

// Custom health and metrics routes (kept in index for orchestration or moved if needed)
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

// Register all API and static routes
registerAllRoutes(app);
setupStaticRoutes(app);

// Error handling
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
  
  activeConnections.forEach((socket) => {
    socket.destroy();
  });
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

(async () => {
  try {
    await runMigrations();
  } catch (err) {
    console.error("[startup] Migration runner failed — aborting server start:", err);
    process.exit(1);
  }

  const PORT = 5000;
  server.listen(PORT, "0.0.0.0", () => {
    const formattedDate = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    console.log(`[${formattedDate}] Server started on 0.0.0.0:${PORT}`);
    
    initUptimeTracking();
    startMetroMonitor();

    // Start background initialization
    (async () => {
      try {
        // Phase 1: Storage and Schema initialization
        try {
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_events_phase_idx ON ota_events(phase)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_events_release_id_idx ON ota_events(release_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_events_created_at_idx ON ota_events(created_at)`);
          console.log("[INIT] Phase 1: Database indices ensured");
        } catch (e) {
          console.warn("[INIT] Phase 1 error (indices):", e);
        }

        // Phase 2: System Cleanups
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
            console.log(`[MIGRATION] ota_events dirty-rv cleanup: deleted ${deletedCount} row(s) with invalid runtime_version`);
          } else {
            console.log("[MIGRATION] ota_events dirty-rv cleanup: 0 dirty rows found — table is clean");
          }
        } catch (e) {
          console.warn("[MIGRATION] ota_events dirty-rv cleanup failed (non-fatal):", e);
        }

        // OTA Retention Seed
        try {
          const existing = await storage.getAppSetting("ota_cleanup_retention_days");
          if (!existing) {
            await storage.upsertAppSetting("ota_cleanup_retention_days", "90");
            console.log("[OTA-CLEANUP] Seeded ota_cleanup_retention_days=90 in app_settings.");
          }
        } catch (e) {
          console.warn("[OTA-CLEANUP] Could not seed ota_cleanup_retention_days:", e);
        }

        // Startup OTA cleanup
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
            console.log(`[OTA-CLEANUP] Removed ${deletedRows.length} stale OTA release(s) older than ${retentionDays} days:`);
            const { deleteObject } = await import("./objectStorage");
            for (const row of deletedRows) {
              console.log(`  → id=${row.id} version=${row.version} status=${row.status} published_at=${row.published_at}`);
              if (row.bundle_path) {
                try {
                  await deleteObject(row.bundle_path);
                  console.log(`  → [OTA-CLEANUP] Deleted bundle from object storage: ${row.bundle_path}`);
                } catch (storageErr) {
                  console.warn(`  → [OTA-CLEANUP] Could not delete bundle ${row.bundle_path} (best-effort):`, storageErr);
                }
              }
            }
          }
        } catch (e) {
          console.warn("[OTA-CLEANUP] Startup OTA release cleanup failed:", e);
        }

        // Column ensures
        try {
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_enabled BOOLEAN NOT NULL DEFAULT false`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS home_latitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS home_longitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_latitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_longitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_radius INTEGER NOT NULL DEFAULT 2`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS gps_precision INTEGER NOT NULL DEFAULT 100`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS offline_position_randomize BOOLEAN NOT NULL DEFAULT true`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_work_enabled BOOLEAN NOT NULL DEFAULT false`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS work_latitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS work_longitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_work_latitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_work_longitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_work_radius INTEGER NOT NULL DEFAULT 2`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_whatever_enabled BOOLEAN NOT NULL DEFAULT false`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS whatever_latitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS whatever_longitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_whatever_latitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_whatever_longitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_whatever_radius INTEGER NOT NULL DEFAULT 2`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_offline_lat DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_offline_lng DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_music_tracks ADD COLUMN IF NOT EXISTS image_url TEXT`);
          await db.execute(sql`ALTER TABLE user_music_tracks ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'spotify'`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS floating_widget_enabled BOOLEAN NOT NULL DEFAULT true`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMP`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_app_close_at TIMESTAMP`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS units_preference JSONB`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{"matches":true,"zoneProposals":true,"chat":true,"motoclub":true,"eventi":true}'::jsonb`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS map_filters JSONB`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN NOT NULL DEFAULT true`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS slot VARCHAR(32)`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS promoted_by VARCHAR(100)`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100)`);
          console.log("[INIT] Phase 2: Schema extensions ensured");
        } catch (e) {
          console.warn("[INIT] Phase 2 error (columns):", e);
        }

        // Phase 3: Seed and Core Services
        await autoSeedEssentialUsers();
        await autoSeedFakeUsers();
        await seedAppleReviewerAccount();
        await seedGooglePlayReviewerAccount();
        await ensureBikerLinkOfficialOnBoot();
        
        startMatchingEngine();
        await initMissingClubConversations();
        console.log("[INIT] Phase 3: Core services and seeding completed");

        // Phase 4: Maintenance Jobs
        // (Moved from index.ts)
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
        await runPlaylistSnapshot();
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
        await saveSchemaSnapshot();

        initState.initializing = false;
        console.log("[INIT] All startup phases completed");
      } catch (err) {
        console.error("[INIT] Startup phase chain error:", err);
        initState.initializing = false;
      }
    })().catch(console.error);
  });
})();
