import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { downloadBuffer, deleteObject, listObjects } from "../objectStorage";
import { sendSuccess, sendError } from "../lib/api-response";
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
        console.error(
          `[ADS WARMUP] IMMAGINE ROTTA — campagna "${campaign.name}" (id=${campaign.id}): ` +
          `il file ${filename} non esiste su Object Storage. ` +
          `Vai su /admin/ads → modifica la campagna → ricarica l'immagine.`,
          err,
        );
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

    // Protect images from ALL campaigns (active + inactive). Only campaigns
    // physically deleted from the DB (DELETE) should lose their cached images.
    // Temporarily disabled campaigns must remain reactivatable without requiring
    // the image to be re-uploaded.
    const allCampaigns = await storage.getAllCampaigns();

    // Contract: campaign imageUrls for locally-cached images must match
    // /api/ads/images/<filename> — the same format used by warmupAdImageCache
    // and cacheAdImage. URLs in any other format are not deleted (they are not
    // in uploads/ads/) but are also not treated as references, so a change in
    // URL format here would require updating all three functions together.
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

    // Local-cache sweep — skipped if the directory doesn't exist yet, but the
    // object-storage sweep below always runs regardless of local-dir state.
    if (fs.existsSync(localDir)) {
      const files = fs.readdirSync(localDir);
      let removed = 0;
      for (const file of files) {
        if (referencedFilenames.has(file)) continue;
        try {
          fs.unlinkSync(path.join(localDir, file));
          removed++;
          console.log(`[ADS CLEANUP] Removed orphaned local cache: ${file}`);
        } catch (unlinkErr) {
          console.warn(`[ADS CLEANUP] Failed to remove local ${file} (non-fatal):`, unlinkErr);
        }
      }
      console.log(`[ADS CLEANUP] Local cache — removed: ${removed}, kept: ${referencedFilenames.size} referenced`);
    } else {
      console.log("[ADS CLEANUP] Local cache dir not found — skipping disk sweep, continuing with object storage");
    }

    // Also remove orphaned files from object storage (public/ads/).
    // This covers images replaced/deleted before the per-operation deleteObject
    // calls were added — those files were never cleaned from the primary store.
    try {
      const objectFiles = await listObjects("public/ads/");
      let objectRemoved = 0;
      for (const obj of objectFiles) {
        // obj.name is the full path, e.g. "public/ads/1234567890-abc123.webp"
        const filename = obj.name.slice("public/ads/".length);
        if (!filename || filename.includes("/")) continue; // skip sub-prefixes
        if (referencedFilenames.has(filename)) continue;
        try {
          await deleteObject(obj.name);
          objectRemoved++;
          console.log(`[ADS CLEANUP] Removed orphaned object: ${obj.name}`);
        } catch (deleteErr) {
          console.warn(`[ADS CLEANUP] Failed to remove object ${obj.name} (non-fatal):`, deleteErr);
        }
      }
      console.log(`[ADS CLEANUP] Object storage — removed: ${objectRemoved}`);
    } catch (objErr) {
      console.warn("[ADS CLEANUP] Object storage sweep failed (non-fatal):", objErr);
    }
  } catch (err) {
    console.warn("[ADS CLEANUP] Cleanup failed (non-fatal):", err);
  }
}

router.get("/images/:filename", async (req: Request, res: Response) => {
  const filename = req.params.filename as string;
  if (!filename || filename.includes("..") || filename.includes("/")) {
    return sendError(res, 400, "Nome file non valido");
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
    console.error(`[ADS IMAGE] 404 — file "${filename}" non trovato su Object Storage:`, error);
    res.setHeader("Cache-Control", "no-store");
    return sendError(res, 404, `Immagine non trovata: ${filename}`);
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
      if (c.name.startsWith("__selfcheck__")) return false;
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
    return sendError(res, 500, "Errore interno del server");
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
      return sendError(res, 401, "Non autenticato");
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }
    const userType = user.userType || "biker";
    const campaigns = await storage.getActiveAdsByUserType(userType);

    const now = new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.name.startsWith("__selfcheck__")) return false;
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      const p = c.placement || "all";
      return p === "all" || p === "home";
    });

    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get my ads error:", error);
    return sendError(res, 500, "Errore interno del server");
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
      if (c.name.startsWith("__selfcheck__")) return false;
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      const cp = c.placement || "all";
      return cp === placement || cp === "all";
    });

    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get placement ads error:", error);
    return sendError(res, 500, "Errore interno del server");
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
    return sendError(res, 404, "File guida non disponibile");
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

    return sendSuccess(res, undefined, "Click registrato");
  } catch (error) {
    console.error("Ad click error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
