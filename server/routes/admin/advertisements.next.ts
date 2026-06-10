import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { sendError, sendSuccess } from "../../lib/api-response";
import { safeModLog } from "../../lib/safe-mod-log";
import { storage } from "../../storage";
import { objectExists } from "../../objectStorage";
import { uploadBuffer, deleteObject } from "../../objectStorage";
import crypto from "crypto";

const router = Router();

const adsDir = path.join(process.cwd(), "uploads", "ads");

// ── Image-health in-memory state ─────────────────────────────────────────────

interface ImageHealthState {
  brokenIds: string[];
  checkedAt: string | null;
  isRunning: boolean;
}

let healthState: ImageHealthState = {
  brokenIds: [],
  checkedAt: null,
  isRunning: false,
};

export function getImageHealthState(): ImageHealthState {
  return healthState;
}

export async function runAdImageHealthCheck(): Promise<void> {
  if (healthState.isRunning) return;
  healthState.isRunning = true;
  try {
    const campaigns = await storage.getAllCampaigns();
    const broken: string[] = [];
    for (const campaign of campaigns) {
      if (!campaign.imageUrl) continue;
      const match = campaign.imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
      if (!match) continue;
      const filename = match[1];
      if (!filename || filename.includes("..") || filename.includes("/")) continue;
      try {
        const exists = await objectExists(`public/ads/${filename}`);
        if (!exists) {
          broken.push(campaign.id);
          const localPath = path.join(adsDir, filename);
          if (fs.existsSync(localPath)) {
            try { fs.unlinkSync(localPath); } catch { /* non-fatal */ }
          }
        }
      } catch {
        broken.push(campaign.id);
      }
    }
    healthState = { brokenIds: broken, checkedAt: new Date().toISOString(), isRunning: false };
    if (broken.length > 0) {
      console.warn(`[ADS HEALTH] ${broken.length} campagne con immagine rotta: ${broken.join(", ")}`);
    } else {
      console.log("[ADS HEALTH] Tutte le immagini sono raggiungibili.");
    }
  } catch (err) {
    healthState.isRunning = false;
    console.warn("[ADS HEALTH] Check fallito (non-fatal):", err);
  }
}

router.get("/image-health", (_req: Request, res: Response) => {
  return res.json(healthState);
});

router.post("/image-health/check", async (_req: Request, res: Response) => {
  runAdImageHealthCheck().catch(() => {});
  return sendSuccess(res, { isRunning: healthState.isRunning });
});

// ── Cache stats ───────────────────────────────────────────────────────────────

router.get("/cache-stats", (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(adsDir)) return res.json({ count: 0, totalBytes: 0 });
    const files = fs.readdirSync(adsDir);
    let totalBytes = 0;
    let count = 0;
    for (const file of files) {
      try {
        const stat = fs.statSync(path.join(adsDir, file));
        if (stat.isFile()) { totalBytes += stat.size; count++; }
      } catch { /* skip */ }
    }
    return res.json({ count, totalBytes });
  } catch (err) {
    console.warn("[ADS CACHE STATS] Error:", err);
    return res.json({ count: 0, totalBytes: 0 });
  }
});

// ── Re-upload image for existing campaign ─────────────────────────────────────

const adReuploadUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post("/:id/reupload-image", adReuploadUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!id) return sendError(res, 400, "ID campagna non valido");
    if (!req.file) return sendError(res, 400, "Nessun file caricato");
    const existing = await storage.getAdCampaign(id);
    if (!existing) return sendError(res, 404, "Campagna non trovata");
    const filename = `ad-${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${req.file.originalname}`;
    const objectPath = `public/ads/${filename}`;
    await uploadBuffer(objectPath, req.file.buffer, req.file.mimetype);
    const newImageUrl = `/api/ads/images/${filename}`;
    const oldImageUrl = existing.imageUrl;
    const campaign = await storage.updateAdCampaign(id, {
      imageUrl: newImageUrl,
      imageVersion: (existing.imageVersion ?? 0) + 1,
    });
    healthState.brokenIds = healthState.brokenIds.filter((bid) => bid !== id);
    await safeModLog({
      moderatorId: req.session.userId!,
      action: "reupload_ad_image",
      targetType: "campaign",
      targetId: id,
      details: `Immagine sostituita per "${existing.name}": ${filename}`,
    });
    if (oldImageUrl) {
      const oldMatch = oldImageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
      if (oldMatch?.[1]) {
        const oldFilename = oldMatch[1];
        try { await deleteObject(`public/ads/${oldFilename}`); } catch { /* non-fatal */ }
        try {
          const lp = path.join(adsDir, oldFilename);
          if (fs.existsSync(lp)) fs.unlinkSync(lp);
        } catch { /* non-fatal */ }
      }
    }
    return res.json(campaign);
  } catch (err) {
    console.error("[ADS REUPLOAD] Error:", err);
    return sendError(res, 500, (err as Error)?.message ?? "Errore re-upload immagine");
  }
});

// ── Self-check ────────────────────────────────────────────────────────────────

router.post("/self-check", async (req: Request, res: Response) => {
  try {
    const { runCampaignsSelfCheck } = await import("../../ai/watchdog/campaigns-self-check");
    const withAi = req.body?.withAi !== false;
    const result = await runCampaignsSelfCheck({ triggeredBy: "manual", withAi });
    await safeModLog({
      moderatorId: req.session.userId!,
      action: "campaigns_self_check",
      targetType: "system",
      targetId: "campaigns",
      details: `Self-check: ${result.overall} (${result.checks.length} passi, ${result.durationMs}ms)`,
    });
    return res.json(result);
  } catch (error) {
    console.error("Self-check campagne error:", error);
    return sendError(res, 500, (error as Error)?.message ?? "Errore self-check");
  }
});

router.get("/self-check/last", async (_req: Request, res: Response) => {
  try {
    const { getLastSelfCheck } = await import("../../ai/watchdog/campaigns-self-check");
    return res.json({ result: getLastSelfCheck() });
  } catch (error) {
    return sendError(res, 500, (error as Error)?.message ?? "Errore lettura self-check");
  }
});

export default router;
