import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { downloadBuffer } from "../objectStorage";
import { db } from "../db";
import { adCampaigns } from "@shared/schema";
import path from "path";
import fs from "fs";

const router = Router();

/**
 * Pre-warm the local disk cache for ad images at server startup.
 * Downloads any active campaign image not already present in uploads/ads/.
 * Runs fully in the background — errors are logged but never thrown.
 */
export async function warmupAdImageCache(): Promise<void> {
  try {
    const campaigns = await storage.getActiveCampaigns();
    const localDir = path.resolve(process.cwd(), "uploads", "ads");
    fs.mkdirSync(localDir, { recursive: true });

    let downloaded = 0;
    let skipped = 0;

    for (const campaign of campaigns) {
      if (!campaign.imageUrl) continue;
      const match = campaign.imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
      if (!match) continue;
      const filename = match[1];
      if (!filename || filename.includes("..") || filename.includes("/")) continue;

      const localPath = path.join(localDir, filename);
      if (fs.existsSync(localPath)) {
        skipped++;
        continue;
      }

      try {
        const buffer = await downloadBuffer(`public/ads/${filename}`);
        fs.writeFileSync(localPath, buffer);
        downloaded++;
        console.log(`[ADS WARMUP] Cached: ${filename}`);
      } catch (err) {
        console.warn(`[ADS WARMUP] Failed to cache ${filename}:`, err);
      }
    }

    console.log(`[ADS WARMUP] Done — downloaded: ${downloaded}, already cached: ${skipped}`);
  } catch (err) {
    console.warn("[ADS WARMUP] Warmup failed (non-fatal):", err);
  }
}

/**
 * Download and cache a single ad image to uploads/ads/ in the background.
 * Safe to call fire-and-forget — errors are logged but never thrown.
 */
export async function cacheAdImage(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;
  try {
    const match = imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
    if (!match) return;
    const filename = match[1];
    if (!filename || filename.includes("..") || filename.includes("/")) return;

    const localDir = path.resolve(process.cwd(), "uploads", "ads");
    fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, filename);

    if (fs.existsSync(localPath)) return;

    const buffer = await downloadBuffer(`public/ads/${filename}`);
    fs.writeFileSync(localPath, buffer);
    console.log(`[ADS CACHE] Cached on publish: ${filename}`);
  } catch (err) {
    console.warn("[ADS CACHE] Failed to cache image on publish (non-fatal):", err);
  }
}

/**
 * Delete files in uploads/ads/ that are not referenced by any campaign in the DB.
 * Runs on a daily schedule — errors are logged but never thrown.
 */
export async function cleanupOrphanedAdImages(): Promise<void> {
  try {
    const localDir = path.resolve(process.cwd(), "uploads", "ads");
    if (!fs.existsSync(localDir)) return;

    // Query ALL campaigns (active + inactive) so we never delete images
    // belonging to temporarily paused campaigns.
    const allCampaigns = await db.select({ imageUrl: adCampaigns.imageUrl }).from(adCampaigns);

    const referencedFilenames = new Set<string>();
    for (const { imageUrl } of allCampaigns) {
      if (!imageUrl) continue;
      const match = imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
      if (!match) continue;
      const filename = match[1];
      if (filename && !filename.includes("..") && !filename.includes("/")) {
        referencedFilenames.add(filename);
      }
    }

    const files = fs.readdirSync(localDir);
    let removed = 0;

    for (const file of files) {
      if (referencedFilenames.has(file)) continue;
      try {
        fs.unlinkSync(path.join(localDir, file));
        removed++;
        console.log(`[ADS CLEANUP] Removed orphaned image: ${file}`);
      } catch (unlinkErr) {
        console.warn(`[ADS CLEANUP] Failed to remove ${file} (non-fatal):`, unlinkErr);
      }
    }

    console.log(
      `[ADS CLEANUP] Done — removed: ${removed}, kept: ${referencedFilenames.size} referenced`,
    );
  } catch (err) {
    console.warn("[ADS CLEANUP] Cleanup failed (non-fatal):", err);
  }
}

router.get("/images/:filename", async (req: Request, res: Response) => {
  const filename = req.params.filename;
  if (!filename || filename.includes("..") || filename.includes("/")) {
    return res.status(400).json({ message: "Nome file non valido" });
  }
  const localPath = path.resolve(process.cwd(), "uploads", "ads", filename);
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }
  try {
    const imageBuffer = await downloadBuffer(`public/ads/${filename}`);
    try {
      const localDir = path.resolve(process.cwd(), "uploads", "ads");
      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(localPath, imageBuffer);
    } catch (writeErr) {
      console.warn("Ad image disk cache write failed (non-fatal):", writeErr);
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    return res.send(imageBuffer);
  } catch (error) {
    console.error("Ad image serve error:", error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).json({ message: "Immagine non trovata" });
  }
});

router.get("/active", async (req: Request, res: Response) => {
  try {
    const adsSetting = await storage.getAppSetting("ads_enabled");
    if (adsSetting?.value === "false") {
      return res.json([]);
    }

    const campaigns = await storage.getActiveCampaigns();

    const now = new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      return true;
    });

    for (const campaign of activeCampaigns) {
      await storage.incrementCampaignImpressions(campaign.id);
    }

    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get active ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/my-ads", async (req: Request, res: Response) => {
  try {
    const adsSetting = await storage.getAppSetting("ads_enabled");
    if (adsSetting?.value === "false") {
      return res.json([]);
    }

    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const userType = user.userType || "biker";
    const campaigns = await storage.getActiveAdsByUserType(userType);

    const now = new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      const p = c.placement || "all";
      return p === "all" || p === "home";
    });

    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get my ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/placement/:placement", async (req: Request, res: Response) => {
  try {
    const adsSetting = await storage.getAppSetting("ads_enabled");
    if (adsSetting?.value === "false") {
      return res.json([]);
    }

    const { placement } = req.params;
    const userId = req.session?.userId;
    let userType = "biker";
    if (userId) {
      const user = await storage.getUser(userId);
      if (user) userType = user.userType || "biker";
    }

    const campaigns = await storage.getActiveAdsByUserType(userType);

    const now = new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      const cp = c.placement || "all";
      return cp === placement || cp === "all";
    });

    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get placement ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

/**
 * GET /api/ads/guide-zip
 * Scarica il file ZIP della guida utente BikerLink da object storage.
 * Endpoint pubblico — nessuna autenticazione richiesta.
 */
router.get("/guide-zip", async (_req: Request, res: Response) => {
  try {
    const zipBuffer = await downloadBuffer("public/guide/bikerlink-guida.zip");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="bikerlink-guida.zip"'
    );
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(zipBuffer);
  } catch (error) {
    console.error("Guide ZIP serve error:", error);
    return res.status(404).json({ message: "File guida non disponibile" });
  }
});

router.post("/:id/click", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session?.userId ?? null;

    await storage.createAdClick({
      campaignId: id as string,
      userId,
    });

    return res.json({ message: "Click registrato" });
  } catch (error) {
    console.error("Ad click error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
