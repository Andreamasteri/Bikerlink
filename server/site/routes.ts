import type { Express, Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { db } from "../db";
import { users } from "@shared/schema";
import { sql } from "drizzle-orm";
import { renderPage, getBaseUrl } from "./render";
import { ensureVisitorId, recordVisit } from "../lib/visitor-tracking";
import {
  buildHome,
  buildFeatures,
  buildSos,
  buildMotoclub,
  buildCommunity,
  buildDownload,
  buildAbout,
  buildFaq,
  buildContact,
} from "./pages";

type Builder = (baseUrl: string) => {
  meta: ReturnType<typeof buildHome>["meta"];
  body: string;
};

const PAGES: { route: string; build: Builder; sitemap: { priority: number; changefreq: string } }[] = [
  { route: "/", build: buildHome, sitemap: { priority: 1.0, changefreq: "weekly" } },
  { route: "/features", build: buildFeatures, sitemap: { priority: 0.8, changefreq: "monthly" } },
  { route: "/sos", build: buildSos, sitemap: { priority: 0.8, changefreq: "monthly" } },
  { route: "/motoclub", build: buildMotoclub, sitemap: { priority: 0.8, changefreq: "monthly" } },
  { route: "/community", build: buildCommunity, sitemap: { priority: 0.8, changefreq: "weekly" } },
  { route: "/download", build: buildDownload, sitemap: { priority: 0.9, changefreq: "weekly" } },
  { route: "/about", build: buildAbout, sitemap: { priority: 0.6, changefreq: "monthly" } },
  { route: "/faq", build: buildFaq, sitemap: { priority: 0.6, changefreq: "monthly" } },
  { route: "/contact", build: buildContact, sitemap: { priority: 0.6, changefreq: "yearly" } },
];

const STATIC_HTML_PAGES: Record<string, string> = {
  "/privacy": "privacy-policy.html",
  "/terms": "terms.html",
  "/delete-account": "delete-account.html",
  "/investors": "investors.html",
};

// Task #1520: collapse duplicate /privacy-policy → /privacy via 301 so the
// audit doesn't flag duplicate title / sitemap coverage issues.
const PERMANENT_REDIRECTS: Record<string, string> = {
  "/privacy-policy": "/privacy",
};

// Approximate centroids for the user base. Latitude/longitude pairs are
// hand-curated country centroids; only countries we actually have data
// for show on the map.
const COUNTRY_GEO: Record<string, { name: string; lat: number; lon: number }> = {
  IT: { name: "Italia", lat: 41.9, lon: 12.5 },
  FR: { name: "Francia", lat: 46.6, lon: 2.4 },
  DE: { name: "Germania", lat: 51.2, lon: 10.4 },
  ES: { name: "Spagna", lat: 40.4, lon: -3.7 },
  PT: { name: "Portogallo", lat: 39.5, lon: -8.0 },
  GB: { name: "Regno Unito", lat: 54.0, lon: -2.0 },
  CH: { name: "Svizzera", lat: 46.8, lon: 8.2 },
  AT: { name: "Austria", lat: 47.5, lon: 14.6 },
  NL: { name: "Paesi Bassi", lat: 52.1, lon: 5.3 },
  BE: { name: "Belgio", lat: 50.5, lon: 4.5 },
  PL: { name: "Polonia", lat: 51.9, lon: 19.1 },
  CZ: { name: "Cechia", lat: 49.8, lon: 15.5 },
  GR: { name: "Grecia", lat: 39.0, lon: 22.0 },
  RO: { name: "Romania", lat: 45.9, lon: 24.9 },
  HR: { name: "Croazia", lat: 45.1, lon: 15.2 },
  SI: { name: "Slovenia", lat: 46.1, lon: 14.8 },
  SK: { name: "Slovacchia", lat: 48.7, lon: 19.7 },
  HU: { name: "Ungheria", lat: 47.2, lon: 19.5 },
  SE: { name: "Svezia", lat: 60.1, lon: 18.6 },
  NO: { name: "Norvegia", lat: 60.5, lon: 8.5 },
  FI: { name: "Finlandia", lat: 61.9, lon: 25.7 },
  DK: { name: "Danimarca", lat: 56.3, lon: 9.5 },
  IE: { name: "Irlanda", lat: 53.4, lon: -8.2 },
  TR: { name: "Turchia", lat: 38.9, lon: 35.2 },
  MA: { name: "Marocco", lat: 31.8, lon: -7.1 },
  TN: { name: "Tunisia", lat: 33.9, lon: 9.5 },
  DZ: { name: "Algeria", lat: 28.0, lon: 1.7 },
  EG: { name: "Egitto", lat: 26.8, lon: 30.8 },
  US: { name: "Stati Uniti", lat: 39.8, lon: -98.6 },
  CA: { name: "Canada", lat: 56.1, lon: -106.3 },
  AR: { name: "Argentina", lat: -38.4, lon: -63.6 },
  BR: { name: "Brasile", lat: -14.2, lon: -51.9 },
  AU: { name: "Australia", lat: -25.3, lon: 133.8 },
  JP: { name: "Giappone", lat: 36.2, lon: 138.3 },
};

// Cache for community stats (recomputed every 5 min).
let statsCache: { ts: number; payload: any } | null = null;
const STATS_TTL_MS = 5 * 60 * 1000;

async function getCommunityStats() {
  const now = Date.now();
  if (statsCache && now - statsCache.ts < STATS_TTL_MS) return statsCache.payload;
  try {
    const rows = await db
      .select({
        country: users.country,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(users)
      .groupBy(users.country);

    const totalRow = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(users);
    const total = totalRow[0]?.count ?? 0;

    const countries = rows
      .filter((r) => r.country)
      .map((r) => {
        const code = (r.country || "").toUpperCase();
        const geo = COUNTRY_GEO[code];
        if (!geo) return null;
        return {
          code,
          name: geo.name,
          lat: geo.lat,
          lon: geo.lon,
          count: Number(r.count) || 0,
        };
      })
      .filter(Boolean);

    const payload = { total, countries };
    statsCache = { ts: now, payload };
    return payload;
  } catch (err) {
    console.error("[community-stats] error:", err);
    return { total: 0, countries: [] };
  }
}

export function registerSiteRoutes(app: Express) {
  // Task #1524: counter visitatori. Tracking middleware for marketing pages.
  // Esegue PRIMA delle route delle pagine, ma filtra strettamente per evitare
  // di loggare API, asset, route admin/portal, expo manifest, ecc.
  const TRACKABLE_PATHS = new Set<string>([
    ...PAGES.map((p) => p.route),
    ...Object.keys(STATIC_HTML_PAGES),
  ]);
  app.use((req: Request, res: Response, next) => {
    if (req.method !== "GET") return next();
    // Expo client manifest fetch: ha sempre l'header expo-platform.
    if (req.header("expo-platform")) return next();
    const p = req.path || "";
    if (!TRACKABLE_PATHS.has(p)) return next();
    try {
      const vid = ensureVisitorId(req, res);
      recordVisit({ req, visitorId: vid, event: "view", path: p });
    } catch (err) {
      console.warn("[site-visits] middleware error:", err);
    }
    return next();
  });

  // Community stats API (used by /community map).
  app.get("/api/community/stats", async (_req: Request, res: Response) => {
    const data = await getCommunityStats();
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(data);
  });

  // Favicon — serve from assets so /favicon.png and /favicon.ico both work.
  const faviconPath = path.resolve(process.cwd(), "assets", "images", "favicon.png");
  app.get(["/favicon.png", "/favicon.ico"], (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(faviconPath);
  });

  // Site pages.
  for (const { route, build } of PAGES) {
    app.get(route, (req: Request, res: Response, next) => {
      // The root "/" is special: when an Expo platform header is present,
      // earlier middleware (configureExpoAndLanding) serves the manifest.
      // By the time we reach here, we know it's a regular browser request
      // for the website.
      if (route === "/" && req.method !== "GET") return next();
      try {
        const baseUrl = getBaseUrl(req);
        const { meta, body } = build(baseUrl);
        const html = renderPage(meta, body, baseUrl);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).send(html);
      } catch (err) {
        console.error(`[site] error rendering ${route}:`, err);
        next(err);
      }
    });
  }

  // 301 redirects for legacy URLs.
  for (const [from, to] of Object.entries(PERMANENT_REDIRECTS)) {
    app.get(from, (_req: Request, res: Response) => res.redirect(301, to));
  }

  // Static legal/special HTML pages — read once into memory, then per request
  // substitute {{BASE_URL}} with the current host so canonical/og:url are
  // host-dynamic (Task #1520 requirement) instead of hardcoded.
  const staticTemplates: Record<string, string> = {};
  for (const [route, file] of Object.entries(STATIC_HTML_PAGES)) {
    const filePath = path.resolve(process.cwd(), "server", "templates", file);
    // Fail-fast: if a static template can't be read at boot, throw so the
    // process exits with a clear deployment error instead of silently
    // serving a stub later.
    staticTemplates[route] = fs.readFileSync(filePath, "utf-8");
    app.get(route, (req: Request, res: Response, next) => {
      try {
        const baseUrl = getBaseUrl(req);
        const html = staticTemplates[route].replace(/\{\{BASE_URL\}\}/g, baseUrl);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).send(html);
      } catch (err) {
        console.error(`[site] error serving static template ${route}:`, err);
        next(err);
      }
    });
  }

  // robots.txt — dynamic, references the current host.
  app.get("/robots.txt", (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    // Task #1520: allow all public pages (incl. /delete-account, a public
    // legal page reachable from the privacy policy). Only block server-only
    // surfaces and protected user areas, per task spec.
    res.send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "Disallow: /admin",
        "Disallow: /admin/",
        "Disallow: /apple-review",
        "Disallow: /investors",
        "Disallow: /uploads/",
        "Disallow: /registrati",
        "Disallow: /accedi",
        "Disallow: /area-utente",
        "Disallow: /media",
        "",
        `Sitemap: ${baseUrl}/sitemap.xml`,
        "",
      ].join("\n"),
    );
  });

  // sitemap.xml — dynamic host, all public pages.
  app.get("/sitemap.xml", (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    const today = new Date().toISOString().split("T")[0];
    const entries = [
      ...PAGES.map((p) => ({
        loc: `${baseUrl}${p.route}`,
        priority: p.sitemap.priority,
        changefreq: p.sitemap.changefreq,
      })),
      { loc: `${baseUrl}/privacy`, priority: 0.3, changefreq: "yearly" },
      { loc: `${baseUrl}/terms`, priority: 0.3, changefreq: "yearly" },
    ];
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries
        .map(
          (e) =>
            `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority.toFixed(1)}</priority>\n  </url>`,
        )
        .join("\n") +
      `\n</urlset>\n`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(body);
  });
}
