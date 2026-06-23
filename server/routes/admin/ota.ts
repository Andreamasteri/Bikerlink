import { Router, type Request, type Response } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { db, withDbRetry } from "../../db";
import { otaReleases, otaBootEvents } from "@shared/db";
import { eq, desc, isNull, and, sql, ne, inArray } from "drizzle-orm";
import { sendError } from "../../lib/api-response";

const execFileAsync = promisify(execFile);

const router = Router();

const EAS_PROJECT_ID = "a25192d7-72e5-46af-97d0-2d38ed9b78e3";
const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";

async function easGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const token = process.env.EAS_TOKEN;
  if (!token) throw new Error("EAS_TOKEN non configurato");
  const res = await fetch(EAS_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`EAS GraphQL HTTP ${res.status}: ${body}`);
  }
  const json = await res.json() as { data?: unknown; errors?: unknown[] };
  if (json.errors && (json.errors as unknown[]).length > 0) {
    throw new Error(`EAS GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Sincronizza il branch EAS `production` nel DB locale per tracking admin.
// Task #2503: i nuovi update sincronizzati da EAS finiscono come `pending` —
// l'admin li approva poi manualmente dal pannello.
async function syncProductionUpdates(): Promise<{ inserted: number; backfilled: number }> {
  const query = `
    query GetBranchUpdates($appId: String!) {
      app {
        byId(appId: $appId) {
          updateBranches(offset: 0, limit: 10) {
            id
            name
            updates(offset: 0, limit: 20) {
              id
              group
              message
              runtimeVersion
              createdAt
            }
          }
        }
      }
    }
  `;

  let data: { app?: { byId?: { updateBranches?: Array<{ id: string; name: string; updates?: Array<{ id: string; group?: string; message?: string; runtimeVersion?: string; createdAt?: string }> }> } } };
  try {
    data = await easGraphQL(query, { appId: EAS_PROJECT_ID }) as typeof data;
  } catch (err) {
    console.warn("[ota-sync] EAS GraphQL error:", err);
    throw err;
  }

  const branches = data?.app?.byId?.updateBranches ?? [];
  const productionBranch = branches.find((b) => b.name === "production");
  const updates = productionBranch?.updates ?? [];
  if (updates.length === 0) return { inserted: 0, backfilled: 0 };

  let inserted = 0;
  for (const upd of updates) {
    const existing = await withDbRetry(() => db.select({ id: otaReleases.id })
      .from(otaReleases)
      .where(eq(otaReleases.easUpdateId, upd.id))
      .limit(1));

    if (existing.length > 0) continue;

    // Task #2503: i nuovi update vengono sempre inseriti come `pending`.
    // L'admin li testa via cold-start su account admin e poi approva dal pannello.
    await withDbRetry(() => db.insert(otaReleases).values({
      easUpdateId: upd.id,
      easGroupId: upd.group ?? null,
      channel: "production",
      runtimeVersion: upd.runtimeVersion ?? null,
      message: upd.message ?? null,
      status: "pending",
      publishedAt: upd.createdAt ? new Date(upd.createdAt) : new Date(),
    }).onConflictDoNothing());
    inserted++;
  }

  // Backfill groupId per record vecchi che ne erano sprovvisti
  for (const upd of updates) {
    if (!upd.group) continue;
    await withDbRetry(() => db.update(otaReleases)
      .set({ easGroupId: upd.group })
      .where(and(eq(otaReleases.easUpdateId, upd.id), isNull(otaReleases.easGroupId))));
  }

  // Backfill otaVersion: copia dal record Android (stesso gruppo) ai record iOS che non ce l'hanno
  await withDbRetry(() => db.execute(sql`
    UPDATE ota_releases r
    SET ota_version = src.ota_version
    FROM ota_releases src
    WHERE r.ota_version IS NULL
      AND r.eas_group_id IS NOT NULL
      AND src.eas_group_id = r.eas_group_id
      AND src.ota_version IS NOT NULL
  `));

  // Backfill otaVersion dal messaggio EAS — formato "[OTA:54.10.27] testo utente"
  // Imposta automaticamente ota_version per tutti i record nello stesso gruppo
  const noVersionRecords = await withDbRetry(() => db
    .select({ id: otaReleases.id, message: otaReleases.message, easGroupId: otaReleases.easGroupId })
    .from(otaReleases)
    .where(isNull(otaReleases.otaVersion)));

  let backfilled = 0;
  for (const rec of noVersionRecords) {
    const match = rec.message?.match(/^\[OTA:([\d.]+)\]/);
    if (!match) continue;
    const parsed = match[1];
    const groupId = rec.easGroupId;
    if (groupId) {
      await withDbRetry(() => db.update(otaReleases)
        .set({ otaVersion: parsed })
        .where(eq(otaReleases.easGroupId, groupId)));
    } else {
      await withDbRetry(() => db.update(otaReleases)
        .set({ otaVersion: parsed })
        .where(eq(otaReleases.id, rec.id)));
    }
    backfilled++;
  }

  return { inserted, backfilled };
}

// Cache TTL in-memory di 60s sul sync EAS, con dedup delle richieste in volo.
// La GET /releases (usata anche dalla Radiografia) prima faceva una GraphQL EAS
// sincrona (lenta, anche >5s) ad ogni run → la probe OTA andava in timeout.
const SYNC_TTL_MS = 60_000;
let _lastSyncAt = 0;
let _syncInFlight: Promise<{ inserted: number; backfilled: number }> | null = null;

// Innesca il sync EAS in background senza bloccare il chiamante: se è già
// avvenuto da meno di 60s (o è già in corso) non fa nulla. Non viene mai
// awaitato dal request path, così GET /releases risponde subito dal DB.
function triggerSyncInBackground(): void {
  if (Date.now() - _lastSyncAt < SYNC_TTL_MS) return;
  if (_syncInFlight) return;
  _syncInFlight = syncProductionUpdates()
    .then(() => { _lastSyncAt = Date.now(); return { inserted: 0, backfilled: 0 }; })
    .catch((err) => { console.warn("[ota] background sync warning:", err); return { inserted: 0, backfilled: 0 }; })
    .finally(() => { _syncInFlight = null; });
}

// GET /api/admin/ota/releases — restituisce tutto lo storico release con telemetria
router.get("/releases", async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const syncFirst = req.query.sync !== "false";

    // Non-blocking: serviamo subito il DB e lasciamo il sync EAS in background.
    // I nuovi update appariranno alla chiamata successiva (entro la finestra TTL).
    if (syncFirst) {
      triggerSyncInBackground();
    }

    const rows = await db.select().from(otaReleases).orderBy(desc(otaReleases.publishedAt));

    const filtered = status
      ? rows.filter((r) => r.status === status)
      : rows;

    return res.json(filtered);
  } catch (err) {
    console.error("[ota] GET /releases error:", err);
    return sendError(res, 500, "Errore recupero OTA releases");
  }
});

// POST /api/admin/ota/sync — forza una sincronizzazione sincrona con EAS e restituisce JSON con il risultato.
// Questa route DEVE stare PRIMA di /:id/... per non essere catturata dal parametro dinamico.
router.post("/sync", async (_req: Request, res: Response) => {
  if (!process.env.EAS_TOKEN) {
    return res.status(503).json({ ok: false, message: "EAS_TOKEN non configurato sul server. Impossibile contattare EAS." });
  }
  // Azzera la cache TTL così il sync effettua davvero la chiamata GraphQL
  _lastSyncAt = 0;
  _syncInFlight = null;
  try {
    const { inserted, backfilled } = await syncProductionUpdates();
    _lastSyncAt = Date.now();
    console.log(`[ota][SYNC] sync manuale completato: ${inserted} nuove, ${backfilled} backfill`);
    return res.json({ ok: true, inserted, backfilled, syncedAt: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ota] POST /sync error:", err);
    return res.status(502).json({ ok: false, message: `Errore sincronizzazione EAS: ${msg}` });
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

    // UPDATE atomico con guard sullo status — previene race con worker auto-rollback o doppio click
    const [updated] = await db
      .update(otaReleases)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        channel: "production",
      })
      .where(and(eq(otaReleases.id, id), eq(otaReleases.status, "pending")))
      .returning();

    if (!updated) {
      return sendError(res, 409, "Lo stato della release è cambiato (race con altro admin o auto-rollback). Ricarica e riprova.");
    }

    console.log(`[ota][AUDIT] release ${id} (${release.easUpdateId}) APPROVED by user ${userId}`);

    // Auto-reject tutte le altre pending sullo stesso canale (sono obsolete)
    const otherPending = await db
      .select({ id: otaReleases.id, easUpdateId: otaReleases.easUpdateId })
      .from(otaReleases)
      .where(and(eq(otaReleases.status, "pending"), eq(otaReleases.channel, release.channel), ne(otaReleases.id, id)));
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
    // l'updateId e il groupId nuovi. Se non li troviamo non possiamo inventarli —
    // un fake updateId rompe il gating client-side (`incomingId !== allowedEasUpdateId` sempre).
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
