import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { adCampaigns as adCampaignsTable } from "@shared/db";
import { adsBulkSchema, adsCreateSchema, adsUpdateSchema, adsBulkDeleteSchema, adsGroupUpdateSchema } from "@shared/validators";
import { eq, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadBuffer } from "../../objectStorage";
import { cacheAdImage } from "../ads";
import { sendSuccess, sendError } from "../../lib/api-response";
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

async function deleteAdImageIfUnreferenced(_filename: string, _excludeIds: string[]): Promise<void> {
  // Logic from admin.ts would go here
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Admin get advertisements error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/bulk", adUpload.array("images", 10), async (req: Request, res: Response) => {
  try {
    const parsedAb = adsBulkSchema.safeParse(req.body);
    if (!parsedAb.success) return sendError(res, 400, parsedAb.error.issues[0].message);
    const { name, sponsor, linkUrl, targetUserType, rotationDuration, rotationMode, sortOrder, startDate, endDate, placement } = parsedAb.data as any;

    const files = (req.files as Express.Multer.File[]) || [];
    const groupId = crypto.randomUUID();
    const campaigns = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const imageUrl = await uploadAdImageToObjectStorage(file.buffer, file.originalname, file.mimetype);
      const campaign = await storage.createAdCampaign({
        name: files.length === 1 ? name.trim() : `${name.trim()} #${i + 1}`,
        sponsor: sponsor || "Syneco Lubrificanti",
        imageUrl,
        linkUrl: linkUrl || null,
        displayMode: "banner",
        targetUserType: targetUserType || "biker",
        rotationDuration: rotationDuration ? parseInt(rotationDuration) : 10,
        rotationMode: rotationMode || "sequential",
        sortOrder: (sortOrder ? parseInt(sortOrder) : 0) + i,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        placement: placement || "all",
        groupId,
      });
      campaigns.push(campaign);
      cacheAdImage(campaign.imageUrl).catch(() => {});
    }

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "bulk_create_advertisements",
      targetType: "campaign",
      targetId: groupId,
      details: `Create ${campaigns.length} campagne in blocco: ${name}`,
    });

    return res.status(201).json(campaigns);
  } catch (error) {
    console.error("Admin bulk advertisement error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

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
    const campaign = await storage.createAdCampaign({
      name,
      sponsor: sponsor || "Syneco Lubrificanti",
      imageUrl,
      linkUrl: linkUrl || null,
      displayMode: "banner",
      description: description || null,
      targetUserType: targetUserType || "biker",
      rotationDuration: rotationDuration ? parseInt(String(rotationDuration)) : 10,
      rotationMode: rotationMode || "sequential",
      sortOrder: sortOrder ? parseInt(String(sortOrder)) : 0,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      placement: placement || "all",
    });
    await storage.createModeratorLog({
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
    const adBody = parsedAu.data as any;
    const updates: any = {};
    if (adBody.name !== undefined) updates.name = adBody.name;
    if (adBody.sponsor !== undefined) updates.sponsor = adBody.sponsor;
    if (adBody.linkUrl !== undefined) updates.linkUrl = adBody.linkUrl;
    if (adBody.description !== undefined) updates.description = adBody.description;
    if (adBody.isActive !== undefined) updates.isActive = adBody.isActive === true || adBody.isActive === "true";
    if (adBody.targetUserType !== undefined) updates.targetUserType = adBody.targetUserType;
    if (adBody.rotationDuration !== undefined) updates.rotationDuration = parseInt(adBody.rotationDuration);
    if (adBody.rotationMode !== undefined) updates.rotationMode = adBody.rotationMode;
    if (adBody.sortOrder !== undefined) updates.sortOrder = parseInt(adBody.sortOrder);
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
    await storage.createModeratorLog({
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
    await storage.createModeratorLog({
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

router.put("/group/:groupId", async (req: Request, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const parsedGu = adsGroupUpdateSchema.safeParse(req.body);
    if (!parsedGu.success) return sendError(res, 400, parsedGu.error.issues[0].message);
    const { name, linkUrl, isActive } = parsedGu.data as any;
    if (!name?.trim()) {
      return sendError(res, 400, "Nome base obbligatorio");
    }
    const existing = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.groupId, groupId));
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
      const newName = sorted.length === 1 ? name.trim() : `${name.trim()} #${i + 1}`;
      const updatePayload: Record<string, unknown> = { name: newName, linkUrl: linkUrl?.trim() || null };
      if (typeof isActive === "boolean") updatePayload.isActive = isActive;
      const [upd] = await db.update(adCampaignsTable)
        .set(updatePayload)
        .where(eq(adCampaignsTable.id, sorted[i].id))
        .returning();
      updated.push(upd);
    }
    const activeLabel = typeof isActive === "boolean" ? `, isActive=${isActive}` : "";
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_advertisement_group",
      targetType: "campaign",
      targetId: groupId,
      details: `Gruppo aggiornato: ${name.trim()} (${updated.length} campagne${activeLabel})`,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Admin update advertisement group error:", error);
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
    await storage.createModeratorLog({
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
