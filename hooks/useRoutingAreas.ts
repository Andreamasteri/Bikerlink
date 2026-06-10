import { useMemo } from "react";
import { Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export type RoutingAreaMode = "disabled" | "tester" | "enabled";

export interface AreaCountry {
  iso: string;
  nome: string;
}

export interface AreaRow {
  codice: string;
  nome: string;
  tier: "core" | "on-demand";
  nazioni: AreaCountry[];
  abilitatoDefault: boolean;
  enabled: boolean;
  pbfApproxGb: number;
  serveHeapMb: number;
}

export interface AreasResponse {
  mode: RoutingAreaMode;
  selfHosted: boolean;
  areas: AreaRow[];
}

export interface AreaMetric {
  code: string;
  container: string;
  running: boolean;
  health: "healthy" | "unhealthy" | "starting" | null;
  cpu_perc?: string;
  mem_usage?: string;
  mem_limit?: string;
  mem_perc?: string;
}

export interface AreaHealthProbe {
  code: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

export interface WatchdogEvent {
  ts?: string;
  timestamp?: string;
  code?: string;
  action?: string;
  reason?: string;
  message?: string;
}

export interface MetricsResponse {
  available: boolean;
  reason?: string;
  timestamp?: string;
  areas?: AreaMetric[];
  health?: AreaHealthProbe[];
  events?: WatchdogEvent[];
  watchdog?: WatchdogEvent[];
}

export interface DirectAreaHealth {
  code: string;
  nome: string;
  tier: "core" | "on-demand";
  portaInterna: number;
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
  probedAt: string;
}

export interface DirectHealthResponse {
  available: boolean;
  reason?: string;
  healthyCount?: number;
  totalCount?: number;
  areas: DirectAreaHealth[];
}

export function parseMemMb(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/([\d.]+)\s*([KMG]?i?B)/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!Number.isFinite(val)) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith("g")) return val * 1024;
  if (unit.startsWith("m")) return val;
  if (unit.startsWith("k")) return val / 1024;
  return val / (1024 * 1024);
}

export function parseCpu(s?: string): number | null {
  if (!s) return null;
  const v = parseFloat(s.replace("%", ""));
  return Number.isFinite(v) ? v : null;
}

export function fmtMb(mb: number | null): string {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export function fmtTime(raw?: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleTimeString("it-IT");
}

export function useRoutingAreas() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AreasResponse>({
    queryKey: ["/api/admin/routing-areas"],
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const { data: metrics } = useQuery<MetricsResponse>({
    queryKey: ["/api/admin/routing-areas/metrics"],
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const {
    data: directHealth,
    isFetching: directHealthFetching,
    refetch: refetchDirectHealth,
  } = useQuery<DirectHealthResponse>({
    queryKey: ["/api/admin/routing/areas/health"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const modeMutation = useMutation({
    mutationFn: async (mode: RoutingAreaMode) => {
      const res = await apiRequest("PATCH", "/api/admin/routing-areas/mode", { mode });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing-areas"] });
    },
    onError: (err: unknown) => {
      Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile aggiornare il master toggle.");
    },
  });

  const enabledMutation = useMutation({
    mutationFn: async (vars: { code: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/routing-areas/${vars.code}/enabled`, {
        enabled: vars.enabled,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing-areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing-areas/metrics"] });
    },
    onError: (err: unknown) => {
      Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile aggiornare l'area.");
    },
  });

  const mode = data?.mode ?? "disabled";
  const areas = data?.areas ?? [];

  const metricByCode = useMemo(() => {
    const map = new Map<string, AreaMetric>();
    for (const m of metrics?.areas ?? []) map.set(m.code, m);
    return map;
  }, [metrics]);

  const healthByCode = useMemo(() => {
    const map = new Map<string, AreaHealthProbe>();
    for (const h of metrics?.health ?? []) map.set(h.code, h);
    return map;
  }, [metrics]);

  const totals = useMemo(() => {
    let usedMb = 0;
    let cpu = 0;
    let runningCount = 0;
    for (const m of metrics?.areas ?? []) {
      if (!m.running) continue;
      runningCount += 1;
      const mem = parseMemMb(m.mem_usage);
      if (mem != null) usedMb += mem;
      const c = parseCpu(m.cpu_perc);
      if (c != null) cpu += c;
    }
    const budgetMb = areas.reduce((s, a) => s + (a.serveHeapMb ?? 0), 0);
    const frac = budgetMb > 0 ? Math.min(usedMb / budgetMb, 1) : 0;
    return { usedMb, cpu, runningCount, budgetMb, frac };
  }, [metrics, areas]);

  const events = metrics?.events ?? metrics?.watchdog ?? [];
  const selfHosted = data?.selfHosted ?? false;

  return {
    data,
    isLoading,
    metrics,
    directHealth,
    directHealthFetching,
    refetchDirectHealth,
    modeMutation,
    enabledMutation,
    mode,
    areas,
    metricByCode,
    healthByCode,
    totals,
    events,
    selfHosted,
  };
}
