import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { db } from "../db";
import { getTrustedClientIp } from "../lib/abuse-rate-limit";
import { sendSuccess, sendError } from "../lib/api-response";
import { sql } from "drizzle-orm";

export function registerExpoUpdatesRoutes(app: Express) {
  app.get("/api/updates/check", async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`SELECT * FROM ota_releases WHERE status = 'active' ORDER BY published_at DESC LIMIT 1`);
      if (!result.rows.length) {
        return res.json({ hasUpdate: false, version: null, releaseNotes: null, bundlePath: null, publishedAt: null });
      }
      const release = result.rows[0] as Record<string, unknown>;
      return res.json({
        hasUpdate: true,
        version: release.version,
        releaseNotes: release.release_notes,
        bundlePath: release.bundle_path,
        manifestUrl: release.bundle_path,
        publishedAt: release.published_at,
      });
    } catch {
      return res.json({ hasUpdate: false, version: null, releaseNotes: null, bundlePath: null, publishedAt: null });
    }
  });

  // ─── Expo Updates Protocol v1 ───────────────────────────────────────────────
  // In-memory SHA-256 cache: releaseId → base64url hash
  const _expoUpdateHashCache = new Map<string, string>();

  // Esposto al router admin per invalidare la cache dopo publish/rollback.
  // L'admin chiama app.locals.invalidateExpoUpdateHash(id?) — se omesso, svuota tutto.
  app.locals.invalidateExpoUpdateHash = (releaseId?: string) => {
    if (releaseId) {
      const had = _expoUpdateHashCache.delete(releaseId);
      console.log(`[expo-updates] cache invalidate id=${releaseId} hit=${had}`);
    } else {
      const size = _expoUpdateHashCache.size;
      _expoUpdateHashCache.clear();
      console.log(`[expo-updates] cache invalidate ALL (cleared ${size} entries)`);
    }
  };

  // Read the expected runtimeVersion from app.json once at startup so that
  // bumping the cycle in app.json automatically updates this endpoint too.
  const _expectedRuntimeVersion: string = (() => {
    try {
      const appJson = JSON.parse(fs.readFileSync(path.resolve("app.json"), "utf8"));
      return appJson?.expo?.runtimeVersion ?? "9.0.0";
    } catch {
      return "9.0.0";
    }
  })();

  // Read the app version from app.json once at startup — used in OTA manifest
  // extra.expoClient so the field stays aligned with app.json without manual updates.
  const _expectedAppVersion: string = (() => {
    try {
      const appJson = JSON.parse(fs.readFileSync(path.resolve("app.json"), "utf8"));
      return appJson?.expo?.version ?? "3.1.0";
    } catch {
      return "3.1.0";
    }
  })();

  app.get("/api/expo-updates", async (req: Request, res: Response) => {
    let debug = false;
    if (req.query.debug === "1") {
      const userId = req.session.userId;
      if (userId) {
        try {
          const { storage } = await import("../storage");
          const user = await storage.getUser(userId);
          if (user?.role === "admin") debug = true;
        } catch {
          // best-effort
        }
      }
    }
    const requestStartedAt = Date.now();
    const otaProbeSampleN = (() => {
      const raw = parseInt(String(process.env.OTA_PROBE_SAMPLE ?? "20"), 10);
      return Number.isFinite(raw) && raw > 0 ? raw : 20;
    })();
    const logEvent = async (status: string, releaseId: string | null, errMsg?: string) => {
      const isAnomaly = status.startsWith("5") || status === "missing-headers" || status === "runtime-mismatch";
      const sampled = Math.floor(Math.random() * otaProbeSampleN) === 0;
      if (!debug && !isAnomaly && !sampled) return;
      try {
        const { otaEvents } = await import("@shared/schema");
        const { db: dbInner } = await import("../db");
        const durationMs = Date.now() - requestStartedAt;
        const detail = errMsg ? `${status} | ${errMsg} | ${durationMs}ms` : `${status} | ${durationMs}ms`;
        await dbInner.insert(otaEvents).values({
          phase: debug ? "server-check" : "server-anon-check",
          source: "server",
          platform: ((req.headers["expo-platform"] as string) ?? "?").substring(0, 16),
          runtimeVersion: ((req.headers["expo-runtime-version"] as string) ?? "?").substring(0, 32),
          currentUpdateId: ((req.headers["expo-current-update-id"] as string) ?? "?").substring(0, 64),
          releaseId: releaseId ? releaseId.substring(0, 64) : undefined,
          error: detail.substring(0, 500),
          failCount: 0,
          ip: getTrustedClientIp(req),
        });
      } catch (e) {
        console.error("[expo-updates debug log] insert failed:", e);
      }
    };

    const setExpoUpdatesHeaders = (etag?: string) => {
      res.setHeader("expo-protocol-version", "1");
      res.setHeader("expo-sfv-version", "0");
      res.setHeader("cache-control", "private, max-age=0");
      if (etag) res.setHeader("etag", etag);
    };

    const writeMultipartResponse = (
      parts: Array<{ name: string; contentType: string; body: string }>,
    ) => {
      const CRLF = "\r\n";
      const boundary = `----expo-updates-${crypto.randomBytes(12).toString("hex")}`;
      const segments = parts.map(
        (p) =>
          `--${boundary}${CRLF}` +
          `content-disposition: form-data; name="${p.name}"${CRLF}` +
          `content-type: ${p.contentType}${CRLF}${CRLF}` +
          p.body,
      );
      const body = segments.join(CRLF) + `${CRLF}--${boundary}--${CRLF}`;
      const buf = Buffer.from(body, "utf8");
      res.removeHeader("ETag");
      res.setHeader("content-type", `multipart/mixed; boundary=${boundary}`);
      res.setHeader("content-length", String(buf.length));
      res.status(200).end(buf);
    };

    const sendNoUpdateDirective = (etag?: string) => {
      setExpoUpdatesHeaders(etag);
      writeMultipartResponse([
        {
          name: "directive",
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ type: "noUpdateAvailable" }),
        },
      ]);
    };

    try {
      const runtimeVersion = req.headers["expo-runtime-version"] as string | undefined;
      const platform = req.headers["expo-platform"] as string | undefined;
      const currentUpdateId = req.headers["expo-current-update-id"] as string | undefined;

      const SEMVER_RE = /^\d+\.\d+\.\d+$/;
      if (runtimeVersion !== undefined && !SEMVER_RE.test(runtimeVersion)) {
        return sendError(res, 400, "expo-runtime-version non valida (formato atteso: X.Y.Z)");
      }

      if (!runtimeVersion || !platform) {
        await logEvent(
          "missing-headers",
          null,
          `rv=${runtimeVersion ?? "absent"} pf=${platform ?? "absent"}`,
        );
      } else if (runtimeVersion !== _expectedRuntimeVersion) {
        await logEvent(
          "runtime-mismatch",
          null,
          `client=${runtimeVersion} server=${_expectedRuntimeVersion}`,
        );
      }

      if (platform && platform !== "android") {
        await logEvent("noUpdate-not-android", null);
        return sendNoUpdateDirective();
      }

      const effectiveRv = runtimeVersion ?? _expectedRuntimeVersion;

      let rawDeviceId: string | null =
        (req.headers["expo-device-id"] as string | undefined) ||
        (req.headers["expo-installation-id"] as string | undefined) ||
        null;
      if (rawDeviceId === "extra-params") {
        try {
          const extraParamsHeader = req.headers["expo-extra-params"] as string | undefined;
          if (extraParamsHeader) {
            const extraParams = JSON.parse(extraParamsHeader) as Record<string, unknown>;
            const parsed = typeof extraParams["device-id"] === "string" ? extraParams["device-id"] : null;
            rawDeviceId = parsed || null;
          } else {
            rawDeviceId = null;
          }
        } catch {
          rawDeviceId = null;
        }
      }
      const deviceId = rawDeviceId?.substring(0, 128) || null;
      let assignedSlot: string | null = null;
      let hasSlotAssignment = false;
      if (deviceId) {
        try {
          const assignResult = await db.execute(sql`SELECT slot, expires_at FROM device_ota_assignments WHERE device_id = ${deviceId}`);
          if (assignResult.rows.length > 0) {
            const asgn = assignResult.rows[0];
            const expired = asgn.expires_at && new Date(asgn.expires_at) <= new Date();
            if (!expired) {
              assignedSlot = asgn.slot as string;
              hasSlotAssignment = true;
            }
          }
        } catch (e) {
          console.error("[expo-updates] assignment lookup failed:", e);
        }
      }

      let release: Record<string, unknown> | null = null;

      if (hasSlotAssignment && assignedSlot) {
        const slotApprovedFilter = assignedSlot === "stable" ? sql` AND approved = true` : sql``;
        const slotResult = await db.execute(sql`SELECT * FROM ota_releases WHERE slot = ${assignedSlot} AND status = 'active' AND runtime_version = ${effectiveRv}${slotApprovedFilter} ORDER BY published_at DESC LIMIT 1`);
        if (slotResult.rows.length > 0) {
          release = slotResult.rows[0] as Record<string, unknown>;
        } else {
          const reason = `slot=${assignedSlot} no active OTA`;
          await logEvent("fallback_to_stable", null, reason);
          const stableResult = await db.execute(sql`SELECT * FROM ota_releases WHERE slot = 'stable' AND status = 'active' AND approved = true AND runtime_version = ${effectiveRv} ORDER BY published_at DESC LIMIT 1`);
          if (stableResult.rows.length > 0) {
            release = stableResult.rows[0] as Record<string, unknown>;
          } else {
            await logEvent("fallback_to_stable_empty", null, `${reason} and stable also empty`);
          }
        }
      } else {
        const stableResult = await db.execute(sql`SELECT * FROM ota_releases WHERE slot = 'stable' AND status = 'active' AND approved = true AND runtime_version = ${effectiveRv} ORDER BY published_at DESC LIMIT 1`);
        if (stableResult.rows.length > 0) {
          release = stableResult.rows[0] as Record<string, unknown>;
        } else {
          const legacyResult = await db.execute(sql`SELECT * FROM ota_releases WHERE slot IS NULL AND status = 'active' AND runtime_version = ${effectiveRv} ORDER BY published_at DESC LIMIT 1`);
          if (legacyResult.rows.length > 0) {
            release = legacyResult.rows[0] as Record<string, unknown>;
            await logEvent("legacy_fallback", String(legacyResult.rows[0].id), "stable slot empty, serving legacy pre-slot OTA");
          }
        }
      }

      if (!release) {
        await logEvent("noUpdate-no-release", null);
        return sendNoUpdateDirective();
      }

      if (currentUpdateId && currentUpdateId === release.id) {
        await logEvent("noUpdate-already-current", String(release.id));
        return sendNoUpdateDirective(`"${release.id}"`);
      }

      let sha256Hash = _expoUpdateHashCache.get(release.id as string);
      let cacheHit = true;
      if (!sha256Hash) {
        cacheHit = false;
        const { downloadBuffer, isValidOtaBundlePath } = await import("../objectStorage");
        if (!isValidOtaBundlePath(release.bundle_path as string)) {
          console.error(
            `[expo-updates] Refusing to build manifest for release ${release.id}: bundle_path failed validator: ${release.bundle_path}`,
          );
          return sendNoUpdateDirective();
        }
        const bundleBuffer = await downloadBuffer(release.bundle_path as string);
        sha256Hash = crypto.createHash("sha256").update(bundleBuffer).digest("base64url");
        _expoUpdateHashCache.set(release.id as string, sha256Hash);
        console.log(`[expo-updates] Computed SHA-256 for release ${release.id}: ${sha256Hash.substring(0, 12)}...`);
      }
      await logEvent(cacheHit ? "200-manifest-cached" : "200-manifest-fresh", String(release.id));

      const BASE_URL = process.env.BIKERLINK_PUBLIC_URL ?? "https://biker-link.replit.app";
      const bundleUrl = `${BASE_URL}/api/expo-updates/assets/${encodeURIComponent(release.id as string)}`;

      const createdAt: string = release.published_at
        ? new Date(release.published_at as string | Date).toISOString()
        : new Date().toISOString();

      const manifest = {
        id: release.id,
        createdAt,
        runtimeVersion: runtimeVersion ?? _expectedRuntimeVersion,
        assets: [] as unknown[],
        launchAsset: {
          hash: sha256Hash,
          key: "bundle",
          contentType: "application/javascript",
          url: bundleUrl,
        },
        metadata: {},
        extra: {
          expoClient: {
            name: "BikerLink",
            version: _expectedAppVersion,
          },
        },
      };

      setExpoUpdatesHeaders(`"${release.id}"`);
      writeMultipartResponse([
        {
          name: "manifest",
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify(manifest),
        },
      ]);
      return;
    } catch (error) {
      console.error("[expo-updates] Error:", error);
      try {
        await logEvent("500-internal-error", null, String((error as Error)?.message ?? error).substring(0, 200));
      } catch {
        // best-effort
      }
      return sendError(res, 500, "Internal server error");
    }
  });

  app.get("/api/expo-updates/assets/:releaseId", async (req: Request, res: Response) => {
    try {
      const { releaseId } = req.params;
      const result = await db.execute(sql`SELECT bundle_path FROM ota_releases WHERE id = ${releaseId} AND status = 'active'`);
      if (!result.rows.length || !(result.rows[0] as Record<string, unknown>).bundle_path) {
        return res.status(404).end();
      }
      const bundlePath = (result.rows[0] as Record<string, unknown>).bundle_path as string;
      const { downloadBuffer, isValidOtaBundlePath } = await import("../objectStorage");
      if (!isValidOtaBundlePath(bundlePath)) {
        console.error(
          `[expo-updates/assets] Refusing to serve release ${releaseId}: bundle_path failed validator: ${bundlePath}`,
        );
        return res.status(404).end();
      }
      const bundleBuffer = await downloadBuffer(bundlePath);
      res.setHeader("content-type", "application/javascript");
      res.setHeader("cache-control", "public, max-age=31536000, immutable");
      return res.end(bundleBuffer);
    } catch (error) {
      console.error("[expo-updates/assets] Error:", error);
      return res.status(500).end();
    }
  });

  const _heartbeatRateMap = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/ota/heartbeat", async (req: Request, res: Response) => {
    try {
      const { deviceId, releaseId, runtimeVersion } = req.body ?? {};
      if (!releaseId || typeof releaseId !== "string") {
        return sendError(res, 400, "releaseId obbligatorio");
      }
      if (runtimeVersion !== undefined && runtimeVersion !== null && !(/^\d+\.\d+\.\d+$/).test(String(runtimeVersion))) {
        return sendError(res, 400, "runtime_version non valida (formato atteso: X.Y.Z)");
      }
      const stripNull = (s: string) => s.replace(/\x00/g, "");
      const safeDeviceId = deviceId ? stripNull(String(deviceId)).substring(0, 32) : null;
      const safeReleaseId = stripNull(String(releaseId)).substring(0, 64);
      const safeRv = runtimeVersion ? stripNull(String(runtimeVersion)).substring(0, 32) : null;
      const clientIp = getTrustedClientIp(req) ?? "unknown";

      const now = Date.now();
      const rl = _heartbeatRateMap.get(clientIp);
      if (!rl || rl.resetAt <= now) {
        _heartbeatRateMap.set(clientIp, { count: 1, resetAt: now + 60_000 });
      } else {
        rl.count++;
        if (rl.count > 10) {
          return sendError(res, 429, "Too many heartbeats");
        }
      }

      const exists = await db.execute(sql`SELECT id FROM ota_releases WHERE id = ${safeReleaseId} LIMIT 1`);
      if (!exists.rows.length) {
        return sendError(res, 404, "Release non trovata");
      }

      let shouldIncrementCount = true;
      if (safeDeviceId) {
        const recent = await db.execute(sql`SELECT 1 FROM ota_events WHERE phase='loaded' AND source=${safeDeviceId} AND release_id=${safeReleaseId} AND created_at > NOW() - INTERVAL '5 minutes' LIMIT 1`);
        if (recent.rows.length > 0) shouldIncrementCount = false;
      }

      const { otaEvents } = await import("@shared/schema");

      await db.insert(otaEvents).values({
        phase: "loaded",
        source: safeDeviceId ?? "unknown",
        platform: "android",
        runtimeVersion: safeRv ?? undefined,
        releaseId: safeReleaseId,
        currentUpdateId: safeReleaseId,
        failCount: 0,
        ip: clientIp,
      });

      if (shouldIncrementCount) {
        await db.execute(sql`UPDATE ota_releases SET success_count = success_count + 1, updated_at = NOW() WHERE id = ${safeReleaseId}`);
      }

      return sendSuccess(res, { counted: shouldIncrementCount });
    } catch (error) {
      console.error("[ota/heartbeat] Error:", error);
      return sendError(res, 500, "Internal server error");
    }
  });

  app.post("/api/ota/stuck-event", async (req: Request, res: Response) => {
    try {
      const { otaStuckEventSchema } = await import("@shared/schema");
      const bodyParsed = otaStuckEventSchema.safeParse(req.body ?? {});
      if (!bodyParsed.success) {
        return sendError(res, 400, bodyParsed.error.issues[0]?.message ?? "Payload non valido");
      }
      const { deviceId, rollbackCount, stuckSessions, runtimeVersion } = bodyParsed.data;
      const stripNull = (s: string) => s.replace(/\x00/g, "");
      const safeDeviceId = deviceId ? stripNull(String(deviceId)).substring(0, 64) : "unknown";
      const safeRv = runtimeVersion ? stripNull(runtimeVersion).substring(0, 32) : null;
      const safeRollback = rollbackCount ?? 0;
      const safeStuck = stuckSessions ?? 0;

      await db.execute(sql`
        INSERT INTO ota_stuck_events (device_id, rollback_count, stuck_sessions, runtime_version, created_at)
        VALUES (${safeDeviceId}, ${safeRollback}, ${safeStuck}, ${safeRv}, NOW())
      `);
      return sendSuccess(res);
    } catch (error) {
      console.error("[ota/stuck-event] Error:", error);
      return sendError(res, 500, "Internal server error");
    }
  });
}
