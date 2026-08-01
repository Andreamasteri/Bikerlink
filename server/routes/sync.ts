// Task #997 — Endpoint admin per trigger manuale e status del sync prod→dev.
//
// Espone, dietro _requireAdmin (montato in server/routes/admin.ts):
//   GET /db/sync/status → { available, inProgress, lastSync, nextScheduledAt }
//   POST /db/sync/run   → avvia syncProdToDev() in foreground e restituisce
//                          { ok, error? } + aggiorna getSyncStatus().
//
// Sicurezza: solo admin autenticati (gate applicato al mount point in admin.ts).
// Idempotenza: sync-service.ts gestisce internamente il mutex isSyncing.

import { Router, type Request, type Response } from "express";
import { sendError } from "../lib/api-response";
import { isSyncAvailable, syncProdToDev, getSyncStatus } from "../sync-service";

const router = Router();

// GET /db/sync/status
// Restituisce lo stato corrente del sync: disponibilità, eventuale sync in corso,
// metadati dell'ultimo sync (ok/error/timestamp) e timestamp del prossimo automatico.
router.get("/db/sync/status", async (_req: Request, res: Response) => {
  try {
    const status = await getSyncStatus();
    return res.json(status);
  } catch (err) {
    console.error("[admin/db/sync/status] error:", err);
    return sendError(res, 500, "Errore lettura stato sync");
  }
});

// POST /db/sync/run
// Avvia un sync manuale prod→dev.
// Se il sync non è disponibile (ambiente di produzione o DATABASE_URL_DEV assente)
// restituisce 409 con spiegazione. Se è già in corso restituisce 409.
// In caso di errore del pg_dump/psql restituisce 500 con il messaggio d'errore.
router.post("/db/sync/run", async (_req: Request, res: Response) => {
  if (!isSyncAvailable()) {
    return sendError(
      res,
      409,
      process.env.BIKERLINK_DEPLOY_ENV === "production" || process.env.NODE_ENV === "production"
        ? "Sync non disponibile in ambiente di produzione"
        : "DATABASE_URL_DEV non configurato — branch dev Neon non ancora presente",
    );
  }

  try {
    const result = await syncProdToDev();
    if (!result.ok) {
      // Errori gestiti: "Sync già in corso", binario mancante, psql error, ecc.
      return res.status(409).json({ ok: false, error: result.error });
    }
    const status = await getSyncStatus();
    return res.json({ ok: true, lastSync: status.lastSync });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/db/sync/run] unexpected error:", err);
    return sendError(res, 500, `Errore sync: ${msg}`);
  }
});

export default router;
