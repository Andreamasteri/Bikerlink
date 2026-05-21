import type { Express, Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Locals {
      invalidateExpoUpdateHash?: (releaseId?: string) => void;
    }
  }
}
import { createServer, type Server } from "node:http";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { initState } from "./init-state";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import { pool } from "./db";
import { storage } from "./storage";
import { getTrustedClientIp } from "./lib/abuse-rate-limit";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import motorcycleRoutes from "./routes/motorcycles";
import proposalRoutes from "./routes/proposals";
import trackingRoutes from "./routes/tracking";
import wishlistRoutes from "./routes/wishlist";
import feedbackRoutes from "./routes/feedback";
import invitationRoutes from "./routes/invitations";
import contestRoutes from "./routes/contest";
import adsRoutes from "./routes/ads";
import chatRoutes from "./routes/chat";
import notificationRoutes from "./routes/notifications";
import reportRoutes from "./routes/reports";
import workshopRoutes from "./routes/workshops";
import easterEggRoutes from "./routes/easter-eggs";
import adminRoutes from "./routes/admin";
import moderatorRoutes from "./routes/moderator";
import customRoutesRouter from "./routes/custom-routes";
import sosRoutes from "./routes/sos";
import telemetryRoutes from "./routes/telemetry";
import motoclubsRoutes from "./routes/motoclubs";
import friendsRoutes from "./routes/friends";
import { handleMusicMatch } from "./routes/music-match";
import matchPreferencesRoutes from "./routes/match-preferences";
import lastfmRoutes from "./routes/lastfm";
import radioRoutes from "./routes/radio";
import eventsRoutes from "./routes/events";
import arcadeRoutes from "./routes/arcade";
import errorsRoutes from "./routes/errors";
import sprintsRoutes from "./routes/sprints";
import { publicMediaRouter, adminMediaRouter } from "./routes/media-library";
import { triggerMatchingRun, triggerMatchingForUser } from "./matching-engine";
import { db } from "./db";
import { users, userFavorites } from "@shared/schema";
import { PRIVACY_POLICY_IT } from "@shared/privacy-policy-it";
import { ilike, eq, and, sql } from "drizzle-orm";
import { onlineTracker } from "./online-tracker";

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = (req as any).session as { userId?: string };
  if (!session?.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  const user = await storage.getUser(session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Accesso non autorizzato" });
  }
  (req as any).adminUser = user;
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.set("trust proxy", 1);
  const PgStore = connectPgSimple(session);
  const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 anno

  // Bridge Bearer token → cookie connect.sid (per client mobile React Native).
  // Il cookie jar nativo Android/iOS può perdere connect.sid (process killed dall'OS,
  // OTA reload del network stack, ecc). Il client mobile salva il token Bearer in
  // AsyncStorage e lo invia come header Authorization. Qui lo ri-inietto come
  // cookie sintetico così express-session lo legge con la sua logica standard.
  // Il valore Bearer è il valore raw firmato del cookie (formato `s:<sid>.<sig>`).
  //
  // IMPORTANTE: il Bearer ha sempre la precedenza su qualsiasi connect.sid nativo
  // già presente nel cookie jar (può essere stale/invalido su Android dopo riavvio
  // del processo). Il cookie stale viene rimosso e sostituito con il token Bearer.
  app.use((req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token) {
        const cookieValue = `connect.sid=${encodeURIComponent(token)}`;
        if (req.headers.cookie) {
          const cleaned = req.headers.cookie
            .split(";")
            .map((c) => c.trim())
            .filter((c) => !c.startsWith("connect.sid="))
            .join("; ");
          req.headers.cookie = cleaned ? `${cleaned}; ${cookieValue}` : cookieValue;
        } else {
          req.headers.cookie = cookieValue;
        }
      }
    }
    next();
  });

  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: "session",
        createTableIfMissing: true,
        ttl: 365 * 24 * 60 * 60, // 1 anno in secondi — allineato a maxAge
      }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      rolling: true, // rinnova la scadenza ad ogni richiesta HTTP → sessione mai scaduta se app è usata
      cookie: {
        maxAge: SESSION_MAX_AGE_MS,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        // Dev: no SameSite attribute (false) → compatible with HTTP localhost, curl, and React Native native client
        // Prod: SameSite=Lax → CSRF protection for browser, React Native ignores SameSite anyway
        sameSite: process.env.NODE_ENV === "production" ? "lax" : (false as const),
      },
    })
  );

  app.use(async (req: any, res: any, next: any) => {
    if (req.session?.userId) {
      const userId: string = req.session.userId;
      const foundInTracker = onlineTracker.touch(userId);
      try {
        const user = await storage.getUser(userId);
        // Task #1078: account non attivo (suspended/blocked/deleted) o utente
        // cancellato → distruggi la sessione e rifiuta la richiesta.
        // Senza questo, una sessione creata prima del ban resta valida fino a 1
        // anno (rolling: true rinnova la scadenza ad ogni request).
        if (!user || user.status !== "active") {
          if (user) onlineTracker.setOffline(userId);
          return req.session.destroy(() => {
            try { res.clearCookie("connect.sid", { path: "/" }); } catch {}
            const reason = !user ? "user-not-found" : `status-${user.status}`;
            return res.status(401).json({ message: "Sessione non più valida", reason });
          });
        }
        if (user.status === "active") {
          if (user.role === "admin") {
            onlineTracker.setOffline(userId);
          } else if (!foundInTracker) {
            const profile = await storage.getUserProfile(userId).catch(() => null);
            onlineTracker.setOnline(userId, {
              role: user.role ?? "user",
              nickname: user.nickname ?? "",
              status: user.status ?? "active",
              userType: user.userType ?? "biker",
              isAvailable: (profile?.isAvailable ?? false) && !(user.ghostMode ?? false),
              ghostMode: user.ghostMode ?? false,
              country: user.country ?? null,
              isFake: user.isFake ?? false,
            });
          }
          if (user.lastLoginAt) {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (new Date(user.lastLoginAt) < fiveMinAgo) {
              await storage.updateUser(userId, { lastLoginAt: new Date() } as any);
            }
          }
        }
      } catch {}
    }
    next();
  });

  app.get("/api/assets/onboarding/:filename", async (req: Request, res: Response) => {
    const { filename } = req.params;
    if (!/^\d{2}-[a-z0-9-]+\.png$/.test(filename)) {
      return res.status(400).send("Invalid filename");
    }
    try {
      const { downloadBuffer } = await import("./objectStorage");
      const buffer = await downloadBuffer(`public/onboarding/${filename}`);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(buffer);
    } catch {
      return res.status(404).send("Not found");
    }
  });

  const CURRENT_APP_VERSION = "3.3.0";
  app.get("/api/version/latest", (_req: Request, res: Response) => {
    return res.json({ latestVersion: CURRENT_APP_VERSION });
  });

  app.use("/api/match-preferences", matchPreferencesRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);

  app.get("/api/user/position", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const profile = await storage.getUserProfile(req.session.userId);
      if (!profile || profile.latitude == null || profile.longitude == null) {
        return res.json({ latitude: null, longitude: null, source: null });
      }
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isLive = profile.coordinatesUpdatedAt != null && new Date(profile.coordinatesUpdatedAt) > fiveMinAgo;
      return res.json({
        latitude: profile.latitude,
        longitude: profile.longitude,
        source: isLive ? "live" : "last_known",
        updatedAt: profile.coordinatesUpdatedAt,
      });
    } catch (error) {
      console.error("Get user position error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });
  app.get("/api/users/my-last-position", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const profile = await storage.getUserProfile(req.session.userId);
      if (!profile || profile.latitude == null || profile.longitude == null) {
        return res.json({ available: false });
      }
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (!profile.coordinatesUpdatedAt || new Date(profile.coordinatesUpdatedAt) < tenMinAgo) {
        return res.json({ available: false });
      }
      return res.json({
        available: true,
        latitude: profile.latitude,
        longitude: profile.longitude,
        updatedAt: profile.coordinatesUpdatedAt,
      });
    } catch (error) {
      console.error("Get my-last-position error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.use("/api/motorcycles", motorcycleRoutes);
  app.use("/api/proposals", proposalRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/workshops", workshopRoutes);
  app.use("/api/easter-eggs", easterEggRoutes);
  app.use("/api/ads", adsRoutes);
  app.use("/api/contest", contestRoutes);
  app.use("/api/wishlist", wishlistRoutes);
  app.use("/api/feedback", feedbackRoutes);
  app.use("/api/invitations", invitationRoutes);
  app.use("/api/routes", trackingRoutes);
  app.use(customRoutesRouter);
  app.use("/api/admin", adminRoutes);
  app.use("/api/moderator", moderatorRoutes);
  app.use("/api/sos", sosRoutes);
  app.use("/api/telemetry", telemetryRoutes);
  app.use("/api/motoclubs", motoclubsRoutes);
  app.use("/api/friends", friendsRoutes);
  app.use("/api/lastfm", lastfmRoutes);
  app.use("/api/music/radio", radioRoutes);
  app.use("/api/events", eventsRoutes);
  app.use("/api/arcade", arcadeRoutes);
  app.use("/api/errors", errorsRoutes);
  app.use("/api/sprints", sprintsRoutes);
  app.use("/api/media", publicMediaRouter);
  app.use("/api/admin/media", adminMediaRouter);

  const { default: plannedRoutesRoutes } = await import("./routes/planned-routes");
  app.use("/api/planned-routes", plannedRoutesRoutes);

  app.get("/api/media/promo-video", async (_req: Request, res: Response) => {
    try {
      const { downloadBuffer } = await import("./objectStorage");
      const buffer = await downloadBuffer("public/playstore/bikerlink_promo_video.mp4");
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", "inline; filename=\"bikerlink_promo_video.mp4\"");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    } catch (error) {
      console.error("Promo video serve error:", error);
      return res.status(404).json({ message: "Video non trovato" });
    }
  });

  app.get("/api/media/convoy-promo", async (_req: Request, res: Response) => {
    try {
      const { downloadBuffer } = await import("./objectStorage");
      const buffer = await downloadBuffer("public/playstore/bikerlink_convoy_promo_30s.mp4");
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", "inline; filename=\"bikerlink_convoy_promo_30s.mp4\"");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    } catch (error) {
      console.error("Convoy promo video serve error:", error);
      return res.status(404).json({ message: "Video non trovato" });
    }
  });

  app.get("/api/media/youtube-promo", async (_req: Request, res: Response) => {
    try {
      const { downloadBuffer } = await import("./objectStorage");
      const buffer = await downloadBuffer("public/playstore/bikerlink_youtube_60s.mp4");
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", "inline; filename=\"bikerlink_youtube_60s.mp4\"");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    } catch (error) {
      console.error("YouTube promo video serve error:", error);
      return res.status(404).json({ message: "Video non trovato" });
    }
  });

  app.get("/api/media/harley-promo", async (_req: Request, res: Response) => {
    try {
      const { downloadBuffer } = await import("./objectStorage");
      const buffer = await downloadBuffer("public/playstore/bikerlink_harley_30s.mp4");
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", "inline; filename=\"bikerlink_harley_30s.mp4\"");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    } catch (error) {
      console.error("Harley promo video serve error:", error);
      return res.status(404).json({ message: "Video non trovato" });
    }
  });

  app.get("/api/media/adrenaline-promo", async (_req: Request, res: Response) => {
    try {
      const { downloadBuffer } = await import("./objectStorage");
      const buffer = await downloadBuffer("public/playstore/bikerlink_adrenaline_30s.mp4");
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", "inline; filename=\"bikerlink_adrenaline_30s.mp4\"");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    } catch (error) {
      console.error("Adrenaline promo video serve error:", error);
      return res.status(404).json({ message: "Video non trovato" });
    }
  });

  app.get("/api/media/solo-rider-promo", async (_req: Request, res: Response) => {
    try {
      const { downloadBuffer } = await import("./objectStorage");
      const buffer = await downloadBuffer("public/playstore/bikerlink_solo_rider_17s.mp4");
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", "inline; filename=\"bikerlink_solo_rider_17s.mp4\"");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    } catch (error) {
      console.error("Solo rider promo video serve error:", error);
      return res.status(404).json({ message: "Video non trovato" });
    }
  });

  app.get("/api/favorites", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const rows = await db
        .select({ favoriteUserId: userFavorites.favoriteUserId })
        .from(userFavorites)
        .where(eq(userFavorites.userId, req.session.userId));
      return res.json(rows.map((r) => r.favoriteUserId));
    } catch (error) {
      console.error("Get favorites error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.post("/api/favorites/:userId", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const currentUserId = req.session.userId;
      const targetUserId = req.params.userId as string;
      if (currentUserId === targetUserId) {
        return res.status(400).json({ message: "Non puoi aggiungere te stesso ai preferiti" });
      }
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Utente non trovato" });
      }
      const existing = await db
        .select({ id: userFavorites.id })
        .from(userFavorites)
        .where(and(eq(userFavorites.userId, currentUserId), eq(userFavorites.favoriteUserId, targetUserId)));
      if (existing.length > 0) {
        await db.delete(userFavorites).where(and(eq(userFavorites.userId, currentUserId), eq(userFavorites.favoriteUserId, targetUserId)));
        return res.json({ favorited: false });
      } else {
        await db.insert(userFavorites).values({ userId: currentUserId, favoriteUserId: targetUserId });
        return res.json({ favorited: true });
      }
    } catch (error) {
      console.error("Toggle favorite error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.get("/api/settings/music-provider", (_req: Request, res: Response) => {
    return res.json({ provider: "lastfm" });
  });

  app.get("/api/match/music", (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Non autenticato" });
    return handleMusicMatch(req, res);
  });

  app.get("/api/updates/check", async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`SELECT * FROM ota_releases WHERE status = 'active' ORDER BY published_at DESC LIMIT 1`);
      if (!result.rows.length) {
        return res.json({ hasUpdate: false, version: null, releaseNotes: null, bundlePath: null, publishedAt: null });
      }
      const release = result.rows[0] as Record<string, unknown>;
      return res.json({
        hasUpdate: true,
        version: release.version,
        releaseNotes: release.release_notes,
        bundlePath: release.bundle_path,
        manifestUrl: release.bundle_path,
        publishedAt: release.published_at,
      });
    } catch {
      return res.json({ hasUpdate: false, version: null, releaseNotes: null, bundlePath: null, publishedAt: null });
    }
  });

  // ─── Expo Updates Protocol v1 ───────────────────────────────────────────────
  // In-memory SHA-256 cache: releaseId → base64url hash
  const _expoUpdateHashCache = new Map<string, string>();

  // Esposto al router admin per invalidare la cache dopo publish/rollback.
  // L'admin chiama app.locals.invalidateExpoUpdateHash(id?) — se omesso, svuota tutto.
  app.locals.invalidateExpoUpdateHash = (releaseId?: string) => {
    if (releaseId) {
      const had = _expoUpdateHashCache.delete(releaseId);
      console.log(`[expo-updates] cache invalidate id=${releaseId} hit=${had}`);
    } else {
      const size = _expoUpdateHashCache.size;
      _expoUpdateHashCache.clear();
      console.log(`[expo-updates] cache invalidate ALL (cleared ${size} entries)`);
    }
  };

  // Read the expected runtimeVersion from app.json once at startup so that
  // bumping the cycle in app.json automatically updates this endpoint too.
  const _expectedRuntimeVersion: string = (() => {
    try {
      const appJson = JSON.parse(fs.readFileSync(path.resolve("app.json"), "utf8"));
      return appJson?.expo?.runtimeVersion ?? "9.0.0";
    } catch {
      return "9.0.0";
    }
  })();

  // Read the app version from app.json once at startup — used in OTA manifest
  // extra.expoClient so the field stays aligned with app.json without manual updates.
  const _expectedAppVersion: string = (() => {
    try {
      const appJson = JSON.parse(fs.readFileSync(path.resolve("app.json"), "utf8"));
      return appJson?.expo?.version ?? "3.1.0";
    } catch {
      return "3.1.0";
    }
  })();

  app.get("/api/expo-updates", async (req: Request, res: Response) => {
    // ?debug=1 viene accettato SOLO se la sessione è quella di un admin autenticato.
    // Per i client expo-updates normali (anonimi) il flag viene silenziosamente
    // ignorato in modo da non poter inquinare ota_events o causare carico DB.
    let debug = false;
    if (req.query.debug === "1") {
      const userId = req.session.userId;
      if (userId) {
        try {
          const { storage } = await import("./storage");
          const user = await storage.getUser(userId);
          if (user?.role === "admin") debug = true;
        } catch {
          // best-effort: in caso di errore, non abilitare debug
        }
      }
    }
    // Canonical diagnostic event: phase="server-check"|"server-anon-check", source="server".
    // Lo `status` (es: "204-not-android", "304-etag-match") va nel campo `error`
    // come info diagnostica anche quando la richiesta è andata a buon fine.
    //
    // Task #1148: logging anonimo con campionamento — anche le richieste senza
    // ?debug=1 vengono loggate 1 ogni N (env OTA_PROBE_SAMPLE, default 20) per
    // dare visibilità in produzione senza saturare il DB. Errori (5xx) e
    // anomalie (header mancanti, runtime mismatch) sono SEMPRE loggati.
    const requestStartedAt = Date.now();
    const otaProbeSampleN = (() => {
      const raw = parseInt(String(process.env.OTA_PROBE_SAMPLE ?? "20"), 10);
      return Number.isFinite(raw) && raw > 0 ? raw : 20;
    })();
    const logEvent = async (status: string, releaseId: string | null, errMsg?: string) => {
      // Decide se loggare:
      // 1) sempre se ?debug=1 admin
      // 2) sempre se è un errore (5xx) o un'anomalia diagnostica
      // 3) altrimenti campionato 1/N
      const isAnomaly = status.startsWith("5") || status === "missing-headers" || status === "runtime-mismatch";
      const sampled = Math.floor(Math.random() * otaProbeSampleN) === 0;
      if (!debug && !isAnomaly && !sampled) return;
      try {
        const { otaEvents } = await import("@shared/schema");
        const { db } = await import("./db");
        const durationMs = Date.now() - requestStartedAt;
        const detail = errMsg ? `${status} | ${errMsg} | ${durationMs}ms` : `${status} | ${durationMs}ms`;
        await db.insert(otaEvents).values({
          phase: debug ? "server-check" : "server-anon-check",
          source: "server",
          platform: ((req.headers["expo-platform"] as string) ?? "?").substring(0, 16),
          runtimeVersion: ((req.headers["expo-runtime-version"] as string) ?? "?").substring(0, 32),
          currentUpdateId: ((req.headers["expo-current-update-id"] as string) ?? "?").substring(0, 64),
          releaseId: releaseId ? releaseId.substring(0, 64) : undefined,
          error: detail.substring(0, 500),
          failCount: 0,
          // Task #1118 / #1126: derive the persisted ip via the centralized
          // getTrustedClientIp helper. Never parse X-Forwarded-For directly —
          // it is attacker-controlled and would let a spoofed left-most entry
          // poison the ota_events incident-response data.
          ip: getTrustedClientIp(req),
        });
      } catch (e) {
        console.error("[expo-updates debug log] insert failed:", e);
      }
    };

    // Task #1150: switch to Expo Updates Protocol v1 (multipart/mixed).
    // Background: prima dichiaravamo `expo-protocol-version: 0` (legacy classic)
    // ma servivamo un body JSON con la struttura del protocollo v1
    // (`launchAsset`/`assets`/`extra.expoClient`). Questa combinazione è invalida
    // per spec e da SDK 55.0.21 il client la rigetta sistematicamente con
    // `ExpoUpdates.checkForUpdateAsync rejected → Failed to check for update`,
    // bloccando l'intera flotta sull'ultima OTA installata. La fix corretta è
    // adottare multipart/mixed v1 reale — sia per la consegna del manifest
    // (parte `manifest`) sia per il "no update" (parte `directive` con
    // `noUpdateAvailable`). In v1 il protocollo non usa 204 / 304 / If-None-Match:
    // il server risponde sempre 200 con la directive appropriata.
    const setExpoUpdatesHeaders = (etag?: string) => {
      res.setHeader("expo-protocol-version", "1");
      res.setHeader("expo-sfv-version", "0");
      res.setHeader("cache-control", "private, max-age=0");
      if (etag) res.setHeader("etag", etag);
    };

    const writeMultipartResponse = (
      parts: Array<{ name: string; contentType: string; body: string }>,
    ) => {
      const CRLF = "\r\n";
      const boundary = `----expo-updates-${crypto.randomBytes(12).toString("hex")}`;
      const segments = parts.map(
        (p) =>
          `--${boundary}${CRLF}` +
          `content-disposition: form-data; name="${p.name}"${CRLF}` +
          `content-type: ${p.contentType}${CRLF}${CRLF}` +
          p.body,
      );
      const body = segments.join(CRLF) + `${CRLF}--${boundary}--${CRLF}`;
      // Important: serve as Buffer + setHeader (not res.type/.send(string)) so
      // Express does NOT append `; charset=utf-8` to a multipart Content-Type
      // (RFC 2046 forbids charset on multipart) and does NOT auto-generate a
      // weak ETag that would interfere with expo-updates' own etag header.
      const buf = Buffer.from(body, "utf8");
      res.removeHeader("ETag");
      res.setHeader("content-type", `multipart/mixed; boundary=${boundary}`);
      res.setHeader("content-length", String(buf.length));
      res.status(200).end(buf);
    };

    const sendNoUpdateDirective = (etag?: string) => {
      setExpoUpdatesHeaders(etag);
      writeMultipartResponse([
        {
          name: "directive",
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ type: "noUpdateAvailable" }),
        },
      ]);
    };

    try {
      const runtimeVersion = req.headers["expo-runtime-version"] as string | undefined;
      const platform = req.headers["expo-platform"] as string | undefined;
      const currentUpdateId = req.headers["expo-current-update-id"] as string | undefined;

      // Task #1843: reject non-semver runtime_version headers before any DB persistence.
      // Payloads like SQL injection strings or "unknown" must never reach ota_events.
      // Valid Expo clients always send a semver string matching the app's runtimeVersion.
      const SEMVER_RE = /^\d+\.\d+\.\d+$/;
      if (runtimeVersion !== undefined && !SEMVER_RE.test(runtimeVersion)) {
        return res.status(400).json({ message: "expo-runtime-version non valida (formato atteso: X.Y.Z)" });
      }

      // Task #1148: anomaly logging — header mancanti e runtime mismatch sono
      // sempre loggati (vedi `isAnomaly` in logEvent). Servono per individuare
      // device male configurati o build con runtimeVersion sbagliato.
      if (!runtimeVersion || !platform) {
        await logEvent(
          "missing-headers",
          null,
          `rv=${runtimeVersion ?? "absent"} pf=${platform ?? "absent"}`,
        );
      } else if (runtimeVersion !== _expectedRuntimeVersion) {
        await logEvent(
          "runtime-mismatch",
          null,
          `client=${runtimeVersion} server=${_expectedRuntimeVersion}`,
        );
      }

      // Only serve Android OTA bundles — iOS publishing is handled separately.
      // In protocol v1 anche il "no update" è una risposta 200 multipart con
      // directive `noUpdateAvailable`, non un 204 vuoto.
      if (platform && platform !== "android") {
        await logEvent("noUpdate-not-android", null);
        return sendNoUpdateDirective();
      }

      // The DB query filters by runtime_version, so no early-exit gate is needed here.
      // Requests from any runtimeVersion cycle are served their own matching release.
      const effectiveRv = runtimeVersion ?? _expectedRuntimeVersion;

      // Task #1355: slot-based routing — read device ID from expo-device-id header,
      // look up assignment in device_ota_assignments, then serve the OTA for that slot.
      //
      // Two strictly separate paths:
      //   A) Device HAS an explicit slot assignment → strict slot routing.
      //      - If the assigned slot has no active OTA AND slot != stable → fall back to stable.
      //      - If stable also empty → noUpdateAvailable. NEVER falls back to legacy query.
      //   B) Device has NO assignment (or no header) → serve stable slot.
      //      - If stable slot is empty → legacy fallback (slot IS NULL, status='active'),
      //        to support pre-slot OTA records that pre-date the new slot system.
      // Identify the device: prefer expo-device-id, fall back to expo-installation-id (Expo SDK standard).
      // Task #1830: if expo-device-id is the sentinel "extra-params", parse Expo-Extra-Params
      // (JSON) and extract the "device-id" key as the real device identifier.
      let rawDeviceId: string | null =
        (req.headers["expo-device-id"] as string | undefined) ||
        (req.headers["expo-installation-id"] as string | undefined) ||
        null;
      if (rawDeviceId === "extra-params") {
        try {
          const extraParamsHeader = req.headers["expo-extra-params"] as string | undefined;
          if (extraParamsHeader) {
            const extraParams = JSON.parse(extraParamsHeader) as Record<string, unknown>;
            const parsed = typeof extraParams["device-id"] === "string" ? extraParams["device-id"] : null;
            rawDeviceId = parsed || null;
          } else {
            rawDeviceId = null;
          }
        } catch {
          rawDeviceId = null;
        }
      }
      const deviceId = rawDeviceId?.substring(0, 128) || null;
      let assignedSlot: string | null = null;
      let hasSlotAssignment = false;
      if (deviceId) {
        try {
          const assignResult = await db.execute(sql`SELECT slot, expires_at FROM device_ota_assignments WHERE device_id = ${deviceId}`);
          if (assignResult.rows.length > 0) {
            const asgn = assignResult.rows[0];
            const expired = asgn.expires_at && new Date(asgn.expires_at) <= new Date();
            if (!expired) {
              assignedSlot = asgn.slot as string;
              hasSlotAssignment = true;
            }
          }
        } catch (e) {
          console.error("[expo-updates] assignment lookup failed:", e);
        }
      }

      let release: Record<string, unknown> | null = null;

      if (hasSlotAssignment && assignedSlot) {
        // Path A: strict slot routing — no legacy fallback
        const slotResult = await db.execute(sql`SELECT * FROM ota_releases WHERE slot = ${assignedSlot} AND status = 'active' AND runtime_version = ${effectiveRv} ORDER BY published_at DESC LIMIT 1`);
        if (slotResult.rows.length > 0) {
          release = slotResult.rows[0] as Record<string, unknown>;
          // Note: `serving_broken_ota` telemetry is intentionally omitted here because
          // the query above already requires `status='active'`, so a broken OTA (status='broken')
          // will never be returned here. Broken OTAs are handled by the else-branch below,
          // which logs `fallback_to_stable` when the assigned slot has no active release.
        } else {
          // Assigned slot has no active OTA (either empty or all releases are broken/archived)
          // → fall back to stable (never to legacy)
          const reason = `slot=${assignedSlot} no active OTA`;
          await logEvent("fallback_to_stable", null, reason);
          const stableResult = await db.execute(sql`SELECT * FROM ota_releases WHERE slot = 'stable' AND status = 'active' AND runtime_version = ${effectiveRv} ORDER BY published_at DESC LIMIT 1`);
          if (stableResult.rows.length > 0) {
            release = stableResult.rows[0] as Record<string, unknown>;
          } else {
            // stable also empty → noUpdateAvailable; log explicitly
            await logEvent("fallback_to_stable_empty", null, `${reason} and stable also empty`);
          }
        }
      } else {
        // Path B: no assignment — try stable slot first
        const stableResult = await db.execute(sql`SELECT * FROM ota_releases WHERE slot = 'stable' AND status = 'active' AND runtime_version = ${effectiveRv} ORDER BY published_at DESC LIMIT 1`);
        if (stableResult.rows.length > 0) {
          release = stableResult.rows[0] as Record<string, unknown>;
        } else {
          // Legacy fallback: only for pre-slot OTA records (slot IS NULL).
          // This handles devices calling before any admin has assigned the stable slot.
          const legacyResult = await db.execute(sql`SELECT * FROM ota_releases WHERE slot IS NULL AND status = 'active' AND runtime_version = ${effectiveRv} ORDER BY published_at DESC LIMIT 1`);
          if (legacyResult.rows.length > 0) {
            release = legacyResult.rows[0] as Record<string, unknown>;
            await logEvent("legacy_fallback", String(legacyResult.rows[0].id), "stable slot empty, serving legacy pre-slot OTA");
          }
          // If legacy also empty → noUpdateAvailable is logged below
        }
      }

      if (!release) {
        await logEvent("noUpdate-no-release", null);
        return sendNoUpdateDirective();
      }

      if (currentUpdateId && currentUpdateId === release.id) {
        await logEvent("noUpdate-already-current", String(release.id));
        return sendNoUpdateDirective(`"${release.id}"`);
      }

      let sha256Hash = _expoUpdateHashCache.get(release.id);
      let cacheHit = true;
      if (!sha256Hash) {
        cacheHit = false;
        const { downloadBuffer, isValidOtaBundlePath } = await import("./objectStorage");
        if (!isValidOtaBundlePath(release.bundle_path)) {
          console.error(
            `[expo-updates] Refusing to build manifest for release ${release.id}: bundle_path failed validator: ${release.bundle_path}`,
          );
          return sendNoUpdateDirective();
        }
        const bundleBuffer = await downloadBuffer(release.bundle_path as string);
        sha256Hash = crypto.createHash("sha256").update(bundleBuffer).digest("base64url");
        _expoUpdateHashCache.set(release.id as string, sha256Hash);
        console.log(`[expo-updates] Computed SHA-256 for release ${release.id}: ${sha256Hash.substring(0, 12)}...`);
      }
      await logEvent(cacheHit ? "200-manifest-cached" : "200-manifest-fresh", String(release.id));

      const BASE_URL = process.env.BIKERLINK_PUBLIC_URL ?? "https://biker-link.replit.app";
      const bundleUrl = `${BASE_URL}/api/expo-updates/assets/${encodeURIComponent(release.id as string)}`;

      const createdAt: string = release.published_at
        ? new Date(release.published_at as string | Date).toISOString()
        : new Date().toISOString();

      const manifest = {
        id: release.id,
        createdAt,
        runtimeVersion: runtimeVersion ?? _expectedRuntimeVersion,
        // assets: [] is intentional — OTA bundles are single-file JS (no separate
        // image/font assets extracted). The bundle itself is in launchAsset only.
        assets: [] as unknown[],
        launchAsset: {
          hash: sha256Hash,
          key: "bundle",
          contentType: "application/javascript",
          url: bundleUrl,
        },
        metadata: {},
        extra: {
          expoClient: {
            name: "BikerLink",
            version: _expectedAppVersion,
          },
        },
      };

      // Risposta v1: parte unica `manifest` con il JSON. Il client SDK 55 sa
      // estrarla, validare l'hash di `launchAsset` e scaricare il bundle.
      setExpoUpdatesHeaders(`"${release.id}"`);
      writeMultipartResponse([
        {
          name: "manifest",
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify(manifest),
        },
      ]);
      return;
    } catch (error) {
      console.error("[expo-updates] Error:", error);
      // Task #1148: errori 500 sono SEMPRE loggati (isAnomaly = status startsWith "5")
      // così che le anomalie del backend OTA siano visibili dal pannello admin
      // anche per richieste di client anonimi che non possono passare ?debug=1.
      try {
        await logEvent("500-internal-error", null, String((error as Error)?.message ?? error).substring(0, 200));
      } catch {
        // best-effort: non vogliamo mai che il logging mascheri il 500 al client
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/expo-updates/assets/:releaseId", async (req: Request, res: Response) => {
    try {
      const { releaseId } = req.params;
      // Task #1123: this route is unauthenticated (the OTA client has no
      // session) and downloads the file with the privileged storage client.
      // It therefore must (a) only serve releases that are CURRENTLY active
      // — draft/inactive/revoked releases must not leak — and (b) re-validate
      // the bundle_path against the OTA prefix allowlist as defense-in-depth
      // in case any legacy or out-of-band INSERT bypassed the admin gate.
      const result = await db.execute(sql`SELECT bundle_path FROM ota_releases WHERE id = ${releaseId} AND status = 'active'`);
      if (!result.rows.length || !(result.rows[0] as Record<string, unknown>).bundle_path) {
        return res.status(404).end();
      }
      const bundlePath = (result.rows[0] as Record<string, unknown>).bundle_path as string;
      const { downloadBuffer, isValidOtaBundlePath } = await import("./objectStorage");
      if (!isValidOtaBundlePath(bundlePath)) {
        console.error(
          `[expo-updates/assets] Refusing to serve release ${releaseId}: bundle_path failed validator: ${bundlePath}`,
        );
        return res.status(404).end();
      }
      const bundleBuffer = await downloadBuffer(bundlePath);
      res.setHeader("content-type", "application/javascript");
      res.setHeader("cache-control", "public, max-age=31536000, immutable");
      return res.end(bundleBuffer);
    } catch (error) {
      console.error("[expo-updates/assets] Error:", error);
      return res.status(500).end();
    }
  });

  // Task #1355: heartbeat endpoint — l'app chiama questo endpoint dopo aver
  // caricato con successo un OTA. Registra in ota_events con phase=loaded e
  // incrementa il contatore success_count sulla release.
  //
  // Security hardening:
  //   - releaseId must exist in ota_releases (otherwise 404 — no metric poisoning)
  //   - Idempotency: a device+release combo is deduplicated within a 5-minute window
  //     (prevents duplicate success_count inflation from retries)
  //   - rate limit: max 10 heartbeats/minute per IP (in-memory counter)
  const _heartbeatRateMap = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/ota/heartbeat", async (req: Request, res: Response) => {
    try {
      const { deviceId, releaseId, runtimeVersion } = req.body ?? {};
      if (!releaseId || typeof releaseId !== "string") {
        return res.status(400).json({ message: "releaseId obbligatorio" });
      }
      // Validate runtimeVersion format — must be semver (X.Y.Z). Reject and return 400
      // for payloads that are not valid semver to prevent injection / dirty data in ota_events.
      if (runtimeVersion !== undefined && runtimeVersion !== null && !(/^\d+\.\d+\.\d+$/).test(String(runtimeVersion))) {
        return res.status(400).json({ message: "runtime_version non valida (formato atteso: X.Y.Z)" });
      }
      // ota_events.source is varchar(32) — truncate deviceId to match the column constraint.
      // Expo installation IDs are UUIDs (36 chars) so we keep the first 32 chars which
      // are unique enough for filtering and idempotency checks.
      // Strip null bytes — PostgreSQL rejects them even in parameterised queries.
      const stripNull = (s: string) => s.replace(/\x00/g, "");
      const safeDeviceId = deviceId ? stripNull(String(deviceId)).substring(0, 32) : null;
      const safeReleaseId = stripNull(String(releaseId)).substring(0, 64);
      const safeRv = runtimeVersion ? stripNull(String(runtimeVersion)).substring(0, 32) : null;
      const clientIp = getTrustedClientIp(req) ?? "unknown";

      // Rate limit: 10 heartbeats per minute per IP
      const now = Date.now();
      const rl = _heartbeatRateMap.get(clientIp);
      if (!rl || rl.resetAt <= now) {
        _heartbeatRateMap.set(clientIp, { count: 1, resetAt: now + 60_000 });
      } else {
        rl.count++;
        if (rl.count > 10) {
          return res.status(429).json({ message: "Too many heartbeats" });
        }
      }

      // Validate releaseId exists (reject unknown IDs — prevents metric poisoning)
      const exists = await db.execute(sql`SELECT id FROM ota_releases WHERE id = ${safeReleaseId} LIMIT 1`);
      if (!exists.rows.length) {
        return res.status(404).json({ message: "Release non trovata" });
      }

      // Idempotency: skip duplicate success_count increment within 5-minute window
      // Uses ota_events: if a 'loaded' event for this device+release exists recently, skip increment
      let shouldIncrementCount = true;
      if (safeDeviceId) {
        const recent = await db.execute(sql`SELECT 1 FROM ota_events WHERE phase='loaded' AND source=${safeDeviceId} AND release_id=${safeReleaseId} AND created_at > NOW() - INTERVAL '5 minutes' LIMIT 1`);
        if (recent.rows.length > 0) shouldIncrementCount = false;
      }

      const { otaEvents } = await import("@shared/schema");

      await db.insert(otaEvents).values({
        phase: "loaded",
        source: safeDeviceId ?? "unknown",
        platform: "android",
        runtimeVersion: safeRv ?? undefined,
        releaseId: safeReleaseId,
        currentUpdateId: safeReleaseId,
        failCount: 0,
        ip: clientIp,
      });

      if (shouldIncrementCount) {
        await db.execute(sql`UPDATE ota_releases SET success_count = success_count + 1, updated_at = NOW() WHERE id = ${safeReleaseId}`);
      }

      return res.json({ ok: true, counted: shouldIncrementCount });
    } catch (error) {
      console.error("[ota/heartbeat] Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Task #1590 — OTA stuck-state telemetry.
  // Called by OtaStuckScreen on mount (fire-and-forget from the client).
  // Persists the event in ota_stuck_events for admin visibility.
  app.post("/api/ota/stuck-event", async (req: Request, res: Response) => {
    try {
      const { otaStuckEventSchema } = await import("@shared/schema");
      const bodyParsed = otaStuckEventSchema.safeParse(req.body ?? {});
      if (!bodyParsed.success) {
        return res.status(400).json({ message: bodyParsed.error.issues[0]?.message ?? "Payload non valido" });
      }
      const { deviceId, rollbackCount, stuckSessions, runtimeVersion } = bodyParsed.data;
      const stripNull = (s: string) => s.replace(/\x00/g, "");
      const safeDeviceId = deviceId ? stripNull(String(deviceId)).substring(0, 64) : "unknown";
      const safeRv = runtimeVersion ? stripNull(runtimeVersion).substring(0, 32) : null;
      const safeRollback = rollbackCount ?? 0;
      const safeStuck = stuckSessions ?? 0;

      await db.execute(sql`
        INSERT INTO ota_stuck_events (device_id, rollback_count, stuck_sessions, runtime_version, created_at)
        VALUES (${safeDeviceId}, ${safeRollback}, ${safeStuck}, ${safeRv}, NOW())
      `);
      return res.json({ ok: true });
    } catch (error) {
      console.error("[ota/stuck-event] Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────

  // Task #1356: Pannello admin OTA minimale (3 zone + log modal).
  // Riusa il middleware admin: rifiuta non-admin con una pagina secca,
  // così l'admin browser sa subito perché non vede nulla.
  app.get("/admin/ota", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).session?.userId;
      if (!userId) {
        res.status(401).setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send('<html><body style="background:#000;color:#888;font-family:sans-serif;padding:40px;text-align:center"><h1>401</h1><p>Sessione admin richiesta.</p></body></html>');
      }
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        res.status(403).setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send('<html><body style="background:#000;color:#888;font-family:sans-serif;padding:40px;text-align:center"><h1>403</h1><p>Accesso riservato agli admin.</p></body></html>');
      }
      const templatePath = path.resolve(process.cwd(), "server", "templates", "admin-ota.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.sendFile(templatePath);
    } catch (err) {
      console.error("[admin/ota] error:", err);
      return res.status(500).send("Errore interno");
    }
  });

  // Task #1524: Pannello admin "Counter Visitatori Sito".
  // Stessa logica admin-gate del /admin/ota — risponde con pagina secca a
  // non-admin così è chiaro perché non vede nulla. Il template è statico e
  // chiama gli endpoint REST /api/admin/site-visits*.
  app.get("/admin/visitatori", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).session?.userId;
      if (!userId) {
        res.status(401).setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send('<html><body style="background:#000;color:#888;font-family:sans-serif;padding:40px;text-align:center"><h1>401</h1><p>Sessione admin richiesta.</p></body></html>');
      }
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        res.status(403).setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send('<html><body style="background:#000;color:#888;font-family:sans-serif;padding:40px;text-align:center"><h1>403</h1><p>Accesso riservato agli admin.</p></body></html>');
      }
      const templatePath = path.resolve(process.cwd(), "server", "templates", "admin-visitatori.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.sendFile(templatePath);
    } catch (err) {
      console.error("[admin/visitatori] error:", err);
      return res.status(500).send("Errore interno");
    }
  });

  app.get(["/privacy-policy", "/privacy"], (_req, res) => {
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "privacy-policy.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get(["/terms", "/tos"], (_req, res) => {
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "terms.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get("/delete-account", (_req, res) => {
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "delete-account.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  // SECURITY (Task #1086): Apple review page requires a secret access token.
  // The token is stored in APPLE_REVIEW_PAGE_TOKEN env var and must be
  // provided as ?token=<value> in the URL. Without a valid token the route
  // returns 404 — indistinguishable from a non-existent page.
  //
  // Trade-off: query-param tokens appear in server access logs and browser
  // history. Mitigations applied:
  //   - Minimum 24-char token enforced at startup (short tokens are brute-
  //     forceable from logs; 24 chars of random = 144+ bits of entropy with
  //     a URL-safe base64 set).
  //   - Timing-safe comparison (crypto.timingSafeEqual) to prevent
  //     length/timing oracle attacks against the token value.
  //   - 404 response leaks nothing about the token or the page existence.
  // APPLE_REVIEW_PAGE_TOKEN must be rotated per review cycle and shared
  // exclusively via App Store Connect review notes (never in code/commits).
  app.get("/apple-review", (req, res) => {
    const pageToken = process.env.APPLE_REVIEW_PAGE_TOKEN;
    const provided = typeof req.query.token === "string" ? req.query.token : "";
    const MIN_TOKEN_LEN = 24;
    let valid = false;
    if (pageToken && pageToken.length >= MIN_TOKEN_LEN && provided.length > 0) {
      try {
        const a = Buffer.from(pageToken);
        const b = Buffer.from(provided.padEnd(pageToken.length, "\0").substring(0, pageToken.length));
        valid = a.length === b.length && crypto.timingSafeEqual(a, b) && provided === pageToken;
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      return res.status(404).send("Not found");
    }
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "apple-review.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get("/api/settings/privacy-policy", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("privacy_policy_text");
      const text = setting?.value || "";
      res.json({ text });
    } catch {
      res.json({ text: "" });
    }
  });

  app.get("/api/settings/email-verification", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("email_verification_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/ads-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ads_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/syneco-branding", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("syneco_branding_visible");
      const visible = setting?.value === "true";
      res.json({ visible });
    } catch {
      res.json({ visible: false });
    }
  });

  app.get("/api/settings/chatbot-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("chatbot_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/fake-users-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("fake_users_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/sos-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("sos_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/phone-sensors-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("phone_sensors_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/custom-routes", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("custom_routes_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/auto-matching", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("auto_matching_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-match", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_match_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-export-playlist", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_export_playlist_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-import-playlist", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_import_playlist_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/primal-user", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("primal_user_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/paypal", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("paypal_email");
      const email = setting?.value || "";
      res.json({ email });
    } catch {
      res.json({ email: "" });
    }
  });

  app.get("/api/settings/ghost-mode-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ghost_mode_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/marketplace-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("marketplace_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/gps-required", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("gps_required");
      res.json({ required: setting?.value !== "false" });
    } catch {
      res.json({ required: true });
    }
  });

  app.get("/api/settings/motoclub-include-zav", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("motoclub_include_zav");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/motoclub-user-creation", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("motoclub_user_creation_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/show-search-preference", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("show_search_preference");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/search-preference-locked", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("search_preference_locked");
      res.json({ locked: setting?.value === "true" });
    } catch {
      res.json({ locked: false });
    }
  });

  app.get("/api/settings/coordinate-history", async (_req, res) => {
    try {
      const [enabled, interval, maxRecords, mode, selectedUsers] = await Promise.all([
        storage.getAppSetting("coordinate_history_enabled"),
        storage.getAppSetting("coordinate_history_interval"),
        storage.getAppSetting("coordinate_history_max_records"),
        storage.getAppSetting("coordinate_history_mode"),
        storage.getAppSetting("coordinate_history_users"),
      ]);
      res.json({
        enabled: enabled?.value === "true",
        interval: interval?.value ? parseInt(interval.value, 10) : 30,
        maxRecords: maxRecords?.value ? parseInt(maxRecords.value, 10) : 60,
        mode: mode?.value || "all",
        selectedUsers: selectedUsers?.value ? JSON.parse(selectedUsers.value) : [],
      });
    } catch {
      res.json({ enabled: false, interval: 30, maxRecords: 60, mode: "all", selectedUsers: [] });
    }
  });

  app.get("/api/settings/coordinates-max-age", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("coordinates_max_age_seconds");
      const seconds = setting?.value ? parseInt(setting.value, 10) : 300;
      res.json({ seconds: isNaN(seconds) || seconds < 10 ? 300 : seconds });
    } catch {
      res.json({ seconds: 300 });
    }
  });

  app.get("/api/settings/profile-refetch-interval", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("profile_refetch_interval");
      const seconds = setting?.value ? parseInt(setting.value, 10) : 30;
      res.json({ seconds: isNaN(seconds) || seconds < 5 ? 30 : seconds });
    } catch {
      res.json({ seconds: 30 });
    }
  });

  app.get("/api/settings/theme", async (_req, res) => {
    try {
      const [switchingSetting, defaultSetting] = await Promise.all([
        storage.getAppSetting("theme_user_switching_enabled"),
        storage.getAppSetting("theme_default"),
      ]);
      const userSwitchingEnabled = switchingSetting?.value === "true";
      const defaultTheme = defaultSetting?.value || "attuale";
      res.json({ userSwitchingEnabled, defaultTheme });
    } catch {
      res.json({ userSwitchingEnabled: false, defaultTheme: "attuale" });
    }
  });

  app.get("/api/users/search", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const { q } = req.query as { q?: string };
      if (!q || q.trim().length < 2) return res.json([]);
      const results = await db
        .select({ id: users.id, nickname: users.nickname, userType: users.userType })
        .from(users)
        .where(ilike(users.nickname, `%${q.trim()}%`))
        .limit(30);
      return res.json(results);
    } catch {
      return res.status(500).json({ message: "Errore interno" });
    }
  });

  app.get("/api/settings/phone-field-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("phone_field_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/user-available-on-login", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("user_available_on_login");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/ota-gate-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ota_gate_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/ota-wait-seconds", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ota_wait_seconds");
      const seconds = parseInt(setting?.value || "10", 10);
      res.json({ seconds: isNaN(seconds) ? 10 : Math.max(0, seconds) });
    } catch {
      res.json({ seconds: 10 });
    }
  });

  app.get("/api/settings/home-message", async (_req, res) => {
    try {
      const [enabledSetting, textSetting] = await Promise.all([
        storage.getAppSetting("home_message_enabled"),
        storage.getAppSetting("home_message_text"),
      ]);
      res.json({
        enabled: enabledSetting?.value === "true",
        text: textSetting?.value || "",
      });
    } catch {
      res.json({ enabled: false, text: "" });
    }
  });

  app.get("/api/settings/donation", async (_req, res) => {
    try {
      const [enabledSetting, textSetting, paypalSetting] = await Promise.all([
        storage.getAppSetting("donation_enabled"),
        storage.getAppSetting("donation_text"),
        storage.getAppSetting("paypal_email"),
      ]);
      res.json({
        enabled: enabledSetting?.value === "true",
        text: textSetting?.value || "",
        paypalEmail: paypalSetting?.value || "",
      });
    } catch {
      res.json({ enabled: false, text: "", paypalEmail: "" });
    }
  });

  app.get("/api/settings/native-version", async (_req, res) => {
    try {
      const [androidLatest, androidMin, androidUrl, iosLatest, iosMin, iosUrl] = await Promise.all([
        storage.getAppSetting("native_android_latest"),
        storage.getAppSetting("native_android_min"),
        storage.getAppSetting("native_android_store_url"),
        storage.getAppSetting("native_ios_latest"),
        storage.getAppSetting("native_ios_min"),
        storage.getAppSetting("native_ios_store_url"),
      ]);
      return res.json({
        android: {
          latestVersion: androidLatest?.value || "1.0.0",
          minVersion: androidMin?.value || "1.0.0",
          storeUrl: androidUrl?.value || "https://play.google.com/store/apps/details?id=com.bikerlink.app",
        },
        ios: {
          latestVersion: iosLatest?.value || "1.0.0",
          minVersion: iosMin?.value || "1.0.0",
          storeUrl: iosUrl?.value || "https://apps.apple.com/app/bikerlink",
        },
      });
    } catch {
      return res.json({
        android: { latestVersion: "1.0.0", minVersion: "1.0.0", storeUrl: "https://play.google.com/store/apps/details?id=com.bikerlink.app" },
        ios: { latestVersion: "1.0.0", minVersion: "1.0.0", storeUrl: "https://apps.apple.com/app/bikerlink" },
      });
    }
  });

  app.get("/api/settings/splash", async (_req, res) => {
    try {
      const [modeSetting, messageSetting, listSetting] = await Promise.all([
        storage.getAppSetting("splash_message_mode"),
        storage.getAppSetting("splash_message"),
        storage.getAppSetting("splash_messages_list"),
      ]);
      const mode = modeSetting?.value || "single";
      const message = messageSetting?.value || "";
      let list: string[] = [];
      try {
        list = JSON.parse(listSetting?.value || "[]");
      } catch {}
      res.json({ mode, message, list });
    } catch {
      res.json({ mode: "single", message: "", list: [] });
    }
  });

  app.get("/api/settings/maps", async (_req, res) => {
    try {
      const [enabledSetting, providerSetting] = await Promise.all([
        storage.getAppSetting("maps_enabled"),
        storage.getAppSetting("maps_provider"),
      ]);
      res.json({
        enabled: enabledSetting?.value !== "false",
        provider: providerSetting?.value || "carto_light",
      });
    } catch {
      res.json({ enabled: true, provider: "carto_light" });
    }
  });

  app.get("/api/settings/maps-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("maps_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/maps-provider", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("maps_provider");
      res.json({ provider: setting?.value || "carto_light" });
    } catch {
      res.json({ provider: "carto_light" });
    }
  });

  app.get("/api/settings/bg-location", async (_req, res) => {
    try {
      const [enabled, trigger, interval, notificationText, ghostModeContinue] = await Promise.all([
        storage.getAppSetting("bg_location_enabled"),
        storage.getAppSetting("bg_location_trigger"),
        storage.getAppSetting("bg_location_interval_seconds"),
        storage.getAppSetting("bg_location_notification_text"),
        storage.getAppSetting("bg_location_ghost_mode_continue"),
      ]);
      res.json({
        enabled: enabled?.value !== "false",
        trigger: trigger?.value || "always",
        intervalSeconds: interval?.value ? parseInt(interval.value, 10) : 30,
        notificationText: notificationText?.value || "BikerLink: {motivo} — posizione attiva in background",
        ghostModeContinue: ghostModeContinue?.value === "true",
      });
    } catch {
      res.json({
        enabled: true,
        trigger: "always",
        intervalSeconds: 30,
        notificationText: "BikerLink: {motivo} — posizione attiva in background",
        ghostModeContinue: false,
      });
    }
  });

  app.post("/api/location/bg-update", async (req: any, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "Non autenticato" });
      }
      const userId: string = req.session.userId;
      const { latitude, longitude, altitude, accuracy, timestamp, activeRouteId, isSosActive, isGhostMode } = req.body;
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return res.status(400).json({ message: "Coordinate non valide" });
      }
      try {
        const profileUpdate: any = { latitude, longitude, coordinatesUpdatedAt: new Date() };
        const existing = await storage.getUserProfile(userId);
        if (existing) {
          await storage.updateUserProfile(userId, profileUpdate);
        }
        storage.saveCoordinateHistory(userId, latitude, longitude).catch(() => {});
      } catch {}

      if (activeRouteId && typeof activeRouteId === "string") {
        try {
          const route = await storage.getRoute(activeRouteId);
          if (route && route.userId === userId && route.status === "active") {
            const point: any = {
              routeId: activeRouteId,
              latitude,
              longitude,
              altitude: typeof altitude === "number" ? altitude : null,
              speedKmh: null,
              timestamp: timestamp ? new Date(timestamp) : new Date(),
            };
            await storage.createRoutePoints([point]);
          }
        } catch {}
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("BG location update error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.get("/api/settings/floating-widget", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("floating_widget_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/all", async (_req, res) => {
    try {
      const [syneco, emailVerification, chatbot, autoMatching, customRoutes, paypal, sosEnabled, mapsEnabled, mapsProvider, unitsPref] = await Promise.all([
        storage.getAppSetting("syneco_branding_visible"),
        storage.getAppSetting("email_verification_enabled"),
        storage.getAppSetting("chatbot_enabled"),
        storage.getAppSetting("auto_matching_enabled"),
        storage.getAppSetting("custom_routes_enabled"),
        storage.getAppSetting("paypal_email"),
        storage.getAppSetting("sos_enabled"),
        storage.getAppSetting("maps_enabled"),
        storage.getAppSetting("maps_provider"),
        storage.getAppSetting("units_preference_enabled"),
      ]);
      res.json({
        synecoBranding: syneco?.value === "true",
        emailVerification: emailVerification?.value === "true",
        chatbotEnabled: chatbot?.value !== "false",
        autoMatching: autoMatching?.value !== "false",
        customRoutes: customRoutes?.value !== "false",
        paypalEmail: paypal?.value || "",
        sosEnabled: sosEnabled?.value !== "false",
        mapsEnabled: mapsEnabled?.value !== "false",
        mapsProvider: mapsProvider?.value || "carto_light",
        unitsPrefEnabled: unitsPref?.value === "true",
      });
    } catch {
      res.json({
        synecoBranding: false,
        emailVerification: false,
        chatbotEnabled: true,
        autoMatching: true,
        customRoutes: true,
        paypalEmail: "",
        sosEnabled: true,
        mapsEnabled: true,
        mapsProvider: "carto_light",
        unitsPrefEnabled: false,
      });
    }
  });

  const MANUAL_PATH = path.resolve(process.cwd(), "server/public/bikerlink-manual.pdf");
  const MANUAL_DIR = path.dirname(MANUAL_PATH);
  const EULA_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-eula.pdf");
  const PRIVACY_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-privacy-policy.pdf");

  const COMPETITOR_PDF_PATH = path.resolve(process.cwd(), "server/public/assets/competitor-analysis.pdf");
  const COMPETITOR_PNG_PATH = path.resolve(process.cwd(), "server/public/assets/competitor-analysis.png");
  const MATCHING_PDF_PATH = path.resolve(process.cwd(), "server/public/matching-system.pdf");

  app.get("/matching-system.pdf", (_req, res) => {
    if (!fs.existsSync(MATCHING_PDF_PATH)) {
      return res.status(404).json({ message: "File non disponibile" });
    }
    res.setHeader("Content-Disposition", 'inline; filename="BikerLink-MatchingSystem.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    fs.createReadStream(MATCHING_PDF_PATH).pipe(res);
  });

  app.get("/assets/competitor-analysis.pdf", (_req, res) => {
    if (!fs.existsSync(COMPETITOR_PDF_PATH)) {
      return res.status(404).json({ message: "File non disponibile" });
    }
    res.setHeader("Content-Disposition", 'inline; filename="competitor-analysis.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    fs.createReadStream(COMPETITOR_PDF_PATH).pipe(res);
  });

  app.get("/assets/competitor-analysis.png", (_req, res) => {
    if (!fs.existsSync(COMPETITOR_PNG_PATH)) {
      return res.status(404).json({ message: "File non disponibile" });
    }
    res.setHeader("Content-Type", "image/png");
    fs.createReadStream(COMPETITOR_PNG_PATH).pipe(res);
  });

  app.get("/api/manual/download", (_req, res) => {
    if (!fs.existsSync(MANUAL_PATH)) {
      return res.status(404).json({ message: "Manuale non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-Manual.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(MANUAL_PATH);
    stream.on("error", (err) => {
      console.error("Manual stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Errore lettura file" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });

  app.get("/api/manual/info", (_req, res) => {
    if (!fs.existsSync(MANUAL_PATH)) {
      return res.json({ available: false });
    }
    const stats = fs.statSync(MANUAL_PATH);
    res.json({
      available: true,
      fileName: "BikerLink-Manual.pdf",
      fileSize: stats.size,
      lastModified: stats.mtime.toISOString(),
    });
  });

  const manualUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-manual.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.post("/api/admin/manual/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });

    manualUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = fs.statSync(MANUAL_PATH);
      res.json({
        message: "Manuale aggiornato con successo",
        fileName: "BikerLink-Manual.pdf",
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
      });
    });
  });

  const eulaUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-eula.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  const privacyUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-privacy-policy.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.get("/api/eula/download", (_req, res) => {
    if (!fs.existsSync(EULA_PDF_PATH)) {
      return res.status(404).json({ message: "EULA non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-EULA.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(EULA_PDF_PATH);
    stream.on("error", (err) => {
      console.error("EULA stream error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore lettura file" });
      else res.end();
    });
    stream.pipe(res);
  });

  app.get("/api/eula/info", (_req, res) => {
    if (!fs.existsSync(EULA_PDF_PATH)) return res.json({ available: false });
    const stats = fs.statSync(EULA_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });

  app.post("/api/admin/eula/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });

    eulaUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = fs.statSync(EULA_PDF_PATH);
      res.json({ message: "EULA aggiornato con successo", fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
    });
  });

  app.get("/api/privacy-policy/download", (_req, res) => {
    if (!fs.existsSync(PRIVACY_PDF_PATH)) {
      return res.status(404).json({ message: "Privacy Policy non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-PrivacyPolicy.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(PRIVACY_PDF_PATH);
    stream.on("error", (err) => {
      console.error("Privacy Policy stream error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore lettura file" });
      else res.end();
    });
    stream.pipe(res);
  });

  app.get("/api/privacy-policy/info", (_req, res) => {
    if (!fs.existsSync(PRIVACY_PDF_PATH)) return res.json({ available: false });
    const stats = fs.statSync(PRIVACY_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });

  app.get("/api/privacy-policy/exists", (_req, res) => {
    res.json({ exists: fs.existsSync(PRIVACY_PDF_PATH) });
  });

  const PRIVACY_EXPORT_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-privacy-policy-export.pdf");

  app.get("/api/privacy-policy/export", async (_req, res) => {
    try {
      const PDFDocument = require("pdfkit") as typeof import("pdfkit");
      const publicDir = path.dirname(PRIVACY_EXPORT_PDF_PATH);
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: "A4" });
        const writeStream = fs.createWriteStream(PRIVACY_EXPORT_PDF_PATH);
        doc.pipe(writeStream);

        const lines = PRIVACY_POLICY_IT.split("\n");
        const titleLine = lines[0];
        const dateLine = lines[2];
        const bodyText = lines.slice(4).join("\n");

        doc.fontSize(16).font("Helvetica-Bold").text(titleLine, { align: "center" });
        doc.moveDown(0.4);
        doc.fontSize(10).font("Helvetica").text(dateLine, { align: "center" });
        doc.moveDown(1.2);
        doc.fontSize(10).font("Helvetica").text(bodyText, { align: "left", lineGap: 3 });

        doc.end();
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-PrivacyPolicy-Export.pdf"');
      res.setHeader("Content-Type", "application/pdf");
      const stream = fs.createReadStream(PRIVACY_EXPORT_PDF_PATH);
      stream.on("error", (err) => {
        console.error("Privacy export stream error:", err);
        if (!res.headersSent) res.status(500).json({ message: "Errore lettura file" });
        else res.end();
      });
      stream.pipe(res);
    } catch (err) {
      console.error("Privacy Policy PDF export error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore generazione PDF" });
    }
  });

  app.post("/api/admin/privacy-policy/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });

    privacyUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = fs.statSync(PRIVACY_PDF_PATH);
      res.json({ message: "Privacy Policy aggiornata con successo", fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
    });
  });

  app.get("/api/user/export-data", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });

    const userId = user.id;

    const [photos, gpsRoutes, sentMessagesResult, contestResult] = await Promise.all([
      storage.getUserPhotos(userId),
      storage.getRoutes(userId),
      db.execute(sql`
        SELECT m.id AS message_id, m.conversation_id, m.message_type, m.content,
               m.image_url, m.latitude, m.longitude, m.created_at
        FROM messages m
        WHERE m.sender_id = ${userId}
        ORDER BY m.created_at DESC
      `),
      db.execute(sql`
        SELECT id, photo_url, caption, week_number, year, votes_count, is_approved, created_at
        FROM photo_contest_entries
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        phone: user.phone ?? null,
        userType: user.userType,
        sex: user.sex ?? null,
        birthYear: user.birthYear ?? null,
        country: user.country ?? null,
        region: user.region ?? null,
        role: user.role,
        status: user.status,
        eulaAccepted: user.eulaAccepted,
        privacyAccepted: user.privacyAccepted,
        consentAcceptedAt: user.consentAcceptedAt ?? null,
        createdAt: user.createdAt ?? null,
      },
      photos: photos.map((p) => ({
        id: p.id,
        photoUrl: p.photoUrl,
        sortOrder: p.sortOrder,
        isApproved: p.isApproved,
        uploadedAt: p.createdAt,
      })),
      gpsRoutes: gpsRoutes.map((r) => ({
        id: r.id,
        title: r.title ?? null,
        status: r.status,
        totalDistanceKm: r.totalDistanceKm ?? 0,
        durationSeconds: r.durationSeconds ?? 0,
        startedAt: r.startedAt,
        stoppedAt: r.stoppedAt ?? null,
        createdAt: r.createdAt,
      })),
      sentMessages: sentMessagesResult.rows.map((m) => ({
        id: m.message_id,
        conversationId: m.conversation_id,
        messageType: m.message_type,
        content: m.content ?? null,
        imageUrl: m.image_url ?? null,
        latitude: m.latitude ?? null,
        longitude: m.longitude ?? null,
        sentAt: m.created_at,
      })),
      contestEntries: contestResult.rows.map((e) => ({
        id: e.id,
        photoUrl: e.photo_url ?? null,
        caption: e.caption ?? null,
        weekNumber: e.week_number,
        year: e.year,
        votesReceived: e.votes_count,
        isApproved: e.is_approved,
        submittedAt: e.created_at,
      })),
    };

    const json = JSON.stringify(exportData, null, 2);
    const filename = `BikerLink-UserData-${user.nickname}-${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(json);
  });

  app.post("/api/matching/trigger", (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const userId = req.session.userId;
    triggerMatchingForUser(userId);
    const result = triggerMatchingRun();
    res.json({ ok: true, ...result });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", initializing: initState.initializing });
  });

  app.get("/api/admin/uptime", requireAdmin, async (_req, res) => {
    const { SERVER_START_TIME, uptimeState } = await import("./uptime");
    res.json({
      backendStartedAt: SERVER_START_TIME,
      metroStartedAt: uptimeState.metroStartTime,
      metroLastSeenAt: uptimeState.metroLastSeenAt,
      metroOnline: uptimeState.metroOnline,
      frontendStartTime: uptimeState.frontendStartTime,
      serverNow: Date.now(),
    });
  });

  app.get("/api/admin/system-health", requireAdmin, async (_req, res) => {
    const { SERVER_START_TIME, uptimeState } = await import("./uptime");
    const now = Date.now();
    const backendUptimeSec = Math.floor((now - SERVER_START_TIME) / 1000);
    const metroUptimeSec = uptimeState.metroOnline && uptimeState.metroStartTime > 0
      ? Math.floor((now - uptimeState.metroStartTime) / 1000)
      : 0;

    const events: { timestamp: string; message: string; type: string }[] = [];
    try {
      const fs = await import("fs");
      const path = await import("path");
      const logPath = path.join(process.cwd(), "logs", "uptime-resets.log");
      if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
        for (const line of lines) {
          const spaceIdx = line.indexOf(" ");
          if (spaceIdx === -1) continue;
          const timestamp = line.slice(0, spaceIdx);
          const message = line.slice(spaceIdx + 1);
          let type = "INFO";
          if (message.startsWith("BACKEND UP (cold start)")) type = "COLD_START";
          else if (message.startsWith("BACKEND RESTART")) type = "BACKEND_RESTART";
          else if (message.startsWith("METRO UP")) type = "METRO_UP";
          else if (message.startsWith("METRO DOWN")) type = "METRO_DOWN";
          events.push({ timestamp, message, type });
        }
        events.reverse();
      }
    } catch {}

    res.json({
      backendStartedAt: SERVER_START_TIME,
      backendUptimeSec,
      metroOnline: uptimeState.metroOnline,
      metroStartedAt: uptimeState.metroStartTime,
      metroUptimeSec,
      events,
    });
  });

  app.get("/api/admin/restart-history", requireAdmin, async (_req, res) => {
    const { db } = await import("./db");
    const { serverRestarts } = await import("@shared/schema");
    const { desc, count } = await import("drizzle-orm");
    const [countResult, rows] = await Promise.all([
      db.select({ count: count() }).from(serverRestarts),
      db.select().from(serverRestarts).orderBy(desc(serverRestarts.startedAt)).limit(50),
    ]);
    res.json({
      total: countResult[0]?.count ?? 0,
      restarts: rows.map((r) => ({
        id: r.id,
        startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
        reason: r.reason,
      })),
    });
  });

  setInterval(async () => {
    try {
      const deleted = await storage.cleanupOldCoordinateHistory();
      if (deleted > 0) {
        console.log(`[CoordinateHistory] Pulizia: rimossi ${deleted} record`);
      }
    } catch (err) {
      console.error("[CoordinateHistory] Cleanup error:", err);
    }
  }, 5 * 60 * 1000);

  app.post("/api/admin/client-error", async (req, res) => {
    try {
      const { clientErrorReportSchema } = await import("@shared/schema");
      const bodyParsed = clientErrorReportSchema.safeParse(req.body ?? {});
      if (!bodyParsed.success) {
        return res.status(400).json({ message: bodyParsed.error.issues[0]?.message ?? "Payload non valido" });
      }
      const { message, stack, componentStack, platform, appVersion } = bodyParsed.data;
      console.error("[CLIENT-ERROR]", JSON.stringify({
        message: message || "unknown",
        stack: (stack || "").substring(0, 2000),
        componentStack: (componentStack || "").substring(0, 1000),
        platform: platform || "unknown",
        appVersion: appVersion || "unknown",
        timestamp: new Date().toISOString(),
      }));
      return res.json({ received: true });
    } catch {
      res.status(200).json({ received: true });
    }
  });

  // ── GET /api/stats/public — real user counts for landing page (no auth) ───
  app.get("/api/stats/public", async (_req, res) => {
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE is_fake = false AND status = 'active' AND COALESCE(role, 'user') != 'admin') AS total,
          COUNT(*) FILTER (WHERE is_fake = false AND status = 'active' AND COALESCE(role, 'user') != 'admin' AND last_login_at >= ${fiveMinAgo}) AS online
        FROM users
      `);
      const row = result.rows[0] as { total: string; online: string } | undefined;
      res.json({
        total: parseInt(row?.total ?? "0", 10),
        online: parseInt(row?.online ?? "0", 10),
      });
    } catch (err) {
      console.error("[stats/public] error:", err);
      res.status(500).json({ total: 0, online: 0 });
    }
  });

  // ── GET /api/stats/global — public stats for landing page ─────────────────
  app.get("/api/stats/global", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE user_type = 'biker') AS bikers,
          COUNT(*) FILTER (WHERE user_type = 'zavorrina') AS zavorrine
        FROM users
        WHERE role != 'admin'
      `);
      const row = result.rows[0] as { total: string; bikers: string; zavorrine: string } | undefined;
      res.json({
        total: parseInt(row?.total ?? "0", 10),
        bikers: parseInt(row?.bikers ?? "0", 10),
        zavorrine: parseInt(row?.zavorrine ?? "0", 10),
      });
    } catch (err) {
      console.error("[stats/global] error:", err);
      res.json({ total: 5000, bikers: 3200, zavorrine: 1800 });
    }
  });

  // ── POST /api/newsletter/subscribe ────────────────────────────────────────
  app.post("/api/newsletter/subscribe", async (req, res) => {
    try {
      const { email, notifyRides } = req.body || {};
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "Email non valida" });
      }
      const normalizedEmail = email.trim().toLowerCase().slice(0, 254);
      const existing = await db.execute(sql`
        SELECT id FROM newsletter_subscribers WHERE email = ${normalizedEmail} LIMIT 1
      `);
      if (existing.rows.length > 0) {
        return res.status(409).json({ message: "Già iscritto" });
      }
      await db.execute(sql`
        INSERT INTO newsletter_subscribers (email, notify_rides)
        VALUES (${normalizedEmail}, ${notifyRides !== false})
      `);
      return res.json({ success: true });
    } catch (err) {
      console.error("[newsletter/subscribe] error:", err);
      return res.status(500).json({ message: "Errore interno" });
    }
  });

  // ── GET /roadmap.json — serve roadmap from server/public ─────────────────
  app.get("/roadmap.json", (_req, res) => {
    const filePath = path.join(process.cwd(), "server", "public", "roadmap.json");
    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.sendFile(filePath);
    } else {
      res.json([]);
    }
  });

  const httpServer = createServer(app);

  import("./backup-service").then(({ startScheduler }) => {
    startScheduler().catch((err) => {
      console.error("[backup-service] Failed to start scheduler:", err);
    });
  }).catch(() => {});

  import("./sync-service").then(({ startSyncScheduler }) => {
    startSyncScheduler();
  }).catch(() => {});

  const { publicRouter: crashLogsPublic, adminRouter: crashLogsAdmin } = await import("./routes/crash-logs");
  app.use("/api/crash-logs", crashLogsPublic);
  app.use("/api/admin/crash-logs", crashLogsAdmin);

  return httpServer;
}
