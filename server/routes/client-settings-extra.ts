import type { Express } from "express";
import { isValhallaAvailableCached } from "../routing/valhalla-client";

/**
 * Rotte di impostazioni client aggiuntive (overflow di client-settings.ts, che è
 * bloccato a dimensione massima — vedi header di quel file).
 */
export function registerClientSettingsExtraRoutes(app: Express) {
  // Gate pubblico per il profilo "auto panoramica" (auto_curvy): vero solo se il
  // server Valhalla self-hosted è configurato e raggiungibile. Il client usa
  // questo flag per mostrare/nascondere l'opzione nel pianificatore giri.
  app.get("/api/settings/valhalla-available", async (_req, res) => {
    try {
      const available = await isValhallaAvailableCached();
      res.json({ available });
    } catch (err) {
      console.warn("[client-settings-extra] valhalla-available check failed:", err);
      res.json({ available: false });
    }
  });
}
