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
    /** Multi-area self-hosted: aree online / totali (null se non self-hosted). */
    areasOnline?: number | null;
    areasTotal?: number | null;
    motorcycleProfileAvailable: boolean | null;
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

export interface ValhallaBenchEngineRun {
  ok: boolean;
  distanceKm: number | null;
  durationMin: number | null;
  latencyMs: number;
  error?: string;
}

export interface ValhallaBenchRow {
  id: string;
  name: string;
  gh: ValhallaBenchEngineRun;
  valhalla: ValhallaBenchEngineRun;
  deltaDistancePct: number | null;
  deltaTimePct: number | null;
  pass: boolean;
}

export interface ValhallaBenchResult {
  ok: boolean;
  /** "hardcoded_reference" = confronto vs distanze baked-in, non vs GH live. */
  groundTruth?: string;
  passDeltaPct: number;
  minPassForActivation: number;
  score: { passed: number; total: number };
  canActivate: boolean;
  results: ValhallaBenchRow[];
}

// ─── Assegnazione funzioni per engine (#3193) ────────────────────────────────

export type RoutingFunctionId = "routing" | "map_matching" | "isochrone" | "matrix";

export interface RoutingFunctionDef {
  id: RoutingFunctionId;
  label: string;
  description: string;
  supportedEngines: string[];
  defaultEngine: string;
}

export interface FunctionEnginesResponse {
  functions: RoutingFunctionDef[];
  config: Record<RoutingFunctionId, string>;
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
