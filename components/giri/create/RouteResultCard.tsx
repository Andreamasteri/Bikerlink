import React from "react";
import { View, Text, StyleSheet, Animated, ActivityIndicator, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import ElevationProfile from "@/components/ElevationProfile";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

type TelemetryCoverageReason =
  | "not_applicable"
  | "no_community_data"
  | "route_coverage_insufficient"
  | "user_km_below_target"
  | "engine_unsupported"
  | "applied";

interface TelemetryCoverage {
  reason: TelemetryCoverageReason;
  coveredSegments: number;
  requiredSegments: number;
  routeSegments: number;
  userKm: number | null;
  targetKm: number | null;
}

interface RouteResult {
  encoded?: string | null;
  rawPoints?: Array<{ lat: number; lng: number }> | null;
  distanceKm: number;
  durationMinutes: number;
  bikerScore: number;
  approximate?: boolean;
  warning?: string | null;
  telemetryCoverage?: TelemetryCoverage | null;
  weatherWarning?: string | null;
  navigationSteps?: Array<{ sign: number; text: string; distance: number; interval: [number, number]; streetName?: string }> | null;
  elevationProfile?: Array<{ distanceKm: number; altitudeM: number }> | null;
  elevationGainM?: number | null;
  altitudeMinM?: number | null;
  altitudeMaxM?: number | null;
}

interface WeatherWaypoint {
  lat: number; lng: number; name: string;
  tempNow: number | null; precipProb: number; weatherCode: number;
  weatherDesc: string; isSuitable: boolean;
}

interface RouteResultCardProps {
  routeResult: RouteResult;
  dismissedWarnings: Set<string>;
  onDismissWarning: (warning: string) => void;
  bikerScoreAnim: Animated.Value;
  weatherLoading: boolean;
  weatherPreview: WeatherWaypoint[] | null;
  isMultiDay: boolean;
  daysCount: number;
  selectedMotoId: string | null;
  fuelStopsNeeded: number;
}

export const RouteResultCard: React.FC<RouteResultCardProps> = ({
  routeResult,
  dismissedWarnings,
  onDismissWarning,
  bikerScoreAnim,
  weatherLoading,
  weatherPreview,
  isMultiDay,
  daysCount,
  selectedMotoId,
  fuelStopsNeeded,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.resultCard}>
      {routeResult.warning === "routing_unavailable" && !dismissedWarnings.has("routing_unavailable") && (
        <View style={s.warningRow}>
          <Ionicons name="warning-outline" size={15} color="#ef4444" />
          <Text style={s.warningText}>
            Routing non disponibile — percorso in linea retta
          </Text>
          <Pressable onPress={() => onDismissWarning("routing_unavailable")} hitSlop={8}>
            <Ionicons name="close" size={15} color="#ef4444" />
          </Pressable>
        </View>
      )}
      {routeResult.telemetryCoverage && (
        <TelemetryCoverageBanner
          coverage={routeResult.telemetryCoverage}
          dismissed={dismissedWarnings}
          onDismiss={onDismissWarning}
          s={s}
        />
      )}
      <Text style={s.resultTitle}>Percorso calcolato</Text>
      <View style={s.resultStats}>
        {[
          { icon: "navigate-outline", value: `${routeResult.distanceKm} km`, label: "Distanza" },
          { icon: "time-outline", value: `${Math.floor(routeResult.durationMinutes / 60)}h ${routeResult.durationMinutes % 60}m`, label: "Durata" },
          { icon: "steering", value: String(Math.round(routeResult.bikerScore * 100)), label: "BikerScore" },
        ].map((stat, i) => (
          <View key={i} style={s.resultStat}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon name from data */}
            <Ionicons name={stat.icon as any} size={20} color={colors.accent} />
            <Text style={s.resultStatValue}>{stat.value}</Text>
            <Text style={s.resultStatLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={s.bikerScoreSection}>
        <View style={s.bsLabelRow}>
          <Text style={s.bsLabel}>BikerScore (curvatura)</Text>
          <Animated.Text style={[s.bsValue, {
            color: bikerScoreAnim.interpolate({
              inputRange: [0, 40, 70, 100],
              outputRange: [colors.textSecondary, colors.accent, colors.accent, "#22c55e"],
              extrapolate: "clamp",
            }),
          }]}>
            {Math.round(routeResult.bikerScore * 100)}/100
          </Animated.Text>
        </View>
        <View style={s.bsBarBg}>
          <Animated.View style={[s.bsBarFill, {
            width: bikerScoreAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ["0%", "100%"],
              extrapolate: "clamp",
            }),
            backgroundColor: bikerScoreAnim.interpolate({
              inputRange: [0, 40, 70, 100],
              outputRange: [colors.textSecondary, colors.accent, colors.accent, "#22c55e"],
              extrapolate: "clamp",
            }),
          }]} />
        </View>
      </View>

      {routeResult.elevationProfile && routeResult.elevationProfile.length > 2 && (
        <View style={{ marginTop: 12 }}>
          <Text style={s.bsLabel}>Profilo altimetrico</Text>
          <View style={{ marginTop: 6 }}>
            <ElevationProfile
              profile={routeResult.elevationProfile}
              gainM={routeResult.elevationGainM}
              minM={routeResult.altitudeMinM}
              maxM={routeResult.altitudeMaxM}
              height={120}
            />
          </View>
        </View>
      )}

      {weatherLoading && (
        <View style={s.weatherBanner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={s.weatherBannerText}>Caricamento meteo...</Text>
        </View>
      )}
      {!weatherLoading && weatherPreview && weatherPreview.length > 0 && (() => {
        const unfavorable = weatherPreview.filter((w) => !w.isSuitable);
        return (
          <View style={s.weatherBanner}>
            <Ionicons name={weatherPreview[0].isSuitable ? "partly-sunny-outline" : "rainy-outline"} size={20} color={weatherPreview[0].isSuitable ? colors.accent : colors.accentRed} />
            <View style={{ flex: 1 }}>
              <Text style={s.weatherBannerText}>
                {weatherPreview[0].tempNow !== null ? `${Math.round(weatherPreview[0].tempNow)}°C` : ""}
                {weatherPreview[0].precipProb > 30 ? ` · 💧 ${weatherPreview[0].precipProb}% pioggia` : ""}
                {" · "}{weatherPreview[0].weatherDesc}
              </Text>
              {unfavorable.length > 0 && (
                <Text style={[s.weatherBannerText, { color: colors.accentRed, fontSize: 11, marginTop: 2 }]}>
                  ⚠ Maltempo previsto: {unfavorable.map((w) => w.name || "tappa").join(", ")}
                </Text>
              )}
            </View>
          </View>
        );
      })()}

      {routeResult.weatherWarning === "weather_unavoidable" && (
        <View style={s.weatherUnavoidableRow}>
          <MaterialCommunityIcons name="weather-lightning-rainy" size={16} color={colors.accentRed} />
          <Text style={s.weatherUnavoidableText}>
            Maltempo non evitabile su questo percorso
          </Text>
        </View>
      )}

      {isMultiDay && (
        <View style={s.multiDayPreview}>
          <MaterialCommunityIcons name="calendar-range" size={16} color="#a78bfa" />
          <Text style={s.multiDayPreviewText}>
            {daysCount} giorni · ~{Math.round(routeResult.distanceKm / daysCount)} km/giorno
          </Text>
        </View>
      )}

      {selectedMotoId && fuelStopsNeeded > 0 && (
        <View style={s.fuelPreview}>
          <MaterialCommunityIcons name="gas-station" size={16} color={colors.accent} />
          <Text style={s.fuelPreviewText}>{fuelStopsNeeded} sosta/e carburante stimate</Text>
        </View>
      )}
    </View>
  );
};

type CardStyles = ReturnType<typeof styles>;

/**
 * Banner cold-start telemetria: rende esplicito *perché* il percorso usa (o non
 * usa) la telemetria, con un progresso verso la soglia quando ha senso.
 * Sostituisce il vecchio warning binario `insufficient_data`.
 */
const TelemetryCoverageBanner: React.FC<{
  coverage: TelemetryCoverage;
  dismissed: Set<string>;
  onDismiss: (key: string) => void;
  s: CardStyles;
}> = ({ coverage, dismissed, onDismiss, s }) => {
  // Profilo geometrico: telemetria non pertinente, nessun banner.
  if (coverage.reason === "not_applicable") return null;

  const key = `telemetry:${coverage.reason}`;
  if (dismissed.has(key)) return null;

  // Stato positivo: telemetria applicata.
  if (coverage.reason === "applied") {
    return (
      <View style={s.telemetryOkRow}>
        <Ionicons name="checkmark-circle-outline" size={15} color="#22c55e" />
        <Text style={s.telemetryOkText}>
          Telemetria attiva · {coverage.coveredSegments}/{coverage.routeSegments} segmenti del percorso
        </Text>
        <Pressable onPress={() => onDismiss(key)} hitSlop={8}>
          <Ionicons name="close" size={15} color="#22c55e" />
        </Pressable>
      </View>
    );
  }

  // Stati di fallback: messaggio specifico + eventuale progresso verso la soglia.
  let message = "Dati telemetria insufficienti — usato il profilo geometrico";
  let progress: { value: number; label: string } | null = null;

  if (coverage.reason === "no_community_data") {
    message = "Nessun dato telemetrico dalla community — usato il profilo geometrico";
  } else if (coverage.reason === "engine_unsupported") {
    message = "Telemetria non supportata dal motore di routing — usato il profilo geometrico";
  } else if (coverage.reason === "route_coverage_insufficient") {
    const required = Math.max(1, coverage.requiredSegments);
    message = `Telemetria scarsa su questo percorso (${coverage.coveredSegments}/${required} segmenti) — usato il profilo geometrico`;
    progress = {
      value: Math.min(1, coverage.coveredSegments / required),
      label: `Copertura ${coverage.coveredSegments}/${required} segmenti`,
    };
  } else if (coverage.reason === "user_km_below_target") {
    const userKm = Math.round(coverage.userKm ?? 0);
    const targetKm = Math.max(1, Math.round(coverage.targetKm ?? 0));
    const remaining = Math.max(0, targetKm - userKm);
    message = "Stile personale non ancora pronto — usato il profilo geometrico";
    progress = {
      value: Math.min(1, userKm / targetKm),
      label: remaining > 0
        ? `Telemetria personale tra ~${remaining} km (${userKm}/${targetKm} km)`
        : `${userKm}/${targetKm} km`,
    };
  }

  return (
    <View style={s.telemetryFallback}>
      <View style={s.telemetryFallbackHeader}>
        <Ionicons name="information-circle-outline" size={15} color="#f59e0b" />
        <Text style={s.fallbackText}>{message}</Text>
        <Pressable onPress={() => onDismiss(key)} hitSlop={8}>
          <Ionicons name="close" size={15} color="#f59e0b" />
        </Pressable>
      </View>
      {progress && (
        <View style={s.telemetryProgressWrap}>
          <View style={s.telemetryProgressBg}>
            <View style={[s.telemetryProgressFill, { width: `${Math.round(progress.value * 100)}%` }]} />
          </View>
          <Text style={s.telemetryProgressLabel}>{progress.label}</Text>
        </View>
      )}
    </View>
  );
};

const styles = (colors: ThemeColors) => StyleSheet.create({
  resultCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  warningRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#ef444422", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#ef444444", marginBottom: 4 },
  warningText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#ef4444", flex: 1 },
  fallbackRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f59e0b22", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#f59e0b44", marginBottom: 4 },
  fallbackText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#f59e0b", flex: 1 },
  telemetryOkRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#22c55e1f", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#22c55e44", marginBottom: 4 },
  telemetryOkText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#22c55e", flex: 1 },
  telemetryFallback: { backgroundColor: "#f59e0b22", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#f59e0b44", marginBottom: 4, gap: 8 },
  telemetryFallbackHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  telemetryProgressWrap: { gap: 4 },
  telemetryProgressBg: { height: 6, backgroundColor: "#f59e0b33", borderRadius: 3, overflow: "hidden" },
  telemetryProgressFill: { height: "100%", borderRadius: 3, backgroundColor: "#f59e0b" },
  telemetryProgressLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#f59e0b" },
  resultTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text, marginBottom: 16 },
  resultStats: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  resultStat: { alignItems: "center", flex: 1 },
  resultStatValue: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text, marginTop: 4 },
  resultStatLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  bikerScoreSection: { marginTop: 8 },
  bsLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  bsLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary },
  bsValue: { fontFamily: "Inter_700Bold", fontSize: 14 },
  bsBarBg: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  bsBarFill: { height: "100%", borderRadius: 4 },
  weatherBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.background, padding: 12, borderRadius: 12, marginTop: 12 },
  weatherBannerText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.text },
  weatherUnavoidableRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.accentRed + "22", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.accentRed + "44", marginTop: 8 },
  weatherUnavoidableText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.accentRed, flex: 1 },
  multiDayPreview: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, backgroundColor: "#a78bfa15", padding: 10, borderRadius: 10 },
  multiDayPreviewText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#a78bfa" },
  fuelPreview: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, backgroundColor: colors.accent + "15", padding: 10, borderRadius: 10 },
  fuelPreviewText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.accent },
});
