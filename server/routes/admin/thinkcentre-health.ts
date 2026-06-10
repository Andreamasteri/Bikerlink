/**
 * ThinkCentre Health — Admin
 *
 * GET /api/admin/thinkcentre-health
 * Probe parallelo dei servizi self-hosted sul ThinkCentre:
 * GraphHopper (routing), Ollama (AI), Whisper (ASR), Nominatim (geocoding),
 * Valhalla (routing), Redis (cache), PostgreSQL (DB), pgAdmin, nginx, Uptime Kuma.
 */

import { Router, type Request, type Response as ExpressResponse } from "express";
import { db } from "../../db";
import { thinkcentreHealthEvents } from "@shared/db";
import { desc } from "drizzle-orm";
import {
  isStartingUp,
  tokenFingerprint,
  type ProbeLogEntry,
} from "./thinkcentre-health-utils";
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
    return res.status(500).json({ error: "Errore recupero eventi ThinkCentre" });
  }
});

router.get("/thinkcentre-health", async (_req: Request, res: ExpressResponse) => {
  try {
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
      checkedAt: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/thinkcentre-health] errore:", msg);
    return res.status(500).json({ error: "Errore probe servizi ThinkCentre" });
  }
});

/**
 * Runs all ThinkCentre probes in parallel and returns a compact status
 * snapshot. Exported so /api/admin/system-probe can call it independently,
 * keeping dot colours fresh even when the dashboard cards are collapsed.
 */
export async function probeThinkCentreStatusSnapshot(): Promise<
  Pick<
    import("../../lib/system-status-cache").SystemStatusSnapshot,
    | "thinkcentre" | "graphhopper" | "valhalla" | "nominatim"
    | "ollama" | "whisper" | "ufw"
    | "redis" | "postgres" | "pgadmin" | "nginx" | "uptimeKuma"
  >
> {
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
