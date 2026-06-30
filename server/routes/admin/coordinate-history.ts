import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { sendError } from "../../lib/api-response";

const router = Router();

router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const [enabled, interval, maxRecords, mode, selectedUsers] = await Promise.all([
      storage.getAppSetting("coordinate_history_enabled"),
      storage.getAppSetting("coordinate_history_interval"),
      storage.getAppSetting("coordinate_history_max_records"),
      storage.getAppSetting("coordinate_history_mode"),
      storage.getAppSetting("coordinate_history_users"),
    ]);
    return res.json({
      enabled: enabled?.value === "true",
      interval: interval?.value ? parseInt(interval.value, 10) : 30,
      maxRecords: maxRecords?.value ? parseInt(maxRecords.value, 10) : 60,
      mode: mode?.value || "all",
      selectedUsers: selectedUsers?.value ? JSON.parse(selectedUsers.value) : [],
    });
  } catch {
    return res.json({ enabled: false, interval: 30, maxRecords: 60, mode: "all", selectedUsers: [] });
  }
});

router.put("/settings", async (req: Request, res: Response) => {
  try {
    const { enabled, interval, maxRecords, mode, selectedUsers } = req.body ?? {};

    if (interval !== undefined) {
      const iv = parseInt(String(interval), 10);
      if (isNaN(iv) || iv < 5) return sendError(res, 400, "interval deve essere >= 5");
      await storage.upsertAppSetting("coordinate_history_interval", String(iv));
    }
    if (maxRecords !== undefined) {
      const mr = parseInt(String(maxRecords), 10);
      if (isNaN(mr) || mr < 1) return sendError(res, 400, "maxRecords deve essere >= 1");
      await storage.upsertAppSetting("coordinate_history_max_records", String(mr));
    }
    if (mode !== undefined) {
      if (!["all", "selected"].includes(mode)) return sendError(res, 400, "mode deve essere 'all' o 'selected'");
      await storage.upsertAppSetting("coordinate_history_mode", mode);
    }
    if (selectedUsers !== undefined) {
      if (!Array.isArray(selectedUsers)) return sendError(res, 400, "selectedUsers deve essere un array");
      await storage.upsertAppSetting("coordinate_history_users", JSON.stringify(selectedUsers));
    }
    if (enabled !== undefined) {
      await storage.upsertAppSetting("coordinate_history_enabled", enabled ? "true" : "false");
    }

    const [enS, ivS, mrS, modeS, usersS] = await Promise.all([
      storage.getAppSetting("coordinate_history_enabled"),
      storage.getAppSetting("coordinate_history_interval"),
      storage.getAppSetting("coordinate_history_max_records"),
      storage.getAppSetting("coordinate_history_mode"),
      storage.getAppSetting("coordinate_history_users"),
    ]);
    return res.json({
      enabled: enS?.value === "true",
      interval: ivS?.value ? parseInt(ivS.value, 10) : 30,
      maxRecords: mrS?.value ? parseInt(mrS.value, 10) : 60,
      mode: modeS?.value || "all",
      selectedUsers: usersS?.value ? JSON.parse(usersS.value) : [],
    });
  } catch (err) {
    console.error("[CoordinateHistory admin] PUT /settings error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await storage.getCoordinateHistoryStats();
    return res.json(stats);
  } catch (err) {
    console.error("[CoordinateHistory admin] GET /stats error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
