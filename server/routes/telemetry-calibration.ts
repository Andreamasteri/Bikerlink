import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { requireUserId } from "../lib/auth-middleware";
import { sendError } from "../lib/api-response";

const router = Router();

router.get("/sensor-settings", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const [globalSetting, userRow] = await Promise.all([
      storage.getAppSetting("telemetry_sensors_global_enabled"),
      withDbRetry(() => db.execute(sql`SELECT telemetry_disabled FROM users WHERE id = ${userId} LIMIT 1`)),
    ]);

    const globalEnabled = globalSetting?.value !== "false";
    const userRow0 = userRow.rows[0] as { telemetry_disabled?: boolean } | undefined;
    const userEnabled = !(userRow0?.telemetry_disabled ?? false);

    return res.json({ globalEnabled, userEnabled });
  } catch (err) {
    console.error("[telemetry/sensor-settings] error:", err);
    return sendError(res, 500, "Errore lettura impostazioni sensori");
  }
});

router.get("/calibration", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const result = await withDbRetry(() => db.execute(sql`
      SELECT mount_calibration FROM users WHERE id = ${userId} LIMIT 1
    `));
    const row = result.rows[0] as { mount_calibration: unknown } | undefined;
    return res.json({ calibration: row?.mount_calibration ?? null });
  } catch (err) {
    console.error("[telemetry/calibration GET] error:", err);
    return sendError(res, 500, "Errore lettura calibrazione");
  }
});

router.put("/calibration", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { calibration } = req.body as { calibration: unknown };

    if (calibration !== null && calibration !== undefined) {
      const c = calibration as Record<string, unknown>;
      const validAxes = ["x", "y", "z"];
      if (
        !validAxes.includes(c.longAxis as string) ||
        !validAxes.includes(c.latAxis as string) ||
        !validAxes.includes(c.vertAxis as string) ||
        (c.longSign !== 1 && c.longSign !== -1) ||
        typeof c.timestamp !== "number"
      ) {
        return sendError(res, 400, "Payload calibrazione non valido");
      }
    }

    const value = calibration == null ? null : JSON.stringify(calibration);
    await db.execute(sql`
      UPDATE users
      SET mount_calibration = ${value}::jsonb, updated_at = NOW()
      WHERE id = ${userId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[telemetry/calibration PUT] error:", err);
    return sendError(res, 500, "Errore salvataggio calibrazione");
  }
});

router.delete("/reset", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const result = await db.execute(sql`
      DELETE FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_type NOT IN ('ideal_lap')
    `);

    // Task #81 — allinea il riepilogo incrementale: /reset cancella solo le
    // sessioni non-ideal_lap, quindi rimuovi le stesse righe di riepilogo.
    await db.execute(sql`
      DELETE FROM telemetry_session_stats
      WHERE user_id = ${userId}
        AND session_type NOT IN ('ideal_lap')
    `);

    const deleted = result.rowCount ?? 0;
    return res.json({ deleted });
  } catch (err) {
    console.error("[telemetry/reset] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
