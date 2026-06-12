import type { Express, Request, Response } from "express";

async function servePromoVideo(
  res: Response,
  objectPath: string,
  filename: string,
  label: string,
): Promise<void> {
  try {
    const { downloadBuffer } = await import("../objectStorage");
    const buffer = await downloadBuffer(objectPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (error) {
    console.error(`${label} promo video serve error:`, error);
    res.status(404).json({ message: "Video non trovato" });
  }
}

export function registerMediaPromoRoutes(app: Express): void {
  app.get("/api/media/promo-video", (_req: Request, res: Response) =>
    servePromoVideo(res, "public/playstore/bikerlink_promo_video.mp4", "bikerlink_promo_video.mp4", "Promo"),
  );
  app.get("/api/media/convoy-promo", (_req: Request, res: Response) =>
    servePromoVideo(res, "public/playstore/bikerlink_convoy_promo_30s.mp4", "bikerlink_convoy_promo_30s.mp4", "Convoy"),
  );
  app.get("/api/media/youtube-promo", (_req: Request, res: Response) =>
    servePromoVideo(res, "public/playstore/bikerlink_youtube_60s.mp4", "bikerlink_youtube_60s.mp4", "YouTube"),
  );
  app.get("/api/media/harley-promo", (_req: Request, res: Response) =>
    servePromoVideo(res, "public/playstore/bikerlink_harley_30s.mp4", "bikerlink_harley_30s.mp4", "Harley"),
  );
  app.get("/api/media/adrenaline-promo", (_req: Request, res: Response) =>
    servePromoVideo(res, "public/playstore/bikerlink_adrenaline_30s.mp4", "bikerlink_adrenaline_30s.mp4", "Adrenaline"),
  );
  app.get("/api/media/solo-rider-promo", (_req: Request, res: Response) =>
    servePromoVideo(res, "public/playstore/bikerlink_solo_rider_17s.mp4", "bikerlink_solo_rider_17s.mp4", "Solo rider"),
  );
}
