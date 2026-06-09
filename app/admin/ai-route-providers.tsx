// LARGE-FILE-LOCKED — limite: 342
// Aggiungi nuove funzionalità in: app/admin/ai-route-providers.next.tsx
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

import {
  RouteProviderId, ProviderStatus, StatusResp, PingResult, PingState,
  ProviderPing, ProviderStat, PROVIDER_ICONS, PROVIDER_COLORS, PROVIDER_DESC,
  ALL_PROVIDERS,
} from './ai-route-providers.constants';
import { styles } from './ai-route-providers.styles';

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
          <Text style={styles.cardTitle}>Parse AI — ultimi 7 giorni</Text>
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

