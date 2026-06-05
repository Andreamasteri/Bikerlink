import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

type SttProviderId = "home" | "groq" | "openai";

interface SttProviderStatus {
  id: SttProviderId;
  label: string;
  configured: boolean;
  inChain: boolean;
  position: number | null;
  envKey: string | null;
}

interface WhisperConfigData {
  statuses: SttProviderStatus[];
  chain: SttProviderId[];
  envOverride: string | null;
}

interface TestResult {
  ok: boolean;
  latency_ms: number;
  text?: string;
  error?: string;
}

const PROVIDER_ICONS: Record<SttProviderId, string> = {
  home: "home",
  groq: "lightning-bolt",
  openai: "robot-outline",
};

const PROVIDER_COLORS: Record<SttProviderId, string> = {
  home: "#22C55E",
  groq: "#F59E0B",
  openai: "#6366F1",
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = new URL(path, getApiUrl()).toString();
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Errore sconosciuto" })) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function WhisperConfigScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<Record<string, TestResult | "loading">>({});

  const { data, isLoading, error } = useQuery<WhisperConfigData>({
    queryKey: ["/api/admin/whisper-config"],
    queryFn: () => apiFetch("/api/admin/whisper-config"),
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: (chain: SttProviderId[]) =>
      apiFetch("/api/admin/whisper-config", {
        method: "PUT",
        body: JSON.stringify({ chain }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/whisper-config"] });
    },
    onError: (e: Error) => {
      Alert.alert("Errore", e.message);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/whisper-config/reset", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/whisper-config"] });
    },
    onError: (e: Error) => {
      Alert.alert("Errore reset", e.message);
    },
  });

  const activeChain: SttProviderId[] = data?.chain ?? [];

  function moveUp(idx: number) {
    if (idx === 0 || data?.envOverride) return;
    const newChain = [...activeChain];
    [newChain[idx - 1], newChain[idx]] = [newChain[idx], newChain[idx - 1]];
    saveMutation.mutate(newChain);
  }

  function moveDown(idx: number) {
    if (idx === activeChain.length - 1 || data?.envOverride) return;
    const newChain = [...activeChain];
    [newChain[idx], newChain[idx + 1]] = [newChain[idx + 1], newChain[idx]];
    saveMutation.mutate(newChain);
  }

  function toggleProvider(id: SttProviderId) {
    if (data?.envOverride) return;
    if (activeChain.includes(id)) {
      if (activeChain.length <= 1) {
        Alert.alert("Attenzione", "La chain deve avere almeno un provider.");
        return;
      }
      saveMutation.mutate(activeChain.filter((p) => p !== id));
    } else {
      const allOrder: SttProviderId[] = ["home", "groq", "openai"];
      const newChain = allOrder.filter((p) => p === id || activeChain.includes(p));
      saveMutation.mutate(newChain);
    }
  }

  async function testProvider(id: SttProviderId) {
    setTestResults((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const url = new URL(`/api/admin/whisper-config/test/${id}`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await res.json() as TestResult;
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, latency_ms: 0, error: e instanceof Error ? e.message : "Errore" },
      }));
    }
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{(error as Error).message}</Text>
      </View>
    );
  }

  const allStatuses = data?.statuses ?? [];
  const envOverride = data?.envOverride ?? null;
  const activeCount = activeChain.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      {envOverride && (
        <View style={styles.envBanner}>
          <MaterialCommunityIcons name="lock-outline" size={16} color="#F59E0B" />
          <Text style={styles.envBannerText}>
            Env override attivo: <Text style={styles.envBannerValue}>STT_PROVIDERS={envOverride}</Text>
          </Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="microphone" size={18} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Chain attiva ({activeCount} provider)</Text>
      </View>

      {allStatuses.map((status) => {
        const posInChain = activeChain.indexOf(status.id);
        const isInChain = posInChain !== -1;
        const iconName = PROVIDER_ICONS[status.id] as React.ComponentProps<typeof MaterialCommunityIcons>["name"];
        const iconColor = isInChain ? PROVIDER_COLORS[status.id] : Colors.textSecondary;
        const testResult = testResults[status.id];

        return (
          <View key={status.id} style={[styles.card, !isInChain && styles.cardInactive]}>
            <View style={styles.cardRow}>
              <View style={[styles.iconBadge, { backgroundColor: isInChain ? `${PROVIDER_COLORS[status.id]}22` : Colors.background }]}>
                <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
              </View>

              <View style={styles.cardInfo}>
                <View style={styles.cardTitleRow}>
                  {isInChain && (
                    <View style={styles.positionBadge}>
                      <Text style={styles.positionText}>{posInChain + 1}</Text>
                    </View>
                  )}
                  <Text style={[styles.cardLabel, !isInChain && styles.cardLabelInactive]}>
                    {status.label}
                  </Text>
                </View>

                <View style={styles.statusRow}>
                  {status.configured ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeTextOk}>✅ Configurato</Text>
                    </View>
                  ) : (
                    <View style={[styles.badge, styles.badgeWarn]}>
                      <Text style={styles.badgeTextWarn}>⚠️ {status.envKey} mancante</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.toggleBtn, isInChain && styles.toggleBtnActive]}
                  onPress={() => toggleProvider(status.id)}
                  disabled={!!envOverride || saveMutation.isPending}
                >
                  <MaterialCommunityIcons
                    name={isInChain ? "check-circle" : "circle-outline"}
                    size={20}
                    color={isInChain ? Colors.accent : Colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.cardFooter, !isInChain && styles.cardFooterSimple]}>
              {isInChain && (
                <View style={styles.orderBtns}>
                  <TouchableOpacity
                    style={[styles.orderBtn, posInChain === 0 && styles.orderBtnDisabled]}
                    onPress={() => moveUp(posInChain)}
                    disabled={posInChain === 0 || !!envOverride || saveMutation.isPending}
                  >
                    <Ionicons name="chevron-up" size={16} color={posInChain === 0 ? Colors.textSecondary : Colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.orderBtn, posInChain === activeChain.length - 1 && styles.orderBtnDisabled]}
                    onPress={() => moveDown(posInChain)}
                    disabled={posInChain === activeChain.length - 1 || !!envOverride || saveMutation.isPending}
                  >
                    <Ionicons name="chevron-down" size={16} color={posInChain === activeChain.length - 1 ? Colors.textSecondary : Colors.text} />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={styles.testBtn}
                onPress={() => testProvider(status.id)}
                disabled={testResult === "loading"}
              >
                {testResult === "loading" ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="play-circle-outline" size={14} color={Colors.accent} />
                    <Text style={styles.testBtnText}>Test</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {testResult && testResult !== "loading" && (
              <View style={[styles.testResult, testResult.ok ? styles.testResultOk : styles.testResultFail]}>
                <Text style={styles.testResultText}>
                  {testResult.ok
                    ? `✅ OK — ${testResult.latency_ms}ms${testResult.text ? ` — "${testResult.text}"` : ""}`
                    : `❌ ${testResult.error ?? "Errore"} (${testResult.latency_ms}ms)`}
                </Text>
              </View>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.resetBtn, resetMutation.isPending && styles.resetBtnDisabled]}
        onPress={() => {
          Alert.alert(
            "Ripristina default",
            "Riporta la chain a home → groq → openai?",
            [
              { text: "Annulla", style: "cancel" },
              { text: "Ripristina", style: "destructive", onPress: () => resetMutation.mutate() },
            ]
          );
        }}
        disabled={resetMutation.isPending || !!envOverride}
      >
        {resetMutation.isPending ? (
          <ActivityIndicator size="small" color={Colors.textSecondary} />
        ) : (
          <>
            <MaterialCommunityIcons name="restore" size={16} color={Colors.textSecondary} />
            <Text style={styles.resetBtnText}>Ripristina default</Text>
          </>
        )}
      </TouchableOpacity>

      {saveMutation.isPending && (
        <View style={styles.savingBanner}>
          <ActivityIndicator size="small" color={Colors.accent} />
          <Text style={styles.savingText}>Salvataggio…</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  envBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F59E0B22",
    borderWidth: 1,
    borderColor: "#F59E0B44",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  envBannerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#F59E0B",
    flex: 1,
  },
  envBannerValue: {
    fontFamily: "Inter_700Bold",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardInactive: {
    opacity: 0.6,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  positionBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  positionText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#000",
  },
  cardLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  cardLabelInactive: {
    color: Colors.textSecondary,
  },
  statusRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#22C55E22",
  },
  badgeWarn: {
    backgroundColor: "#F59E0B22",
  },
  badgeTextOk: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#22C55E",
  },
  badgeTextWarn: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#F59E0B",
  },
  cardActions: {
    alignItems: "center",
  },
  toggleBtn: {
    padding: 4,
  },
  toggleBtnActive: {},
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cardFooterSimple: {
    justifyContent: "flex-end",
  },
  orderBtns: {
    flexDirection: "row",
    gap: 4,
  },
  orderBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  orderBtnDisabled: {
    opacity: 0.4,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: `${Colors.accent}22`,
    borderWidth: 1,
    borderColor: `${Colors.accent}44`,
    minWidth: 60,
    justifyContent: "center",
  },
  testBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
  testResult: {
    marginTop: 10,
    borderRadius: 8,
    padding: 10,
  },
  testResultOk: {
    backgroundColor: "#22C55E22",
  },
  testResultFail: {
    backgroundColor: "#ef444422",
  },
  testResultText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  resetBtnDisabled: {
    opacity: 0.5,
  },
  resetBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  savingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  savingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
