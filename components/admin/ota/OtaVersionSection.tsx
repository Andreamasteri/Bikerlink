import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export interface OtaStatRow {
  current_update_id: string;
  release_id: string;
  runtime_version: string;
  platform: string;
  ok_count: string | number;
  error_count: string | number;
  unique_devices: string | number;
  last_seen: string;
}

interface OtaVersionSectionProps {
  runtimeVersion: string;
  stats: OtaStatRow[];
  updateIdToOtaNum: Map<string, number>;
  formatTimestamp: (iso: string) => string;
}

export const OtaVersionSection: React.FC<OtaVersionSectionProps> = ({
  runtimeVersion,
  stats,
  updateIdToOtaNum,
  formatTimestamp,
}) => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Runtime Version: {runtimeVersion}</Text>
      {stats.map((s, idx) => {
        const otaNum = updateIdToOtaNum.get(s.current_update_id);
        const otaLabel = otaNum ? `OTA-${otaNum}` : s.current_update_id.substring(0, 12);
        const ok = Number(s.ok_count);
        const err = Number(s.error_count);
        const total = ok + err;
        const rate = total > 0 ? ((ok / total) * 100).toFixed(1) : "0";

        return (
          <View key={idx} style={styles.statRow}>
            <View style={styles.statHeader}>
              <Text style={styles.statOta}>{otaLabel}</Text>
              <Text style={styles.statPlatform}>{s.platform}</Text>
              <Text style={styles.statSeen}>{formatTimestamp(s.last_seen)}</Text>
            </View>
            <View style={styles.statGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{s.unique_devices}</Text>
                <Text style={styles.statLabel}>Devices</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: ok > 0 ? "#44AA44" : Colors.text }]}>
                  {ok}
                </Text>
                <Text style={styles.statLabel}>Success</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: err > 0 ? "#FF4444" : Colors.text }]}>
                  {err}
                </Text>
                <Text style={styles.statLabel}>Errors</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{rate}%</Text>
                <Text style={styles.statLabel}>Rate</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 10,
    backgroundColor: Colors.border + "44",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statRow: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border + "22",
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  statOta: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: Colors.accent,
    width: 80,
  },
  statPlatform: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.textSecondary,
    backgroundColor: Colors.border + "44",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: "uppercase",
  },
  statSeen: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    marginLeft: "auto",
  },
  statGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statVal: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    marginTop: 2,
  },
});
