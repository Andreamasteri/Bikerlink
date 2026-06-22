import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { adCampaigns as adCampaignsTable } from "@shared/db";
import { adsGroupUpdateSchema } from "@shared/validators";
import { eq } from "drizzle-orm";
import { sendSuccess, sendError } from "../../lib/api-response";
import { safeModLog } from "../../lib/safe-mod-log";
import { withDbRetry } from "../../lib/db-retry";

function paramStr(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

export const adActionRouter = Router();

adActionRouter.put("/group/:groupId", async (req: Request, res: Response) => {
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

adActionRouter.get("/settings", async (_req: Request, res: Response) => {
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

adActionRouter.post("/settings", async (req: Request, res: Response) => {
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

adActionRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (id === null) return sendError(res, 400, "ID non valido");
    const campaign = await storage.getAdCampaign(id);
    await storage.deleteCampaign(id);
    const { deleteAdImageIfUnreferenced } = await import("./advertisements");
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
