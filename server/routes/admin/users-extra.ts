import { Router, type Request, type Response } from "express";
import { db, pool } from "../../db";
import { users, userPrivacyLog } from "@shared/db";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { storage } from "../../storage";
import { SERVICE_EMAILS } from "@shared/service-emails";

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

// ── DELETE /api/admin/users/:userId/calibration ───────────────────────────────
router.delete("/:userId/calibration", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const result = await db
      .update(users)
      .set({ mountCalibration: sql`NULL`, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (!result.length) return sendError(res, 404, "Utente non trovato");
    console.log(`[admin] calibrazione resettata per utente ${userId}`);
    return res.json({ ok: true, userId });
  } catch (err) {
    console.error("[admin/users/:userId/calibration DELETE] error:", err);
    return sendError(res, 500, "Errore reset calibrazione");
  }
});

router.get("/:userId/privacy-overview", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const [userRow, profile] = await Promise.all([
      storage.getUser(userId),
      storage.getUserProfile(userId),
    ]);
    if (!userRow) return sendError(res, 404, "Utente non trovato");

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const logRows = await db
      .select({
        settingKey: userPrivacyLog.settingKey,
        newValue: userPrivacyLog.newValue,
        changedAt: userPrivacyLog.changedAt,
      })
      .from(userPrivacyLog)
      .where(
        and(
          eq(userPrivacyLog.userId, userId),
          gte(userPrivacyLog.changedAt, sevenDaysAgo),
        ),
      )
      .orderBy(desc(userPrivacyLog.changedAt))
      .limit(200);

    const logByKey: Record<string, Array<{ newValue: boolean; changedAt: string }>> = {};
    for (const row of logRows) {
      if (!logByKey[row.settingKey]) logByKey[row.settingKey] = [];
      logByKey[row.settingKey].push({
        newValue: row.newValue,
        changedAt: row.changedAt.toISOString(),
      });
    }

    return res.json({
      currentSettings: {
        ghost_mode: userRow.ghostMode,
        hide_from_map: profile?.hideFromMap ?? false,
        position_fuzz: profile?.positionFuzz ?? false,
        position_fuzz_km: profile?.positionFuzzKm ?? 1,
        fixed_position_enabled: profile?.fixedPositionEnabled ?? false,
        fake_home_enabled: profile?.fakeHomeEnabled ?? false,
        fake_work_enabled: profile?.fakeWorkEnabled ?? false,
        fake_whatever_enabled: profile?.fakeWhateverEnabled ?? false,
        offline_position_randomize: profile?.offlinePositionRandomize ?? true,
        continuous_gps: (profile?.gpsPrecision ?? "balanced") === "continuous",
        gps_precision: profile?.gpsPrecision ?? "balanced",
      },
      log: logByKey,
    });
  } catch (err) {
    console.error("[admin/users/:userId/privacy-overview] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:userId/profile", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const { userType, sex, birthYear, region } = req.body as {
      userType?: unknown;
      sex?: unknown;
      birthYear?: unknown;
      region?: unknown;
    };

    const validUserTypes = ["biker", "zavorrina", "coppia"];
    if (userType !== undefined && !validUserTypes.includes(userType as string)) {
      return sendError(res, 400, "Tipo utente non valido");
    }
    if (sex !== undefined && sex !== null && sex !== "M" && sex !== "F") {
      return sendError(res, 400, "Sesso non valido (M / F)");
    }
    if (birthYear !== undefined && birthYear !== null) {
      const by = Number(birthYear);
      if (!Number.isInteger(by) || by < 1920 || by > new Date().getFullYear()) {
        return sendError(res, 400, "Anno di nascita non valido");
      }
    }

    const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!rows.length) return sendError(res, 404, "Utente non trovato");

    await db.update(users).set({
      ...(userType !== undefined ? { userType: userType as "biker" | "zavorrina" | "coppia" } : {}),
      ...(sex !== undefined ? { sex: (sex as "M" | "F" | null) ?? null } : {}),
      ...(birthYear !== undefined ? { birthYear: birthYear !== null ? Number(birthYear) : null } : {}),
      ...(region !== undefined ? { region: typeof region === "string" ? region.trim() || null : null } : {}),
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    const updated = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!updated.length) return sendError(res, 404, "Utente non trovato");
    const { password: _, ...safe } = updated[0];
    return res.json(safe);
  } catch (err) {
    console.error("[admin/users/:userId/profile PUT] error:", err);
    return sendError(res, 500, "Errore aggiornamento profilo");
  }
});

router.post("/fix-system-accounts", async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const result = await client.query<{ email: string }>(`
      UPDATE users SET is_system = true
      WHERE LOWER(email) = ANY($1::text[])
        AND is_system = false
      RETURNING email
    `, [SERVICE_EMAILS]);
    const updated = result.rows.map((r) => r.email);
    const count = result.rowCount ?? 0;
    console.log(`[admin/fix-system-accounts] aggiornati ${count} account:`, updated);
    return res.json({ success: true, updated: count, accounts: updated });
  } catch (err) {
    console.error("[admin/fix-system-accounts] error:", err);
    return sendError(res, 500, "Errore correzione flag is_system");
  } finally {
    client.release();
  }
});

router.patch("/:userId/ais", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const rows = await db
      .select({ aisEnabled: users.aisEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!rows.length) return sendError(res, 404, "Utente non trovato");
    const newValue = !rows[0].aisEnabled;
    await db
      .update(users)
      .set({ aisEnabled: newValue, updatedAt: new Date() })
      .where(eq(users.id, userId));
    console.log(`[admin/users/${userId}/ais] aisEnabled=${newValue}`);
    return res.json({ userId, aisEnabled: newValue });
  } catch (err) {
    console.error("[admin/users/:userId/ais] error:", err);
    return sendError(res, 500, "Errore aggiornamento ais_enabled");
  }
});

export default router;
