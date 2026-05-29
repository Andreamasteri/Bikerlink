import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { ROUTING_OPTIONS, ROUTING_PROFILE_OPTIONS } from "@shared/maps-config";
import type { RoutingEngineId, RoutingProfileId, MapsOption } from "@shared/maps-config";

interface RoutingHealth {
  self_hosted: boolean;
  graphhopper: { ok: boolean; status: string; latency_ms: number | null; last_check_at: number | null; consecutive_failures: number; error: string | null };
  cloud_fallback_available: boolean;
  cloud_fallback_active: boolean;
  routing_disabled: boolean;
  degraded: boolean;
  message: string;
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
  const color = disabled ? Colors.textSecondary : down ? Colors.error : Colors.success;
  const icon = disabled ? "pause-circle" : down ? "alert-circle" : "checkmark-circle";
  const title = disabled
    ? "Server di casa: routing disabilitato"
    : `Server di casa: ${down ? "OFFLINE" : "online"}`;
  const lastCheck = data.graphhopper.last_check_at
    ? new Date(data.graphhopper.last_check_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <View style={[styles.healthBox, { borderColor: color }]}>
      <View style={styles.healthHeader}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.healthTitle, { color }]}>{title}</Text>
      </View>
      <Text style={styles.healthMsg}>{data.message}</Text>
      <Text style={styles.healthMeta}>
        Ultimo check: {lastCheck}
        {data.graphhopper.latency_ms != null && !down ? ` · ${data.graphhopper.latency_ms}ms` : ""}
        {down && data.graphhopper.consecutive_failures > 0 ? ` · ${data.graphhopper.consecutive_failures} fallimenti` : ""}
        {data.cloud_fallback_active ? " · fallback Cloud attivo" : ""}
      </Text>
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
}: {
  opt: MapsOption<T>;
  isSelected: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, isSelected && styles.optionSelected, !opt.implemented && styles.optionDimmed]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
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

export function RoutingCard({ engine, profile, routingNotes, mapboxQuota, isPending, onRoutingChange }: RoutingCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [localProfile, setLocalProfile] = React.useState<RoutingProfileId>(profile);

  React.useEffect(() => { setLocalProfile(profile); }, [profile]);

  const handleEngineSelect = (e: RoutingEngineId) => {
    if (!isPending) onRoutingChange(e, localProfile);
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
              disabled={isPending}
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
  healthBox: { backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, padding: 10, marginBottom: 10 },
  healthHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  healthTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  healthMsg: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text, marginBottom: 2 },
  healthMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
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
  optionLeft: { flex: 1 },
  optionText: { flex: 1 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  optionLabelSelected: { color: Colors.accent },
  optionDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  stubBadge: { backgroundColor: "#9333ea22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  stubBadgeText: { fontFamily: "Inter_500Medium", fontSize: 10, color: "#9333ea" },
});
