/**
 * Task #2932 — Pannello admin: selezione provider AI resolver percorsi.
 * Task #2946 — Live ping test per provider AI dalla schermata admin.
 *
 * Mostra stato di ciascun provider (Ollama/Groq/Gemini: configurato?) e
 * permette di scegliere l'ordine della chain a runtime, persistendola nel DB.
 * L'env override ROUTE_AI_PROVIDERS ha priorità assoluta (mostrato come banner).
 * Ogni provider card ha un pulsante "Test" che esegue un live ping e mostra
 * latenza e badge di stato (ok / errore).
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollView, View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Platform,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

type RouteProviderId = "ollama" | "groq" | "gemini";

interface ProviderStatus {
  id: RouteProviderId;
  label: string;
  configured: boolean;
  inChain: boolean;
  position: number | null;
  envKey: string | null;
}

interface StatusResp {
  statuses: ProviderStatus[];
  chain: RouteProviderId[];
  envOverride: string | null;
}

interface PingResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
  reply?: string | null;
}

type PingState = "idle" | "loading" | "ok" | "error";

interface ProviderPing {
  state: PingState;
  latency_ms?: number;
  error?: string;
}

interface ProviderStat {
  provider: string;
  count: number;
}

const PROVIDER_ICONS: Record<RouteProviderId, keyof typeof MaterialCommunityIcons.glyphMap> = {
  ollama: "brain",
  groq: "lightning-bolt",
  gemini: "cloud-outline",
};

const PROVIDER_COLORS: Record<RouteProviderId, string> = {
  ollama: "#FF6600",
  groq: "#7C3AED",
  gemini: "#0EA5E9",
};

const PROVIDER_DESC: Record<RouteProviderId, string> = {
  ollama: "Self-hosted sul ThinkCentre. Gratuito e privato. Richiede OLLAMA_URL.",
  groq: "Cloud veloce (LPU hardware Groq). Free tier 1000 req/giorno. Richiede GROQ_API_KEY.",
  gemini: "Fallback cloud finale (Google AI Studio). Free tier 1500 req/giorno. Richiede GEMINI_API_KEY.",
};

const ALL_PROVIDERS: RouteProviderId[] = ["ollama", "groq", "gemini"];

export default function AiRouteProvidersScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch } = useQuery<StatusResp>({
    queryKey: ["/api/admin/ai/route-providers"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/route-providers")).json(),
    staleTime: 15_000,
  });

  const { data: statsData } = useQuery<{ stats: ProviderStat[] }>({
    queryKey: ["/api/admin/ai/route-providers/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/route-providers/stats")).json(),
    staleTime: 30_000,
  });

  const [chain, setChain] = useState<RouteProviderId[]>(["ollama", "groq", "gemini"]);
  const [pings, setPings] = useState<Partial<Record<RouteProviderId, ProviderPing>>>({});

  useEffect(() => {
    if (data?.chain) setChain(data.chain);
  }, [data]);

  const save = useMutation({
    mutationFn: async (newChain: RouteProviderId[]) =>
      (await apiRequest("POST", "/api/admin/ai/route-providers/config", { chain: newChain })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/route-providers"] });
      refetch();
      Alert.alert("Salvato", "Catena provider aggiornata.");
    },
    onError: (err) => Alert.alert("Errore", err instanceof Error ? err.message : "Salvataggio fallito"),
  });

  const pingProvider = useCallback(async (id: RouteProviderId) => {
    setPings((prev) => ({ ...prev, [id]: { state: "loading" } }));
    try {
      const resp = await apiRequest("POST", "/api/admin/ai/route-providers/test", { provider: id });
      const result: PingResult = await resp.json();
      if (result.ok) {
        setPings((prev) => ({ ...prev, [id]: { state: "ok", latency_ms: result.latency_ms } }));
      } else {
        setPings((prev) => ({ ...prev, [id]: { state: "error", latency_ms: result.latency_ms, error: result.error } }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore di rete";
      setPings((prev) => ({ ...prev, [id]: { state: "error", error: msg } }));
    }
  }, []);

  const testAll = useCallback(() => {
    Promise.all(ALL_PROVIDERS.map((id) => pingProvider(id)));
  }, [pingProvider]);

  const isTestingAny = ALL_PROVIDERS.some((id) => pings[id]?.state === "loading");

  function toggleProvider(id: RouteProviderId) {
    if (chain.includes(id)) {
      if (chain.length <= 1) {
        Alert.alert("Attenzione", "La chain deve contenere almeno un provider.");
        return;
      }
      setChain(chain.filter((p) => p !== id));
    } else {
      setChain([...chain, id].sort((a, b) => ALL_PROVIDERS.indexOf(a) - ALL_PROVIDERS.indexOf(b)));
    }
  }

  function moveUp(id: RouteProviderId) {
    const idx = chain.indexOf(id);
    if (idx <= 0) return;
    const next = [...chain];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setChain(next);
  }

  function moveDown(id: RouteProviderId) {
    const idx = chain.indexOf(id);
    if (idx < 0 || idx >= chain.length - 1) return;
    const next = [...chain];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setChain(next);
  }

  const hasChanges = JSON.stringify(chain) !== JSON.stringify(data?.chain ?? []);
  const isEnvOverrideActive = Boolean(data?.envOverride);

  const topPad = Platform.OS === "web" ? 67 : 0;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: topPad }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 14, paddingTop: topPad + 14, paddingBottom: bottomPad + 24 }}
    >
      {isEnvOverrideActive && (
        <View style={styles.envBanner}>
          <MaterialCommunityIcons name="lock-outline" size={16} color={Colors.warning} />
          <Text style={styles.envBannerText}>
            Override attivo via env: <Text style={styles.envBannerCode}>{`ROUTE_AI_PROVIDERS=${data?.envOverride}`}</Text>
            {"\n"}La chain DB è ignorata finché la variabile è impostata.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Chain attiva</Text>
        <Text style={styles.chainPreview}>
          {chain.length > 0 ? chain.join(" → ") : "—"}
        </Text>
        <Text style={styles.hint}>
          I provider vengono tentati nell'ordine mostrato. Se uno fallisce, passa al successivo.
          Provider non configurati (API key assente) vengono saltati automaticamente.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.testAllBtn, isTestingAny && styles.testAllBtnLoading]}
        onPress={testAll}
        disabled={isTestingAny}
        activeOpacity={0.75}
      >
        {isTestingAny ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : (
          <MaterialCommunityIcons name="access-point-network" size={16} color={Colors.accent} />
        )}
        <Text style={styles.testAllBtnText}>
          {isTestingAny ? "Test in corso…" : "Test tutti i provider"}
        </Text>
      </TouchableOpacity>

      {statsData && statsData.stats.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Percorsi salvati per provider</Text>
          {statsData.stats.map((row) => {
            const color = PROVIDER_COLORS[row.provider as RouteProviderId] ?? Colors.textSecondary;
            const icon = PROVIDER_ICONS[row.provider as RouteProviderId] ?? "chart-bar";
            const total = statsData.stats.reduce((s, r) => s + r.count, 0);
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
            return (
              <View key={row.provider} style={styles.statRow}>
                <MaterialCommunityIcons name={icon} size={14} color={color} />
                <Text style={[styles.statLabel, { color }]}>{row.provider}</Text>
                <View style={styles.statBarWrap}>
                  <View style={[styles.statBar, { width: `${pct}%` as unknown as number, backgroundColor: color + "55" }]} />
                </View>
                <Text style={styles.statCount}>{row.count}</Text>
                <Text style={styles.statPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionLabel}>Provider disponibili</Text>

      {ALL_PROVIDERS.map((id) => {
        const status = data?.statuses.find((s) => s.id === id);
        const isInChain = chain.includes(id);
        const position = chain.indexOf(id);
        const color = PROVIDER_COLORS[id];
        const isFirst = position === 0;
        const isLast = position === chain.length - 1;
        const ping = pings[id];
        const isTestLoading = ping?.state === "loading";

        return (
          <View key={id} style={[styles.providerCard, isInChain && { borderColor: color + "55" }]}>
            <View style={styles.providerHeader}>
              <View style={[styles.iconCircle, { backgroundColor: color + "22" }]}>
                <MaterialCommunityIcons name={PROVIDER_ICONS[id]} size={20} color={color} />
              </View>
              <View style={styles.providerInfo}>
                <View style={styles.providerTitleRow}>
                  <Text style={styles.providerLabel}>{status?.label ?? id}</Text>
                  {isInChain && (
                    <View style={[styles.posBadge, { backgroundColor: color }]}>
                      <Text style={styles.posBadgeText}>#{position + 1}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.statusRow}>
                  <MaterialCommunityIcons
                    name={status?.configured ? "check-circle-outline" : "circle-off-outline"}
                    size={13}
                    color={status?.configured ? Colors.success : Colors.textSecondary}
                  />
                  <Text style={[styles.statusText, { color: status?.configured ? Colors.success : Colors.textSecondary }]}>
                    {status?.configured ? "Configurato" : `Non configurato (${status?.envKey ?? "chiave mancante"})`}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.toggleBtn, isInChain ? { backgroundColor: color } : styles.toggleBtnOff]}
                onPress={() => !isEnvOverrideActive && toggleProvider(id)}
                disabled={isEnvOverrideActive}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={isInChain ? "check" : "plus"}
                  size={16}
                  color={isInChain ? "#fff" : Colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.providerDesc}>{PROVIDER_DESC[id]}</Text>

            {/* ── Test / ping row ── */}
            <View style={styles.testRow}>
              <TouchableOpacity
                style={[styles.testBtn, { borderColor: color + "88" }]}
                onPress={() => pingProvider(id)}
                disabled={isTestLoading}
                activeOpacity={0.7}
              >
                {isTestLoading ? (
                  <ActivityIndicator size="small" color={color} />
                ) : (
                  <MaterialCommunityIcons name="access-point-network" size={13} color={color} />
                )}
                <Text style={[styles.testBtnText, { color }]}>
                  {isTestLoading ? "Testing…" : "Test"}
                </Text>
              </TouchableOpacity>

              {ping && ping.state !== "loading" && (
                <View style={[
                  styles.pingBadge,
                  ping.state === "ok" ? styles.pingBadgeOk : styles.pingBadgeErr,
                ]}>
                  <MaterialCommunityIcons
                    name={ping.state === "ok" ? "check-circle" : "alert-circle"}
                    size={12}
                    color={ping.state === "ok" ? Colors.success : Colors.error}
                  />
                  <Text style={[
                    styles.pingBadgeText,
                    { color: ping.state === "ok" ? Colors.success : Colors.error },
                  ]}>
                    {ping.state === "ok"
                      ? `OK · ${ping.latency_ms}ms`
                      : (ping.error ?? "Errore")}
                  </Text>
                </View>
              )}
            </View>

            {isInChain && (
              <View style={styles.reorderRow}>
                <TouchableOpacity
                  style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
                  onPress={() => !isEnvOverrideActive && moveUp(id)}
                  disabled={isFirst || isEnvOverrideActive}
                >
                  <MaterialCommunityIcons name="arrow-up" size={14} color={isFirst ? Colors.textSecondary : Colors.text} />
                  <Text style={[styles.reorderBtnText, isFirst && styles.reorderBtnTextDisabled]}>Su</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
                  onPress={() => !isEnvOverrideActive && moveDown(id)}
                  disabled={isLast || isEnvOverrideActive}
                >
                  <MaterialCommunityIcons name="arrow-down" size={14} color={isLast ? Colors.textSecondary : Colors.text} />
                  <Text style={[styles.reorderBtnText, isLast && styles.reorderBtnTextDisabled]}>Giù</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.saveBtn, (!hasChanges || save.isPending || isEnvOverrideActive) && styles.saveBtnDisabled]}
        onPress={() => save.mutate(chain)}
        disabled={!hasChanges || save.isPending || isEnvOverrideActive}
        activeOpacity={0.8}
      >
        {save.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <MaterialCommunityIcons name="content-save-outline" size={16} color="#fff" />
            <Text style={styles.saveBtnText}>
              {isEnvOverrideActive ? "Override env attivo" : hasChanges ? "Salva chain" : "Nessuna modifica"}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <MaterialCommunityIcons name="information-outline" size={14} color={Colors.textSecondary} />
        <Text style={styles.infoText}>
          Per forzare la chain via env (priorità assoluta, override DB): imposta{" "}
          <Text style={styles.code}>ROUTE_AI_PROVIDERS=ollama,groq,gemini</Text>.
          {"\n"}Usa <Text style={styles.code}>auto</Text> o lascia vuoto per usare la chain DB.
          {"\n"}I provider esclusi dalla chain non vengono mai tentati, anche se configurati.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  envBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.warning + "18",
    borderColor: Colors.warning + "55",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  envBannerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.warning,
    flex: 1,
    lineHeight: 18,
  },
  envBannerCode: { fontFamily: "Inter_600SemiBold" },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chainPreview: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 8,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  providerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  providerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  providerInfo: { flex: 1 },
  providerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  providerLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  posBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  posBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  toggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnOff: {
    backgroundColor: Colors.border,
  },
  providerDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 8,
  },
  testRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.background,
  },
  testBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  pingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 1,
  },
  pingBadgeOk: { backgroundColor: Colors.success + "18" },
  pingBadgeErr: { backgroundColor: Colors.error + "18" },
  pingBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    flexShrink: 1,
  },
  reorderRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  reorderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reorderBtnDisabled: { opacity: 0.4 },
  reorderBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text },
  reorderBtnTextDisabled: { color: Colors.textSecondary },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  code: { fontFamily: "Inter_600SemiBold", color: Colors.text },
  statRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 8,
  },
  statLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    width: 56,
    textTransform: "capitalize" as const,
  },
  statBarWrap: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  statBar: {
    height: 6,
    borderRadius: 3,
  },
  statCount: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.text,
    width: 34,
    textAlign: "right" as const,
  },
  statPct: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    width: 34,
    textAlign: "right" as const,
  },
  testAllBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "88",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginBottom: 14,
    backgroundColor: Colors.accent + "10",
  },
  testAllBtnLoading: {
    opacity: 0.6,
  },
  testAllBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
  },
});
