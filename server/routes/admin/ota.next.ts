import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { otaReleases } from "@shared/db";
import { eq, desc } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { syncProductionUpdates } from "./ota";

const router = Router();

// PATCH /api/admin/ota/:id/ota-version — imposta manualmente ota_version per una release
// Aggiorna tutti i record dello stesso eas_group_id (Android + iOS insieme)
router.patch("/:id/ota-version", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { otaVersion } = req.body as { otaVersion?: unknown };
    if (!otaVersion || typeof otaVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(otaVersion)) {
      return sendError(res, 400, "otaVersion obbligatorio, formato: MAJOR.MINOR.OTA (es: 54.10.27)");
    }
    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");

    if (release.easGroupId) {
      await db.update(otaReleases)
        .set({ otaVersion })
        .where(eq(otaReleases.easGroupId, release.easGroupId));
    } else {
      await db.update(otaReleases).set({ otaVersion }).where(eq(otaReleases.id, id));
    }
    const [updated] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    console.log(`[ota][AUDIT] release ${id} (group: ${release.easGroupId}) ota-version set to ${otaVersion}`);
    return res.json(updated);
  } catch (err) {
    console.error("[ota] PATCH /:id/ota-version error:", err);
    return sendError(res, 500, "Errore impostazione versione OTA");
  }
});

// POST /api/admin/ota/sync — sync manuale da EAS
router.post("/sync", async (_req: Request, res: Response) => {
  try {
    await syncProductionUpdates();
    const rows = await db.select().from(otaReleases).orderBy(desc(otaReleases.publishedAt));
    return res.json({ synced: true, count: rows.length, releases: rows });
  } catch (err) {
    console.error("[ota] POST /sync error:", err);
    return sendError(res, 500, "Errore sync OTA da EAS");
  }
});

export default router;
