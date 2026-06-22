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
 *
 * Logica estratta in hooks/useRoutingAreas.ts; stili in routing-areas.styles.ts.
 */
import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import {
  useRoutingAreas,
  fmtMb,
  fmtTime,
  fmtBuildDate,
  isStaleGraph,
  parseCpu,
  parseMemMb,
} from "@/hooks/useRoutingAreas";
import { styles } from "./_routing-areas.styles";

const MODES: { id: "disabled" | "tester" | "enabled"; label: string; icon: string }[] = [
  { id: "disabled", label: "Disattivo", icon: "power-off" },
  { id: "tester", label: "Tester", icon: "account-wrench" },
  { id: "enabled", label: "Attivo", icon: "power" },
];

export default function RoutingAreasScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const {
    isLoading,
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
  } = useRoutingAreas();

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
                <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                  {opt.label}
                </Text>
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
              const latText =
                a.ok && a.latencyMs != null ? `${a.latencyMs}ms` : a.error?.slice(0, 18) ?? "—";
              const tierDot = a.tier === "core" ? Colors.accent : Colors.warning;
              const hasMoto = a.profiles?.includes("motorcycle") ?? false;
              const buildLabel = a.buildDate ? fmtBuildDate(a.buildDate) : null;
              const profilesLabel = a.profiles ? a.profiles.join(", ") : null;
              const stale = a.ok && isStaleGraph(a.buildDate);
              const borderColor = stale ? Colors.warning : chipColor + "55";
              return (
                <View
                  key={a.code}
                  style={[styles.ghChip, { backgroundColor: bgColor, borderColor }]}
                >
                  <View style={styles.ghChipHeader}>
                    <View style={[styles.ghDot, { backgroundColor: tierDot }]} />
                    <Text style={[styles.ghChipStatus, { color: chipColor }]} numberOfLines={1}>
                      {a.ok ? "●" : "○"}
                    </Text>
                  </View>
                  <Text style={styles.ghChipName} numberOfLines={1}>{a.nome}</Text>
                  <Text style={styles.ghChipPort}>:{a.portaInterna}</Text>
                  <Text
                    style={[styles.ghChipLatency, { color: a.ok ? Colors.textSecondary : Colors.error }]}
                    numberOfLines={1}
                  >
                    {latText}
                  </Text>
                  {a.ok && buildLabel ? (
                    <View style={styles.ghChipBuildRow}>
                      {stale && (
                        <MaterialCommunityIcons
                          name="calendar-alert"
                          size={10}
                          color={Colors.warning}
                        />
                      )}
                      <Text
                        style={[styles.ghChipBuild, stale && styles.ghChipBuildStale]}
                        numberOfLines={1}
                      >
                        {buildLabel}
                      </Text>
                    </View>
                  ) : null}
                  {a.ok && profilesLabel ? (
                    <View style={styles.ghChipProfiles}>
                      {hasMoto && (
                        <MaterialCommunityIcons name="motorbike" size={11} color={Colors.accent} />
                      )}
                      <Text style={[styles.ghChipProfilesText, !hasMoto && { color: Colors.warning }]} numberOfLines={2}>
                        {profilesLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        <Text style={styles.modeHint}>
          Probe diretta su tutte e 7 le istanze (core + on-demand) via reverse proxy. Timeout 2s. Auto-refresh 60s.
        </Text>

        {/* Cronologia cambiamenti di stato */}
        {(() => {
          const stateEvents = directHealth?.events ?? [];
          if (!directHealth) return null;
          return (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionTitle}>Cronologia up/down</Text>
              {stateEvents.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="clock-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.emptyText}>
                    Nessun cambio di stato rilevato dall'ultimo avvio del server. I cambiamenti up↔down appariranno qui.
                  </Text>
                </View>
              ) : (
                <View style={styles.logCard}>
                  {stateEvents.slice(0, 30).map((e, i) => {
                    const wentUp = e.to;
                    const color = wentUp ? Colors.success : Colors.error;
                    const icon = wentUp ? "arrow-up-circle" : "arrow-down-circle";
                    const label = wentUp ? "UP" : "DOWN";
                    return (
                      <View key={`${e.areaCode}-${e.timestamp}-${i}`} style={styles.logRow}>
                        <View style={styles.timelineIconCol}>
                          <MaterialCommunityIcons name={icon as never} size={16} color={color} />
                        </View>
                        <View style={styles.timelineBody}>
                          <View style={styles.timelineTopRow}>
                            <Text style={[styles.timelineBadge, { color, borderColor: color + "55" }]}>
                              {label}
                            </Text>
                            <Text style={styles.timelineArea} numberOfLines={1}>{e.nome}</Text>
                            <Text style={styles.timelineCode}>[{e.areaCode}]</Text>
                          </View>
                          <View style={styles.timelineBottomRow}>
                            <Text style={styles.logTime}>{fmtTime(e.timestamp)}</Text>
                            {e.latencyMs != null && (
                              <Text style={styles.timelineLatency}>{e.latencyMs}ms</Text>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })()}
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
                    totals.frac >= 0.9
                      ? Colors.error
                      : totals.frac >= 0.7
                      ? Colors.warning
                      : Colors.success,
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
                        {
                          backgroundColor:
                            (a.tier === "core" ? Colors.accent : Colors.warning) + "22",
                        },
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
                  <Text style={styles.metricText}>
                    {running && cpu != null ? `${cpu.toFixed(1)}%` : "—"}
                  </Text>
                </View>
                <View style={styles.metricCell}>
                  <MaterialCommunityIcons
                    name="timer-outline"
                    size={13}
                    color={
                      h && !h.ok
                        ? Colors.error
                        : latency != null && latency > 2500
                        ? Colors.warning
                        : Colors.textSecondary
                    }
                  />
                  <Text
                    style={[styles.metricText, h && !h.ok ? { color: Colors.error } : null]}
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
            <MaterialCommunityIcons
              name="text-box-search-outline"
              size={20}
              color={Colors.textSecondary}
            />
            <Text style={styles.emptyText}>
              Nessun evento watchdog nella relay metriche. Il watchdog del ThinkCentre logga su
              journald (journalctl -u areas-watchdog.service).
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
