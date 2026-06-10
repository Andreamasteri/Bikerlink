/**
 * Task #3123 — Aree di routing (Admin).
 *
 * Pannello dedicato al sistema di routing "ad aree regionali" (un'istanza
 * GraphHopper per gruppo-nazioni, vedi shared/routing-areas.ts). Mostra:
 *   - master toggle (disabled / tester / enabled) — PATCH /mode;
 *   - monitor RAM/CPU complessivo dei container area attivi;
 *   - tabella aree (toggle, nome, nazioni, tier, stato container, RAM, CPU, latenza);
 *   - log watchdog (avvio/stop container) se incluso nella relay metriche.
 *
 * Dati:
 *   GET   /api/admin/routing-areas         → master toggle + elenco gruppi
 *   GET   /api/admin/routing-areas/metrics → metriche per-container (relay) + health
 *   PATCH /api/admin/routing-areas/mode    → imposta il master toggle
 *   PATCH /api/admin/routing-areas/:code/enabled → abilita/disabilita un gruppo
 */
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

// ─── Tipi ────────────────────────────────────────────────────────────────────

type RoutingAreaMode = "disabled" | "tester" | "enabled";

interface AreaCountry {
  iso: string;
  nome: string;
}

interface AreaRow {
  codice: string;
  nome: string;
  tier: "core" | "on-demand";
  nazioni: AreaCountry[];
  abilitatoDefault: boolean;
  enabled: boolean;
  pbfApproxGb: number;
  serveHeapMb: number;
}

interface AreasResponse {
  mode: RoutingAreaMode;
  selfHosted: boolean;
  areas: AreaRow[];
}

interface AreaMetric {
  code: string;
  container: string;
  running: boolean;
  health: "healthy" | "unhealthy" | "starting" | null;
  cpu_perc?: string;
  mem_usage?: string;
  mem_limit?: string;
  mem_perc?: string;
}

interface AreaHealthProbe {
  code: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

/** Evento watchdog opzionale: presente solo se la relay lo espone. */
interface WatchdogEvent {
  ts?: string;
  timestamp?: string;
  code?: string;
  action?: string;
  reason?: string;
  message?: string;
}

interface MetricsResponse {
  available: boolean;
  reason?: string;
  timestamp?: string;
  areas?: AreaMetric[];
  health?: AreaHealthProbe[];
  events?: WatchdogEvent[];
  watchdog?: WatchdogEvent[];
}

/** Risposta di GET /api/admin/routing/areas/health (probe diretta 2s). */
interface DirectAreaHealth {
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

interface DirectHealthResponse {
  available: boolean;
  reason?: string;
  healthyCount?: number;
  totalCount?: number;
  areas: DirectAreaHealth[];
}

const MODES: { id: RoutingAreaMode; label: string; icon: string }[] = [
  { id: "disabled", label: "Disattivo", icon: "power-off" },
  { id: "tester", label: "Tester", icon: "account-wrench" },
  { id: "enabled", label: "Attivo", icon: "power" },
];

// ─── Helper di parsing ───────────────────────────────────────────────────────

/** "1.1GiB" / "512MiB" / "0B" → MB (o null se non interpretabile). */
function parseMemMb(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/([\d.]+)\s*([KMG]?i?B)/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!Number.isFinite(val)) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith("g")) return val * 1024;
  if (unit.startsWith("m")) return val;
  if (unit.startsWith("k")) return val / 1024;
  return val / (1024 * 1024); // byte
}

/** "3.2%" → 3.2 (o null). */
function parseCpu(s?: string): number | null {
  if (!s) return null;
  const v = parseFloat(s.replace("%", ""));
  return Number.isFinite(v) ? v : null;
}

/** MB → stringa leggibile ("1.4 GB" / "640 MB"). */
function fmtMb(mb: number | null): string {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** Timestamp ISO → "HH:MM:SS" locale (o stringa grezza se non parsabile). */
function fmtTime(raw?: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleTimeString("it-IT");
}

// ─── Schermata ───────────────────────────────────────────────────────────────

export default function RoutingAreasScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";

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

  // Indicizza metriche e health per codice per il merge nella tabella.
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

  // Monitor complessivo: RAM usata dai container attivi vs budget heap configurato.
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : 0,
        paddingBottom: (isWeb ? 34 : insets.bottom) + 24,
      }}
    >
      {/* Master toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Master Toggle</Text>
        <View style={styles.modeRow}>
          {MODES.map((opt) => {
            const active = mode === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.modeChip, active && styles.modeChipActive]}
                onPress={() => !active && modeMutation.mutate(opt.id)}
                activeOpacity={0.8}
                disabled={modeMutation.isPending}
              >
                <MaterialCommunityIcons
                  name={opt.icon as never}
                  size={18}
                  color={active ? "#fff" : Colors.textSecondary}
                />
                <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.modeHint}>
          {mode === "disabled"
            ? "Routing ad aree spento: si usa l'istanza GraphHopper globale (comportamento storico)."
            : mode === "tester"
            ? "Attivo solo per gli utenti map-tester (rollout graduale)."
            : "Attivo per tutti gli utenti."}
        </Text>
        {!selfHosted && (
          <View style={styles.warnCard}>
            <MaterialCommunityIcons name="information-outline" size={16} color={Colors.warning} />
            <Text style={styles.warnText}>
              GraphHopper non è self-hosted in questo ambiente: metriche e container non sono disponibili.
            </Text>
          </View>
        )}
      </View>

      {/* Health diretta istanze GH (probe 2s per porta) */}
      <View style={styles.section}>
        <View style={styles.tableHeaderRow}>
          <Text style={styles.sectionTitle}>
            Health Istanze GH
            {directHealth && directHealth.available
              ? `  ${directHealth.healthyCount ?? 0}/${directHealth.totalCount ?? 0} up`
              : ""}
          </Text>
          <TouchableOpacity
            onPress={() => refetchDirectHealth()}
            disabled={directHealthFetching}
            style={styles.refreshBtn}
            activeOpacity={0.7}
          >
            {directHealthFetching ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <MaterialCommunityIcons name="refresh" size={18} color={Colors.accent} />
            )}
          </TouchableOpacity>
        </View>

        {!directHealth ? (
          <View style={styles.monitorCard}>
            <ActivityIndicator size="small" color={Colors.accent} />
          </View>
        ) : !directHealth.available ? (
          <View style={styles.warnCard}>
            <MaterialCommunityIcons name="information-outline" size={16} color={Colors.warning} />
            <Text style={styles.warnText}>
              ThinkCentre non raggiungibile — probe non disponibili.
            </Text>
          </View>
        ) : (
          <View style={styles.chipGrid}>
            {directHealth.areas.map((a) => {
              const chipColor = a.ok ? Colors.success : Colors.error;
              const bgColor = a.ok ? Colors.success + "18" : Colors.error + "18";
              const latText = a.ok && a.latencyMs != null ? `${a.latencyMs}ms` : a.error?.slice(0, 18) ?? "—";
              const tierDot = a.tier === "core" ? Colors.accent : Colors.warning;
              return (
                <View key={a.code} style={[styles.ghChip, { backgroundColor: bgColor, borderColor: chipColor + "55" }]}>
                  <View style={styles.ghChipHeader}>
                    <View style={[styles.ghDot, { backgroundColor: tierDot }]} />
                    <Text style={[styles.ghChipStatus, { color: chipColor }]} numberOfLines={1}>
                      {a.ok ? "●" : "○"}
                    </Text>
                  </View>
                  <Text style={styles.ghChipName} numberOfLines={1}>{a.nome}</Text>
                  <Text style={styles.ghChipPort}>:{a.portaInterna}</Text>
                  <Text style={[styles.ghChipLatency, { color: a.ok ? Colors.textSecondary : Colors.error }]} numberOfLines={1}>
                    {latText}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        <Text style={styles.modeHint}>
          Probe diretta su tutte e 7 le istanze (core + on-demand) via reverse proxy. Timeout 2s. Auto-refresh 60s.
        </Text>
      </View>

      {/* Monitor risorse complessivo */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Risorse (container attivi)</Text>
        <View style={styles.monitorCard}>
          <View style={styles.monitorTopRow}>
            <View style={styles.monitorStat}>
              <Text style={styles.monitorValue}>{fmtMb(totals.usedMb)}</Text>
              <Text style={styles.monitorLabel}>RAM usata</Text>
            </View>
            <View style={styles.monitorStat}>
              <Text style={styles.monitorValue}>{totals.cpu.toFixed(0)}%</Text>
              <Text style={styles.monitorLabel}>CPU totale</Text>
            </View>
            <View style={styles.monitorStat}>
              <Text style={styles.monitorValue}>
                {totals.runningCount}/{areas.length || "—"}
              </Text>
              <Text style={styles.monitorLabel}>Attivi</Text>
            </View>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.round(totals.frac * 100)}%`,
                  backgroundColor:
                    totals.frac >= 0.9 ? Colors.error : totals.frac >= 0.7 ? Colors.warning : Colors.success,
                },
              ]}
            />
          </View>
          <Text style={styles.barCaption}>
            {fmtMb(totals.usedMb)} / {fmtMb(totals.budgetMb)} budget heap configurato
          </Text>
        </View>
      </View>

      {/* Tabella aree */}
      <View style={styles.section}>
        <View style={styles.tableHeaderRow}>
          <Text style={styles.sectionTitle}>Aree ({areas.length})</Text>
          {isLoading && <ActivityIndicator size="small" color={Colors.accent} />}
        </View>

        {areas.map((a) => {
          const m = metricByCode.get(a.codice);
          const h = healthByCode.get(a.codice);
          const running = m?.running ?? false;
          const health = m?.health ?? null;
          // Dot: running+healthy → verde; starting → ambra; spento/unhealthy → grigio/rosso.
          const dotColor = !running
            ? Colors.textSecondary
            : health === "starting"
            ? Colors.warning
            : health === "unhealthy"
            ? Colors.error
            : Colors.success;
          const statusText = !running
            ? "spento"
            : health === "starting"
            ? "avvio…"
            : health === "unhealthy"
            ? "unhealthy"
            : "attivo";
          const cpu = parseCpu(m?.cpu_perc);
          const mem = parseMemMb(m?.mem_usage);
          const latency = h?.latencyMs ?? null;
          const togglePending =
            enabledMutation.isPending && enabledMutation.variables?.code === a.codice;

          return (
            <View key={a.codice} style={styles.areaCard}>
              <View style={styles.areaTopRow}>
                <Switch
                  value={a.enabled}
                  onValueChange={(val) => enabledMutation.mutate({ code: a.codice, enabled: val })}
                  trackColor={{ false: Colors.border, true: Colors.success + "88" }}
                  thumbColor={a.enabled ? Colors.success : Colors.textSecondary}
                  disabled={togglePending}
                />
                <View style={styles.areaInfo}>
                  <View style={styles.areaNameRow}>
                    <Text style={styles.areaName}>{a.nome}</Text>
                    <View
                      style={[
                        styles.tierBadge,
                        { backgroundColor: (a.tier === "core" ? Colors.accent : Colors.warning) + "22" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tierBadgeText,
                          { color: a.tier === "core" ? Colors.accent : Colors.warning },
                        ]}
                      >
                        {a.tier === "core" ? "core" : "on-demand"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.areaCountries} numberOfLines={1}>
                    {a.nazioni.map((n) => n.iso).join(" · ")}
                  </Text>
                </View>
                <View style={styles.areaStatusCol}>
                  <View style={styles.statusDotRow}>
                    <View style={[styles.dot, { backgroundColor: dotColor }]} />
                    <Text style={[styles.statusText, { color: dotColor }]}>{statusText}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.areaMetricsRow}>
                <View style={styles.metricCell}>
                  <MaterialCommunityIcons name="memory" size={13} color={Colors.textSecondary} />
                  <Text style={styles.metricText}>{running ? fmtMb(mem) : "—"}</Text>
                </View>
                <View style={styles.metricCell}>
                  <MaterialCommunityIcons name="chip" size={13} color={Colors.textSecondary} />
                  <Text style={styles.metricText}>{running && cpu != null ? `${cpu.toFixed(1)}%` : "—"}</Text>
                </View>
                <View style={styles.metricCell}>
                  <MaterialCommunityIcons
                    name="timer-outline"
                    size={13}
                    color={
                      h && !h.ok ? Colors.error : latency != null && latency > 2500 ? Colors.warning : Colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.metricText,
                      h && !h.ok ? { color: Colors.error } : null,
                    ]}
                  >
                    {h ? (h.ok ? `${latency ?? "—"} ms` : "down") : "—"}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {!isLoading && areas.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Nessuna area configurata.</Text>
          </View>
        )}
      </View>

      {/* Log watchdog */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Log Watchdog</Text>
        {events.length > 0 ? (
          <View style={styles.logCard}>
            {events.slice(0, 30).map((e, i) => (
              <View key={`${e.ts ?? e.timestamp ?? i}-${i}`} style={styles.logRow}>
                <Text style={styles.logTime}>{fmtTime(e.ts ?? e.timestamp)}</Text>
                <View style={styles.logBody}>
                  <Text style={styles.logMain}>
                    {e.code ? `[${e.code}] ` : ""}
                    {e.action ?? e.message ?? "evento"}
                  </Text>
                  {e.reason ? <Text style={styles.logReason}>{e.reason}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="text-box-search-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>
              Nessun evento watchdog nella relay metriche. Il watchdog del ThinkCentre logga su journald
              (journalctl -u areas-watchdog.service).
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { marginHorizontal: 12, marginTop: 16 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // Master toggle
  modeRow: { flexDirection: "row", gap: 8 },
  modeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  modeChipText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  modeChipTextActive: { color: "#fff" },
  modeHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 8,
    lineHeight: 16,
  },
  warnCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    padding: 10,
    backgroundColor: Colors.warning + "18",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.warning + "44",
  },
  warnText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text, flex: 1, lineHeight: 16 },

  // Monitor
  monitorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  monitorTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  monitorStat: { alignItems: "center", flex: 1 },
  monitorValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  monitorLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  barFill: { height: 8, borderRadius: 4 },
  barCaption: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: "right",
  },

  // Tabella aree
  tableHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  areaCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  areaTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  areaInfo: { flex: 1 },
  areaNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  areaName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  tierBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tierBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 },
  areaCountries: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  areaStatusCol: { alignItems: "flex-end" },
  statusDotRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  areaMetricsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  metricCell: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  metricText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text },

  // Log watchdog
  logCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  logRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  logTime: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary, width: 64 },
  logBody: { flex: 1 },
  logMain: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text },
  logReason: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 17 },

  // Direct health chip grid
  refreshBtn: { padding: 4 },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ghChip: {
    width: "30%",
    flexGrow: 1,
    minWidth: 90,
    maxWidth: 120,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  ghChipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  ghDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ghChipStatus: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  ghChipName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.text,
    textAlign: "center",
  },
  ghChipPort: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ghChipLatency: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    marginTop: 3,
    textAlign: "center",
  },
});
