import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Switch, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders, apiRequest, queryClient } from "@/lib/query-client";

// ── FallbackSwitchCard (Task #110) ────────────────────────────────────────────
// Master switch globale: ON = fallback cloud (Groq/Gemini/OpenAI) consentito,
// OFF (default) = SOLO i modelli self-hosted ThinkCentre. Mostra la modalità
// effettiva accanto allo stato provider e permette di cambiarla.

export function FallbackSwitchCard() {
  const { data, isLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/admin/ai/fallback-switch"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/fallback-switch")).json(),
    staleTime: 15_000,
  });

  const enabled = data?.enabled ?? false;

  const toggle = useMutation({
    mutationFn: async (next: boolean) =>
      (await apiRequest("POST", "/api/admin/ai/fallback-switch", { enabled: next })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/fallback-switch"] });
    },
    onError: (err) =>
      Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile aggiornare il fallback AI"),
  });

  const modeColor = enabled ? Colors.warning : Colors.success;
  const modeLabel = enabled ? "Fallback: ON — cloud consentito" : "Fallback: OFF — solo ThinkCentre";
  const modeIcon: keyof typeof MaterialCommunityIcons.glyphMap = enabled ? "cloud-outline" : "server-security";

  return (
    <View style={fallbackStyles.card}>
      <View style={fallbackStyles.header}>
        <View style={fallbackStyles.headerLeft}>
          <MaterialCommunityIcons name={modeIcon} size={20} color={modeColor} />
          <Text style={fallbackStyles.title}>Fallback AI</Text>
        </View>
        <View style={fallbackStyles.headerRight}>
          {isLoading || toggle.isPending ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={enabled}
              onValueChange={(next) => toggle.mutate(next)}
              trackColor={{ false: Colors.border, true: Colors.warning + "88" }}
              thumbColor={enabled ? Colors.warning : Colors.success}
            />
          )}
        </View>
      </View>
      <View style={fallbackStyles.body}>
        <View style={[fallbackStyles.modeBadge, { borderColor: modeColor, backgroundColor: modeColor + "1A" }]}>
          <MaterialCommunityIcons name={modeIcon} size={13} color={modeColor} />
          <Text style={[fallbackStyles.modeText, { color: modeColor }]}>{modeLabel}</Text>
        </View>
        <Text style={fallbackStyles.hint}>
          {enabled
            ? "ON: le AI usano prima ThinkCentre (Ollama), poi ricadono su Groq/Gemini/OpenAI se il self-hosted non risponde. Comportamento multi-provider completo."
            : "OFF (default): tutta l'app usa SOLO i modelli self-hosted ThinkCentre. Nessuna chiamata cloud viene mai tentata; se il self-hosted non è disponibile la funzione degrada con un avviso."}
        </Text>
      </View>
    </View>
  );
}

const fallbackStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  body: { borderTopWidth: 1, borderTopColor: Colors.border, padding: 14, gap: 10 },
  modeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  modeText: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.2 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});

// ── OllamaStatusCard ─────────────────────────────────────────────────────────

interface OllamaTestResult {
  configured: boolean;
  model: string;
  url: string | null;
  token_configured: boolean;
  latency_ms: number | null;
  ok: boolean;
  reply?: string | null;
  error?: string;
}

export function OllamaStatusCard() {
  const [result, setResult] = React.useState<OllamaTestResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  const runTest = async () => {
    setLoading(true);
    // Safety-net timeout: se il backend non risponde affatto (rete assente,
    // host irraggiungibile) la fetch resterebbe appesa e il bottone girerebbe
    // all'infinito. 75s è generoso di proposito — il test Ollama può impiegare
    // 45-60s quando il modello qwen3 ragiona — così non abortiamo un test lento
    // ma valido; scatta solo su un vero black-hole di rete.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75_000);
    // Base per l'errorBox: la card mostra il riquadro d'errore solo quando
    // `configured === true`, quindi ogni fallimento client-side deve settarlo.
    const errBase = {
      configured: true,
      model: "—",
      url: null,
      token_configured: false,
      latency_ms: null,
      ok: false,
    } as const;
    try {
      const url = new URL("/api/admin/ai/test-ollama", getApiUrl()).toString();
      const res = await fetch(url, {
        headers: authFetchHeaders(),
        credentials: "include",
        signal: controller.signal,
      });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        // Risposta non-JSON (es. pagina HTML di errore da un proxy o da un host
        // sbagliato): non fingere che sia andata bene, mostra un errore esplicito.
        setResult({
          ...errBase,
          error: `Risposta non valida dal server (HTTP ${res.status}). Backend non raggiungibile.`,
        });
        return;
      }
      const data: OllamaTestResult = await res.json();
      setResult(data);
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      setResult({
        ...errBase,
        error: isAbort
          ? "Ollama non raggiungibile: timeout (nessuna risposta dal server entro 75s)."
          : `Errore di rete: ${err instanceof Error ? err.message : "Ollama non raggiungibile"}`,
      });
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  const badgeColor = !result
    ? Colors.textSecondary
    : !result.configured
      ? Colors.textSecondary
      : result.ok
        ? Colors.success
        : Colors.error;

  const badgeLabel = !result
    ? "—"
    : !result.configured
      ? "NON CONFIG."
      : result.ok
        ? "ONLINE"
        : "OFFLINE";

  const badgeIcon: keyof typeof MaterialCommunityIcons.glyphMap = !result
    ? "circle-outline"
    : !result.configured
      ? "circle-off-outline"
      : result.ok
        ? "check-circle-outline"
        : "alert-circle-outline";

  return (
    <View style={ollamaStyles.card}>
      <View style={ollamaStyles.header}>
        <View style={ollamaStyles.headerLeft}>
          <MaterialCommunityIcons name="brain" size={20} color="#FF6600" />
          <Text style={ollamaStyles.title}>Ollama AI Server</Text>
        </View>
        <View style={ollamaStyles.headerRight}>
          {result && (
            <View style={[ollamaStyles.badge, { borderColor: badgeColor, backgroundColor: badgeColor + "22" }]}>
              <MaterialCommunityIcons name={badgeIcon} size={12} color={badgeColor} />
              <Text style={[ollamaStyles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[ollamaStyles.testBtn, loading && ollamaStyles.testBtnDisabled]}
            onPress={runTest}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="play-circle-outline" size={14} color="#fff" />
                <Text style={ollamaStyles.testBtnText}>Test</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {result && (
        <View style={ollamaStyles.body}>
          <View style={ollamaStyles.row}>
            <Text style={ollamaStyles.label}>Modello</Text>
            <Text style={ollamaStyles.value}>{result.model}</Text>
          </View>
          {result.url && (
            <View style={ollamaStyles.row}>
              <Text style={ollamaStyles.label}>URL</Text>
              <Text style={ollamaStyles.value}>{result.url}</Text>
            </View>
          )}
          <View style={ollamaStyles.row}>
            <Text style={ollamaStyles.label}>Token</Text>
            <Text style={ollamaStyles.value}>{result.token_configured ? "Configurato" : "Assente"}</Text>
          </View>
          {result.latency_ms != null && (
            <View style={ollamaStyles.row}>
              <Text style={ollamaStyles.label}>Latenza</Text>
              <Text style={[ollamaStyles.value, { color: result.ok ? Colors.success : Colors.error }]}>
                {result.latency_ms} ms
              </Text>
            </View>
          )}
          {!result.configured && (
            <Text style={ollamaStyles.hint}>
              Imposta OLLAMA_URL nelle variabili d'ambiente per abilitare il provider AI self-hosted.
            </Text>
          )}
          {result.configured && !result.ok && result.error && (
            <View style={ollamaStyles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={13} color={Colors.error} />
              <Text style={ollamaStyles.errorText} numberOfLines={3}>{result.error}</Text>
            </View>
          )}
          {result.configured && result.ok && result.reply && (
            <View style={ollamaStyles.replyBox}>
              <MaterialCommunityIcons name="message-check-outline" size={13} color={Colors.success} />
              <Text style={ollamaStyles.replyText}>{result.reply}</Text>
            </View>
          )}
        </View>
      )}

      {!result && (
        <Text style={ollamaStyles.hint}>
          Premi Test per verificare la raggiungibilità del server Ollama (route parsing + traduzioni).
        </Text>
      )}
    </View>
  );
}

const ollamaStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.3 },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 62,
    justifyContent: "center",
  },
  testBtnDisabled: { opacity: 0.6 },
  testBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  body: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  value: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, flexShrink: 1, textAlign: "right" },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    paddingHorizontal: 14,
    paddingBottom: 12,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Colors.error + "15",
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.error, flex: 1, lineHeight: 17 },
  replyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.success + "15",
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  replyText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.success, flex: 1 },
});

// ── AiMetricsCard ─────────────────────────────────────────────────────────────

interface AiMetricsSummary {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  degradedRate: number;
  errorRate: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
}
interface AiMetricsResponse {
  range: string;
  summary: AiMetricsSummary;
  perProvider: Array<{ provider: string; calls: number; costUsd: number; degradedCount: number }>;
}

export function AiMetricsCard() {
  const { data, isLoading } = useQuery<AiMetricsResponse>({
    queryKey: ["/api/admin/ai/metrics", "24h"],
    queryFn: async () => {
      const url = new URL("/api/admin/ai/metrics?range=24h", getApiUrl()).toString();
      return (await fetch(url, { credentials: "include" })).json() as Promise<AiMetricsResponse>;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const s = data?.summary;

  return (
    <View style={metricsStyles.card}>
      <View style={metricsStyles.header}>
        <MaterialCommunityIcons name="chart-timeline-variant" size={18} color="#6366F1" />
        <Text style={metricsStyles.title}>AI Call Metrics — 24h</Text>
        {isLoading && <ActivityIndicator size="small" color={Colors.textSecondary} style={{ marginLeft: "auto" }} />}
      </View>
      {s ? (
        <View style={metricsStyles.body}>
          <View style={metricsStyles.row}>
            <Text style={metricsStyles.label}>Chiamate</Text>
            <Text style={metricsStyles.value}>{s.calls.toLocaleString("it-IT")}</Text>
          </View>
          <View style={metricsStyles.row}>
            <Text style={metricsStyles.label}>Costo stimato</Text>
            <Text style={metricsStyles.value}>${s.costUsd.toFixed(4)}</Text>
          </View>
          <View style={metricsStyles.row}>
            <Text style={metricsStyles.label}>Token (in / out)</Text>
            <Text style={metricsStyles.value}>
              {s.tokensIn.toLocaleString("it-IT")} / {s.tokensOut.toLocaleString("it-IT")}
            </Text>
          </View>
          <View style={metricsStyles.row}>
            <Text style={metricsStyles.label}>Latenza p50 / p95</Text>
            <Text style={metricsStyles.value}>{s.latencyP50Ms}ms / {s.latencyP95Ms}ms</Text>
          </View>
          {s.degradedRate > 0 && (
            <View style={metricsStyles.row}>
              <Text style={metricsStyles.label}>Tasso degraded</Text>
              <Text style={[metricsStyles.value, { color: Colors.error }]}>{s.degradedRate}%</Text>
            </View>
          )}
          {s.errorRate > 0 && (
            <View style={metricsStyles.row}>
              <Text style={metricsStyles.label}>Tasso errori</Text>
              <Text style={[metricsStyles.value, { color: Colors.warning }]}>{s.errorRate}%</Text>
            </View>
          )}
          {(data?.perProvider ?? []).length > 0 && (
            <View style={metricsStyles.providers}>
              {(data?.perProvider ?? []).slice(0, 4).map((p) => (
                <View key={p.provider} style={metricsStyles.providerChip}>
                  <Text style={metricsStyles.providerText}>{p.provider}</Text>
                  <Text style={metricsStyles.providerCount}>{p.calls}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : !isLoading ? (
        <Text style={metricsStyles.hint}>Nessuna chiamata AI nelle ultime 24h.</Text>
      ) : null}
    </View>
  );
}

const metricsStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  body: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  value: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, flexShrink: 1, textAlign: "right" },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  providers: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  providerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#6366F115",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#6366F130",
  },
  providerText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#6366F1" },
  providerCount: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text },
});
