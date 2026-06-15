import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { adCampaigns as adCampaignsTable } from "@shared/db";
import { adsBulkSchema, adsCreateSchema, adsUpdateSchema, adsBulkDeleteSchema, adsGroupUpdateSchema } from "@shared/validators";
import { eq, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadBuffer, deleteObject } from "../../objectStorage";
import { cacheAdImage, warmupAdImageCache } from "../ads";
import { sendSuccess, sendError } from "../../lib/api-response";
import { safeModLog } from "../../lib/safe-mod-log";
import { withDbRetry } from "../../lib/db-retry";
import crypto from "crypto";

const router = Router();

const adsDir = path.join(process.cwd(), "uploads", "ads");
if (!fs.existsSync(adsDir)) {
  fs.mkdirSync(adsDir, { recursive: true });
}

const adUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function paramStr(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

async function uploadAdImageToObjectStorage(buffer: Buffer, originalname: string, mimetype: string): Promise<string> {
  const filename = `ad-${Date.now()}-${originalname}`;
  const objectPath = `public/ads/${filename}`;
  await uploadBuffer(objectPath, buffer, mimetype);
  return `/api/ads/images/${filename}`;
}

async function deleteAdImageIfUnreferenced(filename: string, excludeIds: string[]): Promise<void> {
  try {
    // Check DB: any campaign (excluding the ones being deleted/updated) still
    // referencing this filename? If yes, keep both the object and the local cache.
    const all = await storage.getAllCampaigns();
    const referenced = all.some((c) => {
      if (excludeIds.includes(c.id)) return false;
      if (!c.imageUrl) return false;
      const m = c.imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
      return m?.[1] === filename;
    });
    if (referenced) return;
    // Remove local cache (uploads/ads/<file>)
    try {
      const localPath = path.join(adsDir, filename);
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (e) {
      console.warn(`[ads/cleanup] local unlink failed for ${filename}:`, e);
    }
    // Remove object storage copy
    try {
      await deleteObject(`public/ads/${filename}`);
    } catch (e) {
      console.warn(`[ads/cleanup] object delete failed for ${filename}:`, e);
    }
  } catch (e) {
    console.warn(`[ads/cleanup] non-fatal error for ${filename}:`, e);
  }
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    const { getImageHealthState, runAdImageHealthCheck } = await import("./advertisements.next");
    const health = getImageHealthState();
    if (!health.checkedAt && !health.isRunning) {
      runAdImageHealthCheck().catch(() => {});
    }
    const brokenSet = new Set<string>(health.brokenIds);
    const enriched = campaigns.map((c) => ({
      ...c,
      imageHealthy: !brokenSet.has(c.id),
    }));
    return res.json(enriched);
  } catch (error) {
    console.error("Admin get advertisements error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/bulk", adUpload.array("images", 10), async (req: Request, res: Response) => {
  try {
    const parsedAb = adsBulkSchema.safeParse(req.body);
    if (!parsedAb.success) return sendError(res, 400, parsedAb.error.issues[0].message);
    const adBulkData = parsedAb.data as Record<string, string | undefined>;
    const {
      baseName, sponsor, linkUrl, targetUserType,
      displayDuration, rotationDuration, rotationMode,
      sortOrder, startDate, endDate, placement,
      groupId: providedGroupId, startIndex, totalImages,
    } = adBulkData;

    const files = (req.files as Express.Multer.File[]) || [];
    const campaigns = [];
    const failedFiles: string[] = [];
    const groupId = (providedGroupId && providedGroupId.trim()) || crypto.randomUUID();
    const base = (baseName ?? "").trim();
    if (!base) return sendError(res, 400, "baseName obbligatorio");
    const startIdx = startIndex ? parseInt(startIndex) : 0;
    const total = totalImages ? parseInt(totalImages) : files.length;
    const explicitDur = displayDuration ?? rotationDuration;
    let duration = 10;
    if (explicitDur) {
      duration = parseInt(String(explicitDur));
    } else {
      const durSetting = await storage.getAppSetting("ads_rotation_duration");
      if (durSetting?.valueJson != null) duration = Number(durSetting.valueJson);
    }
    const modeSetting = await storage.getAppSetting("ads_rotation_mode");
    const defaultMode = modeSetting?.valueJson != null ? String(modeSetting.valueJson) : "sequential";
    const normalizedTarget = normalizeTargetUserType(targetUserType);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const globalIndex = startIdx + i;
      try {
        const imageUrl = await uploadAdImageToObjectStorage(file.buffer, file.originalname, file.mimetype);
        const campaign = await storage.createAdCampaign({
          name: total === 1 ? base : `${base} #${globalIndex + 1}`,
          sponsor: sponsor || "Syneco Lubrificanti",
          imageUrl,
          linkUrl: linkUrl || null,
          displayMode: "banner",
          targetUserType: normalizedTarget,
          rotationDuration: duration,
          rotationMode: rotationMode || defaultMode,
          sortOrder: (sortOrder ? parseInt(sortOrder) : 0) + globalIndex,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          placement: placement || "all",
          groupId,
        });
        campaigns.push(campaign);
        cacheAdImage(campaign.imageUrl).catch(() => {});
      } catch (e) {
        console.warn(`[ads/bulk] file ${file.originalname} failed:`, e);
        failedFiles.push(file.originalname);
      }
    }

    await safeModLog({
      moderatorId: req.session.userId!,
      action: "bulk_create_advertisements",
      targetType: "campaign",
      targetId: groupId,
      details: `Create ${campaigns.length} campagne in blocco: ${base}`,
    });

    return res.status(201).json({
      created: campaigns.length,
      failed: failedFiles.length,
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl, isActive: c.isActive })),
      failedFiles,
    });
  } catch (error) {
    console.error("Admin bulk advertisement error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

/**
 * Normalize the UI's `targetUserType` ↔ storage contract.
 * UI uses `"tutti"` for the catch-all tab; `getActiveAdsByUserType` filters on
 * `eq(targetUserType, "tutti")`. The strict enum in shared/db/ads.ts uses
 * `"all"` — accept it for backward compat but persist `"tutti"`.
 */
function normalizeTargetUserType(input?: string | null): string {
  const v = (input ?? "").trim();
  if (!v) return "biker";
  if (v === "all" || v === "tutti") return "tutti";
  return v;
}

router.post("/", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const parsedAc = adsCreateSchema.safeParse(req.body);
    if (!parsedAc.success) return sendError(res, 400, parsedAc.error.issues[0].message);
    const { name, sponsor, linkUrl, description, targetUserType, rotationDuration, rotationMode, sortOrder, startDate, endDate, placement } = parsedAc.data;
    let imageUrl: string | null = null;
    if (req.file) {
      imageUrl = await uploadAdImageToObjectStorage(req.file.buffer, req.file.originalname, req.file.mimetype);
    } else if (req.body.imageUrl) {
      if (!String(req.body.imageUrl).startsWith("/api/ads/images/")) {
        return sendError(res, 400, "imageUrl non valido: sono accettati solo percorsi interni");
      }
      imageUrl = req.body.imageUrl;
    }
    // Optional groupId from body: allinea il single-create al bulk (che assegna
     // sempre un groupId) e permette al self-check di esercitare /group/:groupId.
    const groupIdFromBody = typeof req.body.groupId === "string" && req.body.groupId.trim().length > 0
      ? req.body.groupId.trim() : undefined;
    const [durSetting2, modeSetting2] = await Promise.all([
      storage.getAppSetting("ads_rotation_duration"),
      storage.getAppSetting("ads_rotation_mode"),
    ]);
    const defaultDuration2 = durSetting2?.valueJson != null ? Number(durSetting2.valueJson) : 10;
    const defaultMode2 = modeSetting2?.valueJson != null ? String(modeSetting2.valueJson) : "sequential";
    const campaign = await storage.createAdCampaign({
      name,
      sponsor: sponsor || "Syneco Lubrificanti",
      imageUrl,
      linkUrl: linkUrl || null,
      displayMode: "banner",
      description: description || null,
      targetUserType: normalizeTargetUserType(targetUserType),
      rotationDuration: rotationDuration ? parseInt(String(rotationDuration)) : defaultDuration2,
      rotationMode: rotationMode || defaultMode2,
      sortOrder: sortOrder ? parseInt(String(sortOrder)) : 0,
      ...(groupIdFromBody ? { groupId: groupIdFromBody } : {}),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      placement: placement || "all",
    });
    await safeModLog({
      moderatorId: req.session.userId!,
      action: "create_advertisement",
      targetType: "campaign",
      targetId: campaign.id,
      details: `Pubblicità creata: ${campaign.name} (${targetUserType || "biker"})`,
    });
    cacheAdImage(campaign.imageUrl).catch(() => {});
    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Admin create advertisement error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:id", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (id === null) return sendError(res, 400, "ID non valido");
    const parsedAu = adsUpdateSchema.safeParse(req.body);
    if (!parsedAu.success) return sendError(res, 400, parsedAu.error.issues[0].message);
    const adBody = parsedAu.data;
    const updates: Partial<import("@shared/db").InsertAdCampaign> = {};
    if (adBody.name !== undefined) updates.name = adBody.name;
    if (adBody.sponsor !== undefined) updates.sponsor = adBody.sponsor;
    if (adBody.linkUrl !== undefined) updates.linkUrl = adBody.linkUrl;
    if (adBody.description !== undefined) updates.description = adBody.description;
    if (adBody.isActive !== undefined) {
      const v = adBody.isActive;
      updates.isActive = v === true || v === "true";
    }
    if (adBody.targetUserType !== undefined) updates.targetUserType = normalizeTargetUserType(adBody.targetUserType);
    if (adBody.rotationDuration !== undefined) updates.rotationDuration = parseInt(String(adBody.rotationDuration));
    if (adBody.rotationMode !== undefined) updates.rotationMode = adBody.rotationMode;
    if (adBody.sortOrder !== undefined) updates.sortOrder = parseInt(String(adBody.sortOrder));
    if (adBody.startDate !== undefined) updates.startDate = adBody.startDate ? new Date(adBody.startDate) : null;
    if (adBody.endDate !== undefined) updates.endDate = adBody.endDate ? new Date(adBody.endDate) : null;
    if (adBody.placement !== undefined) updates.placement = adBody.placement;
    let oldImageUrl: string | null = null;
    if (req.file) {
      const existing = await storage.getAdCampaign(id);
      oldImageUrl = existing?.imageUrl ?? null;
      updates.imageUrl = await uploadAdImageToObjectStorage(req.file.buffer, req.file.originalname, req.file.mimetype);
      updates.imageVersion = ((existing?.imageVersion ?? 0) + 1);
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
      moderatorId: req.session.userId!,
      action: "update_advertisement",
      targetType: "campaign",
      targetId: id,
      details: `Pubblicità aggiornata: ${campaign.name}`,
    });
    if (req.file || req.body.imageUrl !== undefined) {
      cacheAdImage(campaign.imageUrl).catch(() => {});
    }
    if (req.file && oldImageUrl && oldImageUrl !== updates.imageUrl) {
      const match = oldImageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
      if (match) {
        const filename = match[1];
        if (filename && !filename.includes("..") && !filename.includes("/")) {
          deleteAdImageIfUnreferenced(filename, [id]).catch(() => {});
        }
      }
    }
    return res.json(campaign);
  } catch (error) {
    console.error("Admin update advertisement error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/bulk-delete", async (req: Request, res: Response) => {
  try {
    const parsedBd = adsBulkDeleteSchema.safeParse(req.body);
    if (!parsedBd.success) return sendError(res, 400, parsedBd.error.issues[0].message);
    const { ids } = parsedBd.data;
    const toDelete = await db.select().from(adCampaignsTable).where(inArray(adCampaignsTable.id, ids));
    await db.delete(adCampaignsTable).where(inArray(adCampaignsTable.id, ids));
    for (const campaign of toDelete) {
      if (campaign.imageUrl) {
        const match = campaign.imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
        if (match) {
          const filename = match[1];
          if (filename && !filename.includes("..") && !filename.includes("/")) {
            deleteAdImageIfUnreferenced(filename, ids).catch(() => {});
          }
        }
      }
    }
    await safeModLog({
      moderatorId: req.session.userId!,
      action: "bulk_delete_advertisements",
      targetType: "campaign",
      targetId: ids[0] ?? "bulk",
      details: `Eliminate ${ids.length} campagne in blocco`,
    });
    return sendSuccess(res, { deleted: ids.length });
  } catch (error) {
    console.error("Admin bulk delete advertisements error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/warmup", async (_req: Request, res: Response) => {
  try {
    warmupAdImageCache().catch((e) => console.warn("[ADS WARMUP] manual trigger error:", e));
    return sendSuccess(res, undefined, "Warmup avviato in background");
  } catch (error) {
    console.error("Admin ads warmup error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/group/:groupId", async (req: Request, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const parsedGu = adsGroupUpdateSchema.safeParse(req.body);
    if (!parsedGu.success) return sendError(res, 400, parsedGu.error.issues[0].message);
    const { name, linkUrl, isActive } = parsedGu.data;
    const hasName = typeof name === "string" && name.trim().length > 0;
    const hasLink = linkUrl !== undefined;
    const hasActive = typeof isActive === "boolean";
    if (!hasName && !hasLink && !hasActive) {
      return sendError(res, 400, "Almeno un campo (name, linkUrl, isActive) è obbligatorio");
    }
    const existing = await withDbRetry("[ads/group toggle] select", () =>
      db.select().from(adCampaignsTable).where(eq(adCampaignsTable.groupId, groupId))
    );
    if (existing.length === 0) {
      return sendError(res, 404, "Gruppo non trovato");
    }
    const sorted = [...existing].sort((a, b) => {
      const numA = parseInt(a.name.match(/#(\d+)$/)?.[1] ?? "0");
      const numB = parseInt(b.name.match(/#(\d+)$/)?.[1] ?? "0");
      return numA - numB;
    });
    const updated = [];
    for (let i = 0; i < sorted.length; i++) {
      const updatePayload: Record<string, unknown> = {};
      if (hasName) {
        const trimmed = name!.trim();
        updatePayload.name = sorted.length === 1 ? trimmed : `${trimmed} #${i + 1}`;
      }
      if (hasLink) updatePayload.linkUrl = linkUrl?.trim() || null;
      if (hasActive) updatePayload.isActive = isActive;
      if (Object.keys(updatePayload).length === 0) {
        updated.push(sorted[i]);
        continue;
      }
      const [upd] = await withDbRetry(`[ads/group toggle] update id=${sorted[i].id}`, () =>
        db.update(adCampaignsTable)
          .set(updatePayload)
          .where(eq(adCampaignsTable.id, sorted[i].id))
          .returning()
      );
      updated.push(upd);
    }
    const parts: string[] = [];
    if (hasName) parts.push(`name=${name!.trim()}`);
    if (hasActive) parts.push(`isActive=${isActive}`);
    if (hasLink) parts.push(`linkUrl=${linkUrl ?? "null"}`);
    await safeModLog({
      moderatorId: req.session.userId!,
      action: "update_advertisement_group",
      targetType: "campaign",
      targetId: groupId,
      details: `Gruppo aggiornato (${updated.length} campagne): ${parts.join(", ")}`,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Admin update advertisement group error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const [durSetting, modeSetting] = await Promise.all([
      storage.getAppSetting("ads_rotation_duration"),
      storage.getAppSetting("ads_rotation_mode"),
    ]);
    const duration = durSetting?.valueJson != null ? Number(durSetting.valueJson) : 10;
    const mode = modeSetting?.valueJson != null ? String(modeSetting.valueJson) : "sequential";
    return res.json({ duration, mode });
  } catch (error) {
    console.error("Admin get ads settings error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/settings", async (req: Request, res: Response) => {
  try {
    const { duration, mode } = req.body as { duration?: unknown; mode?: unknown };
    const parsedDuration = typeof duration === "number" ? duration : parseInt(String(duration));
    if (!Number.isFinite(parsedDuration) || parsedDuration < 1) {
      return sendError(res, 400, "duration deve essere un numero intero ≥ 1");
    }
    if (mode !== "sequential" && mode !== "random") {
      return sendError(res, 400, "mode deve essere 'sequential' o 'random'");
    }
    await Promise.all([
      storage.upsertAppSetting("ads_rotation_duration", undefined, parsedDuration),
      storage.upsertAppSetting("ads_rotation_mode", undefined, mode),
    ]);
    await safeModLog({
      moderatorId: req.session.userId!,
      action: "update_advertisement",
      targetType: "campaign",
      targetId: "settings",
      details: `Rotazione impostata: ${parsedDuration}s, modalità ${mode}`,
    });
    return res.json({ duration: parsedDuration, mode });
  } catch (error) {
    console.error("Admin post ads settings error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (id === null) return sendError(res, 400, "ID non valido");
    const campaign = await storage.getAdCampaign(id);
    await storage.deleteCampaign(id);
    if (campaign?.imageUrl) {
      const match = campaign.imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
      if (match) {
        const filename = match[1];
        if (filename && !filename.includes("..") && !filename.includes("/")) {
          deleteAdImageIfUnreferenced(filename, [id]).catch(() => {});
        }
      }
    }
    await safeModLog({
      moderatorId: req.session.userId!,
      action: "delete_advertisement",
      targetType: "campaign",
      targetId: id,
    });
    return sendSuccess(res, undefined, "Pubblicità eliminata");
  } catch (error) {
    console.error("Admin delete advertisement error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
