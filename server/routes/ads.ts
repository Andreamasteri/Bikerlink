import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { downloadBuffer, deleteObject, listObjects, uploadBuffer } from "../objectStorage";
import { sendSuccess, sendError } from "../lib/api-response";
import path from "path";
import fs from "fs";

const ADS_BACKUP_PREFIX = ".private/ads-backup/";

const router = Router();

/**
 * Module-level promise that resolves once warmupAdImageCache() has finished
 * (whether successfully or with an error). cleanupOrphanedAdImages() awaits
 * this before performing any deletion, so the two operations are always
 * sequenced correctly regardless of boot timing.
 */
let _warmupResolve: (() => void) | null = null;
const _warmupDone: Promise<void> = new Promise<void>((resolve) => {
  _warmupResolve = resolve;
});

/**
 * Pre-warm the local disk cache for ad images at server startup.
 * Downloads any active campaign image not already present in uploads/ads/.
 * Runs fully in the background — errors are logged but never thrown.
 * Resolves the module-level _warmupDone promise when complete (even on error).
 */
export async function warmupAdImageCache(): Promise<void> {
  try {
    const allCampaigns = await storage.getAllCampaigns();
    const activeCampaigns = allCampaigns.filter((c) => c.isActive);
    const withImage = activeCampaigns.filter((c) => !!c.imageUrl);
    console.log(
      `[ADS WARMUP] Start — campagne totali: ${allCampaigns.length}, attive: ${activeCampaigns.length}, con immagine: ${withImage.length}`,
    );

    const localDir = path.resolve(process.cwd(), "uploads", "ads");
    fs.mkdirSync(localDir, { recursive: true });

    let downloaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const campaign of withImage) {
      const match = campaign.imageUrl!.match(/\/api\/ads\/images\/([^?#]+)/);
      if (!match) {
        console.warn(`[ADS WARMUP] Skip campagna "${campaign.name}" (id=${campaign.id}) — imageUrl non riconosciuto: ${campaign.imageUrl}`);
        continue;
      }
      const filename = match[1];
      if (!filename || filename.includes("..") || filename.includes("/")) {
        console.warn(`[ADS WARMUP] Skip filename non sicuro: "${filename}"`);
        continue;
      }

      const localPath = path.join(localDir, filename);
      if (fs.existsSync(localPath)) {
        skipped++;
        continue;
      }

      const WARMUP_BACKOFF_MS = [1_000, 2_000, 4_000];
      let lastErr: unknown;
      let ok = false;
      for (let attempt = 0; attempt <= WARMUP_BACKOFF_MS.length; attempt++) {
        try {
          const buffer = await downloadBuffer(`public/ads/${filename}`);
          fs.writeFileSync(localPath, buffer);
          downloaded++;
          console.log(`[ADS WARMUP] Ripristinata: ${filename} (campagna "${campaign.name}")${attempt > 0 ? ` al tentativo ${attempt + 1}` : ""}`);
          ok = true;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < WARMUP_BACKOFF_MS.length) {
            const delay = WARMUP_BACKOFF_MS[attempt];
            console.warn(
              `[ADS WARMUP] Retry ${attempt + 1}/${WARMUP_BACKOFF_MS.length} per "${filename}" tra ${delay}ms:`,
              (err as Error)?.message,
            );
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      if (!ok) {
        // Auto-restore dal backup .private/ads-backup/ se disponibile
        try {
          const backupBuffer = await downloadBuffer(`${ADS_BACKUP_PREFIX}${filename}`);
          await uploadBuffer(`public/ads/${filename}`, backupBuffer, "image/jpeg");
          fs.writeFileSync(localPath, backupBuffer);
          downloaded++;
          console.log(`[ADS WARMUP] AUTO-RESTORE da backup: ${filename} — campagna "${campaign.name}" ripristinata automaticamente`);
          ok = true;
        } catch (_backupErr) {
          failed++;
          console.error(
            `[ADS WARMUP] IMMAGINE NON TROVATA IN OBJECT STORAGE — campagna "${campaign.name}" (id=${campaign.id}): ` +
            `"${filename}" assente da Object Storage e da backup .private/ads-backup/ dopo ${WARMUP_BACKOFF_MS.length + 1} tentativi. ` +
            `Vai su /admin/ads → modifica la campagna → ricarica l'immagine.`,
            lastErr,
          );
        }
      }
    }

    console.log(
      `[ADS WARMUP] Completato — ripristinate: ${downloaded}, già in cache: ${skipped}, fallite: ${failed}`,
    );
  } catch (err) {
    console.warn("[ADS WARMUP] Warmup fallito (non bloccante):", err);
  } finally {
    _warmupResolve?.();
    _warmupResolve = null;
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

    let buffer: Buffer;
    try {
      buffer = await downloadBuffer(`public/ads/${filename}`);
    } catch (_primaryErr) {
      // Fallback: tenta il backup .private/ads-backup/ e ripristina in public/ads/
      buffer = await downloadBuffer(`${ADS_BACKUP_PREFIX}${filename}`);
      await uploadBuffer(`public/ads/${filename}`, buffer, "image/jpeg");
      console.log(`[ADS CACHE] AUTO-RESTORE da backup: ${filename}`);
    }
    fs.writeFileSync(localPath, buffer);
    console.log(`[ADS CACHE] Cached on publish: ${filename}`);
  } catch (err) {
    console.warn("[ADS CACHE] Failed to cache image on publish (non-fatal):", err);
  }
}

/**
 * Delete files in uploads/ads/ that are not referenced by any campaign in the DB.
 * Runs on a daily schedule — errors are logged but never thrown.
 *
 * BOOT-ORDER SAFETY: always awaits warmupAdImageCache() completion (with a
 * 3-minute timeout) before performing any deletion. This prevents a race where
 * the cleanup fires before warmup finishes restoring files from Object Storage.
 *
 * EMPTY-SET GUARD: if getAllCampaigns() returns 0 campaigns and there are files
 * in Object Storage, the sweep is skipped entirely. An empty reference set most
 * likely indicates a transient DB error, not a genuine "all campaigns deleted"
 * state — better to leave a few orphans than to wipe real images.
 */
export async function cleanupOrphanedAdImages(): Promise<void> {
  try {
    // Wait for warmup to finish before we delete anything. Cap at 3 min so a
    // stuck warmup doesn't block the cleanup job forever.
    const warmupTimeout = new Promise<void>((resolve) => setTimeout(resolve, 3 * 60_000));
    await Promise.race([_warmupDone, warmupTimeout]);

    const localDir = path.resolve(process.cwd(), "uploads", "ads");

    // Protect images from ALL campaigns (active + inactive). Only campaigns
    // physically deleted from the DB (DELETE) should lose their cached images.
    // Temporarily disabled campaigns must remain reactivatable without requiring
    // the image to be re-uploaded.
    const allCampaigns = await storage.getAllCampaigns();

    // SAFETY GUARD: se non ci sono campagne nel DB, salta il cleanup dell'object
    // storage per evitare di cancellare tutte le immagini in caso di blip DB.
    if (allCampaigns.length === 0) {
      console.warn("[ADS CLEANUP] getAllCampaigns() ha restituito 0 campagne — cleanup object storage saltato per sicurezza (possibile blip DB).");
      return;
    }

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

    console.log(
      `[ADS CLEANUP] Start — campagne in DB: ${allCampaigns.length}, filename referenziati: ${referencedFilenames.size}`,
    );

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
          console.log(`[ADS CLEANUP] Rimosso cache locale orfana: ${file}`);
        } catch (unlinkErr) {
          console.warn(`[ADS CLEANUP] Impossibile rimuovere locale ${file} (non-fatal):`, unlinkErr);
        }
      }
      console.log(`[ADS CLEANUP] Cache locale — rimossi: ${removed}, mantenuti: ${referencedFilenames.size} referenziati`);
    } else {
      console.log("[ADS CLEANUP] Directory locale non trovata — skip disk sweep, continuo con Object Storage");
    }

    // Also remove orphaned files from object storage (public/ads/).
    // This covers images replaced/deleted before the per-operation deleteObject
    // calls were added — those files were never cleaned from the primary store.
    //
    // SAFETY GUARD: if no campaigns are in DB and there are files to sweep,
    // skip the object-storage deletion. An empty campaign list is almost always
    // a transient DB issue — deleting everything would destroy real images that
    // can never be recovered. Log a warning instead and retry on the next run.
    try {
      const objectFiles = await listObjects("public/ads/");
      const sweepableFiles = objectFiles.filter((obj) => {
        const filename = obj.name.slice("public/ads/".length);
        return !!filename && !filename.includes("/") && !referencedFilenames.has(filename);
      });

      if (referencedFilenames.size === 0 && sweepableFiles.length > 0) {
        console.warn(
          `[ADS CLEANUP] SKIP Object Storage sweep — getAllCampaigns() ha restituito 0 campagne ma ci sono ` +
          `${sweepableFiles.length} file orfani in Object Storage. ` +
          `Probabilmente blip DB temporaneo: i file vengono preservati fino al prossimo ciclo.`,
        );
        return;
      }

      let objectRemoved = 0;
      for (const obj of objectFiles) {
        const filename = obj.name.slice("public/ads/".length);
        if (!filename || filename.includes("/")) continue; // skip sub-prefixes
        if (referencedFilenames.has(filename)) continue;
        try {
          await deleteObject(obj.name);
          objectRemoved++;
          console.log(`[ADS CLEANUP] Rimosso oggetto orfano: ${obj.name}`);
        } catch (deleteErr) {
          console.warn(`[ADS CLEANUP] Impossibile rimuovere oggetto ${obj.name} (non-fatal):`, deleteErr);
        }
      }
      console.log(`[ADS CLEANUP] Object Storage — rimossi: ${objectRemoved}`);
    } catch (objErr) {
      console.warn("[ADS CLEANUP] Object Storage sweep fallito (non-fatal):", objErr);
    }
  } catch (err) {
    console.warn("[ADS CLEANUP] Cleanup fallito (non-fatal):", err);
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
      if (c.name.startsWith("__selfcheck__")) return false; // safety belt (primary filter is in DB layer)
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
      if (c.name.startsWith("__selfcheck__")) return false; // safety belt (primary filter is in DB layer)
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
      if (c.name.startsWith("__selfcheck__")) return false; // safety belt (primary filter is in DB layer)
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
