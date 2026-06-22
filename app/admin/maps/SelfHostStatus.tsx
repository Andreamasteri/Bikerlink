import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { styles } from "@/components/admin/maps/SelfHostStatus.styles";
import { formatTime, ErrorTypeIcon, ErrorTypeLabel, formatDuration } from "./SelfHostStatus.part2";

interface RoutingHistoryResponse {
  events: Array<{ type: string; ts: string; error_type?: string; duration_ms?: number }>;
}
interface TestRoutingResult {
  ok: boolean;
  error?: string;
  latency_ms?: number;
  engine?: string;
  distanceKm?: number;
  durationMinutes?: number;
}
export interface RoutingHealth {
  self_hosted: boolean;
  routing_disabled: boolean;
  degraded: boolean;
  message?: string;
  cloud_fallback_active?: boolean;
  graphhopper: {
    healthy: boolean;
    error_type?: string;
    profiles?: string[] | null;
    last_check_at?: string | null;
    last_failure_at?: string | null;
    error?: string;
    latency_ms?: number;
    consecutive_failures?: number;
    available_profiles?: string[] | null;
    profiles_reachable?: boolean;
    profiles_error_reason?: string;
  };
}


function ProfilesSection({
  profiles,
  profilesReachable,
  profilesErrorReason,
}: {
  profiles: string[] | null;
  profilesReachable: boolean;
  profilesErrorReason: string | null;
}) {
  if (!profilesReachable) {
    const label = profilesErrorReason === "timeout"
      ? "Timeout — il tunnel DuckDNS non risponde"
      : profilesErrorReason === "not_self_hosted"
      ? null
      : "Tunnel DuckDNS non raggiungibile — impossibile leggere i profili";

    if (!label) return null;

    return (
      <View style={styles.profilesBox}>
        <View style={styles.profileRow}>
          <Ionicons name="cloud-offline-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.profilesUnavailable}>{label}</Text>
        </View>
      </View>
    );
  }

  const hasMoto = profiles?.includes("motorcycle") ?? false;
  const otherProfiles = (profiles ?? []).filter((p) => p !== "motorcycle");

  return (
    <View style={styles.profilesBox}>
      <Text style={styles.profilesTitle}>Profili disponibili sul server:</Text>
      <View style={styles.profilesList}>
        <View style={styles.profileRow}>
          <Ionicons
            name={hasMoto ? "checkmark-circle" : "close-circle"}
            size={12}
            color={hasMoto ? Colors.success : Colors.error}
          />
          <Text style={[styles.profileName, hasMoto ? styles.profileNameMoto : styles.profileNameMissing]}>
            motorcycle
          </Text>
          <Text style={hasMoto ? styles.profileMotoLabel : styles.profileMotoLabelErr}>
            {hasMoto ? "← richiesto ✓" : "← MANCANTE"}
          </Text>
        </View>
        {otherProfiles.map((p) => (
          <View key={p} style={styles.profileRow}>
            <Ionicons name="ellipse" size={8} color={Colors.textSecondary} />
            <Text style={styles.profileName}>{p}</Text>
          </View>
        ))}
      </View>
      {!hasMoto && (
        <View style={styles.profilesWarning}>
          <Ionicons name="warning-outline" size={12} color="#f59e0b" />
          <Text style={styles.profilesWarningText}>
            Profilo "motorcycle" non trovato — routing userà il profilo fallback
          </Text>
        </View>
      )}
      {profiles === null && profilesReachable && (
        <Text style={styles.profilesUnavailable}>
          Endpoint /info raggiungibile ma nessun profilo restituito
        </Text>
      )}
    </View>
  );
}

function RoutingHistorySection() {
  const [expanded, setExpanded] = React.useState(false);
  const { data, isLoading } = useQuery<RoutingHistoryResponse>({
    queryKey: ["/api/admin/maps/routing-history"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/maps/routing-history")).json(),
    refetchInterval: 30_000,
    enabled: expanded,
  });

  const events = data?.events ?? [];
  const displayed = [...events].reverse();

  return (
    <View style={styles.historyBox}>
      <TouchableOpacity
        style={styles.historyToggle}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.historyToggleText}>
          Storico ultime 24h{events.length > 0 ? ` (${events.length} eventi)` : ""}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={13}
          color={Colors.textSecondary}
          style={{ marginLeft: "auto" }}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.historyContent}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} style={{ marginVertical: 8 }} />
          ) : displayed.length === 0 ? (
            <Text style={styles.historyEmpty}>Nessun evento registrato nelle ultime 24h</Text>
          ) : (
            displayed.map((ev, i) => {
              const isDown = ev.type === "down";
              const color = isDown ? Colors.error : Colors.success;
              const arrow = isDown ? "↓" : "↑";
              const timeStr = new Date(ev.ts).toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const label = isDown
                ? `${ev.error_type ?? "offline"}`
                : `online${ev.duration_ms != null ? ` (down ${formatDuration(ev.duration_ms)})` : ""}`;

              return (
                <View key={i} style={styles.historyRow}>
                  <View style={[styles.historyDot, { backgroundColor: color }]} />
                  <Text style={[styles.historyTime, { color: Colors.textSecondary }]}>{timeStr}</Text>
                  <Text style={[styles.historyArrow, { color }]}>{arrow}</Text>
                  <Text style={[styles.historyLabel, { color }]} numberOfLines={1}>{label}</Text>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

function TestRoutingButton({ selfHosted: _selfHosted }: { selfHosted: boolean }) {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<TestRoutingResult | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/maps/test-routing");
      const data = await res.json() as TestRoutingResult;
      setResult(data);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Errore sconosciuto" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.testBox}>
      <View style={styles.testHeader}>
        <Ionicons name="speedometer-outline" size={13} color={Colors.accent} />
        <Text style={styles.testTitle}>Prova route Mira → Belluno</Text>
        <TouchableOpacity
          style={[styles.testBtn, loading && styles.testBtnDisabled]}
          onPress={handleTest}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.testBtnText}>Prova ora</Text>}
        </TouchableOpacity>
      </View>

      {result && (
        <View style={[styles.testResult, result.ok ? styles.testResultOk : styles.testResultErr]}>
          {result.ok ? (
            <>
              <View style={styles.testResultRow}>
                <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                <Text style={styles.testResultText}>
                  {result.engine ?? "—"} · {result.latency_ms}ms
                </Text>
              </View>
              <Text style={styles.testResultMeta}>
                {result.distanceKm != null ? `${result.distanceKm} km` : ""}
                {result.distanceKm != null && result.durationMinutes != null ? " · " : ""}
                {result.durationMinutes != null ? `~${result.durationMinutes} min` : ""}
              </Text>
            </>
          ) : (
            <View style={styles.testResultRow}>
              <Ionicons name="alert-circle" size={13} color={Colors.error} />
              <Text style={[styles.testResultText, styles.testResultErrText]} numberOfLines={3}>
                {result.error ?? "Errore sconosciuto"}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function SelfHostStatus() {
  const { data } = useQuery<RoutingHealth>({
    queryKey: ["/api/admin/maps/routing-health"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/maps/routing-health")).json(),
    refetchInterval: 30_000,
  });

  if (!data || !data.self_hosted) return null;

  const disabled = data.routing_disabled;
  const down = data.degraded;
  const gh = data.graphhopper;
  const errorType = gh.error_type ?? "ok";

  const color = disabled ? Colors.textSecondary : down ? Colors.error : Colors.success;
  const icon: keyof typeof Ionicons.glyphMap = disabled
    ? "pause-circle"
    : errorType === "tunnel_down"
    ? "cloud-offline-outline"
    : errorType === "profile_missing"
    ? "settings-outline"
    : down
    ? "alert-circle"
    : "checkmark-circle";

  const title = disabled
    ? "ThinkCentre: routing disabilitato"
    : `ThinkCentre: ${down ? "OFFLINE" : "online"}`;

  const lastCheck = formatTime(gh.last_check_at ? new Date(gh.last_check_at).getTime() : null);
  const lastFailure = formatTime(gh.last_failure_at ? new Date(gh.last_failure_at).getTime() : null);

  return (
    <View style={[styles.healthBox, { borderColor: color }]}>
      <View style={styles.healthHeader}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.healthTitle, { color }]}>{title}</Text>
      </View>

      <Text style={styles.healthMsg}>{data.message}</Text>

      {down && gh.error && (
        <View style={styles.errorDetailBox}>
          <View style={styles.errorTypeRow}>
            <ErrorTypeIcon type={errorType} size={12} />
            <ErrorTypeLabel type={errorType} />
          </View>
          <Text style={styles.errorDetailText} numberOfLines={4}>
            {gh.error}
          </Text>
        </View>
      )}

      <Text style={styles.healthMeta}>
        Ultimo check: {lastCheck}
        {gh.latency_ms != null && !down ? ` · ${gh.latency_ms}ms` : ""}
        {down && (gh.consecutive_failures ?? 0) > 0 ? ` · ${gh.consecutive_failures} fallimenti consecutivi` : ""}
        {down && gh.last_failure_at ? ` · ultimo errore: ${lastFailure}` : ""}
        {data.cloud_fallback_active ? " · fallback Cloud attivo" : ""}
      </Text>

      {data.self_hosted && (
        <ProfilesSection
          profiles={gh.available_profiles ?? null}
          profilesReachable={gh.profiles_reachable ?? false}
          profilesErrorReason={gh.profiles_error_reason ?? null}
        />
      )}

      {data.self_hosted && <RoutingHistorySection />}

      <TestRoutingButton selfHosted={data.self_hosted} />
    </View>
  );
}

