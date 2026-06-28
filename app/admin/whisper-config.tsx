// @no-split
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
import * as Clipboard from "expo-clipboard";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { styles } from "@/components/admin/whisper-config.styles";
import { WhisperWatchdogBadge, type WhisperHealthData } from "@/components/admin/WhisperWatchdogBadge";

export type SttProviderId = "home" | "groq" | "openai";

interface SttProviderStatus {
  id: SttProviderId;
  label: string;
  configured: boolean;
  tokenConfigured?: boolean;
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
  body_raw?: string;
}

interface TestResult {
  ok: boolean;
  latency_ms: number | null;
  text?: string;
  error?: string;
  body_raw?: string;
  session_ok?: boolean;
  wav?: FormatProbeResult;
  m4a?: FormatProbeResult;
}

export interface DiagStep {
  label: string;
  ok: boolean;
  latency_ms: number | null;
  detail: string;
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
  const hasBody = options?.body != null;
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...authFetchHeaders(),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Errore sconosciuto" })) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function WhisperDiagSteps({
  diagSteps,
  copyDiagLog,
}: {
  diagSteps: DiagStep[];
  copyDiagLog: () => void;
}) {
  return (
    <View style={styles.diagReport}>
      <View style={styles.diagReportHeader}>
        <MaterialCommunityIcons name="clipboard-list-outline" size={16} color={Colors.text} />
        <Text style={styles.diagReportTitle}>Report diagnostica</Text>
        <TouchableOpacity style={styles.copyLogBtn} onPress={copyDiagLog}>
          <MaterialCommunityIcons name="content-copy" size={14} color={Colors.textSecondary} />
          <Text style={styles.copyLogText}>Copia log</Text>
        </TouchableOpacity>
      </View>
      {diagSteps.map((step, idx) => (
        <View key={idx} style={[styles.diagStep, idx > 0 && styles.diagStepBorder]}>
          <Text style={[styles.diagStepIcon, { color: step.ok ? "#22C55E" : "#ef4444" }]}>
            {step.ok ? "✅" : "❌"}
          </Text>
          <View style={styles.diagStepBody}>
            <Text style={styles.diagStepLabel}>
              {step.label}
              {step.latency_ms != null ? (
                <Text style={styles.diagStepLatency}> — {step.latency_ms}ms</Text>
              ) : null}
            </Text>
            <Text style={styles.diagStepDetail}>{step.detail}</Text>
          </View>
        </View>
      ))}
      {diagSteps.length === 0 && (
        <Text style={styles.diagStepDetail}>Nessun dato restituito.</Text>
      )}
    </View>
  );
}

export default function WhisperConfigScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<Record<string, TestResult | "loading">>({});
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagSteps, setDiagSteps] = useState<DiagStep[] | null>(null);
  const autoTestedRef = useRef(false);

  const { data, isLoading, error } = useQuery<WhisperConfigData>({
    queryKey: ["/api/admin/whisper-config"],
    queryFn: () => apiFetch("/api/admin/whisper-config"),
    refetchOnWindowFocus: false,
  });

  const { data: healthData, dataUpdatedAt: healthUpdatedAt } = useQuery<WhisperHealthData>({
    queryKey: ["/api/admin/whisper-health"],
    queryFn: () => apiFetch("/api/admin/whisper-health"),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
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
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const _resetMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/whisper-config/reset", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/whisper-config"] });
    },
    onError: (e: Error) => Alert.alert("Errore reset", e.message),
  });

  useEffect(() => {
    if (!data || autoTestedRef.current) return;
    const homeStatus = data.statuses.find((s) => s.id === "home");
    if (homeStatus?.configured) {
      autoTestedRef.current = true;
      testProvider("home");
    }
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
    const callStart = Date.now();
    try {
      const url = new URL(`/api/admin/whisper-config/test/${id}`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { ...authFetchHeaders() },
      });
      const clientLatency = Date.now() - callStart;
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
          [id]: { ok: false, latency_ms: clientLatency, error: errMsg, body_raw: bodyText ? bodyText.slice(0, 300) : undefined },
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
          body_raw: fr.body_raw != null ? String(fr.body_raw) : undefined,
        };
      };

      const result: TestResult = {
        ok: Boolean(raw.ok),
        latency_ms: typeof raw.latency_ms === "number" ? raw.latency_ms : clientLatency,
        error: raw.error != null ? String(raw.error) : raw.message != null ? String(raw.message) : undefined,
        text: raw.text != null ? String(raw.text) : undefined,
        body_raw: raw.body_raw != null ? String(raw.body_raw) : undefined,
        session_ok: typeof raw.session_ok === "boolean" ? raw.session_ok : undefined,
        wav: parseFormatProbe(raw.wav),
        m4a: parseFormatProbe(raw.m4a),
      };
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (e) {
      const clientLatency = Date.now() - callStart;
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, latency_ms: clientLatency, error: e instanceof Error ? e.message : "Errore di rete" },
      }));
    }
  }

  async function runDiagnose() {
    setDiagLoading(true);
    setDiagSteps(null);
    try {
      const url = new URL("/api/admin/whisper-config/diagnose", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { ...authFetchHeaders() },
      });
      const bodyText = await res.text().catch(() => "");
      if (!res.ok) {
        setDiagSteps([{ label: "Errore server", ok: false, latency_ms: null, detail: bodyText.slice(0, 200) }]);
        return;
      }
      let parsed: { steps?: DiagStep[] } = {};
      try { parsed = JSON.parse(bodyText) as { steps?: DiagStep[] }; } catch {
        setDiagSteps([{ label: "Risposta non-JSON", ok: false, latency_ms: null, detail: bodyText.slice(0, 200) }]);
        return;
      }
      setDiagSteps(parsed.steps ?? []);
    } catch (e) {
      setDiagSteps([{
        label: "Errore di rete",
        ok: false,
        latency_ms: null,
        detail: e instanceof Error ? e.message : "Impossibile raggiungere il server",
      }]);
    } finally {
      setDiagLoading(false);
    }
  }

  async function copyDiagLog() {
    if (!diagSteps) return;
    const lines = diagSteps.map((s) => {
      const icon = s.ok ? "✅" : "❌";
      const lat = s.latency_ms != null ? ` [${s.latency_ms}ms]` : "";
      return `${icon} ${s.label}${lat}\n   ${s.detail}`;
    });
    const text = `=== Diagnosi Whisper — ${new Date().toISOString()} ===\n\n${lines.join("\n\n")}`;
    await Clipboard.setStringAsync(text);
    Alert.alert("Copiato", "Log diagnostica copiato negli appunti.");
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
      {healthData && (
        <WhisperWatchdogBadge health={healthData} updatedAt={healthUpdatedAt} />
      )}

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

                {status.id === "home" && status.configured && status.tokenConfigured === false && (
                  <View style={styles.tokenWarnBanner}>
                    <MaterialCommunityIcons name="key-alert-outline" size={14} color="#F59E0B" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tokenWarnText}>Token non impostato</Text>
                      <Text style={styles.tokenWarnNote}>Se nginx richiede autenticazione, imposta WHISPER_TOKEN</Text>
                    </View>
                  </View>
                )}
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
                    {!testResult.ok && testResult.wav.body_raw && (
                      <View style={styles.bodyRawBox}>
                        <Text style={styles.bodyRawText} numberOfLines={4}>
                          {testResult.wav.body_raw.slice(0, 200)}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={styles.testResultText}>
                      {testResult.ok
                        ? `✅ OK — ${testResult.latency_ms != null ? `${testResult.latency_ms}ms` : "—"}${testResult.text ? ` — "${testResult.text}"` : ""}`
                        : `❌ ${testResult.error ?? "Errore sconosciuto"} (${testResult.latency_ms != null ? `${testResult.latency_ms}ms` : "—"})`}
                    </Text>
                    {!testResult.ok && testResult.session_ok === false && (
                      <Text style={[styles.testResultText, styles.testResultSubline]}>
                        ⚠️ Sessione admin non valida sul server
                      </Text>
                    )}
                    {!testResult.ok && testResult.body_raw && (
                      <View style={styles.bodyRawBox}>
                        <Text style={styles.bodyRawText} numberOfLines={4}>
                          {testResult.body_raw.slice(0, 200)}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.diagnoseBtn, diagLoading && styles.resetBtnDisabled]}
        onPress={runDiagnose}
        disabled={diagLoading}
      >
        {diagLoading ? (
          <>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.diagnoseBtnText}>Diagnosi in corso…</Text>
          </>
        ) : (
          <>
            <MaterialCommunityIcons name="stethoscope" size={16} color={Colors.accent} />
            <Text style={styles.diagnoseBtnText}>Diagnosi completa</Text>
          </>
        )}
      </TouchableOpacity>

      {diagSteps != null && (
        <WhisperDiagSteps diagSteps={diagSteps} copyDiagLog={copyDiagLog} />
      )}
    </ScrollView>
  );
}
