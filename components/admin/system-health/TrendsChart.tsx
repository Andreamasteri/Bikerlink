// Task #2556 — Widget grafico trend score watchdog (ultime N snapshots).
// SVG inline, niente librerie esterne. Mostra linea score 0-100 + zona
// colorata per status (verde/giallo/arancione/rosso) basata sul valore.
// Include selettore finestra temporale 1h/6h/24h (default 6h).
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import Svg, { Path, Line, Circle, Text as SvgText } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

interface SnapshotRow {
  id: string;
  createdAt: string;
  status: "green" | "yellow" | "orange" | "red";
  score: number;
}

interface Props {
  limit?: number;
  height?: number;
}

type WindowKey = "1h" | "6h" | "24h";
const WINDOW_MS: Record<WindowKey, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};
// Snapshot ogni 60s → limite generoso per coprire la finestra max scelta.
const WINDOW_LIMIT: Record<WindowKey, number> = {
  "1h": 70,
  "6h": 380,
  "24h": 200, // 24h con tick a 60s = 1440 — campioniamo i piu' recenti per evitare grafici troppo densi
};

const STATUS_COLORS = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
} as const;

export function TrendsChart({ limit, height = 180 }: Props) {
  // Default 6h (#2556). Se il caller passa esplicitamente `limit`, vince comunque.
  const [windowKey, setWindowKey] = useState<WindowKey>("6h");
  const effectiveLimit = limit ?? WINDOW_LIMIT[windowKey];

  const q = useQuery<{ snapshots: SnapshotRow[] }>({
    queryKey: ["/api/admin/watchdog/snapshots", effectiveLimit],
    queryFn: async () => (await apiRequest("GET", `/api/admin/watchdog/snapshots?limit=${effectiveLimit}`)).json(),
    refetchInterval: 30_000,
  });

  const rows = useMemo(() => {
    const raw = q.data?.snapshots ?? [];
    // API ritorna desc per createdAt — invertiamo per asse X cronologico,
    // poi filtriamo per la finestra scelta.
    const cutoff = Date.now() - WINDOW_MS[windowKey];
    return [...raw]
      .reverse()
      .filter((r) => {
        const t = Date.parse(r.createdAt);
        return Number.isFinite(t) ? t >= cutoff : true;
      });
  }, [q.data, windowKey]);

  const segmentedControl = (
    <View style={styles.segmented}>
      {(["1h", "6h", "24h"] as const).map((k) => {
        const active = k === windowKey;
        return (
          <TouchableOpacity
            key={k}
            style={[styles.segmentedItem, active && styles.segmentedItemActive]}
            onPress={() => setWindowKey(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentedText, active && styles.segmentedTextActive]}>{k}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (q.isLoading) {
    return (
      <View style={[styles.card, { height }]}>
        {segmentedControl}
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (q.error || rows.length < 2) {
    return (
      <View style={[styles.card]}>
        {segmentedControl}
        <Text style={styles.empty}>Dati insufficienti per il trend ({windowKey})</Text>
      </View>
    );
  }

  const padding = { left: 32, right: 12, top: 12, bottom: 22 };
  const width = 320;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const step = rows.length > 1 ? innerW / (rows.length - 1) : 0;
  const yFor = (score: number) => padding.top + innerH * (1 - Math.min(100, Math.max(0, score)) / 100);

  const pathD = rows
    .map((r, i) => `${i === 0 ? "M" : "L"} ${padding.left + i * step} ${yFor(r.score)}`)
    .join(" ");

  const last = rows[rows.length - 1];
  const min = rows.reduce((m, r) => Math.min(m, r.score), 100);
  const max = rows.reduce((m, r) => Math.max(m, r.score), 0);
  const avg = Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Trend health score</Text>
        <Text style={styles.subtitle}>{rows.length} snapshot ({windowKey}) — ult. {last.score}/100</Text>
      </View>
      {segmentedControl}
      <Svg width={width} height={height}>
        {[0, 25, 50, 75, 100].map((v) => (
          <React.Fragment key={`grid-${v}`}>
            <Line
              x1={padding.left}
              x2={width - padding.right}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke={Colors.border}
              strokeWidth={0.5}
              strokeDasharray="2,3"
            />
            <SvgText
              x={padding.left - 6}
              y={yFor(v) + 3}
              fontSize="9"
              fill={Colors.textSecondary}
              textAnchor="end"
            >
              {v}
            </SvgText>
          </React.Fragment>
        ))}
        <Path d={pathD} stroke={Colors.accent} strokeWidth={1.5} fill="none" />
        {rows.map((r, i) => (
          <Circle
            key={r.id}
            cx={padding.left + i * step}
            cy={yFor(r.score)}
            r={2}
            fill={STATUS_COLORS[r.status]}
          />
        ))}
      </Svg>
      <View style={styles.legend}>
        <Text style={styles.legendItem}>min {min}</Text>
        <Text style={styles.legendItem}>media {avg}</Text>
        <Text style={styles.legendItem}>max {max}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  header: { alignSelf: "stretch", marginBottom: 8 },
  title: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  subtitle: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  empty: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12 },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "stretch",
    marginTop: 6,
  },
  legendItem: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 11 },
  segmented: {
    flexDirection: "row",
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    marginBottom: 8,
    overflow: "hidden",
  },
  segmentedItem: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  segmentedItemActive: { backgroundColor: Colors.accent + "22" },
  segmentedText: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12 },
  segmentedTextActive: { color: Colors.accent, fontFamily: "Inter_700Bold" },
});
