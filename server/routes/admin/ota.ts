import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { otaReleases, appSettings } from "@shared/db";
import { eq, desc, and, sql, ne, inArray, lt } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { storage } from "../../storage";
import { EAS_PROJECT_ID, triggerSyncInBackground, forceSyncNow, syncProductionUpdates } from "./ota-sync";
import otaPart2Router from "./ota.part2";

const router = Router();

// GET /api/admin/ota/releases — restituisce lo storico release con telemetria (ultimi 50 di default)
router.get("/releases", async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const syncFirst = req.query.sync !== "false";
    const limitParam = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 50;

    // Non-blocking: serviamo subito il DB e lasciamo il sync EAS in background.
    if (syncFirst) {
      triggerSyncInBackground();
    }

    // Filtra per status direttamente in SQL (prima del LIMIT) per garantire risultati completi.
    // Le release archiviate (soft-delete) sono escluse di default; ?status=archived per vederle.
    const showArchived = status === "archived";
    const statusWhere = showArchived
      ? eq(otaReleases.status, "archived")
      : status
        ? and(ne(otaReleases.status, "archived"), eq(otaReleases.status, status))
        : ne(otaReleases.status, "archived");

    const rows = await db.select().from(otaReleases)
      .where(statusWhere)
      .orderBy(desc(otaReleases.publishedAt))
      .limit(limit);

    return res.json(rows);
  } catch (err) {
    console.error("[ota] GET /releases error:", err);
    return sendError(res, 500, "Errore recupero OTA releases");
  }
});

// POST /api/admin/ota/prune — archivia release rejected e pending obsolete (soft-delete via status='archived').
// Usa soft-delete invece di DELETE per preservare l'integrità referenziale con ota_boot_events
// (onDelete: cascade). Solo record con telemetria zero vengono archiviati.
// Deve stare PRIMA di /:id/... per non essere catturata dal parametro dinamico.
router.post("/prune", async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    // Trova la release approved più recente sul canale production come baseline.
    const [latestApproved] = await withDbRetry(() => db
      .select({ publishedAt: otaReleases.publishedAt })
      .from(otaReleases)
      .where(and(eq(otaReleases.status, "approved"), eq(otaReleases.channel, "production")))
      .orderBy(desc(otaReleases.publishedAt))
      .limit(1));

    const baselineTs = latestApproved?.publishedAt ?? null;

    let rejectedQuery;
    if (baselineTs) {
      rejectedQuery = sql`
        UPDATE ota_releases
        SET status = 'archived'
        WHERE status = 'rejected'
          AND channel = 'production'
          AND boot_success_count = 0
          AND boot_failure_count = 0
          AND published_at < ${baselineTs}
      `;
    } else {
      rejectedQuery = sql`
        UPDATE ota_releases
        SET status = 'archived'
        WHERE status = 'rejected'
          AND channel = 'production'
          AND boot_success_count = 0
          AND boot_failure_count = 0
      `;
    }
    const rejectedResult = await withDbRetry(() => db.execute(rejectedQuery));
    const archivedRejected = (rejectedResult as { rowCount?: number }).rowCount ?? 0;

    let pendingQuery;
    if (baselineTs) {
      pendingQuery = sql`
        UPDATE ota_releases
        SET status = 'archived'
        WHERE status = 'pending'
          AND channel = 'production'
          AND boot_success_count = 0
          AND boot_failure_count = 0
          AND published_at < ${baselineTs}
      `;
    } else {
      pendingQuery = sql`
        UPDATE ota_releases
        SET status = 'archived'
        WHERE status = 'pending'
          AND channel = 'production'
          AND boot_success_count = 0
          AND boot_failure_count = 0
          AND id NOT IN (
            SELECT id FROM ota_releases
            WHERE status = 'pending' AND channel = 'production'
            ORDER BY published_at DESC
            LIMIT 20
          )
      `;
    }
    const pendingResult = await withDbRetry(() => db.execute(pendingQuery));
    const archivedOldPending = (pendingResult as { rowCount?: number }).rowCount ?? 0;

    console.log(`[ota][PRUNE] archived ${archivedRejected} rejected + ${archivedOldPending} old pending (soft-delete, telemetry=0 only, baseline=${latestApproved?.publishedAt?.toISOString() ?? "none"})`);
    return res.json({ ok: true, archivedRejected, archivedOldPending, archivedAt: now.toISOString() });
  } catch (err) {
    console.error("[ota] POST /prune error:", err);
    return sendError(res, 500, "Errore pulizia OTA releases");
  }
});

// POST /api/admin/ota/sync — forza una sincronizzazione sincrona con EAS.
// Questa route DEVE stare PRIMA di /:id/... per non essere catturata dal parametro dinamico.
// Task #802 — timeout esplicito 45s: restituisce JSON 504 invece di lasciare che
// sia il proxy Replit a tagliare la connessione con HTML (→ "Risposta non valida").
const SYNC_TIMEOUT_MS = 45_000;
router.post("/sync", async (_req: Request, res: Response) => {
  if (!(process.env.EAS_TOKEN ?? process.env.EXPO_TOKEN)) {
    return res.status(503).json({ ok: false, message: "EAS_TOKEN / EXPO_TOKEN non configurato sul server. Impossibile contattare EAS." });
  }
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("SYNC_TIMEOUT")), SYNC_TIMEOUT_MS);
  });
  try {
    const { inserted, backfilled } = await Promise.race([forceSyncNow(), timeoutPromise]);
    clearTimeout(timeoutHandle);
    console.log(`[ota][SYNC] sync manuale completato: ${inserted} nuove, ${backfilled} backfill`);
    return res.json({ ok: true, inserted, backfilled, syncedAt: new Date().toISOString() });
  } catch (err) {
    clearTimeout(timeoutHandle);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "SYNC_TIMEOUT") {
      console.warn("[ota] POST /sync timeout dopo 45s");
      return res.status(504).json({ ok: false, message: "Sync EAS timeout (>45s): il server è sotto carico, riprova tra qualche istante." });
    }
    console.error("[ota] POST /sync error:", err);
    return res.status(502).json({ ok: false, message: `Errore sincronizzazione EAS: ${msg}` });
  }
});

// ── Task #5087 — Canale Emergenza (EMCY) ────────────────────────────────────
// Queste route DEVONO stare PRIMA di /:id/... per non essere catturate dal
// parametro dinamico ("emergency" verrebbe trattato come :id).

// GET /api/admin/ota/emergency/status — stato del redirect emergenza + release del canale.
router.get("/emergency/status", async (_req: Request, res: Response) => {
  try {
    const [row] = await withDbRetry(() => db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "ota_emergency_active"))
      .limit(1));
    const active = row?.value === "true";

    const releases = await withDbRetry(() => db
      .select()
      .from(otaReleases)
      .where(and(eq(otaReleases.channel, "emergency"), ne(otaReleases.status, "archived")))
      .orderBy(desc(otaReleases.publishedAt))
      .limit(50));

    return res.json({ active, releases });
  } catch (err) {
    console.error("[ota] GET /emergency/status error:", err);
    return sendError(res, 500, "Errore recupero stato canale emergenza");
  }
});

// POST /api/admin/ota/emergency/toggle — attiva/disattiva il redirect del manifest.
router.post("/emergency/toggle", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as { active?: unknown };
    if (typeof body.active !== "boolean") {
      return sendError(res, 400, "Campo 'active' (boolean) obbligatorio");
    }
    const value = body.active ? "true" : "false";

    // Guard: non attivare il redirect se non esiste alcuna release emergency approvata.
    if (body.active) {
      const [approved] = await db
        .select({ id: otaReleases.id })
        .from(otaReleases)
        .where(and(eq(otaReleases.channel, "emergency"), eq(otaReleases.status, "approved")))
        .limit(1);
      if (!approved) {
        return sendError(res, 400, "Nessuna release EMCY approvata: approva prima una release sul canale emergency, poi attiva il redirect.");
      }
    }

    await storage.upsertAppSetting(
      "ota_emergency_active",
      value,
      undefined,
      "quando true, /api/ota/manifest serve il canale emergency invece di production.",
    );
    console.log(`[ota][AUDIT] EMERGENCY redirect ${value === "true" ? "ATTIVATO" : "disattivato"} by user ${userId}`);
    return res.json({ ok: true, active: body.active });
  } catch (err) {
    console.error("[ota] POST /emergency/toggle error:", err);
    return sendError(res, 500, "Errore aggiornamento canale emergenza");
  }
});

// POST /api/admin/ota/:id/approve — promuove la release a `approved` (visibile a tutti gli utenti)
router.post("/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.session.userId!;

    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");
    if (release.status !== "pending") return sendError(res, 400, `Stato non valido: ${release.status} (atteso: pending)`);

    if (!release.easGroupId) {
      return sendError(res, 400, "Questa release non ha un groupId EAS. Ri-sincronizza prima dal pannello admin (pulsante Sync).");
    }

    // UPDATE atomico con guard sullo status — previene race con worker auto-rollback o doppio click.
    // Task #5087: preserviamo il canale esistente (production O emergency) invece di forzare "production".
    const [updated] = await db
      .update(otaReleases)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        channel: release.channel,
      })
      .where(and(eq(otaReleases.id, id), eq(otaReleases.status, "pending")))
      .returning();

    if (!updated) {
      return sendError(res, 409, "Lo stato della release è cambiato (race con altro admin o auto-rollback). Ricarica e riprova.");
    }

    console.log(`[ota][AUDIT] release ${id} (${release.easUpdateId}) APPROVED by user ${userId}`);

    // Auto-reject solo le OTA pending pubblicate PRIMA di quella approvata (non le future)
    const otherPending = await db
      .select({ id: otaReleases.id, easUpdateId: otaReleases.easUpdateId })
      .from(otaReleases)
      .where(and(eq(otaReleases.status, "pending"), eq(otaReleases.channel, release.channel), ne(otaReleases.id, id), lt(otaReleases.publishedAt, release.publishedAt)));
    if (otherPending.length > 0) {
      await db
        .update(otaReleases)
        .set({ status: "rejected", rejectedAt: new Date(), rejectedBy: null })
        .where(inArray(otaReleases.id, otherPending.map((r) => r.id)));
      console.log(`[ota][AUDIT] auto-rejected ${otherPending.length} OTA obsolete: ${otherPending.map((r) => r.easUpdateId).join(", ")}`);
    }

    return res.json(updated);
  } catch (err) {
    console.error("[ota] POST /:id/approve error:", err);
    return sendError(res, 500, "Errore approvazione OTA");
  }
});

// POST /api/admin/ota/:id/reject — marca come rifiutata (nessun utente, neanche admin, la riceve)
router.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.session.userId!;

    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");
    if (release.status !== "pending") return sendError(res, 400, `Stato non valido: ${release.status} (atteso: pending)`);

    const [updated] = await db
      .update(otaReleases)
      .set({
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: userId,
      })
      .where(and(eq(otaReleases.id, id), eq(otaReleases.status, "pending")))
      .returning();

    if (!updated) {
      return sendError(res, 409, "Lo stato della release è cambiato (race con altro admin o auto-rollback). Ricarica e riprova.");
    }

    console.log(`[ota][AUDIT] release ${id} (${release.easUpdateId}) REJECTED by user ${userId}`);
    return res.json(updated);
  } catch (err) {
    console.error("[ota] POST /:id/reject error:", err);
    return sendError(res, 500, "Errore rifiuto OTA");
  }
});

// GET /api/admin/ota/:id/try — utility legacy per costruire URL manifest manuale
router.get("/:id/try", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");

    const manifestUrl = `https://u.expo.dev/${EAS_PROJECT_ID}?channel-name=production&runtime-version=${encodeURIComponent(release.runtimeVersion ?? "10.0.0")}`;

    return res.json({
      easUpdateId: release.easUpdateId,
      easGroupId: release.easGroupId,
      channel: release.channel,
      runtimeVersion: release.runtimeVersion,
      manifestUrl,
      message: release.message,
    });
  } catch (err) {
    console.error("[ota] GET /:id/try error:", err);
    return sendError(res, 500, "Errore recupero manifest OTA");
  }
});

// Route EAS-exec (rollback, republish, auto-rollback) + utility (failure-devices, timing-log)
// montate dal subrouter ota.part2.ts per rispettare il limite di 600 righe per file.
router.use("/", otaPart2Router);

export default router;
export { syncProductionUpdates };
