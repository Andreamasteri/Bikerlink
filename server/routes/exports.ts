import path from "path";
import fs from "fs";
import type { Express, Request, Response } from "express";

export function registerExportsRoutes(app: Express) {
  app.get("/api/exports/matching-system.pdf", (_req: Request, res: Response) => {
    const pdfPath = path.join(process.cwd(), "server/public/assets/competitor-analysis.pdf");
    const fallback = path.join(process.cwd(), "server/public/matching-system.pdf");
    const target = fs.existsSync(pdfPath) ? pdfPath : fs.existsSync(fallback) ? fallback : null;
    if (!target) {
      res.status(404).json({ message: "PDF non disponibile" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"BikerLink-MatchingSystem.pdf\"");
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(target).pipe(res);
  });
}
