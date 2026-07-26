import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";

const MATCHING_PDF_ROUTES = [
  "/matching-system.pdf",
  "/api/exports/matching-system.pdf",
] as const;

function getMatchingPdfPath(): string {
  return path.resolve(process.cwd(), "server/public/matching-system.pdf");
}

function serveMatchingPdf(_req: Request, res: Response): void {
  const target = getMatchingPdfPath();
  if (!fs.existsSync(target)) {
    res.status(404).json({ message: "PDF non disponibile" });
    return;
  }

  const stream = fs.createReadStream(target);
  stream.on("error", (error) => {
    console.error("[matching-system.pdf] read failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Errore lettura PDF" });
    } else {
      res.destroy();
    }
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="BikerLink-MatchingSystem.pdf"');
  res.setHeader("Cache-Control", "public, max-age=3600");
  stream.pipe(res);
}

export function registerMatchingPdfRoutes(app: Express): void {
  for (const route of MATCHING_PDF_ROUTES) {
    app.get(route, serveMatchingPdf);
  }
}
