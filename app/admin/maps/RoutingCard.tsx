import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { ROUTING_OPTIONS, ROUTING_PROFILE_OPTIONS } from "@shared/maps-config";
import type { RoutingEngineId, RoutingProfileId, MapsOption } from "@shared/maps-config";

type GHErrorType = "tunnel_down" | "profile_missing" | "routing_error" | "ok";

interface GHHealth {
  ok: boolean;
  status: string;
  latency_ms: number | null;
  last_check_at: number | null;
  last_failure_at: number | null;
  consecutive_failures: number;
  error: string | null;
  error_detail: string | null;
  error_type: GHErrorType;
  version: string | null;
  available_profiles: string[] | null;
  profiles_reachable: boolean;
  profiles_error_reason: string | null;
}

interface RoutingHealth {
  self_hosted: boolean;
  graphhopper: GHHealth;
  cloud_fallback_available: boolean;
  cloud_fallback_active: boolean;
  routing_disabled: boolean;
  degraded: boolean;
  message: string;
}

interface TestRoutingResult {
  ok: boolean;
  engine?: string;
  latency_ms?: number | null;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  error?: string;
  source?: string;
}

function formatTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ErrorTypeIcon({ type, size = 14 }: { type: GHErrorType; size?: number }) {
  if (type === "tunnel_down") return <Ionicons name="cloud-offline-outline" size={size} color={Colors.error} />;
  if (type === "profile_missing") return <Ionicons name="settings-outline" size={size} color="#f59e0b" />;
  if (type === "routing_error") return <Ionicons name="warning-outline" size={size} color={Colors.error} />;
  return <Ionicons name="checkmark-circle" size={size} color={Colors.success} />;
}

function ErrorTypeLabel({ type }: { type: GHErrorType }) {
  const labels: Record<GHErrorType, string> = {
    tunnel_down: "Tunnel DuckDNS non raggiungibile",
    profile_missing: "Profilo motorcycle mancante",
    routing_error: "Errore di routing",
    ok: "Operativo",
  };
  return <Text style={styles.errorTypeLabel}>{labels[type]}</Text>;
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

function TestRoutingButton({ selfHosted }: { selfHosted: boolean }) {
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

function SelfHostStatus() {
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
    ? "Server di casa: routing disabilitato"
    : `Server di casa: ${down ? "OFFLINE" : "online"}`;

  const lastCheck = formatTime(gh.last_check_at);
  const lastFailure = formatTime(gh.last_failure_at);

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
        {down && gh.consecutive_failures > 0 ? ` · ${gh.consecutive_failures} fallimenti consecutivi` : ""}
        {down && gh.last_failure_at ? ` · ultimo errore: ${lastFailure}` : ""}
        {data.cloud_fallback_active ? " · fallback Cloud attivo" : ""}
      </Text>

      {data.self_hosted && (
        <ProfilesSection
          profiles={gh.available_profiles}
          profilesReachable={gh.profiles_reachable ?? false}
          profilesErrorReason={gh.profiles_error_reason ?? null}
        />
      )}

      <TestRoutingButton selfHosted={data.self_hosted} />
    </View>
  );
}

interface RoutingCardProps {
  engine: RoutingEngineId;
  profile: RoutingProfileId;
  routingNotes: string;
  mapboxQuota?: { used: number; limit: number; percent: number; resets_at: string; warning_threshold: number };
  isPending: boolean;
  onRoutingChange: (engine: RoutingEngineId, profile: RoutingProfileId) => void;
}

function StubBadge() {
  return (
    <View style={styles.stubBadge}>
      <Text style={styles.stubBadgeText}>stub</Text>
    </View>
  );
}

function OptionRow<T extends string>({
  opt,
  isSelected,
  onPress,
  disabled,
  dotColor,
}: {
  opt: MapsOption<T>;
  isSelected: boolean;
  onPress: () => void;
  disabled: boolean;
  dotColor: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, isSelected && styles.optionSelected, !opt.implemented && styles.optionDimmed]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
      <View style={styles.optionLeft}>
        <View style={styles.optionText}>
          <View style={styles.labelRow}>
            <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{opt.label}</Text>
            {!opt.implemented && <StubBadge />}
          </View>
          <Text style={styles.optionDesc} numberOfLines={3}>{opt.description}</Text>
        </View>
      </View>
      {isSelected && <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />}
    </TouchableOpacity>
  );
}

const SELF_HOSTED_ENGINES: RoutingEngineId[] = ["graphhopper", "valhalla"];

export function RoutingCard({ engine, profile, routingNotes, mapboxQuota, isPending, onRoutingChange }: RoutingCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [localProfile, setLocalProfile] = React.useState<RoutingProfileId>(profile);

  React.useEffect(() => { setLocalProfile(profile); }, [profile]);

  const { data: health } = useQuery<RoutingHealth>({
    queryKey: ["/api/admin/maps/routing-health"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/maps/routing-health")).json(),
    refetchInterval: 30_000,
  });

  const engineDotColor = (opt: MapsOption<RoutingEngineId>): string => {
    if (!opt.implemented) return Colors.textSecondary;
    if (SELF_HOSTED_ENGINES.includes(opt.id) && health?.degraded) return "#f59e0b";
    return Colors.success;
  };

  const handleEngineSelect = (e: RoutingEngineId) => {
    const opt = ROUTING_OPTIONS.find((r) => r.id === e);
    if (!isPending && opt?.implemented) onRoutingChange(e, localProfile);
  };

  const handleProfileSelect = (p: RoutingProfileId) => {
    setLocalProfile(p);
    if (!isPending) onRoutingChange(engine, p);
  };

  const quotaPercent = mapboxQuota?.percent ?? 0;
  const quotaWarning = mapboxQuota && mapboxQuota.used >= mapboxQuota.warning_threshold;
  const quotaFull = mapboxQuota && mapboxQuota.used >= mapboxQuota.limit;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <Ionicons name="navigate-outline" size={18} color={Colors.accent} />
        <Text style={styles.title}>Routing Engine</Text>
        {isPending && <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 8 }} />}
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} style={{ marginLeft: "auto" }} />
      </TouchableOpacity>

      <SelfHostStatus />

      <View style={styles.currentRow}>
        <Text style={styles.currentLabel}>Attivo: </Text>
        <Text style={styles.currentValue}>{ROUTING_OPTIONS.find((r) => r.id === engine)?.label ?? engine}</Text>
        <Text style={styles.currentLabel}> · Profilo: </Text>
        <Text style={styles.currentValue}>{ROUTING_PROFILE_OPTIONS.find((p) => p.id === profile)?.label ?? profile}</Text>
      </View>

      {!!routingNotes && (
        <View style={styles.notesBox}>
          <Ionicons name="information-circle-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.notesText}>{routingNotes}</Text>
        </View>
      )}

      {mapboxQuota && (
        <View style={[styles.quotaBox, quotaWarning ? styles.quotaBoxWarning : null, quotaFull ? styles.quotaBoxFull : null]}>
          <Ionicons
            name={quotaFull ? "alert-circle" : quotaWarning ? "warning-outline" : "checkmark-circle-outline"}
            size={13}
            color={quotaFull ? Colors.error : quotaWarning ? "#f59e0b" : Colors.success}
          />
          <Text style={styles.quotaText}>
            Mapbox: {mapboxQuota.used.toLocaleString("it-IT")} / {mapboxQuota.limit.toLocaleString("it-IT")} req ({quotaPercent}%)
          </Text>
        </View>
      )}

      {expanded && (
        <>
          <Text style={styles.sectionLabel}>Engine</Text>
          {ROUTING_OPTIONS.map((opt) => (
            <OptionRow
              key={opt.id}
              opt={opt}
              isSelected={engine === opt.id}
              onPress={() => handleEngineSelect(opt.id)}
              disabled={isPending || !opt.implemented}
              dotColor={engineDotColor(opt)}
            />
          ))}

          <Text style={styles.sectionLabel}>Profilo</Text>
          {ROUTING_PROFILE_OPTIONS.map((opt) => (
            <OptionRow
              key={opt.id}
              opt={opt}
              isSelected={localProfile === opt.id}
              onPress={() => handleProfileSelect(opt.id)}
              disabled={isPending}
              dotColor={opt.implemented ? Colors.success : Colors.textSecondary}
            />
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  healthBox: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
    gap: 6,
  },
  healthHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  healthTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  healthMsg: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text },
  healthMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  errorDetailBox: {
    backgroundColor: Colors.error + "12",
    borderRadius: 6,
    padding: 8,
    gap: 4,
  },
  errorTypeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  errorTypeLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.error },
  errorDetailText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.error,
    opacity: 0.85,
  },
  profilesBox: {
    backgroundColor: Colors.surface,
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  profilesTitle: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary },
  profilesList: { gap: 3 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  profileName: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text },
  profileNameMoto: { fontFamily: "Inter_600SemiBold", color: Colors.success },
  profileNameMissing: { fontFamily: "Inter_600SemiBold", color: Colors.error },
  profileMotoLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.success },
  profileMotoLabelErr: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.error },
  profilesWarning: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 2 },
  profilesWarningText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#f59e0b", flex: 1 },
  profilesUnavailable: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, flex: 1 },
  testBox: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  testHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    backgroundColor: Colors.surface,
  },
  testTitle: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text, flex: 1 },
  testBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    minWidth: 72,
    alignItems: "center",
  },
  testBtnDisabled: { opacity: 0.6 },
  testBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  testResult: { padding: 8, gap: 3 },
  testResultOk: { backgroundColor: Colors.success + "14" },
  testResultErr: { backgroundColor: Colors.error + "12" },
  testResultRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  testResultText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text, flex: 1 },
  testResultErrText: { color: Colors.error },
  testResultMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginLeft: 18 },
  currentRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  currentLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  currentValue: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.accent },
  notesBox: { flexDirection: "row", gap: 4, backgroundColor: Colors.background, padding: 8, borderRadius: 6, marginBottom: 8 },
  notesText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  quotaBox: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: Colors.background, padding: 8, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  quotaBoxWarning: { borderColor: "#f59e0b" },
  quotaBoxFull: { borderColor: Colors.error },
  quotaText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  sectionLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary, marginBottom: 8, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
    backgroundColor: Colors.background,
  },
  optionSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "11" },
  optionDimmed: { opacity: 0.6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  optionLeft: { flex: 1 },
  optionText: { flex: 1 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  optionLabelSelected: { color: Colors.accent },
  optionDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  stubBadge: { backgroundColor: "#9333ea22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  stubBadgeText: { fontFamily: "Inter_500Medium", fontSize: 10, color: "#9333ea" },
});
