/**
 * ThinkCentre Health — Admin
 *
 * GET /api/admin/thinkcentre-health
 * Probe parallelo dei servizi self-hosted sul ThinkCentre:
 * GraphHopper (routing), Ollama (AI), Whisper (ASR), Nominatim (geocoding),
 * Valhalla (routing), Redis (cache), PostgreSQL (DB), pgAdmin, nginx, Uptime Kuma.
 */

import { Router, type Request, type Response as ExpressResponse } from "express";
import { db, withDbRetry } from "../../db";
import { appSettings, thinkcentreHealthEvents } from "@shared/db";
import { desc, eq } from "drizzle-orm";
import {
  isStartingUp,
  tokenFingerprint,
  type ProbeLogEntry,
} from "./thinkcentre-health-utils";
import { isThinkCentreInMaintenance } from "../../lib/thinkcentre-maintenance";
import { isThinkCentrePoweredOff } from "../../lib/thinkcentre-powered-off";
import {
  probeValhallaDetailed,
  probeNominatimDetailed,
  probeUfwDetailed,
  type ValhallaDetailedHealth,
  type NominatimDetailedHealth,
  type UfwDetailedHealth,
} from "./thinkcentre-health-vn-probes";
import {
  probeRedisInfra,
  probePostgresInfra,
  probePgAdmin,
  probeNginxInfra,
  probeUptimeKuma,
} from "./thinkcentre-health-infra-probes";
import {
  probeGraphHopperAreas,
  probeOllama,
  probeWhisper,
  type ServiceHealth,
  type AreaServiceHealth,
  type GraphHopperHealth,
  type ErrorEvent,
} from "./thinkcentre-health-gh-probes";
import { updateSystemStatus, type DotStatus as CachedDotStatus } from "../../lib/system-status-cache";
import { sendError } from "../../lib/api-response";

export type {
  ServiceHealth,
  AreaServiceHealth,
  GraphHopperHealth,
  ErrorEvent,
  ProbeLogEntry,
  ValhallaDetailedHealth,
  NominatimDetailedHealth,
  UfwDetailedHealth,
};

type ServiceKey =
  | "graphhopper"
  | "valhalla"
  | "ollama"
  | "whisper"
  | "nominatim"
  | "ufw"
  | "redis"
  | "postgres"
  | "pgadmin"
  | "nginx"
  | "uptimekuma";

const router = Router();

/**
 * GET /api/admin/thinkcentre/maintenance
 * Legge il flag "thinkcentre_maintenance_mode". Default: false.
 */
router.get("/thinkcentre/maintenance", async (_req: Request, res: ExpressResponse) => {
  try {
    const enabled = await isThinkCentreInMaintenance();
    return res.json({ enabled });
  } catch (_err) {
    return sendError(res, 500, "Errore lettura modalità manutenzione ThinkCentre");
  }
});

/**
 * POST /api/admin/thinkcentre/maintenance
 * Body: { enabled: boolean }
 * Attiva/disattiva la modalità manutenzione. Si applica immediatamente senza restart.
 */
router.post("/thinkcentre/maintenance", async (req: Request, res: ExpressResponse) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "Campo 'enabled' deve essere un booleano");
    }
    await withDbRetry(() =>
      db
        .insert(appSettings)
        .values({ key: "thinkcentre_maintenance_mode", value: enabled ? "true" : "false" })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: enabled ? "true" : "false", updatedAt: new Date() },
        }),
    );
    console.log(`[admin/thinkcentre-maintenance] manutenzione ${enabled ? "ATTIVATA" : "disattivata"}`);
    return res.json({ ok: true, enabled });
  } catch (_err) {
    return sendError(res, 500, "Errore salvataggio modalità manutenzione ThinkCentre");
  }
});

/**
 * GET /api/admin/thinkcentre/powered-off
 * Legge il flag "thinkcentre_powered_off". Default: false.
 */
router.get("/thinkcentre/powered-off", async (_req: Request, res: ExpressResponse) => {
  try {
    const enabled = await isThinkCentrePoweredOff();
    return res.json({ enabled });
  } catch (_err) {
    return sendError(res, 500, "Errore lettura stato ThinkCentre spento");
  }
});

/**
 * POST /api/admin/thinkcentre/powered-off
 * Body: { enabled: boolean }
 * Attiva/disattiva il flag "ThinkCentre spento". Si applica immediatamente senza restart.
 * Quando attivo: probe saltate, push bloccate, routing su cloud.
 */
router.post("/thinkcentre/powered-off", async (req: Request, res: ExpressResponse) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "Campo 'enabled' deve essere un booleano");
    }
    await withDbRetry(() =>
      db
        .insert(appSettings)
        .values({ key: "thinkcentre_powered_off", value: enabled ? "true" : "false" })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: enabled ? "true" : "false", updatedAt: new Date() },
        }),
    );
    console.log(`[admin/thinkcentre-powered-off] ThinkCentre ${enabled ? "SPENTO (override attivo)" : "acceso (override rimosso)"}`);
    return res.json({ ok: true, enabled });
  } catch (_err) {
    return sendError(res, 500, "Errore salvataggio stato ThinkCentre spento");
  }
});

router.get("/thinkcentre-events", async (_req: Request, res: ExpressResponse) => {
  try {
    const limit = 20;
    const events = await db
      .select()
      .from(thinkcentreHealthEvents)
      .orderBy(desc(thinkcentreHealthEvents.occurredAt))
      .limit(limit);
    return res.json({ events });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/thinkcentre-events] errore:", msg);
    return sendError(res, 500, "Errore recupero eventi ThinkCentre");
  }
});

router.get("/thinkcentre-health", async (_req: Request, res: ExpressResponse) => {
  try {
    // ThinkCentre spento: risposta sintetica immediata, zero probe di rete.
    if (await isThinkCentrePoweredOff()) {
      return res.json({
        overall: "idle",
        onlineCount: 0,
        configuredCount: 0,
        services: [],
        graphhopperConfigured: false,
        graphhopperUrl: null,
        graphhopperTokenMissing: false,
        graphhopperAreas: [],
        valhallaDetail: null,
        nominatimDetail: null,
        ufwDetail: null,
        tokenFingerprints: { graphhopper: null, valhalla: null, ollama: null, whisper: null, nominatim: null },
        maintenanceMode: false,
        poweredOff: true,
        checkedAt: Date.now(),
      });
    }

    const [
      maintenance,
      graphhopper,
      valhallaDetail,
      nominatimDetail,
      ollama,
      whisper,
      ufwDetail,
      redisInfra,
      postgresInfra,
      pgadminInfra,
      nginxInfra,
      uptimeKumaInfra,
    ] = await Promise.all([
      isThinkCentreInMaintenance(),
      probeGraphHopperAreas(),
      probeValhallaDetailed(),
      probeNominatimDetailed(),
      probeOllama(),
      probeWhisper(),
      probeUfwDetailed(),
      probeRedisInfra(),
      probePostgresInfra(),
      probePgAdmin(),
      probeNginxInfra(),
      probeUptimeKuma(),
    ]);

    const valhallaService: ServiceHealth = {
      key: "valhalla",
      label: "Valhalla",
      configured: valhallaDetail.configured,
      ok: valhallaDetail.ok,
      startingUp: valhallaDetail.ok ? false : isStartingUp("valhalla"),
      latencyMs: valhallaDetail.latencyMs,
      url: valhallaDetail.url,
      error: valhallaDetail.error,
      tileVersion: valhallaDetail.tileVersion,
      tokenMissing: valhallaDetail.tokenMissing,
      history: valhallaDetail.history,
      probeLog: valhallaDetail.probeLog,
    };
    const nominatimService: ServiceHealth = {
      key: "nominatim",
      label: "Nominatim",
      configured: nominatimDetail.configured,
      ok: nominatimDetail.ok,
      startingUp: nominatimDetail.ok ? false : isStartingUp("nominatim"),
      latencyMs: nominatimDetail.latencyMs,
      url: nominatimDetail.url,
      error: nominatimDetail.error,
      tokenMissing: nominatimDetail.tokenMissing,
      history: nominatimDetail.history,
      probeLog: nominatimDetail.probeLog,
    };
    const redisService: ServiceHealth = {
      key: "redis",
      label: "Redis",
      configured: redisInfra.configured,
      ok: redisInfra.ok,
      startingUp: redisInfra.ok ? false : isStartingUp("redis"),
      latencyMs: redisInfra.latencyMs,
      url: redisInfra.url,
      error: redisInfra.error,
      history: redisInfra.history,
      probeLog: redisInfra.probeLog,
    };
    const postgresService: ServiceHealth = {
      key: "postgres",
      label: "PostgreSQL",
      configured: postgresInfra.configured,
      ok: postgresInfra.ok,
      startingUp: postgresInfra.ok ? false : isStartingUp("postgres"),
      latencyMs: postgresInfra.latencyMs,
      url: postgresInfra.url,
      error: postgresInfra.error,
      history: postgresInfra.history,
      probeLog: postgresInfra.probeLog,
    };
    const pgadminService: ServiceHealth = {
      key: "pgadmin",
      label: "pgAdmin",
      configured: pgadminInfra.configured,
      ok: pgadminInfra.ok,
      startingUp: pgadminInfra.ok ? false : isStartingUp("pgadmin"),
      latencyMs: pgadminInfra.latencyMs,
      url: pgadminInfra.url,
      error: pgadminInfra.error,
      history: pgadminInfra.history,
      probeLog: pgadminInfra.probeLog,
    };
    const nginxService: ServiceHealth = {
      key: "nginx",
      label: "nginx",
      configured: nginxInfra.configured,
      ok: nginxInfra.ok,
      startingUp: nginxInfra.ok ? false : isStartingUp("nginx"),
      latencyMs: nginxInfra.latencyMs,
      url: nginxInfra.url,
      error: nginxInfra.error,
      history: nginxInfra.history,
      probeLog: nginxInfra.probeLog,
    };
    const uptimeKumaService: ServiceHealth = {
      key: "uptimekuma",
      label: "Uptime Kuma",
      configured: uptimeKumaInfra.configured,
      ok: uptimeKumaInfra.ok,
      startingUp: uptimeKumaInfra.ok ? false : isStartingUp("uptimekuma"),
      latencyMs: uptimeKumaInfra.latencyMs,
      url: uptimeKumaInfra.url,
      error: uptimeKumaInfra.error,
      history: uptimeKumaInfra.history,
      probeLog: uptimeKumaInfra.probeLog,
    };

    const services: ServiceHealth[] = [
      valhallaService,
      ollama,
      whisper,
      nominatimService,
      redisService,
      postgresService,
      pgadminService,
      nginxService,
      uptimeKumaService,
    ];

    const graphhopperContributes = graphhopper.configured && graphhopper.areas.some((a) => a.enabled);
    const configuredServices = services.filter((s) => s.configured);
    const configuredCount = configuredServices.length + (graphhopperContributes ? 1 : 0);
    const onlineCount =
      configuredServices.filter((s) => s.ok).length +
      (graphhopperContributes && graphhopper.ok ? 1 : 0);

    const overall: "green" | "yellow" | "red" | "idle" =
      configuredCount === 0
        ? "idle"
        : onlineCount === configuredCount
          ? "green"
          : onlineCount === 0
            ? "red"
            : "yellow";

    const tokenFingerprints = {
      graphhopper: tokenFingerprint(process.env.GRAPHHOPPER_TOKEN),
      valhalla:    tokenFingerprint(process.env.VALHALLA_API_KEY),
      ollama:      tokenFingerprint(process.env.OLLAMA_TOKEN),
      whisper:     tokenFingerprint(process.env.WHISPER_TOKEN),
      nominatim:   tokenFingerprint(process.env.NOMINATIM_TOKEN),
    };

    function svcDot(s: ServiceHealth | undefined): CachedDotStatus {
      if (!s || !s.configured) return "unknown";
      if (s.ok) return "ok";
      if (s.startingUp) return "degraded";
      return "offline";
    }
    function ghDot(): CachedDotStatus {
      if (!graphhopper.configured || graphhopper.areas.length === 0) return "unknown";
      const anyOk = graphhopper.areas.some((a) => a.ok);
      const allOk = graphhopper.areas.every((a) => a.ok);
      if (allOk) return "ok";
      if (anyOk) return "degraded";
      const anyStarting = graphhopper.areas.some((a) => a.enabled && a.startingUp);
      if (anyStarting) return "degraded";
      return "offline";
    }
    function ufwDot(): CachedDotStatus {
      if (!ufwDetail || !ufwDetail.configured) return "unknown";
      return ufwDetail.ok ? "ok" : "offline";
    }
    const tcDot: CachedDotStatus =
      overall === "green" ? "ok" : overall === "yellow" ? "degraded" : overall === "red" ? "offline" : "unknown";

    const svcMap = new Map(services.map((s) => [s.key, s]));
    // In manutenzione: ThinkCentre non contribuisce allo stato globale ("unknown" = escluso).
    // Le probe sono comunque eseguite per mostrare i dati all'admin.
    if (maintenance) {
      updateSystemStatus({
        thinkcentre: "unknown",
        graphhopper: "unknown",
        valhalla: "unknown",
        nominatim: "unknown",
        ollama: "unknown",
        whisper: "unknown",
        ufw: "unknown",
        redis: "unknown",
        postgres: "unknown",
        pgadmin: "unknown",
        nginx: "unknown",
        uptimeKuma: "unknown",
      });
    } else {
      updateSystemStatus({
        thinkcentre: tcDot,
        graphhopper: ghDot(),
        valhalla: svcDot(svcMap.get("valhalla")),
        nominatim: svcDot(svcMap.get("nominatim")),
        ollama: svcDot(svcMap.get("ollama")),
        whisper: svcDot(svcMap.get("whisper")),
        ufw: ufwDot(),
        redis: svcDot(svcMap.get("redis")),
        postgres: svcDot(svcMap.get("postgres")),
        pgadmin: svcDot(svcMap.get("pgadmin")),
        nginx: svcDot(svcMap.get("nginx")),
        uptimeKuma: svcDot(svcMap.get("uptimekuma")),
      });
    }

    return res.json({
      overall,
      onlineCount,
      configuredCount,
      services,
      graphhopperConfigured: graphhopper.configured,
      graphhopperUrl: graphhopper.url,
      graphhopperTokenMissing: graphhopper.tokenMissing,
      graphhopperAreas: graphhopper.areas,
      valhallaDetail,
      nominatimDetail,
      ufwDetail,
      tokenFingerprints,
      maintenanceMode: maintenance,
      checkedAt: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/thinkcentre-health] errore:", msg);
    return sendError(res, 500, "Errore probe servizi ThinkCentre");
  }
});

/**
 * Runs all ThinkCentre probes in parallel and returns a compact status
 * snapshot. Exported so /api/admin/system-probe can call it independently,
 * keeping dot colours fresh even when the dashboard cards are collapsed.
 * When maintenance mode is active, skips all probes and returns "unknown"
 * for every ThinkCentre key so the global health is not affected.
 */
export async function probeThinkCentreStatusSnapshot(): Promise<
  Pick<
    import("../../lib/system-status-cache").SystemStatusSnapshot,
    | "thinkcentre" | "graphhopper" | "valhalla" | "nominatim"
    | "ollama" | "whisper" | "ufw"
    | "redis" | "postgres" | "pgadmin" | "nginx" | "uptimeKuma"
  >
> {
  // ThinkCentre spento: snapshot sintetico immediato, zero probe di rete.
  if (await isThinkCentrePoweredOff()) {
    const snap = {
      thinkcentre: "unknown" as CachedDotStatus,
      graphhopper: "unknown" as CachedDotStatus,
      valhalla: "unknown" as CachedDotStatus,
      nominatim: "unknown" as CachedDotStatus,
      ollama: "unknown" as CachedDotStatus,
      whisper: "unknown" as CachedDotStatus,
      ufw: "unknown" as CachedDotStatus,
      redis: "unknown" as CachedDotStatus,
      postgres: "unknown" as CachedDotStatus,
      pgadmin: "unknown" as CachedDotStatus,
      nginx: "unknown" as CachedDotStatus,
      uptimeKuma: "unknown" as CachedDotStatus,
    };
    updateSystemStatus(snap);
    return snap;
  }

  if (await isThinkCentreInMaintenance()) {
    const snap = {
      thinkcentre: "unknown" as CachedDotStatus,
      graphhopper: "unknown" as CachedDotStatus,
      valhalla: "unknown" as CachedDotStatus,
      nominatim: "unknown" as CachedDotStatus,
      ollama: "unknown" as CachedDotStatus,
      whisper: "unknown" as CachedDotStatus,
      ufw: "unknown" as CachedDotStatus,
      redis: "unknown" as CachedDotStatus,
      postgres: "unknown" as CachedDotStatus,
      pgadmin: "unknown" as CachedDotStatus,
      nginx: "unknown" as CachedDotStatus,
      uptimeKuma: "unknown" as CachedDotStatus,
    };
    updateSystemStatus(snap);
    return snap;
  }

  const [
    graphhopper,
    valhallaDetail,
    nominatimDetail,
    ollama,
    whisper,
    ufwDetail,
    redisInfra,
    postgresInfra,
    pgadminInfra,
    nginxInfra,
    uptimeKumaInfra,
  ] = await Promise.all([
    probeGraphHopperAreas(),
    probeValhallaDetailed(),
    probeNominatimDetailed(),
    probeOllama(),
    probeWhisper(),
    probeUfwDetailed(),
    probeRedisInfra(),
    probePostgresInfra(),
    probePgAdmin(),
    probeNginxInfra(),
    probeUptimeKuma(),
  ]);

  function svc(s: { configured: boolean; ok: boolean; startingUp?: boolean }): CachedDotStatus {
    if (!s.configured) return "unknown";
    if (s.ok) return "ok";
    if (s.startingUp) return "degraded";
    return "offline";
  }

  const ghDot = (): CachedDotStatus => {
    if (!graphhopper.configured || graphhopper.areas.length === 0) return "unknown";
    const allOk = graphhopper.areas.every((a) => a.ok);
    if (allOk) return "ok";
    if (graphhopper.areas.some((a) => a.ok)) return "degraded";
    if (graphhopper.areas.some((a) => a.enabled && a.startingUp)) return "degraded";
    return "offline";
  };

  const configuredServices = [valhallaDetail, nominatimDetail, ollama, whisper, redisInfra, postgresInfra, pgadminInfra, nginxInfra, uptimeKumaInfra].filter((s) => s.configured);
  const ghContributes = graphhopper.configured && graphhopper.areas.some((a) => a.enabled);
  const configuredCount = configuredServices.length + (ghContributes ? 1 : 0);
  const onlineCount = configuredServices.filter((s) => s.ok).length + (ghContributes && graphhopper.ok ? 1 : 0);
  const overall: CachedDotStatus =
    configuredCount === 0 ? "unknown" :
    onlineCount === configuredCount ? "ok" :
    onlineCount === 0 ? "offline" : "degraded";

  const snap = {
    thinkcentre: overall,
    graphhopper: ghDot(),
    valhalla: svc(valhallaDetail),
    nominatim: svc(nominatimDetail),
    ollama: svc(ollama),
    whisper: svc(whisper),
    ufw: ufwDetail.configured ? (ufwDetail.ok ? "ok" : "offline") as CachedDotStatus : "unknown",
    redis: svc(redisInfra),
    postgres: svc(postgresInfra),
    pgadmin: svc(pgadminInfra),
    nginx: svc(nginxInfra),
    uptimeKuma: svc(uptimeKumaInfra),
  };

  updateSystemStatus(snap);
  return snap;
}

export default router;
