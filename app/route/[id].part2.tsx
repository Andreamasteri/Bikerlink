import React from "react";
import { View, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Polyline } from "react-native-svg";
import Colors from "@/constants/colors";
import { styles } from "./[id].styles";

export function SparklineChart({
  values,
  color,
  label,
  unit,
  toFixed = 1,
}: {
  values: (number | null | undefined)[];
  color: string;
  label: string;
  unit: string;
  toFixed?: number;
}) {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const VW = 300;
  const VH = 52;
  const PAD = 3;

  const step = values.length > 120 ? Math.ceil(values.length / 120) : 1;
  const sampled = values.filter((_, i) => i % step === 0);

  const pts = sampled
    .reduce<{ segments: string[][]; current: string[] }>(
      (acc, v, i) => {
        if (v == null) {
          if (acc.current.length > 0) {
            acc.segments.push(acc.current);
            acc.current = [];
          }
        } else {
          const x = PAD + (i / Math.max(sampled.length - 1, 1)) * (VW - 2 * PAD);
          const y = VH - PAD - ((v - min) / range) * (VH - 2 * PAD);
          acc.current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        return acc;
      },
      { segments: [], current: [] }
    );
  if (pts.current.length > 0) pts.segments.push(pts.current);

  return (
    <View style={styles.chartRow}>
      <View style={styles.chartMeta}>
        <Text style={styles.chartLabel}>{label}</Text>
        <Text style={[styles.chartPeak, { color }]}>
          {max.toFixed(toFixed)} {unit}
        </Text>
      </View>
      <Svg
        width="100%"
        height={VH}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
      >
        {pts.segments.map((seg, idx) =>
          seg.length > 1 ? (
            <Polyline
              key={idx}
              points={seg.join(" ")}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null
        )}
      </Svg>
    </View>
  );
}

export function StatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <MaterialCommunityIcons
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon name from stat
        name={icon as any}
        size={22}
        color={Colors.accent}
      />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}
