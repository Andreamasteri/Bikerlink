import express from "express";
import type { Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import * as path from "path";
import { storage } from "./storage";
import { db } from "./db";
import { sendError } from "./lib/api-response";
import { 
  motorcyclePhotos, 
  userMotorcycles, 
  userPhotos,
  zavorrinaWishlistPhotos,
  zavorrinaWishlists,
} from "@shared/db";
import { eq } from "drizzle-orm";

const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const configured = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (configured) origins.add(`https://${configured.replace(/^https?:\\/\\//, "")}`);
  return origins;
}

/**
 * Login-CSRF protection for session-issuing auth endpoints.
 *
 * A cross-site HTML form POST (the classic login-CSRF vector) always causes the
 * browser to include an `Origin` header that reflects the *attacker* site, not
 * ours.  We reject any request whose Origin is set to a value outside our known
 * domain list.  Requests with no Origin header (mobile API clients, server-to-
 * server calls) are allowed through unchanged — they cannot receive or store a
 * browser session cookie anyway.
 */
export function enforceOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header("origin");

  if (!origin) {
    return next();
  }

  const allowed = getAllowedOrigins();
  const isLocalhost =
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");

  if (allowed.has(origin) || isLocalhost) {
    return next();
  }

  sendError(res, 403, "Richiesta non autorizzata");
}

export function setupMiddleware(app: express.Application) {
  // Railway/Cloudflare may add multiple reverse-proxy hops.
  // Trust the forwarded chain so req.ip resolves to the client address.
  app.set("trust proxy", true);
  console.log(`[VISITOR-TRACKING] trust proxy set to: true (all proxies trusted)`);

  // One-shot middleware: log the first request's resolved IP so we can verify
  // in production logs that real IPs are being captured correctly.
  let firstRequestLogged = false;
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!firstRequestLogged) {
      firstRequestLogged = true;
      const xff = req.headers["x-forwarded-for"];
      console.log(
        `[VISITOR-TRACKING] first request — req.ip="${req.ip}" X-Forwarded-For="${xff ?? "(none)"}"`,
      );
    }
    next();
  });

  // CORS setup
  app.use((req, res, next) => {
    const origins = new Set<string>();

    const configured = process.env.EXPO_PUBLIC_DOMAIN?.trim();
    if (configured) origins.add(`https://${configured.replace(/^https?:\\/\\//, "")}`);

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

  // Body parsing
  const globalJson = express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  });

  const SMALL_BODY_POST_PATHS = new Set<string>([
    "/api/admin/startup-beacon",
    "/api/admin/ota-error",
    "/api/admin/client-error",
    "/api/feedback",
    "/api/errors",
    "/api/telemetry/maps",
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

  // Task #2533 — Watchdog latency + error tracker (best-effort, non-fatal).
  app.use((req, res, next) => {
    try {
      // dynamic import sync via require-like fallback: usiamo import statico tipo
      // best-effort: se il modulo non esiste, no-op.
      const lat = require("./ai/watchdog/collectors/latency-collector") as {
        latencyMiddleware: (req: unknown, res: unknown, next: () => void) => void;
      };
      lat.latencyMiddleware(req, res, next);
    } catch { next(); }
  });
  app.use((req, res, next) => {
    res.on("finish", () => {
      try {
        if (!req.path.startsWith("/api")) return;
        const err = require("./ai/watchdog/collectors/error-collector") as {
          recordHttpError: (status: number) => void;
        };
        err.recordHttpError(res.statusCode);
      } catch { /* ignore */ }
    });
    next();
  });

  // Request logging
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

  // Compression
  app.use(compression());

  // Security headers — helmet replaces the previous manual setHeader block.
  // contentSecurityPolicy is disabled because we serve mixed assets/landing pages
  // that would otherwise need a bespoke directive set; the existing X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy, and HSTS protections remain in place
  // and crossOriginEmbedderPolicy is off to keep Expo asset hosting working.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }));
}

export function setupStaticRoutes(app: express.Application) {
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

  // Motorcycle photos ACL
  app.get("/uploads/motorcycles/:filename", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.session?.userId) {
        return sendError(res, 401, "Non autenticato");
      }
      const requesterId = req.session.userId;
      const filename = req.params.filename;
      if (filename.includes("/") || filename.includes("..")) {
        return sendError(res, 404, "Foto non trovata");
      }
      const photoUrl = `/uploads/motorcycles/${filename}`;
      const [row] = await db
        .select({ ownerId: userMotorcycles.userId })
        .from(motorcyclePhotos)
        .innerJoin(userMotorcycles, eq(motorcyclePhotos.motorcycleId, userMotorcycles.id))
        .where(eq(motorcyclePhotos.photoUrl, photoUrl))
        .limit(1);
      if (!row || row.ownerId !== requesterId) {
        return sendError(res, 404, "Foto non trovata");
      }
      res.set("Cache-Control", "private, max-age=3600");
      return next();
    } catch (err) {
      console.error("[uploads/motorcycles auth] error:", err);
      return sendError(res, 500, "Errore interno del server");
    }
  });

  // Profile photos ACL
  app.get("/uploads/photos/:filename", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.session?.userId) {
        return sendError(res, 401, "Non autenticato");
      }
      const requesterId = req.session.userId;
      const filename = req.params.filename;
      if (!filename || filename.includes("/") || filename.includes("..")) {
        return sendError(res, 404, "Foto non trovata");
      }
      const photoUrl = `/uploads/photos/${filename}`;
      const [row] = await db
        .select({ userId: userPhotos.userId, isApproved: userPhotos.isApproved })
        .from(userPhotos)
        .where(eq(userPhotos.photoUrl, photoUrl))
        .limit(1);
      if (!row) {
        return sendError(res, 404, "Foto non trovata");
      }
      const isOwner = row.userId === requesterId;
      if (!isOwner) {
        if (!row.isApproved) {
          return sendError(res, 404, "Foto non trovata");
        }
        const blocked = await storage.hasBlockedUser(row.userId, requesterId);
        if (blocked) {
          return sendError(res, 403, "Non puoi visualizzare questa foto");
        }
      }
      res.set("Cache-Control", "private, max-age=3600");
      return next();
    } catch (err) {
      console.error("[uploads/photos auth] error:", err);
      return sendError(res, 500, "Errore interno del server");
    }
  });

  // Wishlist photos ACL
  app.get("/uploads/wishlist/:filename", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.session?.userId) {
        return sendError(res, 401, "Non autenticato");
      }
      const requesterId = req.session.userId;
      const filename = req.params.filename;
      if (!filename || filename.includes("/") || filename.includes("..")) {
        return sendError(res, 404, "Foto non trovata");
      }
      const photoUrl = `/uploads/wishlist/${filename}`;
      const [row] = await db
        .select({ ownerId: zavorrinaWishlists.userId })
        .from(zavorrinaWishlistPhotos)
        .innerJoin(zavorrinaWishlists, eq(zavorrinaWishlistPhotos.wishlistId, zavorrinaWishlists.id))
        .where(eq(zavorrinaWishlistPhotos.photoUrl, photoUrl))
        .limit(1);
      if (!row || row.ownerId !== requesterId) {
        return sendError(res, 404, "Foto non trovata");
      }
      res.set("Cache-Control", "private, max-age=3600");
      return next();
    } catch (err) {
      console.error("[uploads/wishlist auth] error:", err);
      return sendError(res, 500, "Errore interno del server");
    }
  });

  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
}
