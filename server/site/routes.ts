import type { Express, Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { initState } from "../init-state";
import { db } from "../db";
import { users } from "@shared/db";
import { sql } from "drizzle-orm";
import { renderPage, getBaseUrl } from "./render";
import { ensureVisitorId, recordVisit } from "../lib/visitor-tracking";
import { storage } from "../storage";
import {
  buildHome,
  type LandingImages,
  buildFeatures,
  buildSos,
  buildMotoclub,
  buildCommunity,
  buildDownload,
  buildAbout,
  buildFaq,
  buildContact,
  buildMatchingOverview,
  buildMatchingHowItWorks,
  buildMatchingTypes,
  buildMatchingLearning,
  buildMatchingAI,
  buildMatchingPrivacy,
  buildMatchingInvestors,
} from "./pages";
import { BLOG_POSTS, buildBlogIndex, buildBlogPost, findBlogPost } from "./pages-blog";

// Cache for landing images (recomputed every 5 min so changes propagate quickly).
let landingImagesCache: { ts: number; images: LandingImages } | null = null;
const LANDING_IMAGES_TTL_MS = 5 * 60 * 1000;

async function getLandingImages(): Promise<LandingImages> {
  const now = Date.now();
  if (landingImagesCache && now - landingImagesCache.ts < LANDING_IMAGES_TTL_MS) {
    return landingImagesCache.images;
  }
  const KEYS: (keyof LandingImages)[] = [
    "hero_main_url",
    "hero_main_sm_url",
    "hero_community_url",
    "hero_community_sm_url",
  ];
  try {
    const settings = await Promise.all(KEYS.map((k) => storage.getAppSetting(k)));
    const images: LandingImages = {};
    KEYS.forEach((k, i) => {
      const val = settings[i]?.value?.trim();
      if (val) images[k] = val;
    });
    landingImagesCache = { ts: now, images };
    return images;
  } catch {
    return {};
  }
}

// Exported so admin routes can bust the cache after a save.
export function bustLandingImagesCache() {
  landingImagesCache = null;
}

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
  { route: "/blog", build: buildBlogIndex, sitemap: { priority: 0.8, changefreq: "weekly" } },
  { route: "/matching", build: buildMatchingOverview, sitemap: { priority: 0.9, changefreq: "monthly" } },
  { route: "/matching/come-funziona", build: buildMatchingHowItWorks, sitemap: { priority: 0.8, changefreq: "monthly" } },
  { route: "/matching/tipi-di-match", build: buildMatchingTypes, sitemap: { priority: 0.8, changefreq: "monthly" } },
  { route: "/matching/come-impara", build: buildMatchingLearning, sitemap: { priority: 0.8, changefreq: "monthly" } },
  { route: "/matching/intelligenza-artificiale", build: buildMatchingAI, sitemap: { priority: 0.8, changefreq: "monthly" } },
  { route: "/matching/privacy", build: buildMatchingPrivacy, sitemap: { priority: 0.7, changefreq: "monthly" } },
  { route: "/matching/per-investitori", build: buildMatchingInvestors, sitemap: { priority: 0.7, changefreq: "monthly" } },
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
  EC: { name: "Ecuador", lat: -1.8, lon: -78.2 },
};

// Cache for community stats (recomputed every 5 min).
let statsCache: { ts: number; payload: unknown } | null = null;
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

import { registerLegacyRedirects, registerStaticLegalPages, registerRobotsAndSitemap, registerLlmGuide } from "./routes.part2";

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
    if (!TRACKABLE_PATHS.has(p) && !p.startsWith("/blog/")) return next();
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
    app.get(route, async (req: Request, res: Response, next) => {
      // The root "/" is special: when an Expo platform header is present,
      // earlier middleware (configureExpoAndLanding) serves the manifest.
      // By the time we reach here, we know it's a regular browser request
      // for the website.
      if (route === "/" && req.method !== "GET") return next();

      // Durante l'inizializzazione (boot DB non ancora completo) la landing
      // page farebbe una query DB che potrebbe lanciare → 500 → il deploy
      // probe fallisce. Rispondiamo subito con uno stub 200 leggero.
      if (route === "/" && initState.initializing) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(
          "<!doctype html><html lang=\"it\"><head><meta charset=\"utf-8\"><title>BikerLink</title></head><body></body></html>",
        );
      }

      try {
        const baseUrl = getBaseUrl(req);
        let pageResult: { meta: ReturnType<typeof buildHome>["meta"]; body: string };
        if (route === "/") {
          const images = await getLandingImages();
          pageResult = (buildHome as (b: string, i?: LandingImages) => typeof pageResult)(baseUrl, images);
        } else {
          pageResult = build(baseUrl);
        }
        const html = renderPage(pageResult.meta, pageResult.body, baseUrl);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).send(html);
      } catch (err) {
        console.error(`[site] error rendering ${route}:`, err);
        next(err);
      }
    });
  }

  app.get("/blog/:slug", (req: Request, res: Response, next) => {
    const post = findBlogPost(req.params.slug);
    if (!post) return next();
    try {
      const baseUrl = getBaseUrl(req);
      const pageResult = buildBlogPost(baseUrl, post);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(renderPage(pageResult.meta, pageResult.body, baseUrl));
    } catch (err) {
      console.error(`[site] error rendering blog post ${req.params.slug}:`, err);
      return next(err);
    }
  });

  // Matching PDF — printable version of the investors tech deep-dive.
  app.get("/matching/pdf", (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8"/>
<title>BikerLink — Matching Manual Tecnico</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{margin:20mm}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111;background:#fff;font-size:13px;line-height:1.6}
h1{font-size:28px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px}
h2{font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:28px 0 8px;border-bottom:2px solid #FF3B30;padding-bottom:4px}
h3{font-size:14px;font-weight:700;margin:16px 0 4px;text-transform:uppercase;letter-spacing:.5px}
p{margin-bottom:10px;color:#333}
ul{margin:8px 0 12px 20px}
li{margin-bottom:4px;color:#333}
.hero{background:#0A0A0A;color:#fff;padding:32px 40px;margin-bottom:24px}
.hero h1{color:#fff}.accent{color:#FF3B30}
.stat-row{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0}
.stat{flex:1;min-width:120px;background:#f5f5f5;border-left:3px solid #FF3B30;padding:12px 16px;border-radius:2px}
.stat-val{font-size:24px;font-weight:900;color:#FF3B30;line-height:1}
.stat-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#666;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}
th{background:#0A0A0A;color:#fff;padding:8px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
td{padding:8px 12px;border-bottom:1px solid #eee}
tr:nth-child(even) td{background:#fafafa}
code{background:#f0f0f0;padding:1px 5px;border-radius:2px;font-size:11px;font-family:monospace}
.section{margin-bottom:28px}
.no-break{page-break-inside:avoid}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #ddd;font-size:11px;color:#888;text-align:center}
@media print{.no-break{page-break-inside:avoid}}
</style>
</head>
<body>
<div class="hero">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#FF3B30;margin-bottom:12px">BIKERLINK — MATCHING MANUAL TECNICO</div>
  <h1>Sistema di Matching<br/><span class="accent">Technical Deep Dive</span></h1>
  <p style="color:#aaa;margin-top:8px;font-size:14px">Architettura completa · KPI · Stack · Vantaggio competitivo</p>
</div>

<div class="stat-row">
  <div class="stat"><div class="stat-val">17</div><div class="stat-lbl">Segnali di affinità</div></div>
  <div class="stat"><div class="stat-val">&lt;200ms</div><div class="stat-lbl">Latenza engine P99</div></div>
  <div class="stat"><div class="stat-val">6</div><div class="stat-lbl">AI specializzate</div></div>
  <div class="stat"><div class="stat-val">8</div><div class="stat-lbl">Modelli orchestrati</div></div>
  <div class="stat"><div class="stat-val">4</div><div class="stat-lbl">Provider AI failover</div></div>
  <div class="stat"><div class="stat-val">99.95%</div><div class="stat-lbl">Uptime atteso</div></div>
</div>

<div class="section no-break">
<h2>1. I 17 Segnali di Affinità</h2>
<table>
<thead><tr><th>#</th><th>Segnale</th><th>Fonte dati</th><th>Tipo</th></tr></thead>
<tbody>
<tr><td>01</td><td>Brand moto</td><td>Profilo utente</td><td>Diretto</td></tr>
<tr><td>02</td><td>Distanza geohash</td><td>GPS / zona residenza</td><td>Geo-spaziale</td></tr>
<tr><td>03</td><td>Affinità musicale</td><td>Profilo testo libero + embeddings</td><td>Semantico</td></tr>
<tr><td>04</td><td>Lean angle (piega)</td><td>Telemetria giroscopio</td><td>Telemetrico</td></tr>
<tr><td>05</td><td>G-force laterale</td><td>Telemetria accelerometro</td><td>Telemetrico</td></tr>
<tr><td>06</td><td>Route affinity</td><td>Percorsi GPS storici</td><td>Geo-spaziale</td></tr>
<tr><td>07</td><td>Overlap orario</td><td>Timestamp sessioni GPS</td><td>Temporale</td></tr>
<tr><td>08</td><td>Stile di guida</td><td>Velocità + accelerazioni aggregate</td><td>Telemetrico</td></tr>
<tr><td>09</td><td>Club condivisi</td><td>MotoClub membership</td><td>Diretto</td></tr>
<tr><td>10</td><td>Tag comuni</td><td>Hashtag profilo</td><td>Diretto</td></tr>
<tr><td>11</td><td>Affinità bio</td><td>Bio testo libero + embeddings</td><td>Semantico</td></tr>
<tr><td>12</td><td>Lingua e zona</td><td>Impostazioni profilo + GPS</td><td>Diretto</td></tr>
<tr><td>13</td><td>Fascia d'età</td><td>Profilo utente (opzionale)</td><td>Diretto</td></tr>
<tr><td>14</td><td>Reputazione biker</td><td>Feedback utenti + segnalazioni</td><td>Comportamentale</td></tr>
<tr><td>15</td><td>Preferenze dichiarate</td><td>Settings matching</td><td>Diretto</td></tr>
<tr><td>16</td><td>Feedback storico</td><td>Like / ignora / block</td><td>Comportamentale</td></tr>
<tr><td>17</td><td>Decay temporale</td><td>Timestamp ultima attività</td><td>Temporale</td></tr>
</tbody>
</table>
</div>

<div class="section no-break">
<h2>2. Stack Tecnico</h2>
<table>
<thead><tr><th>Layer</th><th>Tecnologia</th><th>Note</th></tr></thead>
<tbody>
<tr><td>Database</td><td><code>PostgreSQL 16 + PostGIS + pgvector</code></td><td>Dati utente, percorsi, embeddings 1536-dim</td></tr>
<tr><td>Cache & Code</td><td><code>DragonflyDB + BullMQ</code></td><td>Cache score, code ricalcolo, lock distribuiti</td></tr>
<tr><td>Scoring Engine</td><td><code>Express + TypeScript</code></td><td>17 segnali, pesi configurabili, feedback loop</td></tr>
<tr><td>Embeddings</td><td><code>OpenAI text-embedding-3-large + multilingual-e5-small</code></td><td>Bio e musica, fallback self-hosted</td></tr>
<tr><td>AI Orchestration</td><td><code>Anthropic Claude → OpenAI GPT → Google Gemini</code></td><td>Cascata failover, 99.95% uptime atteso</td></tr>
<tr><td>Geo</td><td><code>PostGIS + H3 geohash</code></td><td>Distanze reali, zone di guida, route affinity</td></tr>
<tr><td>Client</td><td><code>React Native (Expo) + React Query</code></td><td>iOS/Android, aggiornamenti OTA via EAS</td></tr>
<tr><td>A/B Testing</td><td><code>Framework interno + DragonflyDB flag</code></td><td>Split test algoritmi su % utenti configurabile</td></tr>
</tbody>
</table>
</div>

<div class="section no-break">
<h2>3. I 6 Sottosistemi AI</h2>
<table>
<thead><tr><th>Nome</th><th>Ruolo</th><th>Azioni autonome</th></tr></thead>
<tbody>
<tr><td>AI Moderazione</td><td>Analizza segnalazioni, distingue spam da casi reali</td><td>Solo suggerimenti — decisioni al moderatore umano</td></tr>
<tr><td>AI Watchdog Sistema</td><td>Monitora metriche 24/7, auto-corregge problemi noti</td><td>Auto-fix documentati; allerta admin per anomalie nuove</td></tr>
<tr><td>AI Orchestrator OTA</td><td>Gestisce rilascio aggiornamenti app, rollout e rollback</td><td>Rollback automatico su metriche fuori soglia</td></tr>
<tr><td>AI Integrità Database</td><td>Controllo coerenza dati tra tabelle e microservizi</td><td>Ripara incongruenze minori; segnala quelle grandi</td></tr>
<tr><td>AI Integrità App</td><td>Analisi codice, traduzioni, configurazioni</td><td>Report — nessuna modifica autonoma al codice</td></tr>
<tr><td>AI Console Unificata</td><td>Chat admin con tutti i 5 sistemi, correlazione eventi</td><td>Interfaccia unificata — risponde in linguaggio naturale</td></tr>
</tbody>
</table>
</div>

<div class="section no-break">
<h2>4. Formula di Scoring</h2>
<p>Il punteggio finale è una media pesata dei 17 segnali normalizzati [0,1]:</p>
<p style="font-family:monospace;font-size:14px;background:#f5f5f5;padding:10px 16px;border-radius:2px;border-left:3px solid #FF3B30">
  score = Σ(w<sub>i</sub> × S<sub>i</sub>) / Σ(w<sub>i</sub>)
</p>
<p style="margin-top:10px">Il decay temporale viene applicato come moltiplicatore finale: <code>decay = e^(−λ × giorni_inattivi)</code>. Con λ default: ~50% dopo 30gg, ~10% dopo 60gg, ~0% dopo 90gg.</p>
</div>

<div class="section no-break">
<h2>5. Vantaggio Competitivo (Moat)</h2>
<ul>
<li><strong>Telemetria reale</strong> — Lean angle e G-force da giroscopio/accelerometro. Nessun competitor usa questo dato per matching. Richiede anni di raccolta per essere significativo.</li>
<li><strong>Embeddings su corpus motociclisti</strong> — Il nostro corpus di bio e gusti musicali di motociclisti è unico nel dominio verticale. Un modello generico fa peggio su questo contesto specifico.</li>
<li><strong>Feedback loop + dati storici</strong> — Ogni interazione migliora il modello. Un nuovo competitor partirebbe da zero.</li>
<li><strong>Verticale moto — zero distrazione</strong> — Il contesto "rider" è nativo in ogni feature. Tinder e app generaliste non ottimizzeranno mai davvero per i motociclisti.</li>
</ul>
</div>

<div class="footer">
  BikerLink · ${baseUrl}/matching/per-investitori · invest@bikerlink.app · Confidenziale — Non distribuire
</div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).send(html);
  });

  // 301 redirects for legacy URLs.
  registerLegacyRedirects(app, PERMANENT_REDIRECTS);

  // Static legal/special HTML pages
  const staticTemplates: Record<string, string> = {};
  for (const [route, file] of Object.entries(STATIC_HTML_PAGES)) {
    const filePath = path.resolve(process.cwd(), "server", "templates", file);
    staticTemplates[route] = fs.readFileSync(filePath, "utf-8");
  }
  registerStaticLegalPages(app, STATIC_HTML_PAGES, staticTemplates);

  registerRobotsAndSitemap(app, PAGES, STATIC_HTML_PAGES, BLOG_POSTS);
  registerLlmGuide(app, BLOG_POSTS);

  // Fallback /docs index (dynamic).
}
