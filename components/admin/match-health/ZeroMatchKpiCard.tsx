import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface ZeroMatchSnapshotPoint {
  snapshotDate: string;
  totalUsers: number;
  zeroMatchCount: number;
}

interface Props {
  zeroMatchCount: number;
  total: number;
  snapshots?: ZeroMatchSnapshotPoint[];
}

function TrendIndicator({ current, snapshots }: { current: number; snapshots: ZeroMatchSnapshotPoint[] }) {
  const today = new Date().toISOString().split("T")[0];
  const baseline = snapshots.find((s) => s.snapshotDate < today) ?? snapshots.find((s) => s.snapshotDate !== today) ?? null;
  if (!baseline) return null;

  const prev = baseline.zeroMatchCount;
  const diff = current - prev;
  const pct = prev > 0 ? Math.round(Math.abs(diff / prev) * 100) : 0;

  if (Math.abs(diff) < 2) {
    return (
      <View style={styles.trendRow}>
        <Ionicons name="remove" size={14} color={Colors.textSecondary} />
        <Text style={[styles.trendText, { color: Colors.textSecondary }]}>stabile</Text>
      </View>
    );
  }

  const label = baseline.snapshotDate;

  if (diff > 0) {
    return (
      <View style={styles.trendRow}>
        <Ionicons name="arrow-up" size={14} color={Colors.error} />
        <Text style={[styles.trendText, { color: Colors.error }]}>+{diff} ({pct}%) vs {label}</Text>
      </View>
    );
  }

  return (
    <View style={styles.trendRow}>
      <Ionicons name="arrow-down" size={14} color={Colors.success} />
      <Text style={[styles.trendText, { color: Colors.success }]}>{diff} ({pct}%) vs {label}</Text>
    </View>
  );
}

function Sparkline({ snapshots, currentCount }: { snapshots: ZeroMatchSnapshotPoint[]; currentCount: number }) {
  if (snapshots.length < 2) return null;

  const points = [...snapshots].reverse();
  const all = [...points.map(p => p.zeroMatchCount), currentCount];
  const maxVal = Math.max(...all, 1);
  const minVal = Math.min(...all, 0);
  const range = maxVal - minVal || 1;

  const WIDTH = 80;
  const HEIGHT = 28;
  const count = all.length;
  const step = WIDTH / (count - 1);

  const coords = all.map((v, i) => ({
    x: i * step,
    y: HEIGHT - ((v - minVal) / range) * HEIGHT,
  }));

  const lastColor = all[all.length - 1] > all[0] ? Colors.error : Colors.success;

  return (
    <View style={styles.sparklineWrap}>
      {/* Simple text-based sparkline using dots */}
      {coords.map((c, i) => {
        const isLast = i === coords.length - 1;
        return (
          <View
            key={i}
            style={[
              styles.sparkDot,
              {
                left: c.x,
                top: c.y,
                backgroundColor: isLast ? lastColor : Colors.textSecondary + "80",
                width: isLast ? 6 : 4,
                height: isLast ? 6 : 4,
                borderRadius: isLast ? 3 : 2,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export function ZeroMatchKpiCard({ zeroMatchCount, total, snapshots = [] }: Props) {
  const router = useRouter();
  const accent = zeroMatchCount > 0 ? Colors.warning : Colors.success;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/admin/match-inspector", params: { zeroOnly: "true" } })}
      activeOpacity={0.75}
    >
      <View style={styles.left}>
        <MaterialCommunityIcons name="account-alert" size={28} color={accent} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.title}>Utenti senza match</Text>
          <View style={styles.countRow}>
            <Text style={[styles.count, { color: accent }]}>{zeroMatchCount}</Text>
            <Text style={styles.sep}> / </Text>
            <Text style={styles.total}>{total} utenti reali</Text>
          </View>
          {snapshots.length > 0 && (
            <TrendIndicator current={zeroMatchCount} snapshots={snapshots} />
          )}
        </View>
      </View>
      <View style={styles.right}>
        {snapshots.length >= 2 && (
          <Sparkline snapshots={snapshots} currentCount={zeroMatchCount} />
        )}
        <Text style={[styles.pct, { color: accent }]}>
          {total > 0 ? Math.round((zeroMatchCount / total) * 100) : 0}%
        </Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  count: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  sep: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  total: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  trendText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pct: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  sparklineWrap: {
    width: 80,
    height: 28,
    position: "relative",
    marginRight: 4,
  },
  sparkDot: {
    position: "absolute",
    transform: [{ translateX: -2 }, { translateY: -2 }],
  },
});
