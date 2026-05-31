/**
 * Task #2824 — Tipi condivisi tra le schermate admin del Sistema Routing.
 * Rispecchiano le risposte di server/routes/admin/routing/index.ts.
 */

export interface RoutingCounters {
  windowMs: number;
  successes: number;
  fallbacks: number;
  failures: number;
  byEngine: Record<string, { success: number; fallback: number; failure: number }>;
  enginesDown: Record<string, number | null>;
}

export interface RoutingStatus {
  killSwitch: {
    enabled: boolean;
    envOverride: "forced-on" | "forced-off" | null;
    softEnabled: boolean | null;
    hasHardOverride: boolean;
  };
  activeEngine: string;
  rollout: string;
  graphhopper: {
    url: string;
    selfHosted: boolean;
    status: string;
    ok: boolean;
    down: boolean;
    latencyMs: number | null;
    lastCheckAt: number | null;
    consecutiveFailures: number;
    error: string | null;
    version?: string;
  };
  cloudFallback: {
    available: boolean;
    active: boolean;
  };
  valhalla: {
    status: string;
    ok: boolean;
    configured: boolean;
    down: boolean;
    version?: string;
  };
  tiles: {
    selfHosted: boolean;
    url: string | null;
  };
  envConfig: {
    graphhopperUrl: boolean;
    graphhopperToken: boolean;
    graphhopperApiKey: boolean;
  };
  metrics: RoutingCounters;
}

export interface RoutingTestResult {
  ok: boolean;
  engine: string;
  configuredEngine?: string;
  latencyMs: number;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  error?: string;
}
