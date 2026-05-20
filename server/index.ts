import express from "express";
import type { Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { registerSiteRoutes } from "./site/routes";
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
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  // SECURITY (Task #1082, #1125, #1450): the global 10 MB JSON parser is
  // bypassed on selected public/abuse-prone routes so the route can install
  // a much smaller per-route parser and run its rate limiter before the body
  // is ever parsed.
  //   - /api/admin/startup-beacon (Task #1082) — public diagnostics.
  //   - /api/admin/ota-error      (Task #1125) — public OTA telemetry.
  //   - /api/admin/client-error   (Task #1125) — public client crash sink.
  //   - /api/feedback             (Task #1125) — authenticated but
  //                                              unthrottled and triggers
  //                                              an outbound email per call.
  //   - /api/errors               (Task #1450) — public GPS error sink;
  //                                              triggers outbound email and
  //                                              a DB write per accepted
  //                                              request. Needs the limiter
  //                                              to run before body parsing.
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
    "/api/errors",
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

function configureExpoAndLanding(app: express.Application) {
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

    // Task #1520: when no expo-platform header is present, fall through to
    // registerSiteRoutes() which serves the new multi-page marketing site.
    // Home page is served by server/site/pages.ts :: buildHome().
    next();
  });

  // SEO (robots.txt, sitemap.xml), favicon, static HTML legal pages and the
  // marketing site itself are all registered by registerSiteRoutes() — kept
  // in server/site/routes.ts for maintainability.
  registerSiteRoutes(app);

  // ── APK Status (no redirect) ─────────────────────────────────────────────
  // Returns { available: true } if an APK URL is configured, { available: false } otherwise.
  app.get("/api/download/apk/status", async (_req: Request, res: Response) => {
    try {
      const setting = await storage.getAppSetting("apk_download_url");
      const apkUrl = (setting?.value?.trim()) || process.env.APK_DOWNLOAD_URL;
      return res.json({ available: !!apkUrl });
    } catch {
      const apkUrl = process.env.APK_DOWNLOAD_URL;
      return res.json({ available: !!apkUrl });
    }
  });

  // ── APK Direct Download ──────────────────────────────────────────────────
  // Reads apk_download_url from app_settings DB first, then APK_DOWNLOAD_URL env var.
  // Returns 404 if neither is set.
  app.get("/api/download/apk/latest", async (_req: Request, res: Response) => {
    try {
      const setting = await storage.getAppSetting("apk_download_url");
      const apkUrl = (setting?.value?.trim()) || process.env.APK_DOWNLOAD_URL;
      if (!apkUrl) {
        return res.status(404).json({ error: "APK not available" });
      }
      return res.redirect(302, apkUrl);
    } catch {
      const apkUrl = process.env.APK_DOWNLOAD_URL;
      if (!apkUrl) {
        return res.status(404).json({ error: "APK not available" });
      }
      return res.redirect(302, apkUrl);
    }
  });

  // ── Public App Config ─────────────────────────────────────────────────────
  // Returns non-sensitive app-wide settings for the mobile client to consume.
  // Keys exposed: play_store_url, website_url, maintenance_enabled, maintenance_message.
  app.get("/api/config", async (_req: Request, res: Response) => {
    try {
      const [playStore, website, maintenanceEnabled, maintenanceMessage] = await Promise.all([
        storage.getAppSetting("play_store_url"),
        storage.getAppSetting("website_url"),
        storage.getAppSetting("maintenance_enabled"),
        storage.getAppSetting("maintenance_message"),
      ]);
      return res.json({
        play_store_url: playStore?.value?.trim() || null,
        website_url: website?.value?.trim() || null,
        maintenance_enabled: maintenanceEnabled?.value === "true",
        maintenance_message: maintenanceMessage?.value?.trim() || "",
      });
    } catch (err) {
      console.error("[api/config] error:", err);
      return res.status(500).json({ message: "Errore interno" });
    }
  });

  // ── Web Portal SPA routes ────────────────────────────────────────────────
  // Serve the web portal HTML at specific SPA routes.
  // The client-side JS handles routing internally.
  const webPortalPath = path.resolve(process.cwd(), "server", "templates", "web-portal.html");
  const webPortalRoutes = ["/registrati", "/accedi", "/area-utente", "/media", "/admin/media", "/admin/settings"];
  for (const route of webPortalRoutes) {
    app.get(route, (_req: Request, res: Response) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(webPortalPath);
    });
  }

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets"), {
    setHeaders(res, filePath) {
      const isImage = /\.(webp|png|jpg|jpeg|gif|svg|ico|avif)$/i.test(filePath);
      if (isImage) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));
  app.use("/music", express.static(path.resolve(process.cwd(), "server/public/music"), {
    setHeaders(res) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=86400");
    },
  }));

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

  // Task #1520: gzip/brotli compression for all HTML/CSS/JS/JSON responses.
  // Improves audit perf score and reduces bandwidth, especially for the
  // marketing site rendered server-side at every request.
  app.use(compression());

  // Task #1520: security headers applied to every response. These satisfy
  // squirrelscan's security/csp, security/x-frame-options, and related
  // checks. CSP is intentionally permissive enough to allow:
  //   - inline <style> blocks (renderPage embeds shared CSS)
  //   - inline <script> blocks (small nav-burger toggle, Leaflet bootstrap)
  //   - Google Fonts (fonts.googleapis.com / fonts.gstatic.com)
  //   - Leaflet from unpkg + CARTO tile servers on /community
  //   - Replit dev tooling iframes during local development
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(self), microphone=(self), geolocation=(self), payment=()",
    );
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://replit.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https: wss:",
        "frame-src 'self' https://replit.com",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self' mailto:",
      ].join("; "),
    );
    next();
  });

  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  // Wire offline position randomization into the OnlineTracker lifecycle.
  // When a user times out or is explicitly set offline, apply ±20km fuzz if enabled.
  try {
    const { onlineTracker: tracker } = await import("./online-tracker");
    tracker.setOfflineCallback(async (userId: string) => {
      try {
        const profile = await storage.getUserProfile(userId);
        if (!profile || profile.offlinePositionRandomize === false) return;
        const lat = (profile as any).latitude;
        const lng = (profile as any).longitude;
        if (lat == null || lng == null) return;
        const R = 6371;
        const radiusKm = 20;
        const u = Math.random();
        const v = Math.random();
        const w = radiusKm / R;
        const t = 2 * Math.PI * v;
        const x = w * Math.sqrt(u);
        const fuzzedLat = lat + (x * Math.cos(t)) * (180 / Math.PI);
        const fuzzedLng = lng + (x * Math.sin(t)) * (180 / Math.PI / Math.cos(lat * Math.PI / 180));
        await storage.updateUserProfile(userId, {
          lastOfflineLat: fuzzedLat,
          lastOfflineLng: fuzzedLng,
        } as any);
      } catch {}
    });
  } catch (e) {
    console.warn("[INIT] Failed to wire online tracker offline callback:", e);
  }

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
                const result = await db.execute(sql`UPDATE ota_releases SET runtime_version = ${rv}, updated_at = NOW() WHERE id = ANY(${ids}::text[])`);
                totalUpdated += (result.rowCount ?? 0);
              }

              // Post-backfill verification
              const nullCheck = await db.execute(sql`SELECT COUNT(*)::int AS remaining FROM ota_releases WHERE runtime_version IS NULL`);
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
              const alertCheck = await db.execute(sql`SELECT COUNT(*)::int AS remaining FROM ota_releases WHERE runtime_version IS NULL`);
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

        // Task #1590 — ota_stuck_events table for circuit-breaker telemetry.
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS ota_stuck_events (
              id          SERIAL PRIMARY KEY,
              device_id   VARCHAR(64) NOT NULL,
              rollback_count  INTEGER NOT NULL DEFAULT 0,
              stuck_sessions  INTEGER NOT NULL DEFAULT 0,
              runtime_version VARCHAR(32),
              created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_stuck_events_created_idx ON ota_stuck_events(created_at DESC)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_stuck_events_rv_idx ON ota_stuck_events(runtime_version)`);
          // Seed default alert threshold in app_settings (only if not already set).
          const existingThreshold = await storage.getAppSetting("ota_stuck_alert_threshold");
          if (!existingThreshold?.value) {
            await storage.upsertAppSetting("ota_stuck_alert_threshold", "5");
            console.log("[MIGRATION] ota_stuck_alert_threshold seeded to 5");
          }
          console.log("[MIGRATION] ota_stuck_events table ensured");
        } catch (e) {
          console.warn("[MIGRATION] ota_stuck_events:", e);
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
          const cleanupResult = await db.execute(sql`
            DELETE FROM ota_releases
            WHERE status IN ('superseded', 'draft')
              AND published_at < NOW() - (${String(retentionDays)} || ' days')::INTERVAL
            RETURNING id, version, status, published_at, bundle_path
          `);
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
          console.log("[MIGRATION] user_profiles privacy extended columns ensured");
        } catch (e) {
          console.warn("[MIGRATION] user_profiles privacy extended columns:", e);
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
            await db.execute(sql`ALTER TABLE ${sql.identifier(t)} SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 10)`);
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
              max_acceleration_g DOUBLE PRECISION,
              max_deceleration_g DOUBLE PRECISION,
              max_tilt_deg DOUBLE PRECISION,
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
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS media_library (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
              type VARCHAR(10) NOT NULL DEFAULT 'pdf',
              title_it VARCHAR(300) NOT NULL,
              title_en VARCHAR(300) NOT NULL,
              url TEXT NOT NULL,
              thumbnail_url TEXT,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS media_library_type_idx ON media_library(type)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS media_library_sort_idx ON media_library(sort_order)`);
          console.log("[MIGRATION] media_library table ensured");
        } catch (e) {
          console.warn("[MIGRATION] media_library table:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS newsletter_subscribers (
              id SERIAL PRIMARY KEY,
              email VARCHAR(254) UNIQUE NOT NULL,
              notify_rides BOOLEAN NOT NULL DEFAULT true,
              created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS newsletter_subscribers_email_idx ON newsletter_subscribers (email)`);
          console.log("[MIGRATION] newsletter_subscribers table ensured");
        } catch (e) {
          console.warn("[MIGRATION] newsletter_subscribers:", e);
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
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{"matches":true,"zoneProposals":true,"chat":true,"motoclub":true,"eventi":true}'::jsonb`);
          await db.execute(sql`ALTER TABLE user_profiles ALTER COLUMN notification_preferences SET DEFAULT '{"matches":true,"zoneProposals":true,"chat":true,"motoclub":true,"eventi":true}'::jsonb`);
          console.log("[MIGRATION] user_profiles.notification_preferences ensured");
        } catch (e) {
          console.warn("[MIGRATION] user_profiles.notification_preferences:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS map_filters JSONB`);
          console.log("[MIGRATION] user_profiles.map_filters ensured");
        } catch (e) {
          console.warn("[MIGRATION] user_profiles.map_filters:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN NOT NULL DEFAULT true`);
          console.log("[MIGRATION] user_profiles.push_notifications_enabled ensured");
        } catch (e) {
          console.warn("[MIGRATION] user_profiles.push_notifications_enabled:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS slot VARCHAR(32)`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS promoted_by VARCHAR(100)`);
          await db.execute(sql`ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0`);
          await db.execute(sql`ALTER TABLE ota_releases ALTER COLUMN slot SET DEFAULT 'archived'`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_releases_slot_idx ON ota_releases(slot)`);
          // Task #1356: indici per debug agente su ota_events.
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_events_release_phase_idx ON ota_events(release_id, phase)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_events_source_created_idx ON ota_events(source, created_at DESC)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ota_events_phase_created_idx ON ota_events(phase, created_at DESC)`);
          console.log("[MIGRATION] ota_releases slot/success + ota_events debug indices ensured");
        } catch (e) {
          console.warn("[MIGRATION] ota_releases slot columns:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS device_ota_assignments (
              device_id VARCHAR(128) PRIMARY KEY,
              slot VARCHAR(32) NOT NULL DEFAULT 'stable',
              assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
              assigned_by VARCHAR(100),
              expires_at TIMESTAMP
            )
          `);
          console.log("[MIGRATION] device_ota_assignments table ensured");
        } catch (e) {
          console.warn("[MIGRATION] device_ota_assignments table:", e);
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

        try {
          await db.execute(sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS max_lateral_g DOUBLE PRECISION`);
          console.log("[MIGRATION] routes.max_lateral_g ensured");
        } catch (e) {
          console.warn("[MIGRATION] routes.max_lateral_g:", e);
        }

        try {
          // Drop DEFAULT 0 from sensor columns so null semantics are preserved:
          // null = sensor not active; explicit value = sensor was active (even if near zero).
          await db.execute(sql`ALTER TABLE routes ALTER COLUMN max_acceleration_g DROP DEFAULT`);
          await db.execute(sql`ALTER TABLE routes ALTER COLUMN max_deceleration_g DROP DEFAULT`);
          await db.execute(sql`ALTER TABLE routes ALTER COLUMN max_tilt_deg DROP DEFAULT`);
          await db.execute(sql`ALTER TABLE routes ALTER COLUMN max_lateral_g DROP DEFAULT`);
          // Backfill: rows where all four sensor peaks are 0 were recorded before sensor
          // integration — treat them as no-sensor-data (null).
          await db.execute(sql`
            UPDATE routes
            SET max_acceleration_g = NULL,
                max_deceleration_g = NULL,
                max_tilt_deg       = NULL,
                max_lateral_g      = NULL
            WHERE COALESCE(max_acceleration_g, 0) = 0
              AND COALESCE(max_deceleration_g, 0) = 0
              AND COALESCE(max_tilt_deg,       0) = 0
              AND COALESCE(max_lateral_g,      0) = 0
          `);
          console.log("[MIGRATION] routes sensor columns: defaults dropped, zero rows backfilled to NULL");
        } catch (e) {
          console.warn("[MIGRATION] routes sensor columns null migration:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS proposal_zone_notifications (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              proposal_id VARCHAR(36) NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
              sent_at TIMESTAMP NOT NULL DEFAULT now()
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS proposal_zone_notif_unique_idx ON proposal_zone_notifications (user_id, proposal_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS proposal_zone_notif_proposal_idx ON proposal_zone_notifications (proposal_id)`);
          console.log("[MIGRATION] proposal_zone_notifications table ensured");
        } catch (e) {
          console.warn("[MIGRATION] proposal_zone_notifications:", e);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS planned_routes (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              title VARCHAR(200) NOT NULL,
              description TEXT,
              waypoints JSONB DEFAULT '[]'::jsonb,
              polyline TEXT,
              distance_km DOUBLE PRECISION DEFAULT 0,
              duration_minutes INTEGER DEFAULT 0,
              biker_score DOUBLE PRECISION DEFAULT 0,
              style VARCHAR(20) NOT NULL DEFAULT 'curvy',
              visibility VARCHAR(20) NOT NULL DEFAULT 'public',
              is_multi_day BOOLEAN NOT NULL DEFAULT false,
              metadata JSONB DEFAULT '{}'::jsonb,
              created_at TIMESTAMP NOT NULL DEFAULT now(),
              updated_at TIMESTAMP NOT NULL DEFAULT now()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS planned_routes_user_id_idx ON planned_routes (user_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS planned_routes_visibility_idx ON planned_routes (visibility)`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS route_weather_cache (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              route_id VARCHAR(36) NOT NULL REFERENCES planned_routes(id) ON DELETE CASCADE,
              departure_time TIMESTAMP NOT NULL,
              weather_data JSONB DEFAULT '{}'::jsonb,
              created_at TIMESTAMP NOT NULL DEFAULT now()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS route_weather_cache_route_id_idx ON route_weather_cache (route_id)`);
          await db.execute(sql`ALTER TABLE planned_routes ADD COLUMN IF NOT EXISTS real_curvature_score DOUBLE PRECISION`);
          console.log("[MIGRATION] planned_routes + route_weather_cache tables ensured");
        } catch (e) {
          console.warn("[MIGRATION] planned_routes/route_weather_cache:", e);
        }

        try {
          await db.execute(sql`ALTER TABLE biker_biker_matches ADD COLUMN IF NOT EXISTS pair_type VARCHAR(10) NOT NULL DEFAULT 'bb'`);
          console.log("[MIGRATION] biker_biker_matches.pair_type ensured");
        } catch (e) {
          console.warn("[MIGRATION] biker_biker_matches.pair_type:", e);
        }

        // Task #1686 — ride_telemetry table for sensor log infrastructure
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS ride_telemetry (
              id          SERIAL PRIMARY KEY,
              user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              session_id  VARCHAR(36) NOT NULL,
              session_type VARCHAR(10) NOT NULL DEFAULT 'ride',
              ts          BIGINT NOT NULL,
              lat         DOUBLE PRECISION NOT NULL,
              lon         DOUBLE PRECISION NOT NULL,
              speed_kmh   REAL,
              lean_angle  REAL,
              gforce_x    REAL,
              gforce_y    REAL,
              gforce_z    REAL,
              heading     REAL,
              altitude_m  REAL,
              matched     BOOLEAN NOT NULL DEFAULT false,
              created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ride_telemetry_user_id_idx    ON ride_telemetry (user_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ride_telemetry_session_id_idx ON ride_telemetry (session_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ride_telemetry_ts_idx         ON ride_telemetry (ts)`);

          console.log("[MIGRATION] ride_telemetry table ensured");
        } catch (e) {
          console.warn("[MIGRATION] ride_telemetry:", e);
        }

        // Fase 2 — Map Matching: aggiungi colonna `matched` a ride_telemetry
        try {
          await db.execute(sql`
            ALTER TABLE ride_telemetry
            ADD COLUMN IF NOT EXISTS matched BOOLEAN NOT NULL DEFAULT false
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ride_telemetry_matched_idx ON ride_telemetry (matched)`);
          console.log("[MIGRATION] ride_telemetry.matched column ensured");
        } catch (e) {
          console.warn("[MIGRATION] ride_telemetry.matched:", e);
        }

        // Fase 2 — Map Matching: crea tabella segment_telemetry
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS segment_telemetry (
              osm_way_id    BIGINT          PRIMARY KEY,
              avg_lean_angle DOUBLE PRECISION,
              max_lean_angle DOUBLE PRECISION,
              avg_gforce    DOUBLE PRECISION,
              sample_count  INTEGER         NOT NULL DEFAULT 0,
              last_updated  TIMESTAMP       NOT NULL DEFAULT NOW()
            )
          `);
          console.log("[MIGRATION] segment_telemetry table ensured");
        } catch (e) {
          console.warn("[MIGRATION] segment_telemetry:", e);
        }

        // Fase 3 — Curvy Score: aggiungi colonna curvy_score a segment_telemetry
        try {
          await db.execute(sql`
            ALTER TABLE segment_telemetry
            ADD COLUMN IF NOT EXISTS curvy_score DOUBLE PRECISION
          `);
          console.log("[MIGRATION] segment_telemetry.curvy_score column ensured");
        } catch (e) {
          console.warn("[MIGRATION] segment_telemetry.curvy_score:", e);
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
          const matchPrefVisibleSetting = await storage.getAppSetting("match_preferences_visible");
          if (!matchPrefVisibleSetting) await storage.upsertAppSetting("match_preferences_visible", "false");
          const searchPrefLockedSetting = await storage.getAppSetting("search_preference_locked");
          if (!searchPrefLockedSetting) await storage.upsertAppSetting("search_preference_locked", "false");
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

        // Phase 3.6: one-time cleanup — remove legacy 8.x OTA records
        try {
          const { storage: stOta } = await import("./storage");
          const ota8xCleaned = await stOta.getAppSetting("ota_8x_cleanup_done_v1").catch(() => null);
          if (!ota8xCleaned) {
            const { db: dbOta } = await import("./db");
            const { sql: sqlOta } = await import("drizzle-orm");
            const evRes = await dbOta.execute(sqlOta`DELETE FROM ota_events WHERE runtime_version = '8.0.0'`);
            const rlRes = await dbOta.execute(sqlOta`DELETE FROM ota_releases WHERE runtime_version = '8.0.0'`);
            const evDel = (evRes as any)?.rowCount ?? "?";
            const rlDel = (rlRes as any)?.rowCount ?? "?";
            console.log(`[INIT] Phase 3.6 OTA 8.x cleanup: ota_events=${evDel} deleted, ota_releases=${rlDel} deleted`);
            await stOta.upsertAppSetting("ota_8x_cleanup_done_v1", "done");
          } else {
            console.log("[INIT] Phase 3.6 OTA 8.x cleanup already done, skipping");
          }
        } catch (e) {
          console.warn("[INIT] Phase 3.6 OTA 8.x cleanup error:", e);
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

        // Phase 5.5: auto-trigger mass seed if new geographic zones (IN, AU, ID, TH, ZA, NG, KE)
        // are not yet populated. Runs in background so it does not block startup.
        // Uses a one-time flag (mass_seed_new_zones_v1) to skip checks on subsequent boots
        // once the seed has completed successfully.
        setTimeout(async () => {
          try {
            const { storage: stPhase55 } = await import("./storage");

            // One-time flag: skip entirely on subsequent deploys after a verified successful seed
            const newZonesDone = await stPhase55.getAppSetting("mass_seed_new_zones_v1");
            if (newZonesDone?.value === "done") {
              console.log("[INIT] Phase 5.5 mass seed check skipped (new zones already seeded)");
              return;
            }

            const fakeUsersSetting55 = await stPhase55.getAppSetting("fake_users_enabled");
            if (fakeUsersSetting55?.value !== "true") {
              console.log("[INIT] Phase 5.5 mass seed check skipped (fake users disabled)");
              return;
            }

            const { EUROPEAN_ZONES: EZ55 } = await import("./mass-seed-data");
            const NEW_ZONE_COUNTRIES = new Set(["IN", "AU", "ID", "TH", "ZA", "NG", "KE"]);
            // Build per-country expected zone counts so we can check per-country presence,
            // not just an aggregate total that could mask a partially populated set.
            const zonesPerCountry = new Map<string, number>();
            for (const z of EZ55) {
              if (NEW_ZONE_COUNTRIES.has(z.country)) {
                zonesPerCountry.set(z.country, (zonesPerCountry.get(z.country) ?? 0) + 1);
              }
            }

            // Returns true only when EVERY new country has at least minPerZone users per zone.
            const checkCoverage = async (minPerZone: number): Promise<boolean> => {
              const rows = await db.execute(sql`
                SELECT country, COUNT(*)::int AS cnt FROM users
                WHERE invitation_code = 'mass_seed_5k_v1' AND country = ANY(${Array.from(NEW_ZONE_COUNTRIES)}::text[])
                GROUP BY country
              `);
              const countByCountry = new Map((rows.rows as Array<{ country: string; cnt: number }>).map(r => [r.country, r.cnt]));
              for (const [country, zoneCount] of zonesPerCountry) {
                const have = countByCountry.get(country) ?? 0;
                if (have < zoneCount * minPerZone) return false;
              }
              return true;
            };

            const alreadyCovered = await checkCoverage(1);

            if (!alreadyCovered) {
              console.log("[INIT] Phase 5.5 new-zone users missing — triggering mass seed in background");
              const { massSeedFakeUsers } = await import("./mass-seed");
              // massSeedFakeUsers() swallows internal errors and always resolves.
              // Write the completion flag only after verifying per-country coverage
              // via a fresh DB query — not by trusting the return value of the function.
              massSeedFakeUsers()
                .then(async () => {
                  const succeeded = await checkCoverage(1).catch(() => false);
                  if (succeeded) {
                    await stPhase55.upsertAppSetting("mass_seed_new_zones_v1", "done").catch(() => {});
                    console.log("[mass-seed] Phase 5.5 completion flag written — all new zones populated");
                  } else {
                    console.warn("[mass-seed] Phase 5.5 seed completed but coverage check failed — flag NOT written; will retry on next boot");
                  }
                })
                .catch((err: unknown) => console.error("[mass-seed] auto-trigger error:", err));
            } else {
              console.log("[INIT] Phase 5.5 new-zone users OK (per-country coverage verified) — writing completion flag");
              await stPhase55.upsertAppSetting("mass_seed_new_zones_v1", "done").catch(() => {});
            }
          } catch (e) {
            console.warn("[INIT] Phase 5.5 mass seed auto-check error:", e);
          }
        }, 5_000);

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
              const result = await db.execute(sql`
                DELETE FROM ota_releases
                WHERE status IN ('superseded', 'draft')
                  AND published_at < NOW() - (${String(retentionDays)} || ' days')::INTERVAL
                RETURNING id, version, status, published_at
              `);
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
              const result = await db.execute(sql`
                DELETE FROM ota_events
                WHERE id IN (
                  SELECT id FROM ota_events
                  ORDER BY created_at DESC
                  OFFSET ${OTA_EVENTS_RETENTION}
                ) OR created_at < NOW() - INTERVAL '30 days'
                RETURNING id
              `);
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

        // Phase 12.6 — ota_stuck_events periodic cleanup every 6h
        // Hard retention: keeps at most OTA_STUCK_EVENTS_RETENTION rows (env var, default 500).
        // Also removes records older than 90 days regardless of row count.
        // Runs once at startup (1-min delay) then every 6h.
        {
          const _rawStuckRetention = parseInt(process.env.OTA_STUCK_EVENTS_RETENTION ?? "500", 10);
          const OTA_STUCK_EVENTS_RETENTION = Number.isFinite(_rawStuckRetention) && _rawStuckRetention >= 1
            ? _rawStuckRetention
            : 500;
          if (_rawStuckRetention !== OTA_STUCK_EVENTS_RETENTION) {
            console.warn(`[OTA-STUCK-CLEANUP] OTA_STUCK_EVENTS_RETENTION env var is invalid ("${process.env.OTA_STUCK_EVENTS_RETENTION}") — falling back to 500.`);
          }
          const SIX_HOURS_MS_STUCK = 6 * 60 * 60 * 1000;
          const runOtaStuckEventsCleanup = async () => {
            try {
              const result = await db.execute(sql`
                DELETE FROM ota_stuck_events
                WHERE id IN (
                  SELECT id FROM ota_stuck_events
                  ORDER BY created_at DESC
                  OFFSET ${OTA_STUCK_EVENTS_RETENTION}
                ) OR created_at < NOW() - INTERVAL '90 days'
                RETURNING id
              `);
              const count = result.rowCount ?? 0;
              if (count > 0) {
                console.log(`[OTA-STUCK-CLEANUP] Removed ${count} old ota_stuck_events record(s) (retention=${OTA_STUCK_EVENTS_RETENTION}).`);
              } else {
                console.log(`[OTA-STUCK-CLEANUP] No old ota_stuck_events to remove (retention=${OTA_STUCK_EVENTS_RETENTION}).`);
              }
            } catch (err) {
              console.warn("[OTA-STUCK-CLEANUP] Periodic cleanup error:", err);
            }
          };
          setTimeout(() => {
            runOtaStuckEventsCleanup();
            setInterval(runOtaStuckEventsCleanup, SIX_HOURS_MS_STUCK);
          }, 60 * 1000);
          console.log(`[INIT] Phase 12.6 ota_stuck_events cleanup scheduled (1min delay, then every 6h, retention=${OTA_STUCK_EVENTS_RETENTION})`);
        }

        // Phase 12.7 — OTA stuck-state spike alert (every 15 min)
        // Queries ota_stuck_events for events in the last hour. If the count
        // reaches the configurable threshold (app_settings key:
        // ota_stuck_alert_threshold, default: 5) an alert email is sent to all
        // admin/moderator accounts plus the hardcoded bikerlinkapp@gmail.com.
        // A 1-hour cooldown (app_settings key: ota_stuck_last_alert_at) prevents
        // flooding when the spike persists across multiple check cycles.
        {
          const STUCK_ALERT_INTERVAL_MS = 15 * 60 * 1000;
          const STUCK_ALERT_WINDOW_MINUTES = 60;
          const STUCK_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
          const STUCK_ALERT_FALLBACK_EMAIL = "bikerlinkapp@gmail.com";

          const runOtaStuckCheck = async () => {
            try {
              // 1. Read configurable threshold from app_settings (default 5).
              const thresholdRaw = await storage.getAppSetting("ota_stuck_alert_threshold").catch(() => null);
              const threshold = Math.max(1, parseInt(thresholdRaw?.value ?? "5", 10) || 5);

              // 2. Count events in the last window.
              const windowResult = await db.execute(sql`
                SELECT
                  COUNT(*)::int                  AS event_count,
                  COUNT(DISTINCT device_id)::int AS unique_devices
                FROM ota_stuck_events
                WHERE created_at >= NOW() - INTERVAL '1 hour'
              `);
              const row = windowResult.rows[0] as { event_count: number; unique_devices: number } | undefined;
              const eventCount = row?.event_count ?? 0;
              const uniqueDevices = row?.unique_devices ?? 0;

              if (eventCount < threshold) {
                console.log(`[OTA-STUCK-ALERT] ${eventCount}/${threshold} eventi nell'ultima ora — sotto soglia, nessun alert.`);
                return;
              }

              // 3. Enforce cooldown: skip if last alert was within 1 hour.
              const lastAlertSetting = await storage.getAppSetting("ota_stuck_last_alert_at").catch(() => null);
              if (lastAlertSetting?.value) {
                const lastAt = new Date(lastAlertSetting.value).getTime();
                if (!isNaN(lastAt) && Date.now() - lastAt < STUCK_ALERT_COOLDOWN_MS) {
                  console.log(`[OTA-STUCK-ALERT] Soglia superata (${eventCount}/${threshold}) ma in cooldown — prossimo alert dopo ${new Date(lastAt + STUCK_ALERT_COOLDOWN_MS).toISOString()}`);
                  return;
                }
              }

              // 4. runtimeVersion breakdown.
              const rvResult = await db.execute(sql`
                SELECT runtime_version, COUNT(*)::int AS count
                FROM ota_stuck_events
                WHERE created_at >= NOW() - INTERVAL '1 hour'
                GROUP BY runtime_version
                ORDER BY count DESC
                LIMIT 10
              `);
              const runtimeVersions = rvResult.rows as Array<{ runtime_version: string | null; count: number }>;

              // 5. Build recipient list: bikerlinkapp + all admin/mod emails.
              let recipients: string[] = [STUCK_ALERT_FALLBACK_EMAIL];
              try {
                const allUsers = await storage.getAllUsers();
                const adminEmails = allUsers
                  .filter((u) => (u.role === "admin" || u.role === "moderator") && u.email)
                  .map((u) => u.email as string);
                recipients = Array.from(new Set([STUCK_ALERT_FALLBACK_EMAIL, ...adminEmails]));
              } catch (e) {
                console.warn("[OTA-STUCK-ALERT] Impossibile caricare utenti admin, uso solo fallback email:", e);
              }

              // 6. Send alert email and inspect per-recipient outcomes.
              const { sendOtaStuckAlertEmail } = await import("./email");
              const alertResult = await sendOtaStuckAlertEmail({
                to: recipients,
                eventCount,
                uniqueDevices,
                threshold,
                windowMinutes: STUCK_ALERT_WINDOW_MINUTES,
                runtimeVersions,
              });

              // 7. Persist last-alert timestamp ONLY if at least one send succeeded.
              // If all sends failed, skip the cooldown update so the next cycle can retry.
              if (alertResult.sent.length > 0) {
                await storage.upsertAppSetting("ota_stuck_last_alert_at", new Date().toISOString());
                console.log(`[OTA-STUCK-ALERT] Alert inviato a ${alertResult.sent.join(", ")} — ${eventCount} eventi su ${uniqueDevices} dispositivi (soglia=${threshold}).`);
                if (alertResult.failed.length > 0) {
                  console.warn(`[OTA-STUCK-ALERT] Invio parzialmente fallito per: ${alertResult.failed.join(", ")}`);
                }
              } else {
                console.warn(`[OTA-STUCK-ALERT] Tutti gli invii falliti (${recipients.length} destinatari) — cooldown NON impostato, il prossimo ciclo riproverà.`);
              }
            } catch (err) {
              console.warn("[OTA-STUCK-ALERT] Errore controllo stuck-state:", err);
            }
          };

          // First run after 5 minutes (allow DB/migrations to settle), then every 15 min.
          setTimeout(() => {
            runOtaStuckCheck();
            setInterval(runOtaStuckCheck, STUCK_ALERT_INTERVAL_MS);
          }, 5 * 60 * 1000);
          console.log("[INIT] Phase 12.7 OTA stuck-state alert scheduled (5min delay, then every 15min, window=60min)");
        }

        // Phase 13 — schema snapshot (non-blocking, fire-and-forget)
        // Captures a fresh snapshot of the DB schema after all migrations have run.
        // Used by the match-health skill to detect structural changes between deploys.
        try {
          const { saveSchemaSnapshot } = await import("./scripts/snapshot-schema");
          await saveSchemaSnapshot();
          console.log("[INIT] Phase 13 schema snapshot saved");
        } catch (e) {
          console.warn("[INIT] Phase 13 schema snapshot failed (non-fatal):", e);
        }

        // Phase 14 — Map Matching nightly scheduler (02:00 Europe/Rome)
        // Associa i punti GPS raccolti dalla telemetria ai segmenti stradali OSM.
        // Richiede GRAPHHOPPER_URL (self-hosted) o GRAPHHOPPER_API_KEY (cloud).
        // Documentazione: server/README-graphhopper.md
        try {
          const { scheduleNightlyMapMatching } = await import("./map-matching-job");
          scheduleNightlyMapMatching();
          console.log("[INIT] Phase 14 map matching nightly scheduler registered (02:00 Europe/Rome)");
        } catch (e) {
          console.warn("[INIT] Phase 14 map matching scheduler failed (non-fatal):", e);
        }

        // Phase 15 — Curvy Score weekly scheduler (domenica 03:00 Europe/Rome)
        // Calcola il curvy_score reale per ogni segmento OSM da segment_telemetry.
        // Usato dal profilo di routing "Curvy Reale" in planned-routes.
        try {
          const { scheduleWeeklyCurvyScoreUpdate } = await import("./curvy-score-job");
          scheduleWeeklyCurvyScoreUpdate();
          console.log("[INIT] Phase 15 curvy score weekly scheduler registered (domenica 03:00 Europe/Rome)");
        } catch (e) {
          console.warn("[INIT] Phase 15 curvy score scheduler failed (non-fatal):", e);
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
