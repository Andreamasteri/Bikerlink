import { updateSystemStatus, type DotStatus as CachedDotStatus } from "../../lib/system-status-cache";
import {
  probeGraphHopperAreas,
  probeOllama,
  probeWhisper,
  type ServiceHealth,
  type GraphHopperHealth,
  type AreaServiceHealth,
} from "./thinkcentre-health-gh-probes";
import {
  probeValhallaDetailed,
  probePhotonDetailed,
  probeUfwDetailed,
} from "./thinkcentre-health-vn-probes";
import {
  probeDragonflyInfra,
  probeNginxInfra,
  probeUptimeKuma,
} from "./thinkcentre-health-infra-probes";
import { isThinkCentreInMaintenance } from "../../lib/thinkcentre-maintenance";
import { isThinkCentrePoweredOff } from "../../lib/thinkcentre-powered-off";

/**
 * Snapshot helper for thinkcentre-health.
 */
export async function updateThinkCentreSystemStatus(
  maintenance: boolean,
  services: ServiceHealth[],
  graphhopper: GraphHopperHealth,
  ufwDetail: { configured: boolean; ok: boolean },
  overall: "green" | "yellow" | "red" | "idle"
) {
  function svcDot(s: ServiceHealth | undefined): CachedDotStatus {
    if (!s || !s.configured) return "unknown";
    if (s.ok) return "ok";
    if (s.startingUp) return "degraded";
    return "offline";
  }
  function ghDot(): CachedDotStatus {
    if (!graphhopper.configured || graphhopper.areas.length === 0) return "unknown";
    const anyOk = graphhopper.areas.some((a: AreaServiceHealth) => a.ok);
    const allOk = graphhopper.areas.every((a: AreaServiceHealth) => a.ok);
    if (allOk) return "ok";
    if (anyOk) return "degraded";
    const anyStarting = graphhopper.areas.some((a: AreaServiceHealth) => a.enabled && a.startingUp);
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

  if (maintenance) {
    updateSystemStatus({
      thinkcentre: "unknown",
      graphhopper: "unknown",
      valhalla: "unknown",
      photon: "unknown",
      ollama: "unknown",
      whisper: "unknown",
      ufw: "unknown",
      dragonfly: "unknown",
      nginx: "unknown",
      uptimeKuma: "unknown",
    });
  } else {
    updateSystemStatus({
      thinkcentre: tcDot,
      graphhopper: ghDot(),
      valhalla: svcDot(svcMap.get("valhalla")),
      photon: svcDot(svcMap.get("photon")),
      ollama: svcDot(svcMap.get("ollama")),
      whisper: svcDot(svcMap.get("whisper")),
      ufw: ufwDot(),
      dragonfly: svcDot(svcMap.get("dragonfly")),
      nginx: svcDot(svcMap.get("nginx")),
      uptimeKuma: svcDot(svcMap.get("uptimekuma")),
    });
  }
}

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
    | "thinkcentre" | "graphhopper" | "valhalla" | "photon"
    | "ollama" | "whisper" | "ufw"
    | "dragonfly" | "nginx" | "uptimeKuma"
  >
> {
  // ThinkCentre spento: snapshot sintetico immediato, zero probe di rete.
  if (await isThinkCentrePoweredOff()) {
    const snap = {
      thinkcentre: "unknown" as CachedDotStatus,
      graphhopper: "unknown" as CachedDotStatus,
      valhalla: "unknown" as CachedDotStatus,
      photon: "unknown" as CachedDotStatus,
      ollama: "unknown" as CachedDotStatus,
      whisper: "unknown" as CachedDotStatus,
      ufw: "unknown" as CachedDotStatus,
      dragonfly: "unknown" as CachedDotStatus,
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
      photon: "unknown" as CachedDotStatus,
      ollama: "unknown" as CachedDotStatus,
      whisper: "unknown" as CachedDotStatus,
      ufw: "unknown" as CachedDotStatus,
      dragonfly: "unknown" as CachedDotStatus,
      nginx: "unknown" as CachedDotStatus,
      uptimeKuma: "unknown" as CachedDotStatus,
    };
    updateSystemStatus(snap);
    return snap;
  }

  const [
    graphhopper,
    valhallaDetail,
    photonDetail,
    ollama,
    whisper,
    ufwDetail,
    dragonflyInfra,
    nginxInfra,
    uptimeKumaInfra,
  ] = await Promise.all([
    probeGraphHopperAreas(),
    probeValhallaDetailed(),
    probePhotonDetailed(),
    probeOllama(),
    probeWhisper(),
    probeUfwDetailed(),
    probeDragonflyInfra(),
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
    const allOk = graphhopper.areas.every((a: AreaServiceHealth) => a.ok);
    if (allOk) return "ok";
    if (graphhopper.areas.some((a: AreaServiceHealth) => a.ok)) return "degraded";
    if (graphhopper.areas.some((a: AreaServiceHealth) => a.enabled && a.startingUp)) return "degraded";
    return "offline";
  };

  const configuredServices = [valhallaDetail, photonDetail, ollama, whisper, dragonflyInfra, nginxInfra, uptimeKumaInfra].filter((s) => s.configured);
  const ghContributes = graphhopper.configured && graphhopper.areas.some((a: AreaServiceHealth) => a.enabled);
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
    photon: svc(photonDetail),
    ollama: svc(ollama),
    whisper: svc(whisper),
    ufw: ufwDetail.configured ? (ufwDetail.ok ? "ok" : "offline") as CachedDotStatus : "unknown",
    dragonfly: svc(dragonflyInfra),
    nginx: svc(nginxInfra),
    uptimeKuma: svc(uptimeKumaInfra),
  };

  updateSystemStatus(snap);
  return snap;
}
