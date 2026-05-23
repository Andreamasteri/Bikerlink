import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { storage } from "../../storage";
import { otaEvents, otaPublishTokens, otaReleases, deviceOtaAssignments } from "@shared/db";
import { otaErrorSchema, publishWithSlotSchema, createOtaTokenSchema, assignOtaSlotSchema, publishOtaReleaseSchema, otaAssignDeviceSchema, otaPromoteSchema, otaMarkBrokenSchema, updateOtaNotesSchema } from "@shared/validators";
import { sql, eq, and, or, isNull, desc } from "drizzle-orm";
import crypto from "crypto";
import { uploadBuffer, objectExists, isValidOtaBundlePath, deleteObject } from "../../objectStorage";
import { sendOtaPendingApprovalPushToAdmins } from "../../push-notifications";
import { sendSuccess, sendError } from "../../lib/api-response";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

const otaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

function paramStr(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

async function assertAdminSession(req: Request, res: Response): Promise<boolean> {
  if ((req as any).otaTokenAuthenticated === true) return true;
  if (!req.session?.userId) {
    sendError(res, 401, "Non autenticato");
    return false;
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") {
    sendError(res, 403, "Accesso riservato agli amministratori");
    return false;
  }
  if (user.status !== "active") {
    sendError(res, 403, "Account non attivo");
    return false;
  }
  return true;
}

router.get("/ota-events", async (req: Request, res: Response) => {
  try {
    const limitRaw = parseInt(String(req.query.limit ?? "100"), 10);
    const limit = Math.min(Math.max(isNaN(limitRaw) ? 100 : limitRaw, 1), 500);
    const phaseFilter = req.query.phase ? String(req.query.phase).substring(0, 32) : null;
    const sourceFilter = req.query.source ? String(req.query.source).substring(0, 32) : null;
    const platformFilter = req.query.platform ? String(req.query.platform).substring(0, 16) : null;
    const updateIdFilter = req.query.updateId ? String(req.query.updateId).substring(0, 64) : null;
    const deviceIdFilter = req.query.deviceId ? String(req.query.deviceId).substring(0, 64) : null;

    const whereFragments = [
      phaseFilter ? sql`phase = ${phaseFilter}` : undefined,
      sourceFilter ? sql`source = ${sourceFilter}` : undefined,
      platformFilter ? sql`platform = ${platformFilter}` : undefined,
      updateIdFilter ? sql`current_update_id ILIKE ${"%" + updateIdFilter + "%"}` : undefined,
      deviceIdFilter ? sql`ip ILIKE ${"%" + deviceIdFilter + "%"}` : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);

    const whereSql = whereFragments.length > 0
      ? sql`WHERE ${sql.join(whereFragments, sql` AND `)}`
      : sql``;

    const result = await db.execute(sql`
      SELECT id, created_at, phase, source, platform, runtime_version, current_update_id, release_id, error, fail_count, ip, diagnostics
      FROM ota_events
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    return res.json({ events: result.rows, limit, filters: { phase: phaseFilter, source: sourceFilter, platform: platformFilter, updateId: updateIdFilter, deviceId: deviceIdFilter } });
  } catch (err) {
    console.error("[OTA-EVENTS] read error:", err);
    return sendError(res, 500, "Errore lettura eventi OTA");
  }
});

router.get("/ota-device-history", async (req: Request, res: Response) => {
  try {
    const rawDeviceId = req.query.deviceId ? String(req.query.deviceId).trim().substring(0, 64) : null;
    if (!rawDeviceId) {
      return sendError(res, 400, "deviceId è obbligatorio");
    }
    const fuzzy = req.query.fuzzy === "true";
    const pageRaw = parseInt(String(req.query.page ?? "1"), 10);
    const page = Math.max(isNaN(pageRaw) ? 1 : pageRaw, 1);
    const pageSizeRaw = parseInt(String(req.query.pageSize ?? "100"), 10);
    const pageSize = Math.min(Math.max(isNaN(pageSizeRaw) ? 100 : pageSizeRaw, 1), 500);
    const offset = (page - 1) * pageSize;

    const matchSql = fuzzy
      ? sql`device_id ILIKE ${"%" + rawDeviceId + "%"}`
      : sql`device_id = ${rawDeviceId}`;

    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM ota_events WHERE ${matchSql}
    `);
    const totalCount = (countResult.rows[0] as { total: number }).total ?? 0;

    const result = await db.execute(sql`
      SELECT id, created_at, phase, source, platform, runtime_version, current_update_id, release_id, error, fail_count, ip, device_id, diagnostics
      FROM ota_events
      WHERE ${matchSql}
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const events = result.rows as any[];

    let currentState = null;
    if (page === 1 && events.length > 0) {
      const first = events[0];
      currentState = {
        updateId: first.current_update_id,
        runtimeVersion: first.runtime_version,
        platform: first.platform,
        lastSeen: first.created_at,
        lastPhase: first.phase,
        lastError: first.error,
      };
    } else if (page > 1 && totalCount > 0) {
      const latestResult = await db.execute(sql`
        SELECT phase, platform, runtime_version, current_update_id, error, created_at
        FROM ota_events
        WHERE ${matchSql}
        ORDER BY created_at DESC
        LIMIT 1
      `);
      if (latestResult.rows.length > 0) {
        const r = latestResult.rows[0] as any;
        currentState = {
          updateId: r.current_update_id,
          runtimeVersion: r.runtime_version,
          platform: r.platform,
          lastSeen: r.created_at,
          lastPhase: r.phase,
          lastError: r.error,
        };
      }
    }

    const totalPages = Math.ceil(totalCount / pageSize);

    return res.json({
      events,
      currentState,
      total: totalCount,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
      deviceId: rawDeviceId,
      fuzzy,
    });
  } catch (err) {
    console.error("[OTA-DEVICE-HISTORY] read error:", err);
    return sendError(res, 500, "Errore lettura storico dispositivo");
  }
});

router.get("/ota-adoption", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        release_id,
        runtime_version,
        phase,
        platform,
        COUNT(*) AS event_count,
        COUNT(DISTINCT ip) AS unique_devices,
        MIN(created_at) AS first_seen,
        MAX(created_at) AS last_seen
      FROM ota_events
      WHERE release_id IS NOT NULL AND release_id <> ''
      GROUP BY release_id, runtime_version, phase, platform
      ORDER BY last_seen DESC
    `);
    const daily = await db.execute(sql`
      SELECT
        release_id,
        runtime_version,
        DATE_TRUNC('day', created_at) AS day,
        COUNT(DISTINCT ip) AS unique_devices
      FROM ota_events
      WHERE release_id IS NOT NULL AND release_id <> ''
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY release_id, runtime_version, day
      ORDER BY day ASC
    `);
    return res.json({ breakdown: result.rows, daily: daily.rows });
  } catch (err) {
    console.error("[OTA-ADOPTION] read error:", err);
    return sendError(res, 500, "Errore lettura adoption trends");
  }
});

router.get("/ota-stats", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        current_update_id,
        MIN(release_id) AS release_id,
        COALESCE(runtime_version, '?') AS runtime_version,
        COALESCE(platform, '?') AS platform,
        COUNT(*) FILTER (WHERE phase = 'reload') AS ok_count,
        COUNT(*) FILTER (WHERE phase = 'error') AS error_count,
        COUNT(DISTINCT ip) AS unique_devices,
        MAX(created_at) AS last_seen
      FROM ota_events
      WHERE current_update_id IS NOT NULL AND current_update_id <> ''
      GROUP BY
        current_update_id,
        COALESCE(runtime_version, '?'),
        COALESCE(platform, '?')
      ORDER BY last_seen DESC
      LIMIT 100
    `);
    return res.json({ stats: result.rows });
  } catch (err) {
    console.error("[OTA-STATS] read error:", err);
    return sendError(res, 500, "Errore lettura OTA stats");
  }
});

router.get("/ota-stuck-events", async (req: Request, res: Response) => {
  try {
    const limitRaw = parseInt(String(req.query.limit ?? "200"), 10);
    const limit = Math.min(Math.max(isNaN(limitRaw) ? 200 : limitRaw, 1), 500);
    const rvFilter = req.query.runtimeVersion
      ? String(req.query.runtimeVersion).substring(0, 32)
      : null;

    const whereSql = rvFilter
      ? sql`WHERE runtime_version = ${rvFilter}`
      : sql``;

    const result = await db.execute(sql`
      SELECT id, device_id, rollback_count, stuck_sessions, runtime_version, created_at
      FROM ota_stuck_events
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(DISTINCT device_id)::int AS unique_devices,
             COUNT(DISTINCT runtime_version)::int AS unique_rvs,
             MAX(created_at) AS last_event_at
      FROM ota_stuck_events
    `);

    const countRow = countResult.rows[0] as any;

    return res.json({
      events: result.rows,
      total: countRow.total ?? 0,
      uniqueDevices: countRow.unique_devices ?? 0,
      uniqueRvs: countRow.unique_rvs ?? 0,
      lastEventAt: countRow.last_event_at ?? null,
      limit,
      filter: { runtimeVersion: rvFilter },
    });
  } catch (err) {
    console.error("[OTA-STUCK-EVENTS] read error:", err);
    return sendError(res, 500, "Errore lettura stuck events");
  }
});

router.post("/ota/upload", otaUpload.single("bundle"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return sendError(res, 400, "Nessun file bundle fornito");
    const { runtimeVersion } = req.body;
    if (!runtimeVersion) {
      return sendError(res, 400, "runtimeVersion è obbligatorio");
    }

    const filename = `ota-${runtimeVersion}-${Date.now()}.js`;
    const objectPath = `private/ota/${filename}`;
    await uploadBuffer(objectPath, req.file.buffer, "application/octet-stream");

    const [release] = await db.insert(otaReleases).values({
      version: `upload-${Date.now()}`,
      runtimeVersion,
      bundlePath: objectPath,
      status: "draft",
      slot: "archived",
      approved: false,
      createdBy: req.session.userId ?? null,
    }).returning();

    sendOtaPendingApprovalPushToAdmins(release.id).catch(() => {});
    return res.status(201).json(release);
  } catch (error) {
    console.error("OTA upload error:", error);
    return sendError(res, 500, "Errore durante il caricamento del bundle");
  }
});

router.post("/ota", async (req: Request, res: Response) => {
  try {
    const parsedPublish = publishOtaReleaseSchema.safeParse(req.body);
    if (!parsedPublish.success) return sendError(res, 400, parsedPublish.error.issues[0].message);
    const { version, runtimeVersion, bundlePath, releaseNotes, slot } = parsedPublish.data;

    const [release] = await db.insert(otaReleases).values({
      version,
      runtimeVersion: runtimeVersion ?? null,
      bundlePath: bundlePath ?? null,
      releaseNotes: releaseNotes ?? null,
      slot: slot ?? "archived",
      status: "draft",
      approved: false,
      createdBy: req.session.userId ?? null,
    }).returning();

    const actorId = req.session.userId;
    if (actorId) {
      storage.createModeratorLog({
        moderatorId: actorId,
        action: "create_ota_release",
        targetType: "ota_release",
        targetId: release.id,
        details: `Release creata: v=${version} RV=${runtimeVersion ?? "-"}`,
      }).catch(() => {});
    }

    return res.status(201).json(release);
  } catch (err) {
    console.error("OTA create error:", err);
    return sendError(res, 500, "Errore creazione release");
  }
});

router.post("/ota/:id/publish", async (req: Request, res: Response) => {
  if (!await assertAdminSession(req, res)) return;
  try {
    const id = paramStr(req.params.id);
    if (!id) return sendError(res, 400, "ID non valido");

    const existing = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!existing.length) return sendError(res, 404, "Release non trovata");

    // Promuovi SEMPRE a 'admin-preview': l'admin deve testare sul proprio
    // dispositivo prima di distribuire a tutti gli utenti (slot=stable).
    // Il flusso completo è: publish → admin-preview → [test] → distribute → stable.
    const [updated] = await db.update(otaReleases)
      .set({
        status: "active",
        slot: "admin-preview",
        approved: false,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(otaReleases.id, id))
      .returning();

    const actorId = req.session.userId;
    if (actorId) {
      storage.createModeratorLog({
        moderatorId: actorId,
        action: "publish_ota_release",
        targetType: "ota_release",
        targetId: id,
        details: `Release in admin-preview: v=${existing[0].version} RV=${existing[0].runtimeVersion ?? "-"}`,
      }).catch(() => {});
    }

    sendOtaPendingApprovalPushToAdmins(id).catch(() => {});

    return res.json(updated);
  } catch (err) {
    console.error("OTA publish error:", err);
    return sendError(res, 500, "Errore pubblicazione release");
  }
});

router.post("/ota/token", async (req: Request, res: Response) => {
  try {
    const parsedToken = createOtaTokenSchema.safeParse(req.body);
    if (!parsedToken.success) return sendError(res, 400, parsedToken.error.issues[0].message);
    const { label, expiresInDays } = parsedToken.data;

    const rawToken = `ota_${crypto.randomBytes(32).toString("hex")}`;
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const row = await db.insert(otaPublishTokens).values({
      label,
      tokenHash,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null,
    }).returning();

    try {
      await storage.createModeratorLog({
        moderatorId: req.session.userId!,
        action: "create_ota_token",
        targetType: "ota_token",
        targetId: String(row[0].id),
        details: `Token creato: ${label}`,
      });
    } catch (logErr) {
      console.warn("[OTA] createModeratorLog non-fatal:", logErr);
    }

    return res.status(201).json({ ...row[0], rawToken });
  } catch (err) {
    console.error("OTA token create error:", err);
    return sendError(res, 500, "Errore creazione token");
  }
});

router.get("/ota", async (_req: Request, res: Response) => {
  try {
    const releases = await db.select().from(otaReleases).orderBy(desc(otaReleases.createdAt));
    return res.json(releases);
  } catch (err) {
    console.error("OTA get error:", err);
    return sendError(res, 500, "Errore lettura release");
  }
});

router.get("/ota/tokens", async (_req: Request, res: Response) => {
  try {
    const tokens = await db.select().from(otaPublishTokens).where(eq(otaPublishTokens.revoked, false)).orderBy(desc(otaPublishTokens.createdAt));
    return res.json(tokens);
  } catch (err) {
    console.error("OTA tokens get error:", err);
    return sendError(res, 500, "Errore lettura token");
  }
});

router.delete("/ota/token/:id", async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (!id) return sendError(res, 400, "ID non valido");

    await db.update(otaPublishTokens).set({ revoked: true }).where(eq(otaPublishTokens.id, parseInt(id)));

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "revoke_ota_token",
      targetType: "ota_token",
      targetId: id,
    });

    return sendSuccess(res);
  } catch (err) {
    console.error("OTA token delete error:", err);
    return sendError(res, 500, "Errore revoca token");
  }
});

router.get("/ota/pending", async (_req: Request, res: Response) => {
  try {
    const pending = await db.select().from(otaEvents).where(eq(otaEvents.phase, "pending")).orderBy(desc(otaEvents.createdAt));
    return res.json(pending);
  } catch (err) {
    return sendError(res, 500, "Errore lettura pending OTA");
  }
});

router.post("/ota/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (!id) return sendError(res, 400, "ID non valido");
    const existing = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!existing.length) return sendError(res, 404, "Release non trovata");
    const [updated] = await db.update(otaReleases)
      .set({ approved: true, approvedAt: new Date(), approvedBy: req.session.userId ?? null, slot: "stable", updatedAt: new Date() })
      .where(eq(otaReleases.id, id))
      .returning();
    return res.json(updated);
  } catch (err) {
    return sendError(res, 500, "Errore approvazione release");
  }
});

router.patch("/ota/:id/notes", async (req: Request, res: Response) => {
  if (!await assertAdminSession(req, res)) return;
  try {
    const id = paramStr(req.params.id);
    if (!id) return sendError(res, 400, "ID non valido");

    const parsed = updateOtaNotesSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);

    const existing = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!existing.length) return sendError(res, 404, "Release non trovata");

    const [updated] = await db.update(otaReleases)
      .set({ releaseNotes: parsed.data.releaseNotes, updatedAt: new Date() })
      .where(eq(otaReleases.id, id))
      .returning();

    const actorId = req.session.userId;
    if (actorId) {
      storage.createModeratorLog({
        moderatorId: actorId,
        action: "edit_ota_release_notes",
        targetType: "ota_release",
        targetId: id,
        details: `Note aggiornate per v=${existing[0].version}`,
      }).catch(() => {});
    }

    return res.json(updated);
  } catch (err) {
    console.error("[OTA-NOTES] patch error:", err);
    return sendError(res, 500, "Errore aggiornamento note");
  }
});

router.get("/ota/releases", async (_req: Request, res: Response) => {
  try {
    const releases = await db.select().from(otaReleases).orderBy(desc(otaReleases.createdAt));
    return res.json(releases);
  } catch (err) {
    return sendError(res, 500, "Errore lettura release");
  }
});

router.get("/ota/pending-approval", async (req: Request, res: Response) => {
  if (!await assertAdminSession(req, res)) return;
  try {
    const result = await db.execute(sql`
      SELECT * FROM ota_releases
      WHERE slot = 'admin-preview' AND status = 'active' AND approved = false
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `);
    if (result.rows.length === 0) return res.json(null);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[OTA-PENDING-APPROVAL] error:", err);
    return sendError(res, 500, "Errore lettura pending approval");
  }
});

router.post("/ota/assign-admin-preview", async (req: Request, res: Response) => {
  if (!await assertAdminSession(req, res)) return;
  try {
    const rawDeviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim().substring(0, 128) : null;
    if (!rawDeviceId) return sendError(res, 400, "deviceId obbligatorio");

    // expoInstallationId is the UUID that expo-updates SDK sends in the
    // `expo-device-id` / `expo-installation-id` request header when calling
    // /api/expo-updates. Saving this as a separate row ensures the slot lookup
    // in expo-updates-handler matches even if the Expo-internal ID differs
    // from the app's custom device ID (they are different UUIDs).
    const rawExpoInstallationId = typeof req.body?.expoInstallationId === "string"
      ? req.body.expoInstallationId.trim().substring(0, 128)
      : null;

    const pending = await db.execute(sql`
      SELECT * FROM ota_releases
      WHERE slot = 'admin-preview' AND status = 'active' AND approved = false
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `);
    if (pending.rows.length === 0) return sendError(res, 404, "Nessuna OTA in attesa di approvazione admin");

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const actorId = req.session.userId ?? null;

    // Save the app's custom device ID (used for heartbeat/diagnostics).
    await db.execute(sql`
      INSERT INTO device_ota_assignments (device_id, slot, assigned_at, assigned_by, expires_at)
      VALUES (${rawDeviceId}, 'admin-preview', NOW(), ${actorId}, ${expiresAt.toISOString()})
      ON CONFLICT (device_id) DO UPDATE
        SET slot = 'admin-preview',
            assigned_at = NOW(),
            assigned_by = ${actorId},
            expires_at = ${expiresAt.toISOString()}
    `);

    // Also save the Expo-internal installation ID if provided — this is the UUID
    // that expo-updates SDK includes in expo-device-id / expo-installation-id headers.
    // Without this row the slot lookup in expo-updates-handler never finds the device.
    if (rawExpoInstallationId && rawExpoInstallationId !== rawDeviceId) {
      await db.execute(sql`
        INSERT INTO device_ota_assignments (device_id, slot, assigned_at, assigned_by, expires_at)
        VALUES (${rawExpoInstallationId}, 'admin-preview', NOW(), ${actorId}, ${expiresAt.toISOString()})
        ON CONFLICT (device_id) DO UPDATE
          SET slot = 'admin-preview',
              assigned_at = NOW(),
              assigned_by = ${actorId},
              expires_at = ${expiresAt.toISOString()}
      `);
      console.log(`[OTA-ASSIGN-ADMIN-PREVIEW] saved expoInstallationId "${rawExpoInstallationId.substring(0, 16)}…" → admin-preview`);
    } else if (!rawExpoInstallationId) {
      console.warn("[OTA-ASSIGN-ADMIN-PREVIEW] expoInstallationId not provided — expo-updates slot lookup may fail if Expo SDK device ID differs from custom deviceId");
    }

    console.log(`[OTA-ASSIGN-ADMIN-PREVIEW] deviceId "${rawDeviceId.substring(0, 16)}…" → admin-preview, expiresAt=${expiresAt.toISOString()}`);

    storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "assign_admin_preview_device",
      targetType: "ota_release",
      targetId: String(pending.rows[0].id),
      details: `Admin device ${rawDeviceId.substring(0, 16)}… assegnato a admin-preview${rawExpoInstallationId ? ` (expoId: ${rawExpoInstallationId.substring(0, 16)}…)` : ""}`,
    }).catch(() => {});

    return sendSuccess(res, { release: pending.rows[0], expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error("[OTA-ASSIGN-ADMIN-PREVIEW] error:", err);
    return sendError(res, 500, "Errore assegnazione admin-preview");
  }
});

router.post("/ota/:id/distribute", async (req: Request, res: Response) => {
  if (!await assertAdminSession(req, res)) return;
  try {
    const id = paramStr(req.params.id);
    if (!id) return sendError(res, 400, "ID non valido");

    const existing = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!existing.length) return sendError(res, 404, "Release non trovata");
    if (existing[0].slot !== "admin-preview") {
      return sendError(res, 400, `La release è nello slot '${existing[0].slot}', non admin-preview`);
    }

    const [updated] = await db.update(otaReleases)
      .set({
        slot: "stable",
        approved: true,
        approvedAt: new Date(),
        approvedBy: req.session.userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(otaReleases.id, id))
      .returning();

    await db.execute(sql`
      DELETE FROM device_ota_assignments WHERE slot = 'admin-preview'
    `);

    storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "distribute_ota_release",
      targetType: "ota_release",
      targetId: id,
      details: `OTA distribuita a tutti: v=${existing[0].version} RV=${existing[0].runtimeVersion ?? "-"}`,
    }).catch(() => {});

    return res.json(updated);
  } catch (err) {
    console.error("[OTA-DISTRIBUTE] error:", err);
    return sendError(res, 500, "Errore distribuzione release");
  }
});

router.post("/ota/assign-slot", async (req: Request, res: Response) => {
  try {
    const parsed = assignOtaSlotSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    void parsed.data;
    return sendSuccess(res);
  } catch (err) {
    return sendError(res, 500, "Errore assegnazione slot");
  }
});

router.post("/ota/assign-device", async (req: Request, res: Response) => {
  try {
    const parsed = otaAssignDeviceSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    return sendSuccess(res);
  } catch (err) {
    return sendError(res, 500, "Errore assegnazione dispositivo");
  }
});

router.get("/ota/device-assignments", async (_req: Request, res: Response) => {
  try {
    return res.json([]);
  } catch (err) {
    return sendError(res, 500, "Errore lettura assegnazioni");
  }
});

router.delete("/ota/device-assignments/:deviceId", async (req: Request, res: Response) => {
  try {
    return sendSuccess(res);
  } catch (err) {
    return sendError(res, 500, "Errore eliminazione assegnazione");
  }
});

router.post("/ota/promote", async (req: Request, res: Response) => {
  try {
    const parsed = otaPromoteSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    return sendSuccess(res);
  } catch (err) {
    return sendError(res, 500, "Errore promozione release");
  }
});

router.post("/ota/revert", async (req: Request, res: Response) => {
  try {
    return sendSuccess(res);
  } catch (err) {
    return sendError(res, 500, "Errore revert release");
  }
});

router.post("/ota/mark-broken", async (req: Request, res: Response) => {
  if (!await assertAdminSession(req, res)) return;
  try {
    const parsed = otaMarkBrokenSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const releaseId = (parsed.data as { releaseId?: string }).releaseId;
    if (!releaseId) return sendError(res, 400, "releaseId obbligatorio");
    const existing = await db.select().from(otaReleases).where(eq(otaReleases.id, releaseId)).limit(1);
    if (!existing.length) return sendError(res, 404, "Release non trovata");
    const [updated] = await db.update(otaReleases)
      .set({ status: "broken", slot: "archived", updatedAt: new Date() })
      .where(eq(otaReleases.id, releaseId))
      .returning();
    await db.execute(sql`
      DELETE FROM device_ota_assignments WHERE slot = 'admin-preview'
    `);
    const actorId = req.session.userId;
    if (actorId) {
      storage.createModeratorLog({
        moderatorId: actorId,
        action: "mark_ota_broken",
        targetType: "ota_release",
        targetId: releaseId,
        details: `Release marcata rotta: v=${existing[0].version}`,
      }).catch(() => {});
    }
    return res.json(updated);
  } catch (err) {
    return sendError(res, 500, "Errore segnalazione release");
  }
});

router.post("/ota/:id/mark-broken", async (req: Request, res: Response) => {
  if (!await assertAdminSession(req, res)) return;
  try {
    const id = paramStr(req.params.id);
    if (!id) return sendError(res, 400, "ID non valido");
    const existing = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!existing.length) return sendError(res, 404, "Release non trovata");
    const [updated] = await db.update(otaReleases)
      .set({ status: "broken", slot: "archived", updatedAt: new Date() })
      .where(eq(otaReleases.id, id))
      .returning();
    await db.execute(sql`
      DELETE FROM device_ota_assignments WHERE slot = 'admin-preview'
    `);
    const actorId = req.session.userId;
    if (actorId) {
      storage.createModeratorLog({
        moderatorId: actorId,
        action: "mark_ota_broken",
        targetType: "ota_release",
        targetId: id,
        details: `Release marcata rotta da admin-preview: v=${existing[0].version}`,
      }).catch(() => {});
    }
    return res.json(updated);
  } catch (err) {
    console.error("[OTA-MARK-BROKEN] error:", err);
    return sendError(res, 500, "Errore segnalazione release");
  }
});

router.get("/ota/events", async (req: Request, res: Response) => {
  try {
    const result = await db.select().from(otaEvents).orderBy(desc(otaEvents.createdAt)).limit(100);
    return res.json(result);
  } catch (err) {
    return sendError(res, 500, "Errore lettura eventi");
  }
});

export default router;
