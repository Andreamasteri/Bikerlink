import express from "express";
import type { Request, Response } from "express";
import type { Express } from "express-serve-static-core";
import * as fs from "fs";
import * as path from "path";
import { registerRoutes } from "./routes";
import { registerSiteRoutes } from "./site/routes";
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
        if (!res.headersSent) res.status(500).json({ error: "Internal error" });
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
    const userId = (req.session as any)?.userId as string | undefined;
    if (!userId) {
      return res.redirect(302, "/accedi?next=/pianifica");
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(pianificaPath);
  });
}
