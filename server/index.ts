import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import { initState } from "./init-state";
import { startMatchingEngine, stopMatchingEngine } from "./matching-engine";
import { autoSeedEssentialUsers, autoSeedFakeUsers, seedAppleReviewerAccount } from "./auto-seed";
import { db, pool } from "./db";
import { sql, eq, and } from "drizzle-orm";
import { motoClubs, motoClubMembers, conversations, conversationParticipants } from "@shared/schema";
import { seedMotoclubs } from "./routes/motoclubs";
import * as fs from "fs";
import * as path from "path";
import { initUptimeTracking, startMetroMonitor } from "./uptime";

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
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

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
        const jsonStr = JSON.stringify(capturedJsonResponse);
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
      // In dev mode (nessun static-build e non siamo in production), lascia che il proxy Metro serva l'app Expo.
      // isProduction = true se NODE_ENV="production" oppure se REPLIT_INTERNAL_APP_DOMAIN è impostato
      // (Replit lo setta solo nel container di produzione, non in sviluppo).
      const staticBuildIndex = path.resolve(process.cwd(), "static-build", "index.html");
      const isProduction = process.env.NODE_ENV === "production" || !!process.env.REPLIT_INTERNAL_APP_DOMAIN;
      if (!isProduction && !fs.existsSync(staticBuildIndex)) return next();
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  const webBuildDir = path.resolve(process.cwd(), "static-build", "web");
  const noCacheHtml = (res: express.Response, filePath: string) => {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  };
  app.use("/web", express.static(webBuildDir, { setHeaders: noCacheHtml }));
  app.use(express.static(webBuildDir, { index: false, setHeaders: noCacheHtml }));
  app.use("/web", (_req: Request, res: Response) => {
    const indexPath = path.join(webBuildDir, "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Web build not available");
    }
  });

  // SPA fallback: serve index.html per rotte sconosciute quando static-build esiste.
  // In dev (no static-build): proxy a Metro :8081 tramite createProxyMiddleware —
  // permette al canvas Replit di raggiungere le rotte Expo Router (/welcome, ecc.).
  const spaFallbackIndex = path.resolve(process.cwd(), "static-build", "index.html");
  // isProductionMode = true se NODE_ENV="production" oppure se Replit ha impostato REPLIT_INTERNAL_APP_DOMAIN
  // (presente solo nel container di produzione, non in sviluppo).
  const isProductionMode = process.env.NODE_ENV === "production" || !!process.env.REPLIT_INTERNAL_APP_DOMAIN;
  const devProxyActive = !isProductionMode && !fs.existsSync(spaFallbackIndex);
  if (isProductionMode) {
    log("Production mode — Metro proxy disabilitato");
  } else if (devProxyActive) {
    log("Dev proxy → Metro :8081 attivo (static-build non trovato)");
  }
  const metroProxy = devProxyActive
    ? createProxyMiddleware<Request, Response>({
        target: "http://127.0.0.1:8081",
        changeOrigin: true,
        on: {
          error: (_err, _req, res) => {
            (res as Response)
              .status(502)
              .send(
                "Metro non disponibile. Avvia il workflow 'Start Frontend'."
              );
          },
        },
      })
    : null;
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    if (req.path.startsWith("/uploads")) return next();
    if (fs.existsSync(spaFallbackIndex)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.sendFile(spaFallbackIndex);
    }
    if (metroProxy) return metroProxy(req, res, next);
    next();
  });

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

  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  const webBuildIndex = path.join(path.resolve(process.cwd(), "static-build", "web"), "index.html");
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();
    if (req.path === "/" || req.path === "/manifest" || req.path === "/healthz") return next();
    if (req.path.match(/\.\w+$/)) return next();
    if (fs.existsSync(webBuildIndex)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.sendFile(webBuildIndex);
    }
    next();
  });

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);

  // Track active connections so we can destroy them on shutdown
  const activeConnections = new Set<import("net").Socket>();

  // Graceful shutdown — destroy active connections, free DB pool, exit cleanly
  let _shuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(`[Shutdown] ${signal} ricevuto — chiusura pulita in corso...`);
    stopMatchingEngine();

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
        } catch (e) {
          console.warn("[MIGRATION] ota_releases:", e);
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
          if (!mapsUserChoiceSetting) await storage.upsertAppSetting("maps_user_choice_enabled", "true");
        } catch (e) {
          console.warn("[SEED] splash settings:", e);
        }
        console.log("[INIT] Phase 3 essential seed + settings done");

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
