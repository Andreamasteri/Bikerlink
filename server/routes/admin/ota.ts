import { Router, type Request, type Response } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { db, withDbRetry } from "../../db";
import { otaReleases, appSettings } from "@shared/db";
import { eq, desc, and, sql, ne, inArray, lt } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { EAS_PROJECT_ID, triggerSyncInBackground, forceSyncNow, syncProductionUpdates } from "./ota-sync";

const execFileAsync = promisify(execFile);

const router = Router();

// GET /api/admin/ota/releases — restituisce lo storico release con telemetria (ultimi 50 di default)
router.get("/releases", async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const syncFirst = req.query.sync !== "false";
    const limitParam = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 50;

    // Non-blocking: serviamo subito il DB e lasciamo il sync EAS in background.
    // I nuovi update appariranno alla chiamata successiva (entro la finestra TTL).
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

    const filtered = rows;

    return res.json(filtered);
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
    // Se non esiste, usiamo un cutoff fisso: mantieni le 20 pending più recenti.
    const [latestApproved] = await withDbRetry(() => db
      .select({ publishedAt: otaReleases.publishedAt })
      .from(otaReleases)
      .where(and(eq(otaReleases.status, "approved"), eq(otaReleases.channel, "production")))
      .orderBy(desc(otaReleases.publishedAt))
      .limit(1));

    // Baseline timestamp: se esiste una release approved su production, archivia tutto ciò che è più vecchio.
    // Altrimenti: per i rejected archivia tutto; per i pending teniamo i 20 più recenti.
    const baselineTs = latestApproved?.publishedAt ?? null;

    // Archivia rejected sul canale production con telemetria zero.
    // Con baseline: solo quelli più vecchi della release approvata.
    // Senza baseline: tutti i rejected con telemetria zero.
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

    // Archivia pending obsolete con telemetria zero.
    // Con baseline: più vecchi della release approvata.
    // Senza baseline: tutti eccetto i 20 più recenti per canale production.
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

// POST /api/admin/ota/sync — forza una sincronizzazione sincrona con EAS e restituisce JSON con il risultato.
// Questa route DEVE stare PRIMA di /:id/... per non essere catturata dal parametro dinamico.
router.post("/sync", async (_req: Request, res: Response) => {
  if (!process.env.EAS_TOKEN) {
    return res.status(503).json({ ok: false, message: "EAS_TOKEN non configurato sul server. Impossibile contattare EAS." });
  }
  try {
    const { inserted, backfilled } = await forceSyncNow();
    console.log(`[ota][SYNC] sync manuale completato: ${inserted} nuove, ${backfilled} backfill`);
    return res.json({ ok: true, inserted, backfilled, syncedAt: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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

// POST /api/admin/ota/emergency/toggle — attiva/disattiva il redirect del manifest
// verso il canale emergency. body: { active: boolean }.
router.post("/emergency/toggle", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as { active?: unknown };
    if (typeof body.active !== "boolean") {
      return sendError(res, 400, "Campo 'active' (boolean) obbligatorio");
    }
    const value = body.active ? "true" : "false";

    // Guard: non attivare il redirect se non esiste alcuna release emergency approvata,
    // altrimenti i device riceverebbero allowed:false e resterebbero senza OTA.
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

    const [existing] = await db
      .select({ id: appSettings.id })
      .from(appSettings)
      .where(eq(appSettings.key, "ota_emergency_active"))
      .limit(1);
    if (existing) {
      await db.update(appSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(appSettings.key, "ota_emergency_active"));
    } else {
      await db.insert(appSettings).values({
        key: "ota_emergency_active",
        value,
        description: "Task #5087 — quando true, /api/ota/manifest serve il canale emergency invece di production.",
      });
    }

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
    // Task #5087: preserviamo il canale esistente (production O emergency) invece di forzare
    // "production", altrimenti approvare una EMCY la sposterebbe per errore sul canale normale.
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

    // UPDATE atomico con guard sullo status — previene race con worker auto-rollback o doppio click
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

// POST /api/admin/ota/:id/rollback
// Task #2503: rollback VERO — ri-pubblica su EAS production il bundle della release indicata
// via `eas update --republish --group=<groupId>` e inserisce una nuova riga `approved` nel DB.
router.post("/:id/rollback", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.session.userId!;

    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");
    if (release.status !== "approved") {
      return sendError(res, 400, `Rollback disponibile solo per release approvate (stato attuale: ${release.status})`);
    }
    if (!release.easGroupId) {
      return sendError(res, 400, "Questa release non ha un groupId EAS. Ri-sincronizza prima dal pannello admin (pulsante Sync).");
    }
    if (!process.env.EAS_TOKEN) {
      return sendError(res, 500, "EAS_TOKEN non configurato sul server — impossibile eseguire republish");
    }

    const rollbackMessage = `Rollback to ${release.otaVersion ?? release.easUpdateId.slice(0, 8)} (by admin)`;

    let stdoutText = "";
    let stderrText = "";
    try {
      const { stdout, stderr } = await execFileAsync(
        "npx",
        [
          "eas",
          "update",
          "--republish",
          "--group",
          release.easGroupId,
          "--message",
          rollbackMessage,
          "--non-interactive",
        ],
        {
          env: {
            ...process.env,
            EXPO_TOKEN: process.env.EAS_TOKEN,
            EAS_NO_VCS: "1",
            EAS_SKIP_AUTO_FINGERPRINT: "1",
          },
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      stdoutText = stdout || "";
      stderrText = stderr || "";
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      console.error("[ota] rollback eas update --republish FAILED:", e.message, e.stdout, e.stderr);
      return sendError(res, 500, `EAS republish fallito: ${(e.stderr || e.message || "errore sconosciuto").slice(0, 400)}`);
    }

    const output = `${stdoutText}\n${stderrText}`;
    // Parsing STRICT: l'output di `eas update --republish` deve contenere chiaramente
    // l'updateId e il groupId nuovi. Se non li troviamo non possiamo inventarli.
    const updateIdMatch = output.match(/Android update ID\s+([a-f0-9-]{36})/i)
      ?? output.match(/iOS update ID\s+([a-f0-9-]{36})/i)
      ?? output.match(/Update ID\s+([a-f0-9-]{36})/i);
    const groupIdMatch = output.match(/Update group ID\s+([a-f0-9-]{36})/i);
    if (!updateIdMatch || !groupIdMatch) {
      console.error("[ota] rollback parse FAILED — output:\n", output.slice(0, 4000));
      return sendError(res, 500, "EAS republish completato ma impossibile parsare updateId/groupId dall'output. Verifica manualmente su EAS e ri-esegui Sync.");
    }
    const newUpdateId = updateIdMatch[1];
    const newGroupId = groupIdMatch[1];

    // Inserisci la nuova riga (status approved → distribuita subito a tutti)
    const [inserted] = await db.insert(otaReleases).values({
      easUpdateId: newUpdateId,
      easGroupId: newGroupId,
      channel: "production",
      runtimeVersion: release.runtimeVersion,
      message: rollbackMessage,
      otaVersion: release.otaVersion ? `${release.otaVersion}-rb` : null,
      status: "approved",
      publishedAt: new Date(),
      approvedAt: new Date(),
      approvedBy: userId,
    }).onConflictDoUpdate({
      target: otaReleases.easUpdateId,
      set: {
        status: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        channel: "production",
        easGroupId: newGroupId,
      },
    }).returning();

    console.log(`[ota][AUDIT] rollback to release ${id} (${release.easUpdateId}) by user ${userId} → new updateId ${newUpdateId}`);
    return res.json({ ok: true, rolledBackFrom: id, newRelease: inserted, output: output.slice(0, 2000) });
  } catch (err) {
    console.error("[ota] POST /:id/rollback error:", err);
    return sendError(res, 500, "Errore rollback OTA");
  }
});

// POST /api/admin/ota/:id/republish
// Ri-pubblica su EAS il bundle di QUALSIASI release (pending, rejected, approved) come nuova
// release pending → visibile solo agli admin. Usato per il debug step-by-step: permette di
// far ricevere una specifica OTA storica al dispositivo di test senza distribuirla agli utenti.
router.post("/:id/republish", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.session.userId!;

    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");
    if (!release.easGroupId) {
      return sendError(res, 400, "Questa release non ha un groupId EAS. Ri-sincronizza prima dal pannello admin (pulsante Sync).");
    }
    if (!process.env.EAS_TOKEN) {
      return sendError(res, 500, "EAS_TOKEN non configurato sul server — impossibile eseguire republish");
    }

    const republishMessage = `Test republish OTA ${release.otaVersion ?? release.easUpdateId.slice(0, 8)} (by admin)`;

    let stdoutText = "";
    let stderrText = "";
    try {
      const { stdout, stderr } = await execFileAsync(
        "npx",
        [
          "eas",
          "update",
          "--republish",
          "--group",
          release.easGroupId,
          "--message",
          republishMessage,
          "--non-interactive",
        ],
        {
          env: {
            ...process.env,
            EXPO_TOKEN: process.env.EAS_TOKEN,
            EAS_NO_VCS: "1",
            EAS_SKIP_AUTO_FINGERPRINT: "1",
          },
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      stdoutText = stdout || "";
      stderrText = stderr || "";
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      console.error("[ota] republish eas update --republish FAILED:", e.message, e.stdout, e.stderr);
      return sendError(res, 500, `EAS republish fallito: ${(e.stderr || e.message || "errore sconosciuto").slice(0, 400)}`);
    }

    const output = `${stdoutText}\n${stderrText}`;
    const updateIdMatch = output.match(/Android update ID\s+([a-f0-9-]{36})/i)
      ?? output.match(/iOS update ID\s+([a-f0-9-]{36})/i)
      ?? output.match(/Update ID\s+([a-f0-9-]{36})/i);
    const groupIdMatch = output.match(/Update group ID\s+([a-f0-9-]{36})/i);
    if (!updateIdMatch || !groupIdMatch) {
      console.error("[ota] republish parse FAILED — output:\n", output.slice(0, 4000));
      return sendError(res, 500, "EAS republish completato ma impossibile parsare updateId/groupId dall'output. Verifica manualmente su EAS e ri-esegui Sync.");
    }
    const newUpdateId = updateIdMatch[1];
    const newGroupId = groupIdMatch[1];

    // Inserisce come pending: solo gli admin la ricevono per il debug.
    // Non viene distribuita agli utenti normali finché non viene approvata.
    const [inserted] = await db.insert(otaReleases).values({
      easUpdateId: newUpdateId,
      easGroupId: newGroupId,
      channel: "production",
      runtimeVersion: release.runtimeVersion,
      message: republishMessage,
      otaVersion: release.otaVersion ? `${release.otaVersion}-test` : null,
      status: "pending",
      publishedAt: new Date(),
    }).onConflictDoUpdate({
      target: otaReleases.easUpdateId,
      set: {
        status: "pending",
        channel: "production",
        easGroupId: newGroupId,
        message: republishMessage,
      },
    }).returning();

    console.log(`[ota][AUDIT] republish (test) release ${id} (${release.easUpdateId}) by user ${userId} → new updateId ${newUpdateId}`);
    return res.json({ ok: true, republishedFrom: id, newRelease: inserted, output: output.slice(0, 2000) });
  } catch (err) {
    console.error("[ota] POST /:id/republish error:", err);
    return sendError(res, 500, "Errore republish OTA");
  }
});

// POST /api/admin/ota/:id/auto-rollback — toggle/aggiorna config auto-rollback per la release
router.post("/:id/auto-rollback", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const body = req.body as {
      enabled?: unknown;
      threshold?: unknown;
      minDownloads?: unknown;
      windowMinutes?: unknown;
    };

    const patch: Partial<typeof otaReleases.$inferInsert> = {};
    if (typeof body.enabled === "boolean") patch.autoRollbackEnabled = body.enabled;
    if (typeof body.threshold === "number" && body.threshold >= 1 && body.threshold <= 100) patch.autoRollbackThreshold = Math.round(body.threshold);
    if (typeof body.minDownloads === "number" && body.minDownloads >= 1) patch.autoRollbackMinDownloads = Math.round(body.minDownloads);
    if (typeof body.windowMinutes === "number" && body.windowMinutes >= 1) patch.autoRollbackWindowMinutes = Math.round(body.windowMinutes);

    if (Object.keys(patch).length === 0) return sendError(res, 400, "Nessun campo valido da aggiornare");

    const [updated] = await db.update(otaReleases).set(patch).where(eq(otaReleases.id, id)).returning();
    if (!updated) return sendError(res, 404, "OTA release non trovata");

    return res.json(updated);
  } catch (err) {
    console.error("[ota] POST /:id/auto-rollback error:", err);
    return sendError(res, 500, "Errore aggiornamento config auto-rollback");
  }
});

// ── GET /:id/failure-devices — modelli dispositivi con boot_failure per release ─
router.get("/:id/failure-devices", async (req: Request, res: Response) => {
  try {
    const releaseId = req.params.id;
    const rows = await db.execute<{ device_model: string | null; cnt: string }>(
      sql`SELECT device_model, COUNT(*) AS cnt
          FROM ota_boot_events
          WHERE release_id = ${releaseId}
            AND event_type = 'boot_failure'
          GROUP BY device_model
          ORDER BY cnt DESC`
    );

    const devices = (rows.rows ?? rows).map((r: { device_model: string | null; cnt: string }) => ({
      deviceModel: r.device_model ?? null,
      count: Number(r.cnt),
    }));

    return res.json({ devices });
  } catch (err) {
    console.error("[ota] GET /:id/failure-devices error:", err);
    return sendError(res, 500, "Errore recupero dispositivi con fallimento");
  }
});

// ── GET /timing-log — ultime N righe di logs/ota-timing.log ──────────────────
router.get("/timing-log", async (req: Request, res: Response) => {
  try {
    const n = Math.min(Math.max(parseInt(String(req.query.n ?? "50"), 10) || 50, 1), 500);
    const logPath = resolve(process.cwd(), "logs/ota-timing.log");
    if (!existsSync(logPath)) {
      return res.json({ lines: [], message: "Nessun timing log disponibile ancora." });
    }
    const content = readFileSync(logPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    return res.json({ lines: lines.slice(-n), total: lines.length });
  } catch (err) {
    console.error("[ota] GET /timing-log error:", err);
    return sendError(res, 500, "Errore lettura timing log");
  }
});

export default router;
export { syncProductionUpdates };
