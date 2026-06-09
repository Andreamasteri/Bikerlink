import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { users, userProfiles } from "@shared/db";
import { eq } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { storage } from "../../storage";

const router = Router();

router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!rows.length) return sendError(res, 404, "Utente non trovato");
    const { password: _, ...safe } = rows[0];
    return res.json(safe);
  } catch (err) {
    console.error("[admin/users/:userId GET] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:userId/privacy-settings", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const [userRow, profile] = await Promise.all([
      storage.getUser(userId),
      storage.getUserProfile(userId),
    ]);
    if (!userRow) return sendError(res, 404, "Utente non trovato");
    return res.json({
      ghostMode: userRow.ghostMode,
      fixedPositionEnabled: profile?.fixedPositionEnabled ?? false,
      fixedPositionLat: profile?.fixedPositionLat ?? null,
      fixedPositionLng: profile?.fixedPositionLng ?? null,
      hideFromMap: profile?.hideFromMap ?? false,
      hideOnlineStatus: profile?.hideOnlineStatus ?? false,
      hideLastSeen: profile?.hideLastSeen ?? false,
      hideDistance: profile?.hideDistance ?? false,
      offlinePositionRandomize: profile?.offlinePositionRandomize ?? true,
      positionFuzz: profile?.positionFuzz ?? false,
      positionFuzzKm: profile?.positionFuzzKm ?? 1,
      fakeHomeEnabled: profile?.fakeHomeEnabled ?? false,
      fakeWorkEnabled: profile?.fakeWorkEnabled ?? false,
      fakeWhateverEnabled: profile?.fakeWhateverEnabled ?? false,
      gpsPrecision: profile?.gpsPrecision ?? "balanced",
    });
  } catch (err) {
    console.error("[admin/users/:userId/privacy-settings GET] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:userId/telemetry-disabled", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const { disabled } = req.body as { disabled?: unknown };
    if (typeof disabled !== "boolean") {
      return sendError(res, 400, "disabled deve essere un booleano");
    }
    await db
      .update(users)
      .set({ telemetryDisabled: disabled, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return res.json({ userId, telemetryDisabled: disabled });
  } catch (err) {
    console.error("[admin/users/:userId/telemetry-disabled] error:", err);
    return sendError(res, 500, "Errore aggiornamento telemetry_disabled");
  }
});

router.put("/:userId/matching-disabled", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const { matchingDisabled } = req.body as { matchingDisabled?: unknown };
    if (typeof matchingDisabled !== "boolean") {
      return sendError(res, 400, "matchingDisabled deve essere un booleano");
    }
    const result = await db
      .update(users)
      .set({ matchingDisabled, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (!result.length) return sendError(res, 404, "Utente non trovato");
    return res.json({ userId, matchingDisabled });
  } catch (err) {
    console.error("[admin/users/:userId/matching-disabled] error:", err);
    return sendError(res, 500, "Errore aggiornamento matching_disabled");
  }
});

export default router;
