import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { styles } from "./whisper-config.styles";

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

interface FormatProbeResult {
  ok: boolean;
  latency_ms: number | null;
  error?: string;
  text?: string;
}

interface TestResult {
  ok: boolean;
  latency_ms: number | null;
  text?: string;
  error?: string;
  wav?: FormatProbeResult;
  m4a?: FormatProbeResult;
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
    headers: { "Content-Type": "application/json", ...authFetchHeaders() },
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
  const autoTestedRef = useRef(false);

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

  useEffect(() => {
    if (!data || autoTestedRef.current) return;
    const homeStatus = data.statuses.find((s) => s.id === "home");
    if (homeStatus?.configured) {
      autoTestedRef.current = true;
      testProvider("home");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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
        headers: { "Content-Type": "application/json", ...authFetchHeaders() },
      });

      const bodyText = await res.text().catch(() => "");
      let raw: Record<string, unknown> = {};
      try { raw = JSON.parse(bodyText) as Record<string, unknown>; } catch { /* non-JSON */ }

      if (!res.ok) {
        const jsonMsg = raw.message ?? raw.error;
        const errMsg = jsonMsg != null
          ? String(jsonMsg)
          : `HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 120)}` : ""}`;
        setTestResults((prev) => ({
          ...prev,
          [id]: { ok: false, latency_ms: null, error: errMsg },
        }));
        return;
      }

      const parseFormatProbe = (r: unknown): FormatProbeResult | undefined => {
        if (!r || typeof r !== "object") return undefined;
        const fr = r as Record<string, unknown>;
        return {
          ok: Boolean(fr.ok),
          latency_ms: typeof fr.latency_ms === "number" ? fr.latency_ms : null,
          error: fr.error != null ? String(fr.error) : undefined,
          text: fr.text != null ? String(fr.text) : undefined,
        };
      };

      const result: TestResult = {
        ok: Boolean(raw.ok),
        latency_ms: typeof raw.latency_ms === "number" ? raw.latency_ms : null,
        error: raw.error != null ? String(raw.error) : raw.message != null ? String(raw.message) : undefined,
        text: raw.text != null ? String(raw.text) : undefined,
        wav: parseFormatProbe(raw.wav),
        m4a: parseFormatProbe(raw.m4a),
      };
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, latency_ms: null, error: e instanceof Error ? e.message : "Errore di rete" },
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
                {status.id === "home" && testResult.wav != null ? (
                  <>
                    <Text style={styles.testResultText}>
                      {testResult.wav.ok
                        ? `✅ WAV — ${testResult.wav.latency_ms != null ? `${testResult.wav.latency_ms}ms` : "—"}${testResult.wav.text ? ` — "${testResult.wav.text}"` : ""}`
                        : `❌ WAV — ${testResult.wav.error ?? "Errore"} (${testResult.wav.latency_ms != null ? `${testResult.wav.latency_ms}ms` : "—"})`}
                    </Text>
                    {testResult.m4a != null && (
                      <Text style={[styles.testResultText, styles.testResultSubline]}>
                        {testResult.m4a.ok
                          ? `✅ M4A — ${testResult.m4a.latency_ms != null ? `${testResult.m4a.latency_ms}ms` : "—"}`
                          : `❌ M4A — ${testResult.m4a.error ?? "Errore"} (${testResult.m4a.latency_ms != null ? `${testResult.m4a.latency_ms}ms` : "—"})`}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.testResultText}>
                    {testResult.ok
                      ? `✅ OK — ${testResult.latency_ms != null ? `${testResult.latency_ms}ms` : "—"}${testResult.text ? ` — "${testResult.text}"` : ""}`
                      : `❌ ${testResult.error ?? "Errore sconosciuto"} (${testResult.latency_ms != null ? `${testResult.latency_ms}ms` : "—"})`}
                  </Text>
                )}
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
