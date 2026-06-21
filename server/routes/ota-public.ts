// Endpoint pubblici OTA (Task #2503)
// - GET  /api/ota/manifest : gating della release distribuita al device.
//        Admin riceve la pending più recente per testarla; gli utenti normali ricevono solo `approved`.
// - POST /api/ota/event    : telemetria boot (downloaded | boot_success | boot_failure) per device.
import { Router, type Request, type Response } from "express";
import { db, pool } from "../db";
import { otaReleases, otaBootEvents, users, appSettings } from "@shared/db";
import { eq, desc, sql, and, or, inArray } from "drizzle-orm";
import { sendError } from "../lib/api-response";

const router = Router();

/**
 * Fallback: ricava userId da un sessionToken passato nel body dell'evento OTA.
 * Usato quando l'Authorization header è assente (cold start pre-login).
 * Il token è il valore raw del cookie connect.sid (formato express-session: s:<sid>.<hmac>).
 */
async function lookupUserIdBySessionToken(token: string): Promise<string | null> {
  try {
    const decoded = decodeURIComponent(token);
    const withoutPrefix = decoded.startsWith("s:") ? decoded.slice(2) : decoded;
    const lastDot = withoutPrefix.lastIndexOf(".");
    const sid = lastDot >= 0 ? withoutPrefix.slice(0, lastDot) : withoutPrefix;
    if (!sid) return null;
    const result = await pool.query<{ sess: { userId?: string } }>(
      "SELECT sess FROM session WHERE sid = $1 LIMIT 1",
      [sid]
    );
    const sess = result.rows[0]?.sess;
    return typeof sess?.userId === "string" ? sess.userId : null;
  } catch {
    return null;
  }
}

async function getUserRole(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    return row?.role ?? null;
  } catch {
    return null;
  }
}

// GET /api/ota/manifest — gating server-side per OTA: admin riceve pending+approved,
// utenti normali e anonimi solo approved. Risposta usata dal client prima di parlare con EAS.
router.get("/manifest", async (req: Request, res: Response) => {
  try {
    // Kill switch globale: se ota_channel_locked=true, nessuna OTA viene distribuita a nessuno.
    const [lockRow] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "ota_channel_locked")).limit(1);
    if (lockRow?.value === "true") {
      return res.json({ allowed: false, reason: "channel_locked" });
    }

    const userId = req.session?.userId;
    const role = await getUserRole(userId);
    const isAdmin = role === "admin";

    const statuses = isAdmin ? ["pending", "approved"] : ["approved"];

    const [release] = await db
      .select({
        id: otaReleases.id,
        easUpdateId: otaReleases.easUpdateId,
        easGroupId: otaReleases.easGroupId,
        runtimeVersion: otaReleases.runtimeVersion,
        otaVersion: otaReleases.otaVersion,
        status: otaReleases.status,
        message: otaReleases.message,
        channel: otaReleases.channel,
      })
      .from(otaReleases)
      .where(inArray(otaReleases.status, statuses))
      .orderBy(desc(otaReleases.publishedAt))
      .limit(1);

    if (!release) {
      return res.json({ allowed: false, isAdmin });
    }

    // Raccogli tutti gli easUpdateId dello stesso gruppo (Android + iOS hanno lo stesso easGroupId
    // ma easUpdateId diversi). Il client confronta con la lista invece del singolo ID per evitare
    // il bug "penultima OTA applicata" causato dalla scelta casuale del record per piattaforma.
    let allowedEasUpdateIds: string[] = [release.easUpdateId];
    if (release.easGroupId) {
      const groupRecords = await db
        .select({ easUpdateId: otaReleases.easUpdateId })
        .from(otaReleases)
        .where(eq(otaReleases.easGroupId, release.easGroupId));
      const ids = groupRecords.map((r) => r.easUpdateId).filter(Boolean) as string[];
      if (ids.length > 0) allowedEasUpdateIds = ids;
    }

    return res.json({
      allowed: true,
      isAdmin,
      releaseId: release.id,
      allowedEasUpdateId: release.easUpdateId,
      allowedEasGroupId: release.easGroupId,
      allowedEasUpdateIds,
      runtimeVersion: release.runtimeVersion,
      otaVersion: release.otaVersion,
      status: release.status,
      message: release.message,
      channel: release.channel,
    });
  } catch (err) {
    console.error("[ota/manifest] error:", err);
    return sendError(res, 500, "Errore recupero manifest OTA");
  }
});

// POST /api/ota/event — telemetria boot per device. Idempotente: dedup per (release, device, event_type).
// Richiede sessione autenticata: senza questo gating un attaccante potrebbe inflazionare i contatori
// e triggerare false auto-rollback. La sessione è sempre presente in produzione (l'app fa login al boot).
// Fallback: se l'header Authorization è assente (cold start assoluto pre-login), il client può
// passare il sessionToken nel body — viene usato per ricavare userId dalla session table.
router.post("/event", async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      releaseId?: unknown;
      easUpdateId?: unknown;
      deviceId?: unknown;
      eventType?: unknown;
      platform?: unknown;
      appVersion?: unknown;
      deviceModel?: unknown;
      sessionToken?: unknown;
    };

    // Lookup userId: Authorization header → body.sessionToken → no session
    let userId = req.session?.userId;
    if (!userId && typeof body.sessionToken === "string" && body.sessionToken.length > 0) {
      userId = (await lookupUserIdBySessionToken(body.sessionToken)) ?? undefined;
    }
    if (!userId) {
      // Silenzioso: utenti non loggati o boot pre-login non contribuiscono alla telemetria.
      return res.json({ ok: true, ignored: "no_session" });
    }

    const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 80) : null;
    const eventType = typeof body.eventType === "string" ? body.eventType : null;
    if (!deviceId || !eventType) {
      return sendError(res, 400, "Campi deviceId, eventType obbligatori");
    }
    if (!["downloaded", "boot_success", "boot_failure"].includes(eventType)) {
      return sendError(res, 400, "eventType non valido (downloaded | boot_success | boot_failure)");
    }

    // Risolvi releaseId o tramite easUpdateId
    let releaseId = typeof body.releaseId === "string" ? body.releaseId : null;
    if (!releaseId && typeof body.easUpdateId === "string") {
      const [row] = await db
        .select({ id: otaReleases.id })
        .from(otaReleases)
        .where(eq(otaReleases.easUpdateId, body.easUpdateId))
        .limit(1);
      releaseId = row?.id ?? null;
    }
    if (!releaseId) {
      // Silenzioso: telemetria su release sconosciuta (es. bundle di sviluppo) non è un errore.
      return res.json({ ok: true, ignored: "unknown_release" });
    }

    const platform = typeof body.platform === "string" ? body.platform.slice(0, 16) : null;
    const appVersion = typeof body.appVersion === "string" ? body.appVersion.slice(0, 32) : null;
    const deviceModel = typeof body.deviceModel === "string" ? body.deviceModel.slice(0, 120) : null;

    // Insert dedup via UNIQUE INDEX (release_id, device_id, event_type)
    const inserted = await db
      .insert(otaBootEvents)
      .values({ releaseId, userId, deviceId, eventType, platform, appVersion, deviceModel })
      .onConflictDoNothing()
      .returning({ id: otaBootEvents.id });

    if (inserted.length === 0) {
      return res.json({ ok: true, duplicate: true });
    }

    // Incrementa il contatore sulla release
    if (eventType === "downloaded") {
      await db.update(otaReleases)
        .set({ downloadCount: sql`${otaReleases.downloadCount} + 1` })
        .where(eq(otaReleases.id, releaseId));
    } else if (eventType === "boot_success") {
      await db.update(otaReleases)
        .set({ bootSuccessCount: sql`${otaReleases.bootSuccessCount} + 1` })
        .where(eq(otaReleases.id, releaseId));
    } else if (eventType === "boot_failure") {
      await db.update(otaReleases)
        .set({ bootFailureCount: sql`${otaReleases.bootFailureCount} + 1` })
        .where(eq(otaReleases.id, releaseId));
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[ota/event] error:", err);
    return sendError(res, 500, "Errore registrazione evento OTA");
  }
});

// Silenziatore: l'import "or"/"and" potrebbe servire ad altri estensori futuri.
void or; void and;

export default router;
