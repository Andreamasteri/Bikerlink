import type { Express, Request, Response, NextFunction } from "express";
import { getBaseUrl } from "./render";

export function registerLegacyRedirects(app: Express, PERMANENT_REDIRECTS: Record<string, string>) {
  for (const [from, to] of Object.entries(PERMANENT_REDIRECTS)) {
    app.get(from, (_req: Request, res: Response) => res.redirect(301, to));
  }
}

export function registerStaticLegalPages(app: Express, STATIC_HTML_PAGES: Record<string, string>, staticTemplates: Record<string, string>) {
  for (const [route, _file] of Object.entries(STATIC_HTML_PAGES)) {
    app.get(route, (req: Request, res: Response, next: NextFunction) => {
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
}

export function registerRobotsAndSitemap(app: Express, PAGES: { route: string; sitemap: { priority: number; changefreq: string } }[], _STATIC_HTML_PAGES: Record<string, string>) {
  // robots.txt — dynamic, references the current host.
  app.get("/robots.txt", (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
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
    const entries = [
      ...PAGES.map((p) => ({
        loc: `${baseUrl}${p.route}`,
        priority: p.sitemap.priority,
        changefreq: p.sitemap.changefreq,
      })),
      { loc: `${baseUrl}/docs`, priority: 0.7, changefreq: "monthly" },
      { loc: `${baseUrl}/docs/matching`, priority: 0.6, changefreq: "monthly" },
      { loc: `${baseUrl}/docs/sos`, priority: 0.6, changefreq: "monthly" },
      { loc: `${baseUrl}/docs/motoclub`, priority: 0.6, changefreq: "monthly" },
      { loc: `${baseUrl}/docs/percorsi`, priority: 0.6, changefreq: "monthly" },
      { loc: `${baseUrl}/docs/telemetria`, priority: 0.6, changefreq: "monthly" },
      { loc: `${baseUrl}/docs/api`, priority: 0.5, changefreq: "monthly" },
      { loc: `${baseUrl}/privacy`, priority: 0.3, changefreq: "yearly" },
      { loc: `${baseUrl}/terms`, priority: 0.3, changefreq: "yearly" },
      { loc: `${baseUrl}/delete-account`, priority: 0.3, changefreq: "yearly" },
    ];
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries
        .map(
          (e) =>
            `  <url>\n    <loc>${e.loc}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority.toFixed(1)}</priority>\n  </url>`,
        )
        .join("\n") +
      `\n</urlset>\n`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(body);
  });
}

export function registerLlmGuide(app: Express) {
  // llms.txt — machine-readable site guide for AI crawlers.
  app.get("/llms.txt", (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(
      [
        "# BikerLink",
        "",
        "> BikerLink è l'app di social matching per motociclisti. Connette biker in base a stile di guida, moto, percorsi e passioni, usando telemetria reale e intelligenza artificiale.",
        "",
        "## Sezioni principali",
        "",
        `- Home: ${baseUrl}/`,
        `- Funzionalità: ${baseUrl}/features`,
        `- Sistema SOS: ${baseUrl}/sos`,
        `- MotoClub: ${baseUrl}/motoclub`,
        `- Community: ${baseUrl}/community`,
        `- Documentazione (indice): ${baseUrl}/docs`,
        `- Download app: ${baseUrl}/download`,
        `- Chi siamo: ${baseUrl}/about`,
        `- FAQ: ${baseUrl}/faq`,
        `- Contatti: ${baseUrl}/contact`,
        "",
        "## Matching AI",
        "",
        `- Panoramica matching: ${baseUrl}/matching`,
        `- Come funziona: ${baseUrl}/matching/come-funziona`,
        `- Tipi di match: ${baseUrl}/matching/tipi-di-match`,
        `- Come impara: ${baseUrl}/matching/come-impara`,
        `- Intelligenza artificiale: ${baseUrl}/matching/intelligenza-artificiale`,
        `- Privacy matching: ${baseUrl}/matching/privacy`,
        "",
        "## Documentazione",
        "",
        `- Indice documentazione: ${baseUrl}/docs`,
        `- Matching AI — come funziona il matching: ${baseUrl}/docs/matching`,
        `- SOS Biker — sistema emergenze stradali: ${baseUrl}/docs/sos`,
        `- MotoClub — club, membri e chat di gruppo: ${baseUrl}/docs/motoclub`,
        `- Percorsi — navigazione GPS e curvy routing: ${baseUrl}/docs/percorsi`,
        `- Telemetria — dati di guida reali e loro uso: ${baseUrl}/docs/telemetria`,
        `- API — riferimento tecnico per sviluppatori: ${baseUrl}/docs/api`,
        "",
        "## Pagine legali e supporto",
        "",
        `- Privacy Policy: ${baseUrl}/privacy`,
        `- Termini di Servizio: ${baseUrl}/terms`,
        `- Elimina account: ${baseUrl}/delete-account`,
        "",
        "## Contatto",
        "",
        "- Supporto: support@bikerlink.app",
        "- Privacy: privacy@bikerlink.app",
        "",
      ].join("\n"),
    );
  });
}
