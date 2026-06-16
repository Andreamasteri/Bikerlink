import express from "express";
import type { Request, Response } from "express";
import type { Express } from "express-serve-static-core";
import * as fs from "fs";
import * as path from "path";
import { registerRoutes } from "./routes";
import { registerSiteRoutes } from "./site/routes";
import { registerLeafletMapRoutes } from "./routes/leaflet-maps";
import tileProxyRouter from "./routes/maps/tile-proxy";
import { storage } from "./storage";

const log = console.log;

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

  if (!forceLive && staticBundleExists(platform)) {
    try {
      const manifest = readStaticManifest(platform);
      log(`[manifest] Serving local static bundle for ${platform}`);
      return res.send(JSON.stringify(manifest));
    } catch (err) {
      console.error("[manifest] static read error:", err);
    }
  }

  try {
    const manifest = await fetchMetroManifest(platform);
    log(`[manifest] Serving live Metro manifest for ${platform}`);
    return res.send(JSON.stringify(manifest));
  } catch {
    // Metro not available
  }

  return res.status(503).json({ error: `Bundle non disponibile per ${platform}. Riprova tra qualche secondo.` });
}

export function registerAllRoutes(app: express.Application) {
  const expressApp = app as unknown as Express;
  
  // API Routes
  registerRoutes(expressApp);

  // Tile proxy — forwards tile requests, detects 429/5xx from upstream
  app.use("/api", tileProxyRouter);

  // Leaflet map HTML endpoints (served as URI to avoid large inline source={{ html }})
  registerLeafletMapRoutes(expressApp);

  // Expo Manifest and Landing/Site Routes
  app.use((req, res, next) => {
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
        if (!res.headersSent) res.status(500).json({ error: "Errore interno" });
      });
    }

    next();
  });

  registerSiteRoutes(expressApp);

  // APK and Config routes
  app.get("/api/download/apk/status", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("apk_download_url");
      const apkUrl = (setting?.value?.trim()) || process.env.APK_DOWNLOAD_URL;
      return res.json({ available: !!apkUrl });
    } catch {
      const apkUrl = process.env.APK_DOWNLOAD_URL;
      return res.json({ available: !!apkUrl });
    }
  });

  app.get("/api/download/apk/latest", async (_req, res) => {
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

  app.get("/api/config", async (_req, res) => {
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

  // Web Portal SPA routes
  const webPortalPath = path.resolve(process.cwd(), "server", "templates", "web-portal.html");
  let webPortalHtml: string | null = null;
  function getWebPortalHtml(): string {
    if (!webPortalHtml) {
      webPortalHtml = fs.readFileSync(webPortalPath, "utf8");
    }
    const expoWebUrl = process.env.EXPO_WEB_URL || "";
    const injection = `<script>window.EXPO_WEB_URL=${JSON.stringify(expoWebUrl)};</script>`;
    return webPortalHtml.replace("</head>", `${injection}\n</head>`);
  }

  // /docs and /docs/* — dedicated routes with per-topic SEO meta tags.
  function serveDocsPage(
    req: Request,
    res: Response,
    title: string,
    description: string,
    urlPath: string,
  ) {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "bikerlink.app";
    const baseUrl = `${proto}://${host}`;
    const metaInjection = [
      `<title>${title}</title>`,
      `<meta name="description" content="${description}"/>`,
      `<meta property="og:title" content="${title}"/>`,
      `<meta property="og:description" content="${description}"/>`,
      `<meta property="og:url" content="${baseUrl}${urlPath}"/>`,
      `<meta property="og:type" content="website"/>`,
      `<meta property="og:image" content="${baseUrl}/assets/images/og-default.png"/>`,
      `<meta name="twitter:card" content="summary_large_image"/>`,
      `<meta name="twitter:title" content="${title}"/>`,
      `<meta name="twitter:description" content="${description}"/>`,
    ].join("\n  ");
    const expoWebUrl = process.env.EXPO_WEB_URL || "";
    const scriptInjection = `<script>window.EXPO_WEB_URL=${JSON.stringify(expoWebUrl)};</script>`;
    const baseHtml = webPortalHtml || fs.readFileSync(webPortalPath, "utf8");
    const html = baseHtml
      .replace(/<title>.*?<\/title>/, "")
      .replace(/<meta name="description"[^>]*\/?>/, "")
      .replace("</head>", `  ${metaInjection}\n  ${scriptInjection}\n</head>`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(html);
  }

  app.get("/docs", (req, res) => {
    serveDocsPage(
      req, res,
      "BikerLink Docs — Guida e documentazione per motociclisti",
      "Documentazione ufficiale di BikerLink: guida all'app, funzionalità matching, MotoClub, SOS biker, percorsi e telemetria. Tutto quello che devi sapere per usare BikerLink al meglio.",
      "/docs",
    );
  });

  app.get("/docs/matching", (req, res) => {
    serveDocsPage(
      req, res,
      "BikerLink Docs — Matching AI tra motociclisti",
      "Come funziona il sistema di matching AI di BikerLink: algoritmo, punteggi di compatibilità, telemetria reale e criteri di abbinamento tra biker.",
      "/docs/matching",
    );
  });

  app.get("/docs/sos", (req, res) => {
    serveDocsPage(
      req, res,
      "BikerLink Docs — Sistema SOS Biker",
      "Documentazione del sistema SOS Biker di BikerLink: segnalazione emergenze stradali, allerta automatica dei contatti e gestione degli incidenti in tempo reale.",
      "/docs/sos",
    );
  });

  app.get("/docs/motoclub", (req, res) => {
    serveDocsPage(
      req, res,
      "BikerLink Docs — MotoClub",
      "Guida completa ai MotoClub su BikerLink: creazione di club, gestione dei membri, codici invito, chat di gruppo e funzionalità dedicate ai gruppi moto.",
      "/docs/motoclub",
    );
  });

  app.get("/docs/percorsi", (req, res) => {
    serveDocsPage(
      req, res,
      "BikerLink Docs — Percorsi e navigazione GPS",
      "Documentazione dei percorsi moto su BikerLink: pianificazione curvy routing, navigazione GPS, profili di guida, suggerimenti AI e condivisione giri.",
      "/docs/percorsi",
    );
  });

  app.get("/docs/telemetria", (req, res) => {
    serveDocsPage(
      req, res,
      "BikerLink Docs — Telemetria di guida",
      "Come BikerLink raccoglie e usa la telemetria di guida: velocità in curva, inclinazione, stile di guida, dati GPS reali e loro impatto sul matching e sui percorsi.",
      "/docs/telemetria",
    );
  });

  app.get("/docs/api", (req, res) => {
    serveDocsPage(
      req, res,
      "BikerLink Docs — Riferimento API",
      "Riferimento API tecnico di BikerLink per sviluppatori: endpoint pubblici, autenticazione, formato delle risposte e integrazione con il sistema di matching e percorsi.",
      "/docs/api",
    );
  });

  const webPortalRoutes = ["/registrati", "/accedi", "/area-utente", "/media", "/admin/media", "/admin/settings"];
  for (const route of webPortalRoutes) {
    app.get(route, (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(getWebPortalHtml());
    });
  }

  // AI Trip Planner page
  const pianificaPath = path.resolve(process.cwd(), "server", "templates", "pianifica.html");
  app.get("/pianifica", (req, res) => {
    const userId = (req.session as { userId?: string })?.userId;
    if (!userId) {
      return res.redirect(302, "/accedi?next=/pianifica");
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(pianificaPath);
  });

  // Live diagnostics dashboard (admin only — requires active admin session)
  const diagnosticsLivePath = path.resolve(process.cwd(), "server", "templates", "diagnostics-live.html");
  app.get("/admin/diagnostics/live", async (req, res) => {
    // Session-based access (browser with active admin session)
    const userId = (req.session as { userId?: string })?.userId;
    if (!userId) {
      return res.redirect(302, "/accedi?next=/admin/diagnostics/live");
    }
    try {
      const { storage: appStorage } = await import("./storage");
      const user = await appStorage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).send("Accesso riservato agli amministratori.");
      }
    } catch {
      return res.status(500).send("Errore interno.");
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(diagnosticsLivePath);
  });
}
