import type { Express, Request, Response } from "express";

export function registerExportsRoutes(app: Express) {
  app.get("/api/exports/matching-system.pdf", async (_req: Request, res: Response) => {
    try {
      const { generateMatchingPdf } = await import("../exports/generate-matching-pdf");
      const stream = generateMatchingPdf();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=\"matching-system.pdf\"");
      res.setHeader("Cache-Control", "public, max-age=3600");
      stream.on("error", (err) => {
        console.error("[exports] matching-system.pdf stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Errore generazione PDF" });
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    } catch (err) {
      console.error("[exports] matching-system.pdf generation failed:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore generazione PDF" });
    }
  });
}
