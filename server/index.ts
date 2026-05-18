import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { initState } from "./init-state";
import { startMatchingEngine, stopMatchingEngine } from "./matching-engine";
import { autoSeedEssentialUsers, autoSeedFakeUsers, seedAppleReviewerAccount, seedGooglePlayReviewerAccount, ensureBikerLinkOfficialOnBoot } from "./auto-seed";
import { db, pool } from "./db";
import { sql, eq, and } from "drizzle-orm";
import { motoClubs, motoClubMembers, conversations, conversationParticipants, motorcyclePhotos, userMotorcycles, userPhotos } from "@shared/schema";
import { seedMotoclubs } from "./routes/motoclubs";
import * as fs from "fs";
import * as path from "path";
import { initUptimeTracking, startMetroMonitor, stopMetroMonitor } from "./uptime";
import { matchEnrichmentSemaphore, MATCH_ENRICHMENT_GLOBAL_LIMIT } from "./lib/concurrency";
import { storage } from "./storage";

const app = express();
const log = console.log;

app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  // SECURITY (Task #1082, #1125): the global 10 MB JSON parser is bypassed
  // on selected public/abuse-prone routes so the route can install a much
  // smaller per-route parser and run its rate limiter before the body is
  // ever parsed.
  //   - /api/admin/startup-beacon (Task #1082) — public diagnostics.
  //   - /api/admin/ota-error      (Task #1125) — public OTA telemetry.
  //   - /api/admin/client-error   (Task #1125) — public client crash sink.
  //   - /api/feedback             (Task #1125) — authenticated but
  //                                              unthrottled and triggers
  //                                              an outbound email per call.
  // Without this bypass an attacker pays the cost of a 10 MB JSON parse
  // (CPU, memory, log noise) before the route can decide to drop the
  // request, which is exactly the abuse vector the threat model calls out.
  const globalJson = express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  });
  // Path normalized (lowercased + trailing-slash stripped) so a variant
  // like `/api/admin/ota-error/` cannot bypass the per-route cap and hit
  // the 10 MB global parser first.
  const SMALL_BODY_POST_PATHS = new Set<string>([
    "/api/admin/startup-beacon",
    "/api/admin/ota-error",
    "/api/admin/client-error",
    "/api/feedback",
  ]);
  app.use((req, res, next) => {
    if (req.method === "POST") {
      const normalized = (req.path || "").toLowerCase().replace(/\/+$/, "");
      if (SMALL_BODY_POST_PATHS.has(normalized)) {
        return next();
      }
    }
    return globalJson(req, res, next);
  });

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      if (capturedJsonResponse && res.statusCode !== 304) {
        const sanitized: Record<string, unknown> = { ...capturedJsonResponse };
        if ("sessionToken" in sanitized) sanitized.sessionToken = "[REDACTED]";
        const jsonStr = JSON.stringify(sanitized);
        logLine += ` :: ${jsonStr.length > 200 ? jsonStr.slice(0, 197) + "..." : jsonStr}`;
      }

      if (logLine.length > 120) {
        logLine = logLine.slice(0, 119) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

async function fetchMetroManifest(platform: string): Promise<Record<string, unknown>> {
  const http = await import("http");
  const data = await new Promise<string>((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 8081,
      path: "/",
      method: "GET",
      headers: {
        "expo-platform": platform,
        "Accept": "application/expo+json,application/json",
        "Expo-Protocol-Version": "1",
        "Expo-API-Version": "1",
      },
      timeout: 1500,
    };
    const metroReq = http.default.request(options, (metroRes) => {
      let body = "";
      metroRes.on("data", (chunk) => { body += chunk; });
      metroRes.on("end", () => resolve(body));
    });
    metroReq.on("error", reject);
    metroReq.on("timeout", () => { metroReq.destroy(); reject(new Error("timeout")); });
    metroReq.end();
  });
  return JSON.parse(data) as Record<string, unknown>;
}

function staticBundleExists(platform: string): boolean {
  const manifestPath = path.resolve(process.cwd(), "static-build", platform, "manifest.json");
  if (!fs.existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    const launchAsset = manifest.launchAsset as Record<string, unknown> | undefined;
    const bundleUrl = launchAsset?.url as string | undefined;
    if (!bundleUrl) return false;
    const urlPath = new URL(bundleUrl).pathname;
    const localPath = path.resolve(process.cwd(), "static-build", urlPath.replace(/^\//, ""));
    return fs.existsSync(localPath);
  } catch {
    return false;
  }
}

function readStaticManifest(platform: string): Record<string, unknown> {
  const manifestPath = path.resolve(process.cwd(), "static-build", platform, "manifest.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
}

async function serveExpoManifest(platform: string, req: Request, res: Response) {
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const forceLive = req.query["live"] === "true";

  // Percorso primario: bundle statico locale (affidabile, sempre disponibile)
  if (!forceLive && staticBundleExists(platform)) {
    try {
      const manifest = readStaticManifest(platform);
      log(`[manifest] Serving local static bundle for ${platform}`);
      return res.send(JSON.stringify(manifest));
    } catch (err) {
      console.error("[manifest] static read error:", err);
    }
  }

  // Percorso secondario: Metro live (dev / ?live=true / nessun bundle locale)
  try {
    const manifest = await fetchMetroManifest(platform);
    log(`[manifest] Serving live Metro manifest for ${platform}`);
    return res.send(JSON.stringify(manifest));
  } catch {
    // Metro non disponibile
  }

  // Nessuna sorgente disponibile
  return res.status(503).json({ error: `Bundle non disponibile per ${platform}. Riprova tra qualche secondo.` });
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return void serveExpoManifest(platform, req, res).catch((err) => {
        console.error("[manifest] error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Internal error" });
      });
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  // ── Pagine HTML statiche (privacy, termini, cancella account) ──────────────
  // DEVONO essere prima di qualsiasi express.static — in produzione
  // static-build/index.html esiste e la SPA catch-all intercetterebbe queste
  // route se registrate dopo i middleware di file statici.
  const htmlPages: Record<string, string> = {
    "/privacy":        "privacy-policy.html",
    "/privacy-policy": "privacy-policy.html",
    "/terms":          "terms.html",
    "/delete-account": "delete-account.html",
  };
  for (const [route, file] of Object.entries(htmlPages)) {
    const filePath = path.resolve(process.cwd(), "server", "templates", file);
    app.get(route, (_req: Request, res: Response) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(filePath);
    });
  }

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));

  // SECURITY (Task #1080): le foto extra delle moto vengono scritte come
  // /uploads/motorcycles/<random>.webp. Servire questo path come static
  // pubblico permetteva a chiunque (anche logged-out) di scaricare
  // un'immagine appreso il filename, bypassando le ACL del garage. Ora
  // intercetto la sotto-cartella PRIMA della static middleware, richiedo
  // sessione valida + ownership del proprietario della moto, e
  // costringo cache privata. Le altre /uploads/* (es: /uploads/contest/)
  // continuano a usare la static middleware sottostante.
  app.get("/uploads/motorcycles/:filename", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "Non autenticato" });
      }
      const requesterId = req.session.userId;
      const filename = req.params.filename;
      if (filename.includes("/") || filename.includes("..")) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      const photoUrl = `/uploads/motorcycles/${filename}`;
      const [row] = await db
        .select({ ownerId: userMotorcycles.userId })
        .from(motorcyclePhotos)
        .innerJoin(userMotorcycles, eq(motorcyclePhotos.motorcycleId, userMotorcycles.id))
        .where(eq(motorcyclePhotos.photoUrl, photoUrl))
        .limit(1);
      if (!row || row.ownerId !== requesterId) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      res.set("Cache-Control", "private, max-age=3600");
      return next();
    } catch (err) {
      console.error("[uploads/motorcycles auth] error:", err);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  // Task #1122: foto profilo legacy salvate come /uploads/photos/<file>.
  // La static middleware le servirebbe a chiunque (anche logged-out),
  // bypassando i controlli database (approvazione, blocco) presenti su
  // /api/users/photos/:filename. Intercetta PRIMA della static: richiedi
  // sessione, verifica esistenza row in user_photos, isApproved, e che
  // il proprietario non abbia bloccato il requester.
  app.get("/uploads/photos/:filename", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "Non autenticato" });
      }
      const requesterId = req.session.userId;
      const filename = req.params.filename;
      if (!filename || filename.includes("/") || filename.includes("..")) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      const photoUrl = `/uploads/photos/${filename}`;
      const [row] = await db
        .select({ userId: userPhotos.userId, isApproved: userPhotos.isApproved })
        .from(userPhotos)
        .where(eq(userPhotos.photoUrl, photoUrl))
        .limit(1);
      if (!row) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      const isOwner = row.userId === requesterId;
      if (!isOwner) {
        if (!row.isApproved) {
          return res.status(404).json({ message: "Foto non trovata" });
        }
        const blocked = await storage.hasBlockedUser(row.userId, requesterId);
        if (blocked) {
          return res.status(403).json({ message: "Non puoi visualizzare questa foto" });
        }
      }
      res.set("Cache-Control", "private, max-age=3600");
      return next();
    } catch (err) {
      console.error("[uploads/photos auth] error:", err);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

async function initMissingClubConversations() {
  try {
    const clubs = await db
      .select({ id: motoClubs.id, name: motoClubs.name, conversationId: motoClubs.conversationId })
      .from(motoClubs)
      .where(eq(motoClubs.isApproved, true));

    let synced = 0;
    for (const club of clubs) {
      try {
        let convId = club.conversationId;

        if (convId) {
          const existing = await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(eq(conversations.id, convId))
            .limit(1);
          if (existing.length === 0) {
            convId = null;
            await db.update(motoClubs)
              .set({ conversationId: null, updatedAt: new Date() })
              .where(eq(motoClubs.id, club.id));
          }
        }

        if (!convId) {
          const [conv] = await db.insert(conversations).values({
            conversationType: "motoclub",
            title: `Club ${club.name}`,
          }).returning();
          convId = conv.id;

          await db.update(motoClubs)
            .set({ conversationId: convId, updatedAt: new Date() })
            .where(eq(motoClubs.id, club.id));
        }

        const members = await db
          .select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(and(eq(motoClubMembers.clubId, club.id), eq(motoClubMembers.status, "active")));

        if (members.length > 0) {
          const rows = members.map((m) => ({ conversationId: convId as string, userId: m.userId }));
          await db.insert(conversationParticipants).values(rows).onConflictDoNothing();
        }

        synced++;
      } catch (clubErr) {
        console.warn(`[INIT] initMissingClubConversations error for club ${club.id}:`, clubErr);
      }
    }

    console.log(`[INIT] Club conversations synced for ${synced}/${clubs.length} approved clubs`);
  } catch (e) {
    console.warn("[INIT] initMissingClubConversations error:", e);
  }
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  app.set("trust proxy", 1);

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

  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);

  // Best-effort pre-listen cache warm-up: downloads any active campaign image
  // not already on disk before server.listen() is called, so no request can
  // arrive before the cache is populated. A 30s timeout prevents deadlock if
  // object storage is slow or unreachable; errors only log — startup always
  // proceeds regardless of warm-up outcome.
  try {
    const { warmupAdImageCache } = await import("./routes/ads");
    const WARMUP_TIMEOUT_MS = 30_000;
    await Promise.race([
      warmupAdImageCache(),
      new Promise<void>((resolve) => setTimeout(() => {
        console.warn("[INIT] Ad image warmup timed out after 30s — continuing startup");
        resolve();
      }, WARMUP_TIMEOUT_MS)),
    ]);
  } catch (e) {
    console.warn("[INIT] Ad image warmup failed (non-fatal):", e);
  }

  // Track active connections so we can destroy them on shutdown
  const activeConnections = new Set<import("net").Socket>();

  // Graceful shutdown — destroy active connections, free DB pool, exit cleanly
  let _shuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(`[Shutdown] ${signal} ricevuto — chiusura pulita in corso...`);
    stopMatchingEngine();
    stopMetroMonitor();

    // Destroy all active sockets so server.close() finishes immediately
    for (const socket of activeConnections) {
      socket.destroy();
    }
    activeConnections.clear();

    server.close(() => {
      console.log("[Shutdown] Server HTTP chiuso.");
      pool.end().then(() => {
        console.log("[Shutdown] Pool DB chiuso.");
        process.exit(0);
      }).catch(() => process.exit(0));
    });

    // Force exit after 8 seconds — always exit 0 so Replit promote completes cleanly
    setTimeout(() => {
      console.log("[Shutdown] Timeout — uscita forzata.");
      process.exit(0);
    }, 8_000);
  };
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
      startMetroMonitor();

      // Phase 1 (immediate): run cheap DB migrations only — no heavy work at boot
      (async () => {
        // Ensure server_restarts table exists before recording uptime (must run first)
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS server_restarts (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              started_at TIMESTAMP NOT NULL DEFAULT NOW(),
              reason VARCHAR(50) NOT NULL DEFAULT 'restart'
            )
          `);
        } catch (e) {
          console.warn("[MIGRATION] server_restarts (pre-uptime):", e);
        }

        // Now it is safe to record this boot
        initUptimeTracking();

        try {
          await db.execute(sql`ALTER TABLE invitation_codes ADD COLUMN IF NOT EXISTS image_url TEXT`);
        } catch (e) {
          console.warn("[MIGRATION] invitation_codes.image_url:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS placement VARCHAR(30) NOT NULL DEFAULT 'all'`);
        } catch (e) {
          console.warn("[MIGRATION] ad_campaigns.placement:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS image_version INTEGER NOT NULL DEFAULT 0`);
        } catch (e) {
          console.warn("[MIGRATION] ad_campaigns.image_version:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS group_id TEXT`);
        } catch (e) {
          console.warn("[MIGRATION] ad_campaigns.group_id:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN NOT NULL DEFAULT false`);
        } catch (e) {
          console.warn("[MIGRATION] users.ghost_mode:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferred_map_style VARCHAR(20)`);
        } catch (e) {
          console.warn("[MIGRATION] user_profiles.preferred_map_style:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_lat DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_lng DOUBLE PRECISION`);
        } catch (e) {
          console.warn("[MIGRATION] users.first_login_at/lat/lng:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_app_version VARCHAR(32)`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_platform VARCHAR(16)`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ota_number INTEGER`);
        } catch (e) {
          console.warn("[MIGRATION] users.last_app_version/last_platform/last_ota_number:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS region VARCHAR(100)`);
          await db.execute(sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS country VARCHAR(2)`);
          await db.execute(sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false`);
          await db.execute(sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0`);
          await db.execute(sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS cover_url TEXT`);
        } catch (e) {
          console.warn("[MIGRATION] moto_clubs columns:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_blocks (
              id SERIAL PRIMARY KEY,
              blocker_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              blocked_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_unique_idx ON user_blocks (blocker_id, blocked_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON user_blocks (blocker_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id)`);
        } catch (e) {
          console.warn("[MIGRATION] user_blocks:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS ota_releases (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              version VARCHAR(50) NOT NULL,
              bundle_path TEXT,
              release_notes TEXT,
              scheduled_at TIMESTAMP,
              published_at TIMESTAMP,
              status VARCHAR(20) NOT NULL DEFAULT 'draft',
              created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_releases_status_idx ON ota_releases (status)`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS runtime_version VARCHAR(50)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_releases_rv_status_idx ON ota_releases (runtime_version, status)`);
          // Date-aware backfill: for every row with runtime_version IS NULL, infer the
          // correct runtimeVersion from its published_at timestamp using cycle-start boundaries
          // derived from ota-updates.json. This handles rows that may span multiple APK cycles.
          // Rows with no published_at fall back to the current runtimeVersion from app.json.
          try {
            const nullRows = await db.execute(sql`
              SELECT id, published_at FROM ota_releases WHERE runtime_version IS NULL
            `);
            const nullCount = (nullRows.rows as Array<{id: string; published_at: string | null}>).length;

            if (nullCount === 0) {
              console.log("[MIGRATION] ota_releases: runtime_version backfill complete — all rows have non-NULL runtime_version");
            } else {
              // Build cycle-start map from ota-updates.json + ota-updates-archive.json (historic cycles 2.x-7.x)
              type OtaEntry = { runtimeVersion: string; publishedAt?: string };
              const otaUpdatesRaw: OtaEntry[] = JSON.parse(
                fs.readFileSync(path.resolve("ota-updates.json"), "utf8")
              );
              const archivePath = path.resolve("ota-updates-archive.json");
              if (fs.existsSync(archivePath)) {
                const archiveRaw: OtaEntry[] = JSON.parse(fs.readFileSync(archivePath, "utf8"));
                otaUpdatesRaw.push(...archiveRaw);
              }
              const cycleStartMs = new Map<string, number>();
              for (const entry of otaUpdatesRaw) {
                if (!entry.publishedAt) continue;
                const ts = new Date(entry.publishedAt).getTime();
                if (isNaN(ts)) continue;
                const existing = cycleStartMs.get(entry.runtimeVersion);
                if (existing === undefined || ts < existing) {
                  cycleStartMs.set(entry.runtimeVersion, ts);
                }
              }
              // Sort cycles by start date ascending → [{ rv, startMs }, ...]
              const sortedCycles = Array.from(cycleStartMs.entries())
                .sort((a, b) => a[1] - b[1])
                .map(([rv, startMs]) => ({ rv, startMs }));

              // Fallback runtimeVersion for rows with no published_at
              const appJson = JSON.parse(fs.readFileSync(path.resolve("app.json"), "utf8"));
              const fallbackRv: string = appJson?.expo?.runtimeVersion ?? "8.0.0";

              // Assign each null row to a runtimeVersion
              const assignMap = new Map<string, string[]>(); // rv → [rowId, ...]
              for (const row of nullRows.rows as Array<{id: string; published_at: string | null}>) {
                let assignedRv = fallbackRv;
                if (row.published_at) {
                  const rowTs = new Date(row.published_at).getTime();
                  if (!isNaN(rowTs) && sortedCycles.length > 0) {
                    // Last cycle whose start date ≤ row's published_at
                    let matched: string | null = null;
                    for (const cycle of sortedCycles) {
                      if (cycle.startMs <= rowTs) matched = cycle.rv;
                    }
                    assignedRv = matched ?? sortedCycles[0].rv;
                  }
                }
                const list = assignMap.get(assignedRv) ?? [];
                list.push(row.id as string);
                assignMap.set(assignedRv, list);
              }

              // Dry-run report
              console.log(`[MIGRATION] ota_releases: backfilling runtime_version for ${nullCount} NULL row(s):`);
              for (const [rv, ids] of assignMap) {
                console.log(`  → ${rv}: ${ids.length} row(s)`);
              }

              // Execute batch UPDATE per cycle (one round-trip per runtimeVersion)
              let totalUpdated = 0;
              for (const [rv, ids] of assignMap) {
                const result = await pool.query(
                  `UPDATE ota_releases SET runtime_version = $1, updated_at = NOW() WHERE id = ANY($2::text[])`,
                  [rv, ids]
                );
                totalUpdated += (result.rowCount ?? 0);
              }

              // Post-backfill verification
              const nullCheck = await pool.query(
                `SELECT COUNT(*)::int AS remaining FROM ota_releases WHERE runtime_version IS NULL`
              );
              const remaining = (nullCheck.rows[0] as { remaining: number }).remaining ?? 0;
              if (remaining === 0) {
                console.log(`[MIGRATION] ota_releases: runtime_version backfill complete — ${totalUpdated} row(s) updated, all rows non-NULL`);
              } else {
                console.error(`[MIGRATION] ota_releases: ALERT — ${remaining} row(s) still have NULL runtime_version after backfill. OTA serving may be degraded.`);
              }
            }
          } catch (backfillErr) {
            console.warn("[MIGRATION] ota_releases backfill runtime_version:", backfillErr);
            // Operational alert: check for remaining NULL rows even after failure
            try {
              const alertCheck = await pool.query(
                `SELECT COUNT(*)::int AS remaining FROM ota_releases WHERE runtime_version IS NULL`
              );
              const alertRemaining = (alertCheck.rows[0] as { remaining: number }).remaining ?? 0;
              if (alertRemaining > 0) {
                console.error(`[MIGRATION] ota_releases: ALERT — ${alertRemaining} row(s) have NULL runtime_version due to backfill error. Strict OTA filtering is active; these rows will not be served.`);
              }
            } catch (_) { /* best-effort */ }
          }
        } catch (e) {
          console.warn("[MIGRATION] ota_releases:", e);
        }

        // Task #1148: aggiungi colonna `diagnostics` JSONB su ota_events.
        // È nullable e con default IF NOT EXISTS, quindi sicura su DB esistenti
        // (produzione) dove `db:push` non viene eseguito al rilascio. Senza
        // questa migrazione il SELECT in /api/admin/ota-events e l'INSERT in
        // /api/admin/ota-error fallirebbero con "column diagnostics does not exist".
        try {
          await db.execute(sql`ALTER TABLE ota_events ADD COLUMN IF NOT EXISTS diagnostics jsonb`);
        } catch (e) {
          console.warn("[MIGRATION] ota_events.diagnostics:", e);
        }

        // Helper: read ota_cleanup_retention_days from app_settings (default 90).
        const getOtaRetentionDays = async (): Promise<number> => {
          try {
            const setting = await storage.getAppSetting("ota_cleanup_retention_days");
            if (setting?.value) {
              const parsed = parseInt(setting.value, 10);
              if (!isNaN(parsed) && parsed > 0) return parsed;
            }
          } catch { /* best-effort, fall back to default */ }
          return 90;
        };

        // Seed: ensure ota_cleanup_retention_days exists in app_settings (idempotent, does NOT overwrite)
        try {
          const existing = await storage.getAppSetting("ota_cleanup_retention_days");
          if (!existing) {
            await storage.upsertAppSetting("ota_cleanup_retention_days", "90");
            console.log("[OTA-CLEANUP] Seeded ota_cleanup_retention_days=90 in app_settings.");
          }
        } catch (e) {
          console.warn("[OTA-CLEANUP] Could not seed ota_cleanup_retention_days:", e);
        }

        // Startup cleanup: remove superseded/draft OTA releases older than configured retention window
        // + delete corresponding bundles from object storage (best-effort)
        try {
          const retentionDays = await getOtaRetentionDays();
          const cleanupResult = await pool.query(
            `DELETE FROM ota_releases
             WHERE status IN ('superseded', 'draft')
               AND published_at < NOW() - ($1 || ' days')::INTERVAL
             RETURNING id, version, status, published_at, bundle_path`,
            [String(retentionDays)]
          );
          const deletedRows = cleanupResult.rows as Array<{ id: string; version: string; status: string; published_at: string; bundle_path: string | null }>;
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
          } else {
            console.log(`[OTA-CLEANUP] No stale OTA releases to remove at startup (retention=${retentionDays}d).`);
          }
        } catch (e) {
          console.warn("[OTA-CLEANUP] Startup OTA release cleanup failed:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_enabled BOOLEAN NOT NULL DEFAULT false`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS home_latitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS home_longitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_latitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_longitude DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_radius INTEGER NOT NULL DEFAULT 2`);
        } catch (e) {
          console.warn("[MIGRATION] user_profiles fake_home columns:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS gps_precision INTEGER NOT NULL DEFAULT 100`);
        } catch (e) {
          console.warn("[MIGRATION] user_profiles gps_precision:", e);
        }

        try {
          // Rename legacy user_spotify_tokens → user_music_tokens if needed
          await db.execute(sql`
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_spotify_tokens')
                AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_music_tokens')
              THEN
                ALTER TABLE user_spotify_tokens RENAME TO user_music_tokens;
              END IF;
            END $$
          `);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_music_tokens (
              user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
              provider_user_id VARCHAR(200) NOT NULL,
              display_name VARCHAR(200),
              access_token TEXT NOT NULL,
              refresh_token TEXT NOT NULL,
              expires_at TIMESTAMP NOT NULL,
              connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
              last_sync_at TIMESTAMP
            )
          `);
          // Rename legacy spotify_user_id column if it still exists
          await db.execute(sql`
            DO $$ BEGIN
              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'user_music_tokens'
                  AND column_name = 'spotify_user_id'
              ) THEN
                ALTER TABLE user_music_tokens
                  RENAME COLUMN spotify_user_id TO provider_user_id;
              END IF;
            END $$
          `);
        } catch (e) {
          console.warn("[MIGRATION] user_music_tokens:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_music_tracks (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              lastfm_track_id VARCHAR(200) NOT NULL,
              track_name VARCHAR(500) NOT NULL,
              artist_id VARCHAR(200) NOT NULL,
              artist_name VARCHAR(300) NOT NULL,
              album_name VARCHAR(500),
              genres TEXT[] DEFAULT '{}',
              popularity INTEGER DEFAULT 0,
              added_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS user_track_uniq ON user_music_tracks (user_id, lastfm_track_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS user_music_tracks_user_idx ON user_music_tracks (user_id)`);
        } catch (e) {
          console.warn("[MIGRATION] user_music_tracks:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS shared_playlists (
              id SERIAL PRIMARY KEY,
              from_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              to_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              conversation_id VARCHAR(36) REFERENCES conversations(id) ON DELETE SET NULL,
              tracks_data JSONB NOT NULL,
              track_count INTEGER NOT NULL,
              shared_at TIMESTAMP NOT NULL DEFAULT NOW(),
              merged_at TIMESTAMP
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS shared_playlists_to_user_idx ON shared_playlists (to_user_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS shared_playlists_from_user_idx ON shared_playlists (from_user_id)`);
        } catch (e) {
          console.warn("[MIGRATION] shared_playlists:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS playlist_id INTEGER REFERENCES shared_playlists(id) ON DELETE SET NULL`);
        } catch (e) {
          console.warn("[MIGRATION] messages.playlist_id:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE user_music_tracks ADD COLUMN IF NOT EXISTS image_url TEXT`);
        } catch (e) {
          console.warn("[MIGRATION] user_music_tracks.image_url:", e);
        }

        try {
          // Rename legacy spotify_track_id → lastfm_track_id if needed
          await db.execute(sql`
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_music_tracks' AND column_name = 'spotify_track_id') THEN
                ALTER TABLE user_music_tracks RENAME COLUMN spotify_track_id TO lastfm_track_id;
              END IF;
            END $$
          `);
          await db.execute(sql`ALTER TABLE user_music_tracks ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'spotify'`);
          await db.execute(sql`DROP INDEX IF EXISTS user_track_uniq`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS user_track_uniq ON user_music_tracks (user_id, lastfm_track_id, provider)`);
        } catch (e) {
          console.warn("[MIGRATION] user_music_tracks.provider + unique index:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_lastfm_sessions (
              user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
              lastfm_username VARCHAR(200) NOT NULL,
              session_key VARCHAR(500) NOT NULL,
              connected_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
        } catch (e) {
          console.warn("[MIGRATION] user_lastfm_sessions:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_playlist_snapshots (
              user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
              tracks_json JSONB NOT NULL,
              saved_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
        } catch (e) {
          console.warn("[MIGRATION] user_playlist_snapshots:", e);
        }

        try {
          // Normalize legacy snapshot JSON: rename spotifyTrackId → lastfmTrackId
          await db.execute(sql`
            UPDATE user_playlist_snapshots
            SET tracks_json = (
              SELECT jsonb_agg(
                CASE
                  WHEN elem ? 'spotifyTrackId'
                  THEN jsonb_set(elem - 'spotifyTrackId', '{lastfmTrackId}', elem->'spotifyTrackId')
                  ELSE elem
                END
              )
              FROM jsonb_array_elements(tracks_json) AS elem
            )
            WHERE tracks_json::text LIKE '%spotifyTrackId%'
          `);
        } catch (e) {
          console.warn("[MIGRATION] user_playlist_snapshots normalize spotifyTrackId:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS floating_widget_enabled BOOLEAN NOT NULL DEFAULT true`);
        } catch (e) {
          console.warn("[MIGRATION] users.floating_widget_enabled:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMP`);
        } catch (e) {
          console.warn("[MIGRATION] users.last_logout_at:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_app_close_at TIMESTAMP`);
        } catch (e) {
          console.warn("[MIGRATION] users.last_app_close_at:", e);
        }

        try {
          await db.execute(sql`
            ALTER TABLE custom_routes
              ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public'
          `);
          await db.execute(sql`
            UPDATE custom_routes
            SET visibility = CASE WHEN is_public = true THEN 'public' ELSE 'private' END
            WHERE (visibility = 'public' AND is_public = false)
               OR (visibility NOT IN ('public', 'friends', 'private'))
          `);
          await db.execute(sql`
            UPDATE custom_routes
            SET is_public = (visibility = 'public')
            WHERE (visibility = 'private' AND is_public = true)
               OR (visibility = 'public' AND is_public = false)
          `);
        } catch (e) {
          console.warn("[MIGRATION] custom_routes.visibility backfill:", e);
        }

        try {
          // Prima: rileva e risolvi eventuali nickname duplicati case-insensitive già presenti
          const dupes = await db.execute(sql`
            SELECT LOWER(nickname) AS lower_nick, array_agg(id ORDER BY created_at DESC) AS ids
            FROM users
            GROUP BY LOWER(nickname)
            HAVING COUNT(*) > 1
          `);
          if (dupes.rows.length > 0) {
            console.warn(`[MIGRATION] Trovati ${dupes.rows.length} gruppi di nickname duplicati (case-insensitive) — rinomino i duplicati non-primari`);
            for (const row of dupes.rows) {
              const ids = row.ids as string[];
              // Il primo (più recente per created_at) è il "vincitore" — gli altri vengono rinominati
              for (let i = 1; i < ids.length; i++) {
                const newNickname = `${row.lower_nick}_dup${i}`;
                await db.execute(sql`UPDATE users SET nickname = ${newNickname} WHERE id = ${ids[i]}`);
                console.warn(`[MIGRATION] Nickname duplicato rinominato: id=${ids[i]} → ${newNickname}`);
              }
            }
          }
          // Poi: crea l'indice UNIQUE case-insensitive (ora sicuro, nessun duplicato)
          await db.execute(sql`
            CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_lower_unique_idx ON users (LOWER(nickname))
          `);
          console.log("[MIGRATION] Indice UNIQUE case-insensitive su users.nickname creato/già esistente");
        } catch (e) {
          console.error("[MIGRATION] ERRORE CRITICO users nickname lower unique index:", e);
        }

        // Autovacuum aggressivo sulle tabelle soggette a bloat da DELETE massivi
        // (default PostgreSQL: 20% dead rows — troppo alto per tabelle con pochi record reali)
        try {
          const vacuumTables = [
            "biker_biker_matches",
            "biker_zavorrina_matches",
            "user_profiles",
            "user_playlist_snapshots",
            "conversations",
          ];
          for (const t of vacuumTables) {
            await db.execute(sql.raw(
              `ALTER TABLE ${t} SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 10)`
            ));
          }
          console.log("[MIGRATION] Autovacuum aggressivo configurato su tabelle critiche (scale_factor=0.05, threshold=10)");
        } catch (e) {
          console.warn("[MIGRATION] autovacuum tuning:", e);
        }

        try {
          await db.execute(sql`DELETE FROM app_settings WHERE key = 'default_taskbar_style'`);
          console.log("[MIGRATION] Removed stale default_taskbar_style rows from app_settings");
        } catch (e) {
          console.warn("[MIGRATION] default_taskbar_style cleanup:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS sprint_results (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              route_id VARCHAR(36) REFERENCES routes(id) ON DELETE SET NULL,
              sprint_0to100_ms INTEGER NOT NULL,
              max_acceleration_g DOUBLE PRECISION DEFAULT 0,
              max_deceleration_g DOUBLE PRECISION DEFAULT 0,
              max_tilt_deg DOUBLE PRECISION DEFAULT 0,
              created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS sprint_results_user_id_idx ON sprint_results(user_id)
          `);
          console.log("[MIGRATION] sprint_results table ensured");
        } catch (e) {
          console.warn("[MIGRATION] sprint_results table:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT`);
          console.log("[MIGRATION] users.expo_push_token ensured");
        } catch (e) {
          console.warn("[MIGRATION] users.expo_push_token:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS units_preference JSONB`);
          console.log("[MIGRATION] user_profiles.units_preference ensured");
        } catch (e) {
          console.warn("[MIGRATION] user_profiles.units_preference:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE route_points ADD COLUMN IF NOT EXISTS accel_g DOUBLE PRECISION`);
          await db.execute(sql`ALTER TABLE route_points ADD COLUMN IF NOT EXISTS tilt_deg DOUBLE PRECISION`);
          console.log("[MIGRATION] route_points.accel_g/tilt_deg ensured");
        } catch (e) {
          console.warn("[MIGRATION] route_points sensor columns:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS gps_blackout_count INTEGER NOT NULL DEFAULT 0`);
          await db.execute(sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS gps_blackout_seconds INTEGER NOT NULL DEFAULT 0`);
          console.log("[MIGRATION] routes.gps_blackout_count/gps_blackout_seconds ensured");
        } catch (e) {
          console.warn("[MIGRATION] routes gps blackout columns:", e);
        }

        console.log("[INIT] Phase 1 migrations done — starting sequential heavy tasks");
        initState.initializing = false;

        const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

        // Phase 1.5: cleanup admin matches
        try {
          const { storage: stCleanup } = await import("./storage");
          const cleaned = await stCleanup.cleanupAdminMatches();
          console.log(`[INIT] Phase 1.5 admin cleanup done — biker-zavarrina: ${cleaned.bikerZavarrina}, biker-biker: ${cleaned.bikerBiker}`);
        } catch (e) {
          console.warn("[INIT] admin cleanup error:", e);
        }

        // Phase 2: start matching engine
        await delay(2_000);
        startMatchingEngine();
        console.log("[INIT] Phase 2 matching engine started");

        // Phase 2.5: VACUUM FULL deferred (60s dopo avvio)
        // Recupera lo spazio fisico lasciato dai DELETE massivi degli utenti fittizi.
        // Si esegue UNA SOLA VOLTA (flag db_vacuum_full_v3 in app_settings).
        setTimeout(async () => {
          try {
            const { storage: stVac } = await import("./storage");
            const done = await stVac.getAppSetting("db_vacuum_full_v3");
            if (done?.value === "done") {
              console.log("[VACUUM] One-shot già eseguito in precedenza — skip.");
              return;
            }
            const { runVacuumFullAll } = await import("./vacuum-service");
            const outcome = await runVacuumFullAll();
            if (outcome === "executed") {
              await stVac.upsertAppSetting("db_vacuum_full_v3", "done");
            }
          } catch (e) {
            console.warn("[VACUUM] Errore durante VACUUM FULL one-shot:", e);
          }
        }, 60_000);

        // Phase 3: seed essential users + splash settings
        await delay(2_000);
        try {
          await autoSeedEssentialUsers();
        } catch (e) {
          console.warn("[INIT] autoSeedEssentialUsers error:", e);
        }
        try {
          await seedAppleReviewerAccount();
        } catch (e) {
          console.warn("[INIT] seedAppleReviewerAccount error:", e);
        }
        try {
          await seedGooglePlayReviewerAccount();
        } catch (e) {
          console.warn("[INIT] seedGooglePlayReviewerAccount error:", e);
        }
        try {
          await ensureBikerLinkOfficialOnBoot();
        } catch (e) {
          console.warn("[INIT] ensureBikerLinkOfficialOnBoot error:", e);
        }
        try {
          const { storage } = await import("./storage");
          const modeSetting = await storage.getAppSetting("splash_message_mode");
          if (!modeSetting) await storage.upsertAppSetting("splash_message_mode", "single");
          const listSetting = await storage.getAppSetting("splash_messages_list");
          if (!listSetting) await storage.upsertAppSetting("splash_messages_list", "[]");
          const motoclubZavSetting = await storage.getAppSetting("motoclub_include_zav");
          if (!motoclubZavSetting) await storage.upsertAppSetting("motoclub_include_zav", "true");
          const showSearchPrefSetting = await storage.getAppSetting("show_search_preference");
          if (!showSearchPrefSetting) await storage.upsertAppSetting("show_search_preference", "false");
          const mapsUserChoiceSetting = await storage.getAppSetting("maps_user_choice_enabled");
          if (!mapsUserChoiceSetting) await storage.upsertAppSetting("maps_user_choice_enabled", "false");
          const unitsPrefSetting = await storage.getAppSetting("units_preference_enabled");
          if (!unitsPrefSetting) await storage.upsertAppSetting("units_preference_enabled", "false");
          const musicProviderSetting = await storage.getAppSetting("music_provider");
          if (!musicProviderSetting) await storage.upsertAppSetting("music_provider", "lastfm");
        } catch (e) {
          console.warn("[SEED] splash settings:", e);
        }
        console.log("[INIT] Phase 3 essential seed + settings done");

        // Phase 3.5: one-time cleanup — null out Last.fm placeholder imageUrls
        try {
          const { db: dbClean } = await import("./db");
          const { userMusicTracks } = await import("@shared/schema");
          const { like, and, eq } = await import("drizzle-orm");
          await dbClean
            .update(userMusicTracks)
            .set({ imageUrl: null })
            .where(
              and(
                eq(userMusicTracks.provider, "lastfm"),
                like(userMusicTracks.imageUrl!, "%2a96cbd8b46e442fc41c2b86b821562f%")
              )
            );
          console.log("[INIT] Phase 3.5 Last.fm placeholder imageUrl cleanup done");
        } catch (e) {
          console.warn("[INIT] Phase 3.5 lastfm placeholder cleanup error:", e);
        }

        // Phase 4: motoclub migration + reseed (heavy — many DB inserts)
        await delay(2_000);
        try {
          const { storage: st } = await import("./storage");
          const alreadyReset = await st.getAppSetting("motoclub_brand_region_v2").catch(() => null);
          if (!alreadyReset) {
            console.log("[MIGRATION] Pulizia completa motoclub in corso...");
            await db.execute(sql`DELETE FROM moto_club_invites`);
            await db.execute(sql`DELETE FROM moto_club_requests`);
            await db.execute(sql`DELETE FROM moto_club_members`);
            await db.execute(sql`DELETE FROM moto_clubs`);
            await st.upsertAppSetting("motoclub_brand_region_v2", "true");
            console.log("[MIGRATION] Motoclub svuotati — riseed brand+region avviato...");
          }
          await seedMotoclubs();
        } catch (e) {
          console.warn("[MIGRATION] cleanup/reseed motoclub:", e);
        }
        console.log("[INIT] Phase 4 motoclub seed done");

        // Phase 5: fake user seed (very heavy — bcrypt hashing for many users)
        await delay(2_000);
        try {
          const { storage: stPhase5 } = await import("./storage");
          const fakeUsersSetting = await stPhase5.getAppSetting("fake_users_enabled");
          const fakeUsersEnabled = fakeUsersSetting?.value === "true";
          if (!fakeUsersEnabled) {
            console.log("[INIT] Phase 5 fake user seed skipped (fake users disabled)");
          } else {
            await autoSeedFakeUsers();
            console.log("[INIT] Phase 5 fake user seed done");
          }
        } catch (e) {
          console.warn("[INIT] autoSeedFakeUsers error:", e);
        }

        // Phase 6: club conversation sync
        await delay(2_000);
        try {
          await initMissingClubConversations();
        } catch (e) {
          console.warn("[INIT] initMissingClubConversations deferred error:", e);
        }
        console.log("[INIT] Phase 6 club conversation sync done");

        // Phase 6b: ghost_mode fix per account bot "moderatore"
        try {
          await db.execute(sql`
            UPDATE users SET ghost_mode = true
            WHERE nickname = 'moderatore' AND role = 'moderator' AND ghost_mode = false
          `);
          console.log("[INIT] Phase 6b: ghost_mode=true applicato all'account bot 'moderatore'");
        } catch (e) {
          console.warn("[INIT] Phase 6b ghost_mode fix error:", e);
        }

        // Phase 7: start 6h playlist snapshot job
        const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
        const runPlaylistSnapshot = async () => {
          try {
            const { db: dbSnap } = await import("./db");
            const { userMusicTracks: umt, userPlaylistSnapshots } = await import("@shared/schema");
            const { sql: sqlSnap, eq: eqSnap } = await import("drizzle-orm");

            const usersWithTracks = await dbSnap.execute(
              sqlSnap`SELECT DISTINCT user_id FROM user_music_tracks`
            );
            let saved = 0;
            for (const row of usersWithTracks.rows as Array<{ user_id: string }>) {
              try {
                const tracks = await dbSnap.select().from(umt).where(eqSnap(umt.userId, row.user_id));
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
                await dbSnap
                  .insert(userPlaylistSnapshots)
                  .values({ userId: row.user_id, tracksJson, savedAt: new Date() })
                  .onConflictDoUpdate({
                    target: [userPlaylistSnapshots.userId],
                    set: { tracksJson, savedAt: new Date() },
                  });
                saved++;
              } catch (userErr) {
                console.warn(`[SNAPSHOT] error for user ${row.user_id}:`, userErr);
              }
            }
            console.log(`[SNAPSHOT] Playlist snapshot saved for ${saved} users`);
          } catch (e) {
            console.warn("[SNAPSHOT] runPlaylistSnapshot error:", e);
          }
        };
        await runPlaylistSnapshot();
        setInterval(runPlaylistSnapshot, SIX_HOURS_MS);
        console.log("[INIT] Phase 7 playlist snapshot job started (every 6h)");

        // Phase 8 — daily cleanup of orphaned ad images in uploads/ads/
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const { cleanupOrphanedAdImages } = await import("./routes/ads");
        // Run once 5 minutes after startup so warm-up and first traffic settle,
        // then repeat every 24 hours.
        setTimeout(async () => {
          await cleanupOrphanedAdImages();
          setInterval(cleanupOrphanedAdImages, ONE_DAY_MS);
        }, 5 * 60 * 1000);
        console.log("[INIT] Phase 8 ad image cleanup job scheduled (5min delay, then every 24h)");

        // Phase 9 — periodic semaphore queue-depth metrics (every 60s)
        //
        // PRESSURE_ALERT_THRESHOLD (env: PRESSURE_ALERT_THRESHOLD, default 3):
        //   Number of consecutive 60-second intervals where pendingCount > 0
        //   before a WARNING-level alert is emitted.  Set to 1 to alert on the
        //   very first queued interval; set higher to tolerate brief spikes.
        const METRICS_INTERVAL_MS = 60_000;
        const PRESSURE_ALERT_THRESHOLD = (() => {
          const val = parseInt(process.env.PRESSURE_ALERT_THRESHOLD ?? "", 10);
          return isNaN(val) || val < 1 ? 3 : val;
        })();
        let consecutivePressureCount = 0;
        // alertFiredThisEpisode prevents repeat [ALERT] logs during sustained pressure.
        // The alert fires exactly once when the threshold is first crossed; it resets
        // only when pressure clears so a second episode triggers a fresh alert.
        let alertFiredThisEpisode = false;
        const logSemaphoreMetrics = () => {
          const active = matchEnrichmentSemaphore.activeCount;
          const pending = matchEnrichmentSemaphore.pendingCount;
          const limit = MATCH_ENRICHMENT_GLOBAL_LIMIT;

          if (pending > 0) {
            consecutivePressureCount++;
            const pressure = ` ⚠ PRESSURE (consecutive=${consecutivePressureCount}/${PRESSURE_ALERT_THRESHOLD})`;
            console.log(
              `[METRICS] matchEnrichmentSemaphore — active=${active}/${limit} pending=${pending}${pressure}`
            );
            if (consecutivePressureCount >= PRESSURE_ALERT_THRESHOLD && !alertFiredThisEpisode) {
              alertFiredThisEpisode = true;
              console.warn(
                `[ALERT] matchEnrichmentSemaphore has been under pressure for ${consecutivePressureCount} consecutive interval(s) ` +
                `(pending=${pending}, limit=${limit}). ` +
                `Consider raising MATCH_ENRICHMENT_CONCURRENCY or scaling the server.`
              );
            }
          } else {
            if (consecutivePressureCount > 0) {
              console.log(
                `[METRICS] matchEnrichmentSemaphore — pressure cleared after ${consecutivePressureCount} consecutive interval(s)`
              );
            } else {
              console.log(
                `[METRICS] matchEnrichmentSemaphore — active=${active}/${limit} pending=${pending}`
              );
            }
            consecutivePressureCount = 0;
            alertFiredThisEpisode = false;
          }
        };
        setInterval(logSemaphoreMetrics, METRICS_INTERVAL_MS);
        console.log(
          `[INIT] Phase 9 semaphore metrics logger started (every 60s, alert after ${PRESSURE_ALERT_THRESHOLD} consecutive pressure intervals — override with PRESSURE_ALERT_THRESHOLD env var)`
        );

        // Phase 10 — nightly VACUUM FULL ANALYZE at 03:00 Europe/Rome
        const { scheduleNightlyVacuum } = await import("./vacuum-service");
        scheduleNightlyVacuum();
        console.log("[INIT] Phase 10 nightly VACUUM scheduler registered (03:00 Europe/Rome)");

        // Phase 11 — workspace cache cleanup every 24h
        // Runs scripts/cleanup-cache.sh via child_process.exec.
        // First run is delayed 5 min after boot (avoids interfering with startup).
        {
          const { exec } = await import("child_process");
          const path = await import("path");
          const scriptPath = path.resolve(process.cwd(), "scripts/cleanup-cache.sh");
          const runCleanup = () => {
            exec(`bash "${scriptPath}"`, { timeout: 120_000 }, (err, stdout, stderr) => {
              if (err) {
                console.warn("[CLEANUP] Cache cleanup error:", err.message);
                if (stderr) console.warn("[CLEANUP] stderr:", stderr.slice(0, 400));
              } else {
                const summary = stdout.trim().split("\n").pop() ?? "";
                console.log("[CLEANUP]", summary || "Cache cleanup completata");
              }
            });
          };
          // First run after 5 minutes, then every 24 hours
          setTimeout(() => {
            runCleanup();
            setInterval(runCleanup, 24 * 60 * 60 * 1000);
          }, 5 * 60 * 1000);
          console.log("[INIT] Phase 11 workspace cache cleanup scheduled (5min delay, then every 24h)");
        }

        // Phase 11.5 — log rotation every 24h
        // Runs scripts/rotate-logs.sh via child_process.exec.
        // First run is delayed 10 min after boot (staggers with Phase 11 cache cleanup).
        // Truncates any .log in logs/ that exceeds 1 MB, keeping the last 200 KB.
        {
          const { exec: execRotate } = await import("child_process");
          const pathMod = await import("path");
          const rotateScriptPath = pathMod.resolve(process.cwd(), "scripts/rotate-logs.sh");
          const runRotate = () => {
            execRotate(`bash "${rotateScriptPath}"`, { timeout: 60_000 }, (err, stdout, stderr) => {
              if (err) {
                console.warn("[LOG-ROTATE] Error:", err.message);
                if (stderr) console.warn("[LOG-ROTATE] stderr:", stderr.slice(0, 400));
              } else {
                const summary = stdout.trim().split("\n").pop() ?? "";
                console.log("[LOG-ROTATE]", summary || "Log rotation completata");
              }
            });
          };
          // First run after 10 minutes, then every 24 hours
          setTimeout(() => {
            runRotate();
            setInterval(runRotate, 24 * 60 * 60 * 1000);
          }, 10 * 60 * 1000);
          console.log("[INIT] Phase 11.5 log rotation scheduled (10min delay, then every 24h)");
        }

        // Phase 12 — OTA release auto-cleanup every 24h
        // Deletes rows with status IN ('superseded', 'draft') published beyond the configured retention window.
        // Retention is read from app_settings (key: ota_cleanup_retention_days, default 90).
        // First run is delayed 15 minutes after boot to stagger with other maintenance jobs.
        {
          const runOtaCleanup = async () => {
            try {
              const retentionDays = await getOtaRetentionDays();
              const result = await pool.query(
                `DELETE FROM ota_releases
                 WHERE status IN ('superseded', 'draft')
                   AND published_at < NOW() - ($1 || ' days')::INTERVAL
                 RETURNING id, version, status, published_at`,
                [String(retentionDays)]
              );
              const rows = result.rows as Array<{ id: string; version: string; status: string; published_at: string }>;
              if (rows.length > 0) {
                console.log(`[OTA-CLEANUP] Periodic: removed ${rows.length} stale OTA release(s) older than ${retentionDays} days:`);
                for (const row of rows) {
                  console.log(`  → id=${row.id} version=${row.version} status=${row.status} published_at=${row.published_at}`);
                }
              } else {
                console.log(`[OTA-CLEANUP] Periodic: no stale OTA releases found (retention=${retentionDays}d).`);
              }
            } catch (err) {
              console.warn("[OTA-CLEANUP] Periodic cleanup error:", err);
            }
          };
          // First run after 15 minutes, then every 24 hours
          setTimeout(() => {
            runOtaCleanup();
            setInterval(runOtaCleanup, 24 * 60 * 60 * 1000);
          }, 15 * 60 * 1000);
          console.log("[INIT] Phase 12 OTA release auto-cleanup scheduled (15min delay, then every 24h)");
        }

        // Phase 12.5 — ota_events periodic cleanup every 6h
        // Hard retention: keeps at most OTA_EVENTS_RETENTION rows (env var, default 1000).
        // Also removes records older than 30 days regardless of row count.
        // Runs once at startup (1-min delay) then every 6h. Replaces the old probabilistic
        // soft-delete that fired on ~2% of POST /ota-error inserts (now removed from that handler).
        {
          const _rawRetention = parseInt(process.env.OTA_EVENTS_RETENTION ?? "1000", 10);
          const OTA_EVENTS_RETENTION = Number.isFinite(_rawRetention) && _rawRetention >= 1
            ? _rawRetention
            : 1000;
          if (_rawRetention !== OTA_EVENTS_RETENTION) {
            console.warn(`[OTA-EVENTS-CLEANUP] OTA_EVENTS_RETENTION env var is invalid ("${process.env.OTA_EVENTS_RETENTION}") — falling back to 1000.`);
          }
          const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
          const runOtaEventsCleanup = async () => {
            try {
              const result = await pool.query(
                `DELETE FROM ota_events
                 WHERE id IN (
                   SELECT id FROM ota_events
                   ORDER BY created_at DESC
                   OFFSET $1
                 ) OR created_at < NOW() - INTERVAL '30 days'
                 RETURNING id`,
                [OTA_EVENTS_RETENTION]
              );
              const count = result.rowCount ?? 0;
              if (count > 0) {
                console.log(`[OTA-EVENTS-CLEANUP] Removed ${count} old ota_events record(s) (retention=${OTA_EVENTS_RETENTION}).`);
              } else {
                console.log(`[OTA-EVENTS-CLEANUP] No old ota_events to remove (retention=${OTA_EVENTS_RETENTION}).`);
              }
            } catch (err) {
              console.warn("[OTA-EVENTS-CLEANUP] Periodic cleanup error:", err);
            }
          };
          setTimeout(() => {
            runOtaEventsCleanup();
            setInterval(runOtaEventsCleanup, SIX_HOURS_MS);
          }, 60 * 1000);
          console.log(`[INIT] Phase 12.5 ota_events cleanup scheduled (1min delay, then every 6h, retention=${OTA_EVENTS_RETENTION})`);
        }
      })().catch((err) => {
        console.error("[INIT] Startup phase chain error:", err);
        initState.initializing = false;
      });
    },
  );

  // Register each new TCP socket so gracefulShutdown can destroy them instantly
  server.on("connection", (socket) => {
    activeConnections.add(socket);
    socket.once("close", () => activeConnections.delete(socket));
  });
})();
