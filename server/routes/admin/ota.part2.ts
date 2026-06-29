import { Router, type Request, type Response } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../../db";
import { otaReleases } from "@shared/db";
import { eq, and, sql } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { EAS_PROJECT_ID } from "./ota-sync";

const execFileAsync = promisify(execFile);

const router = Router();

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
// release pending → visibile solo agli admin. Usato per il debug step-by-step (Task #5089).
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

    const [existing] = await db.select({ id: otaReleases.id, status: otaReleases.status })
      .from(otaReleases)
      .where(eq(otaReleases.easUpdateId, newUpdateId))
      .limit(1);
    if (existing?.status === "approved") {
      console.warn(`[ota][AUDIT] republish ABORTED — EAS returned same updateId ${newUpdateId} already approved (release ${existing.id}); would have downgraded to pending`);
      return sendError(res, 409, `EAS ha restituito lo stesso updateId (${newUpdateId.slice(0, 8)}…) che è già approvato e distribuito. L'operazione è stata annullata per evitare di revocare la distribuzione agli utenti. Verifica manualmente su EAS.`);
    }

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

// GET /:id/failure-devices — modelli dispositivi con boot_failure per release
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

// GET /timing-log — ultime N righe di logs/ota-timing.log
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
export { EAS_PROJECT_ID };
