import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Polyline } from "react-native-svg";
import { useColors } from "@/hooks/useColors";

interface ElevationPoint {
  distanceKm: number;
  altitudeM: number;
}

interface ElevationProfileProps {
  profile: ElevationPoint[];
  gainM?: number | null;
  lossM?: number | null;
  minM?: number | null;
  maxM?: number | null;
  height?: number;
}

export default function ElevationProfile({ profile, gainM, lossM, minM, maxM, height = 100 }: ElevationProfileProps) {
  const colors = useColors();
  const s = styles(colors);

  if (!profile || profile.length < 2) return null;

  const W = 320;
  const H = height - 32;
  const PAD_L = 4;
  const PAD_R = 4;
  const PAD_T = 8;
  const PAD_B = 4;

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const totalDist = profile[profile.length - 1].distanceKm;
  const altValues = profile.map((p) => p.altitudeM);
  const altMin = Math.min(...altValues);
  const altMax = Math.max(...altValues);
  const altRange = Math.max(1, altMax - altMin);

  function xFor(distKm: number) {
    return PAD_L + (distKm / Math.max(totalDist, 0.001)) * chartW;
  }
  function yFor(alt: number) {
    return PAD_T + chartH - ((alt - altMin) / altRange) * chartH;
  }

  const pathPoints = profile.map((p) => ({ x: xFor(p.distanceKm), y: yFor(p.altitudeM) }));

  // Build SVG path for filled area
  let d = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
  for (let i = 1; i < pathPoints.length; i++) {
    d += ` L ${pathPoints[i].x} ${pathPoints[i].y}`;
  }
  // Close area to bottom
  d += ` L ${pathPoints[pathPoints.length - 1].x} ${PAD_T + chartH}`;
  d += ` L ${pathPoints[0].x} ${PAD_T + chartH}`;
  d += " Z";

  // Polyline for the profile line itself
  const polylinePoints = pathPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <View style={[s.container, { height }]}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
            <Stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
          </LinearGradient>
        </Defs>
        <Path d={d} fill="url(#elevGrad)" />
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      <View style={s.labels}>
        <View style={s.labelItem}>
          <Text style={s.labelValue}>{minM !== null && minM !== undefined ? minM : Math.round(altMin)} m</Text>
          <Text style={s.labelKey}>Min</Text>
        </View>
        <View style={s.labelItem}>
          <Text style={s.labelValue}>{maxM !== null && maxM !== undefined ? maxM : Math.round(altMax)} m</Text>
          <Text style={s.labelKey}>Max</Text>
        </View>
        {gainM !== null && gainM !== undefined && (
          <View style={s.labelItem}>
            <Text style={[s.labelValue, { color: "#22c55e" }]}>+{gainM} m</Text>
            <Text style={s.labelKey}>Salita</Text>
          </View>
        )}
        {lossM !== null && lossM !== undefined && (
          <View style={s.labelItem}>
            <Text style={[s.labelValue, { color: "#f87171" }]}>−{lossM} m</Text>
            <Text style={s.labelKey}>Discesa</Text>
          </View>
        )}
        <View style={s.labelItem}>
          <Text style={s.labelValue}>{totalDist.toFixed(1)} km</Text>
          <Text style={s.labelKey}>Distanza</Text>
        </View>
      </View>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingTop: 8,
      paddingBottom: 4,
    },
    labels: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingTop: 4,
    },
    labelItem: { alignItems: "center" },
    labelValue: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 12,
      color: colors.text,
    },
    labelKey: {
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      color: colors.textSecondary,
    },
  });
