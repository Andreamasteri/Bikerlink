import { Router, type Request, type Response } from "express";
import { syncStagingUpdates } from "./admin/ota";
import { db } from "../db";
import { otaReleases } from "@shared/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

function checkSecret(req: Request, res: Response): boolean {
  const secret = process.env.OTA_PUBLISH_SECRET;
  if (!secret) {
    res.status(503).json({ success: false, message: "OTA_PUBLISH_SECRET non configurato sul server" });
    return false;
  }
  const auth = req.header("Authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (provided !== secret) {
    res.status(401).json({ success: false, message: "Secret non valido" });
    return false;
  }
  return true;
}

router.post("/force-approve", async (req: Request, res: Response) => {
  if (!checkSecret(req, res)) return;

  try {
    await syncStagingUpdates();

    const easGroupId: string | undefined = typeof req.body?.easGroupId === "string"
      ? req.body.easGroupId
      : undefined;

    let query;
    if (easGroupId) {
      query = db.select().from(otaReleases)
        .where(and(eq(otaReleases.easGroupId, easGroupId), eq(otaReleases.status, "pending")))
        .orderBy(desc(otaReleases.publishedAt))
        .limit(1);
    } else {
      query = db.select().from(otaReleases)
        .where(eq(otaReleases.status, "pending"))
        .orderBy(desc(otaReleases.publishedAt))
        .limit(1);
    }

    const [pending] = await query;

    if (!pending) {
      const [approved] = await db.select().from(otaReleases)
        .where(eq(otaReleases.status, "approved"))
        .orderBy(desc(otaReleases.publishedAt))
        .limit(1);
      return res.json({
        success: true,
        message: "Nessun pending trovato — già approvato in precedenza",
        approved: approved ?? null,
      });
    }

    await db.update(otaReleases)
      .set({ status: "approved", approvedAt: new Date(), approvedBy: null })
      .where(eq(otaReleases.id, pending.id));

    console.log(`[ota-webhook] force-approved updateId=${pending.easUpdateId} groupId=${pending.easGroupId}`);

    return res.json({
      success: true,
      message: "OTA approvato e distribuito",
      approved: { ...pending, status: "approved" },
    });
  } catch (err) {
    console.error("[ota-webhook] force-approve error:", err);
    return res.status(500).json({ success: false, message: String(err) });
  }
});

export default router;
