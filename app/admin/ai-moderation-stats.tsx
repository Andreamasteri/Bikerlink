/**
 * Task #2532 — Stats Co-Pilot AI Moderazione: budget, provider health,
 * coda triage, accettazione draft, anomalie recenti.
 */
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, type StyleProp, type TextStyle } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface Stats {
  budget: { month: string; totalCostUsd: number; limitUsd: number; pct: number; state: "ok" | "warn" | "frozen" };
  queue: { pending: number; running: boolean; processed: number; failed: number; oldestEnqueuedMsAgo: number; lastError: { at: string; message: string } | null };
  providers: Array<{ id: string; available: boolean; lastError?: string; lastErrorAt?: string; cooldownRemainingMs?: number; isQuotaError?: boolean }>;
  analyzed24h: number;
  byScope: Array<{ scope: string; n: number; cost: number; accepted: number }>;
  byModel: Array<{ model: string | null; n: number; cost: number }>;
  anomaliesRecent: Array<{ id: string; type: string; category: string | null; observed: number; threshold: number; createdAt: string }>;
  groqTpd?: { used: number; cap: number; pct: number; exceeded: boolean };
}

export default function AiModerationStatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, refetch, isFetching } = useQuery<Stats>({
    queryKey: ["/api/admin/ai/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/stats")).json(),
    refetchInterval: 30_000,
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={Colors.accent} />}
    >
      {isLoading && !data ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Text style={styles.empty}>Nessun dato.</Text>
      ) : (
        <>
          {/* Budget */}
          <View style={[styles.card, { borderColor: data.budget.state === "frozen" ? Colors.error : data.budget.state === "warn" ? Colors.warning : Colors.success }]}>
            <Text style={styles.cardTitle}>Budget mensile ({data.budget.month})</Text>
            <View style={styles.row}>
              <Text style={styles.bigValue}>${data.budget.totalCostUsd.toFixed(2)}</Text>
              <Text style={styles.muted}> / ${data.budget.limitUsd.toFixed(2)}</Text>
            </View>
            <View style={styles.barOuter}>
              <View style={[styles.barFill, {
                width: `${Math.min(100, data.budget.pct * 100)}%`,
                backgroundColor: data.budget.state === "frozen" ? Colors.error : data.budget.state === "warn" ? Colors.warning : Colors.success,
              }]} />
            </View>
            <Text style={styles.cardMeta}>{Math.round(data.budget.pct * 100)}% — {data.budget.state.toUpperCase()}</Text>
            <TouchableOpacity style={styles.linkBtn} onPress={() => router.push("/admin/ai-moderation-settings")}>
              <Text style={styles.linkBtnText}>Modifica limite</Text>
            </TouchableOpacity>
          </View>

          {/* Provider health */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Provider AI</Text>
            {data.providers.map((p) => (
              <View key={p.id} style={styles.providerRow}>
                <View style={[styles.dot, { backgroundColor: p.available ? Colors.success : (p.isQuotaError ? Colors.warning : Colors.error) }]} />
                <Text style={styles.providerName}>{p.id}</Text>
                <View style={styles.providerStatusCol}>
                  <Text style={[styles.providerStatus, !p.available && p.isQuotaError && styles.providerStatusQuota]}>
                    {p.available ? "online" : p.isQuotaError ? "quota lockout" : "error"}
                    {!p.available && p.cooldownRemainingMs != null ? (
                      <CooldownTimer initialMs={p.cooldownRemainingMs} style={[styles.providerStatus, !p.available && p.isQuotaError && styles.providerStatusQuota]} />
                    ) : null}
                  </Text>
                  {!p.available && p.lastError ? <Text style={styles.providerError} numberOfLines={1}>{p.lastError}</Text> : null}
                </View>
              </View>
            ))}
          </View>

          {/* Groq TPD soft-cap */}
          {data.groqTpd != null && (
            <View style={[styles.card, {
              borderColor: data.groqTpd.exceeded
                ? Colors.error
                : data.groqTpd.pct >= 0.8
                  ? Colors.warning
                  : Colors.border,
            }]}>
              <Text style={styles.cardTitle}>Groq TPD — token oggi</Text>
              <View style={styles.row}>
                <Text style={styles.bigValue}>{data.groqTpd.used.toLocaleString("it-IT")}</Text>
                <Text style={styles.muted}> / {data.groqTpd.cap.toLocaleString("it-IT")}</Text>
              </View>
              <View style={styles.barOuter}>
                <View style={[styles.barFill, {
                  width: `${Math.min(100, data.groqTpd.pct * 100)}%`,
                  backgroundColor: data.groqTpd.exceeded
                    ? Colors.error
                    : data.groqTpd.pct >= 0.8
                      ? Colors.warning
                      : Colors.success,
                }]} />
              </View>
              <Text style={styles.cardMeta}>
                {Math.round(data.groqTpd.pct * 100)}%
                {data.groqTpd.exceeded ? " — SOFT-CAP ATTIVO (Gemini/OpenAI in uso)" : data.groqTpd.pct >= 0.8 ? " — soglia vicina" : " — ok"}
              </Text>
            </View>
          )}

          {/* Queue */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Coda triage</Text>
            <View style={styles.kpiRow}>
              <Kpi label="Pending" value={data.queue.pending} />
              <Kpi label="Processati" value={data.queue.processed} />
              <Kpi label="Failed" value={data.queue.failed} color={data.queue.failed > 0 ? Colors.error : Colors.text} />
              <Kpi label="Analizzati 24h" value={data.analyzed24h} />
            </View>
            {data.queue.lastError ? (
              <Text style={styles.errorRow} numberOfLines={2}>Ultimo errore: {data.queue.lastError.message}</Text>
            ) : null}
          </View>

          {/* By scope */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Utilizzo per scope (30g)</Text>
            {data.byScope.length === 0 ? <Text style={styles.muted}>Nessuna call.</Text> : data.byScope.map((s) => (
              <View key={s.scope} style={styles.scopeRow}>
                <Text style={styles.scopeName}>{s.scope}</Text>
                <Text style={styles.scopeStat}>{s.n} call</Text>
                <Text style={styles.scopeStat}>${s.cost.toFixed(3)}</Text>
                {s.scope === "action_draft" ? (
                  <Text style={[styles.scopeStat, { color: Colors.success }]}>
                    {s.accepted}/{s.n} accettati
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          {/* By model */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Per modello (30g)</Text>
            {data.byModel.length === 0 ? <Text style={styles.muted}>Nessuna call.</Text> : data.byModel.map((m) => (
              <View key={m.model ?? "unknown"} style={styles.scopeRow}>
                <Text style={styles.scopeName}>{m.model ?? "—"}</Text>
                <Text style={styles.scopeStat}>{m.n} call</Text>
                <Text style={styles.scopeStat}>${m.cost.toFixed(3)}</Text>
              </View>
            ))}
          </View>

          {/* Anomalies */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Anomalie recenti</Text>
            {data.anomaliesRecent.length === 0 ? (
              <Text style={styles.muted}>Nessuna anomalia negli ultimi 30g.</Text>
            ) : data.anomaliesRecent.slice(0, 10).map((a) => (
              <View key={a.id} style={styles.anomalyRow}>
                <MaterialCommunityIcons name="alert-octagon-outline" size={16} color={Colors.warning} />
                <Text style={styles.anomalyText}>
                  <Text style={styles.anomalyType}>{a.type}</Text>
                  {a.category ? ` (${a.category})` : ""} — osservati {a.observed}, soglia {a.threshold.toFixed(1)}
                </Text>
                <Text style={styles.anomalyDate}>{new Date(a.createdAt).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function CooldownTimer({ initialMs, style }: { initialMs: number; style?: StyleProp<TextStyle> }) {
  const fetchedAt = useRef(Date.now());
  const [remaining, setRemaining] = useState(initialMs);

  useEffect(() => {
    fetchedAt.current = Date.now();
    setRemaining(initialMs);
  }, [initialMs]);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - fetchedAt.current;
      const left = initialMs - elapsed;
      setRemaining(left > 0 ? left : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [initialMs]);

  if (remaining <= 0) return <Text style={style}> — scaduto</Text>;
  return <Text style={style}>{` — ${formatCooldown(remaining)}`}</Text>;
}

function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec}s rimanenti`;
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m rimanenti`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes > 0 ? `${hours}h ${minutes}m rimanenti` : `${hours}h rimanenti`;
}

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 14, marginBottom: 8 },
  cardMeta: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 6 },
  row: { flexDirection: "row", alignItems: "baseline" },
  bigValue: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 26 },
  muted: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12 },
  barOuter: { height: 8, backgroundColor: Colors.surfaceLight, borderRadius: 4, overflow: "hidden", marginTop: 8 },
  barFill: { height: "100%", borderRadius: 4 },
  linkBtn: { marginTop: 8, alignSelf: "flex-start" },
  linkBtnText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  providerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  providerName: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13, minWidth: 80 },
  providerStatusCol: { flex: 1 },
  providerStatus: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular" },
  providerStatusQuota: { color: Colors.warning, fontFamily: "Inter_600SemiBold" },
  providerError: { color: Colors.error, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  kpiRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  kpi: { flex: 1, alignItems: "center", padding: 8, backgroundColor: Colors.surfaceLight, borderRadius: 8 },
  kpiValue: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 18 },
  kpiLabel: { color: Colors.textSecondary, fontSize: 10, marginTop: 2 },
  errorRow: { color: Colors.error, fontSize: 12, marginTop: 8, fontFamily: "Inter_400Regular" },
  scopeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  scopeName: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 12, flex: 1 },
  scopeStat: { color: Colors.textSecondary, fontSize: 11, fontFamily: "Inter_400Regular" },
  anomalyRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  anomalyText: { color: Colors.text, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  anomalyType: { fontFamily: "Inter_600SemiBold" },
  anomalyDate: { color: Colors.textSecondary, fontSize: 10 },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40, fontFamily: "Inter_400Regular" },
});
