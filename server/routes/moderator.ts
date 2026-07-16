import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import * as fs from "fs";
import { storage } from "../storage";
import { uploadBuffer, deleteObject, BUCKET_CAMPAIGN, BUCKET_CONTEST } from "../objectStorage";
import { cacheAdImage } from "./ads";
import { requireUserId } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";
import { safeModLog } from "../lib/safe-mod-log";
import { getInternalProbeToken, getInternalProbeHeaderName, getInternalProbeModeratorHeaderName, isLoopback } from "../ai/watchdog/internal-token";

const router = Router();

// Bypass loopback per il self-check interno: se la richiesta arriva da 127.0.0.1
// con un probe token valido e indica un moderator id, lo validiamo e lo usiamo
// al posto della sessione. Restituisce l'id solo se l'utente esiste, è
// admin/moderatore ed è attivo. Negli altri casi torna null (nessun bypass).
async function tryProbeModerator(req: Request): Promise<string | null> {
  try {
    const tokenHdr = req.headers[getInternalProbeHeaderName()];
    const token = Array.isArray(tokenHdr) ? tokenHdr[0] : tokenHdr;
    if (!token || token !== getInternalProbeToken() || !isLoopback(req.ip)) return null;
    const modHdr = req.headers[getInternalProbeModeratorHeaderName()];
    const moderatorId = Array.isArray(modHdr) ? modHdr[0] : modHdr;
    if (!moderatorId) return null;
    const user = await storage.getUser(moderatorId);
    if (!user || (user.role !== "admin" && user.role !== "moderator") || user.status !== "active") return null;
    return moderatorId;
  } catch {
    return null;
  }
}

async function requireModerator(req: Request, res: Response): Promise<string | null> {
  const probeId = await tryProbeModerator(req);
  if (probeId) return probeId;

  const userId = requireUserId(req, res);
  if (!userId) return null;

  const user = await storage.getUser(userId);
  if (!user || (user.role !== "admin" && user.role !== "moderator")) {
    sendError(res, 403, "Accesso non autorizzato");
    return null;
  }
  // Task #1078: defense-in-depth — moderatore sospeso/bloccato non deve continuare
  // a esercitare azioni di moderazione anche se la sessione è ancora viva.
  // (Il middleware globale in routes.ts dovrebbe già averla distrutta.)
  if (user.status !== "active") {
    sendError(res, 403, "Account non attivo");
    return null;
  }
  return userId;
}

router.get("/photos", async (req: Request, res: Response) => {
  try {
    const userId = await requireModerator(req, res);
    if (!userId) return;

    const userPhotos = await storage.getUnapprovedUserPhotos();
    const contestEntries = await storage.getUnapprovedContestEntries();

    const photos = [
      ...userPhotos.map((p) => ({
        id: p.id,
        type: "user_photo" as const,
        photoUrl: p.photoUrl,
        userId: p.userId,
        createdAt: p.createdAt,
        isApproved: p.isApproved,
      })),
      ...contestEntries.map((e) => ({
        id: e.id,
        type: "contest_entry" as const,
        photoUrl: e.photoUrl,
        userId: e.userId,
        caption: e.caption,
        createdAt: e.createdAt,
        isApproved: e.isApproved,
      })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return res.json(photos);
  } catch (error) {
    console.error("Get moderator photos error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/photos/:id/approve", async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;

    const id = req.params.id as string;
    const photoType = (req.body.type as string) || "user_photo";

    let result;
    if (photoType === "contest_entry") {
      result = await storage.updateContestEntryApproval(id, true);
    } else {
      result = await storage.updateUserPhotoApproval(id, true);
    }

    if (!result) {
      return sendError(res, 404, "Foto non trovata");
    }

    await storage.createModeratorLog({
      moderatorId,
      action: "approve_photo",
      targetType: photoType,
      targetId: id,
      details: "Foto approvata",
    });

    return res.json(result);
  } catch (error) {
    console.error("Approve photo error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/photos/:id/reject", async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;

    const id = req.params.id as string;
    const photoType = (req.body.type as string) || "user_photo";
    const reason = req.body.reason as string | undefined;

    if (photoType === "contest_entry") {
      const entry = await storage.getPhotoContestEntry(id);
      if (!entry) {
        return sendError(res, 404, "Foto non trovata");
      }
      await storage.updateContestEntryApproval(id, false);
      // Defense-in-depth: rimuovi anche il file dal bucket object-storage.
      // L'endpoint GET /api/contest/photos/:filename già blocca con 404 quando
      // isApproved=false, ma eliminare il file garantisce che la foto rifiutata
      // non resti raggiungibile via futuri endpoint o pre-signed URL.
      if (entry.photoUrl) {
        const photoFilename = entry.photoUrl.split("/").pop();
        if (photoFilename) {
          // Try new PhotoContest/ path first, then legacy public/contest/
          deleteObject(`${BUCKET_CONTEST}${photoFilename}`)
            .catch(() => deleteObject(`public/contest/${photoFilename}`))
            .catch((err) => {
              // Log per audit/incident response: il reject DB è già avvenuto e l'endpoint
              // contest.ts blocca comunque l'accesso (isApproved !== true). Manteniamo
              // l'idempotenza ma non perdiamo visibilità sui fallimenti del bucket.
              console.warn(
                `[moderator/reject_contest] Object delete failed for ${photoFilename} (entry ${id}):`,
                err?.message ?? err
              );
            });
        }
      }
    } else {
      const photo = await storage.getUserPhoto(id);
      if (!photo) {
        return sendError(res, 404, "Foto non trovata");
      }
      await storage.deleteUserPhoto(id);
      // Task #1122: per le foto legacy locali, cancella anche il file da disco.
      // Senza questo, l'URL `/uploads/photos/<file>` resterebbe raggiungibile
      // (anche se ora è gated, qualunque bypass futuro lo riesporrebbe).
      // Le foto su object-storage (`/api/users/photos/...`) non vengono toccate
      // qui: la moderazione le rende già 404 via DB e non condividono filename.
      const url = photo.photoUrl;
      if (url && url.startsWith("/uploads/photos/")) {
        try {
          const filePath = path.join(process.cwd(), url);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.warn(`[moderator/reject_photo] legacy file delete failed for ${url}:`, e);
        }
      }
    }

    await storage.createModeratorLog({
      moderatorId,
      action: "reject_photo",
      targetType: photoType,
      targetId: id,
      details: reason ? `Foto rifiutata: ${reason}` : "Foto rifiutata",
    });

    return sendSuccess(res, undefined, "Foto rifiutata");
  } catch (error) {
    console.error("Reject photo error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/logs", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }
    const caller = await storage.getUser(req.session.userId);
    if (!caller || caller.role !== "admin") {
      return sendError(res, 403, "Accesso riservato agli amministratori");
    }
    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (error) {
    console.error("Get moderator logs error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

async function uploadAdImage(buffer: Buffer, originalname: string, mimetype: string): Promise<string> {
  const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
  const filename = uniqueSuffix + path.extname(originalname);
  const objectPath = `${BUCKET_CAMPAIGN}${filename}`;
  console.log(`[uploadAdImage] Uploading "${originalname}" → ${objectPath} (${buffer.length} bytes, ${mimetype})`);
  await uploadBuffer(objectPath, buffer, mimetype);
  console.log(`[uploadAdImage] Upload OK → /api/ads/images/${filename}`);
  return `/api/ads/images/${filename}`;
}

const adUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Solo immagini"));
  },
});

router.get("/advertisements", async (req: Request, res: Response) => {
  try {
    const userId = await requireModerator(req, res);
    if (!userId) return;
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Moderator get campaigns error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/advertisements", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;
    const { name, sponsor, linkUrl, description, targetUserType, rotationDuration, rotationMode, sortOrder, startDate, endDate, placement } = req.body;
    if (!name) {
      return sendError(res, 400, "Nome campagna obbligatorio");
    }
    let imageUrl: string | null = null;
    let imageUploadFailed = false;
    if (req.file) {
      try {
        imageUrl = await uploadAdImage(req.file.buffer, req.file.originalname, req.file.mimetype);
      } catch (uploadErr) {
        console.error("Moderator create campaign — upload immagine fallito (fallback senza immagine):", uploadErr);
        imageUrl = null;
        imageUploadFailed = true;
      }
    } else if (req.body.imageUrl) {
      if (!String(req.body.imageUrl).startsWith("/api/ads/images/")) {
        return sendError(res, 400, "imageUrl non valido: sono accettati solo percorsi interni");
      }
      imageUrl = req.body.imageUrl;
    }
    const [durSettingMod, modeSettingMod] = await Promise.all([
      storage.getAppSetting("ads_rotation_duration"),
      storage.getAppSetting("ads_rotation_mode"),
    ]);
    const defaultDurationMod = durSettingMod?.valueJson != null ? Number(durSettingMod.valueJson) : 10;
    const defaultModeMod = modeSettingMod?.valueJson != null ? String(modeSettingMod.valueJson) : "sequential";
    const campaign = await storage.createAdCampaign({
      name,
      sponsor: sponsor || "Syneco Lubrificanti",
      imageUrl,
      linkUrl: linkUrl || null,
      displayMode: "banner",
      description: description || null,
      targetUserType: targetUserType || "biker",
      rotationDuration: rotationDuration ? parseInt(rotationDuration) : defaultDurationMod,
      rotationMode: rotationMode || defaultModeMod,
      sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      placement: placement || "all",
    });
    await safeModLog({
      moderatorId,
      action: "create_advertisement",
      targetType: "campaign",
      targetId: campaign.id,
      details: `Campagna creata dal moderatore: ${campaign.name} (${targetUserType || "biker"})`,
    });
    cacheAdImage(campaign.imageUrl).catch(() => {});
    return res.status(201).json(imageUploadFailed ? { ...campaign, imageUploadFailed: true } : campaign);
  } catch (error) {
    console.error("Moderator create campaign error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/advertisements/:id", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;
    const id = req.params.id as string;
    const updates: Partial<{
      name: string; sponsor: string; linkUrl: string | null; description: string | null;
      isActive: boolean; targetUserType: string; rotationDuration: number;
      rotationMode: string; sortOrder: number; placement: string;
      imageUrl: string; imageVersion: number;
    }> = {};
    if (req.body.name !== undefined) updates.name = req.body.name as string;
    if (req.body.sponsor !== undefined) updates.sponsor = req.body.sponsor as string;
    if (req.body.linkUrl !== undefined) updates.linkUrl = req.body.linkUrl as string;
    if (req.body.description !== undefined) updates.description = req.body.description as string;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive === true || req.body.isActive === "true";
    if (req.body.targetUserType !== undefined) updates.targetUserType = req.body.targetUserType as string;
    if (req.body.rotationDuration !== undefined) updates.rotationDuration = parseInt(req.body.rotationDuration as string);
    if (req.body.rotationMode !== undefined) updates.rotationMode = req.body.rotationMode as string;
    if (req.body.sortOrder !== undefined) updates.sortOrder = parseInt(req.body.sortOrder as string);
    if (req.body.placement !== undefined) updates.placement = req.body.placement as string;
    let imageUploadFailed = false;
    if (req.file) {
      try {
        updates.imageUrl = await uploadAdImage(req.file.buffer, req.file.originalname, req.file.mimetype);
        const existing = await storage.getAdCampaign(id);
        updates.imageVersion = ((existing?.imageVersion ?? 0) + 1);
      } catch (uploadErr) {
        console.error("Moderator update campaign — upload immagine fallito (aggiornamento senza immagine):", uploadErr);
        imageUploadFailed = true;
      }
    } else if (req.body.imageUrl !== undefined) {
      if (req.body.imageUrl !== null && req.body.imageUrl !== "" && !String(req.body.imageUrl).startsWith("/api/ads/images/")) {
        return sendError(res, 400, "imageUrl non valido: sono accettati solo percorsi interni");
      }
      updates.imageUrl = req.body.imageUrl;
    }
    if (req.body.bumpImageVersion === true || req.body.bumpImageVersion === "true") {
      const existing = await storage.getAdCampaign(id);
      updates.imageVersion = ((existing?.imageVersion ?? 0) + 1);
    }
    const campaign = await storage.updateAdCampaign(id, updates);
    if (!campaign) {
      return sendError(res, 404, "Campagna non trovata");
    }
    await safeModLog({
      moderatorId,
      action: "update_advertisement",
      targetType: "campaign",
      targetId: id,
      details: `Campagna aggiornata dal moderatore: ${campaign.name}`,
    });
    if (req.file || req.body.imageUrl !== undefined) {
      cacheAdImage(campaign.imageUrl).catch(() => {});
    }
    return res.json(imageUploadFailed ? { ...campaign, imageUploadFailed: true } : campaign);
  } catch (error) {
    console.error("Moderator update campaign error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/log-profile-view", async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return sendError(res, 400, "targetUserId richiesto");
    }
    await storage.createModeratorLog({
      moderatorId,
      action: "view_profile",
      targetType: "user",
      targetId: targetUserId,
      details: null,
    });
    return sendSuccess(res);
  } catch (error) {
    console.error("Log profile view error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
