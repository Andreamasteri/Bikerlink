/**
 * system-status-cache — shared in-memory store for dot-status of all
 * System Health services. Written by the heavy probe endpoints
 * (thinkcentre-health, routing/status, matching/monitor) and read by
 * the lightweight GET /api/admin/system-probe poller.
 */

export type DotStatus = "ok" | "degraded" | "offline" | "unknown";

export interface SystemStatusSnapshot {
  thinkcentre: DotStatus;
  graphhopper: DotStatus;
  valhalla: DotStatus;
  nominatim: DotStatus;
  ollama: DotStatus;
  whisper: DotStatus;
  ufw: DotStatus;
  dragonfly: DotStatus;
  postgres: DotStatus;
  pgadmin: DotStatus;
  nginx: DotStatus;
  uptimeKuma: DotStatus;
  routing: DotStatus;
  matching: DotStatus;
  updatedAt: number;
}

const _defaults: SystemStatusSnapshot = {
  thinkcentre: "unknown",
  graphhopper: "unknown",
  valhalla: "unknown",
  nominatim: "unknown",
  ollama: "unknown",
  whisper: "unknown",
  ufw: "unknown",
  dragonfly: "unknown",
  postgres: "unknown",
  pgadmin: "unknown",
  nginx: "unknown",
  uptimeKuma: "unknown",
  routing: "unknown",
  matching: "unknown",
  updatedAt: 0,
};

let _cache: SystemStatusSnapshot = { ..._defaults };

export function updateSystemStatus(
  patch: Partial<Omit<SystemStatusSnapshot, "updatedAt">>,
): void {
  _cache = { ..._cache, ...patch, updatedAt: Date.now() };
}

export function getSystemStatus(): SystemStatusSnapshot {
  return _cache;
}
