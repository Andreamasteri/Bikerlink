/**
 * ThinkCentre Health — Admin
 *
 * GET /api/admin/thinkcentre-health
 * Probe parallelo dei servizi self-hosted sul ThinkCentre:
 * GraphHopper (routing), Ollama (AI), Whisper (ASR), Photon (geocoding),
 * Valhalla (routing), DragonflyDB (cache), nginx, Uptime Kuma.
 */

import { Router, type Request, type Response as ExpressResponse } from "express";
import { db, withDbRetry } from "../../db";
import { appSettings, thinkcentreHealthEvents } from "@shared/db";
import { desc } from "drizzle-orm";
import {
  isStartingUp,
  tokenFingerprint,
  type ProbeLogEntry,
} from "./thinkcentre-health-utils";
import { isThinkCentreInMaintenance } from "../../lib/thinkcentre-maintenance";
import { isThinkCentrePoweredOff } from "../../lib/thinkcentre-powered-off";
import { resetThinkCentreOfflineCache } from "../../lib/thinkcentre-offline";
import { isThinkCentreIgnoredForTests } from "../../lib/thinkcentre-ignore-tests";
import {
  probeValhallaDetailed,
  probePhotonDetailed,
  probeUfwDetailed,
  type ValhallaDetailedHealth,
  type PhotonDetailedHealth,
  type UfwDetailedHealth,
} from "./thinkcentre-health-vn-probes";
import {
  probeDragonflyInfra,
  probeNginxInfra,
  probeUptimeKuma,
  probeAiHub,
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
import { probeAres, type AresHealth } from "./thinkcentre-health-ares-probe";
import { probeRepoDrift, type RepoDriftHealth } from "./thinkcentre-health-repodrift-probe";
import { sendError } from "../../lib/api-response";

import { updateThinkCentreSystemStatus, probeThinkCentreStatusSnapshot } from "./thinkcentre-health.part2";

export type {
  ServiceHealth,
  AreaServiceHealth,
  GraphHopperHealth,
  ErrorEvent,
  ProbeLogEntry,
  ValhallaDetailedHealth,
  PhotonDetailedHealth,
  UfwDetailedHealth,
  AresHealth,
  RepoDriftHealth,
};

export { probeThinkCentreStatusSnapshot };

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
    // Invalida la cache TTL 3min: lo switch deve avere effetto immediato.
    resetThinkCentreOfflineCache();
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
    // Invalida la cache TTL 3min: lo switch deve avere effetto immediato.
    resetThinkCentreOfflineCache();
    console.log(`[admin/thinkcentre-powered-off] ThinkCentre ${enabled ? "SPENTO (override attivo)" : "acceso (override rimosso)"}`);
    return res.json({ ok: true, enabled });
  } catch (_err) {
    return sendError(res, 500, "Errore salvataggio stato ThinkCentre spento");
  }
});

/**
 * GET /api/admin/thinkcentre/ignore-for-tests
 * Legge il flag "thinkcentre_ignore_for_tests". Default: false.
 */
router.get("/thinkcentre/ignore-for-tests", async (_req: Request, res: ExpressResponse) => {
  try {
    const enabled = await isThinkCentreIgnoredForTests();
    return res.json({ enabled });
  } catch (_err) {
    return sendError(res, 500, "Errore lettura flag ignore-for-tests ThinkCentre");
  }
});

/**
 * POST /api/admin/thinkcentre/ignore-for-tests
 * Body: { enabled: boolean }
 * Attiva/disattiva la soppressione degli alert ThinkCentre nel proposer AI watchdog.
 */
router.post("/thinkcentre/ignore-for-tests", async (req: Request, res: ExpressResponse) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "Campo 'enabled' deve essere un booleano");
    }
    await withDbRetry(() =>
      db
        .insert(appSettings)
        .values({ key: "thinkcentre_ignore_for_tests", value: enabled ? "true" : "false" })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: enabled ? "true" : "false", updatedAt: new Date() },
        }),
    );
    console.log(`[admin/thinkcentre-ignore-tests] soppressione alert ${enabled ? "ATTIVATA" : "disattivata"}`);
    return res.json({ ok: true, enabled });
  } catch (_err) {
    return sendError(res, 500, "Errore salvataggio flag ignore-for-tests ThinkCentre");
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
        photonDetail: null,
        ufwDetail: null,
        tokenFingerprints: { graphhopper: null, valhalla: null, ollama: null, whisper: null, photon: null },
        aresDetail: null,
        maintenanceMode: false,
        poweredOff: true,
        checkedAt: Date.now(),
      });
    }

    const [
      maintenance,
      graphhopper,
      valhallaDetail,
      photonDetail,
      ollama,
      whisper,
      ufwDetail,
      dragonflyInfra,
      nginxInfra,
      uptimeKumaInfra,
      aresDetail,
      repoDrift,
      aiHubInfra,
    ] = await Promise.all([
      isThinkCentreInMaintenance(),
      probeGraphHopperAreas(),
      probeValhallaDetailed(),
      probePhotonDetailed(),
      probeOllama(),
      probeWhisper(),
      probeUfwDetailed(),
      probeDragonflyInfra(),
      probeNginxInfra(),
      probeUptimeKuma(),
      probeAres(),
      probeRepoDrift(),
      probeAiHub(),
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
    const photonService: ServiceHealth = {
      key: "photon",
      label: "Photon",
      configured: photonDetail.configured,
      ok: photonDetail.ok,
      startingUp: photonDetail.ok ? false : isStartingUp("photon"),
      latencyMs: photonDetail.latencyMs,
      url: photonDetail.url,
      error: photonDetail.error,
      tokenMissing: photonDetail.tokenMissing,
      history: photonDetail.history,
      probeLog: photonDetail.probeLog,
    };
    const dragonflyService: ServiceHealth = {
      key: "dragonfly",
      label: "DragonflyDB",
      configured: dragonflyInfra.configured,
      ok: dragonflyInfra.ok,
      startingUp: dragonflyInfra.ok ? false : isStartingUp("dragonfly"),
      latencyMs: dragonflyInfra.latencyMs,
      url: dragonflyInfra.url,
      error: dragonflyInfra.error,
      history: dragonflyInfra.history,
      probeLog: dragonflyInfra.probeLog,
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

    const aiHubService: ServiceHealth = {
      key: "aihub",
      label: "AI Hub",
      configured: aiHubInfra.configured,
      ok: aiHubInfra.ok,
      startingUp: false,
      latencyMs: aiHubInfra.latencyMs,
      url: aiHubInfra.url,
      error: aiHubInfra.error,
      history: aiHubInfra.history,
      probeLog: aiHubInfra.probeLog,
    };

    const services: ServiceHealth[] = [
      valhallaService,
      ollama,
      whisper,
      photonService,
      dragonflyService,
      nginxService,
      uptimeKumaService,
      aiHubService,
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
      ollama:      tokenFingerprint(process.env.BOWIE_OLLAMA_TOKEN),
      whisper:     tokenFingerprint(process.env.WHISPER_TOKEN),
      photon:      tokenFingerprint(process.env.PHOTON_TOKEN),
    };

    await updateThinkCentreSystemStatus(maintenance, services, graphhopper, ufwDetail, overall);

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
      photonDetail,
      ufwDetail,
      tokenFingerprints,
      aresDetail,
      repoDrift,
      maintenanceMode: maintenance,
      checkedAt: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/thinkcentre-health] errore:", msg);
    return sendError(res, 500, "Errore probe servizi ThinkCentre");
  }
});

export default router;
