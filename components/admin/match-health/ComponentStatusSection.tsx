import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface ErrorItem {
  timestamp: string;
  count: number;
}

interface ComponentStatus {
  key: string;
  label: string;
  status: "OK" | "WARN" | "ERROR";
  uptime: number;
  lastError: string;
  errorsIn24h: ErrorItem[];
}

interface Props {
  componentStatus: ComponentStatus[];
}

export const ComponentStatusSection = ({ componentStatus }: Props) => {
  return (
    <>
      {componentStatus.map((cs) => (
        <View key={cs.key} style={styles.csRow}>
          <View style={styles.csHeader}>
            <Text style={styles.csLabel}>{cs.label}</Text>
            <View style={[styles.statusBadge, cs.status === "OK" ? styles.statusOk : cs.status === "WARN" ? styles.statusWarn : styles.statusError]}>
              <Text style={styles.statusBadgeText}>{cs.status}</Text>
            </View>
          </View>
          <View style={styles.csDetails}>
            <View style={styles.csDetailItem}>
              <Text style={styles.csDetailLabel}>Uptime:</Text>
              <Text style={styles.csDetailValue}>{(cs.uptime * 100).toFixed(1)}%</Text>
            </View>
            <View style={styles.csDetailItem}>
              <Text style={styles.csDetailLabel}>Last error:</Text>
              <Text style={styles.csDetailValue} numberOfLines={1}>{cs.lastError}</Text>
            </View>
          </View>
          <View style={styles.miniChart}>
            {cs.errorsIn24h.map((e, idx) => (
              <View
                key={idx}
                style={[
                  styles.bar,
                  {
                    height: Math.min(20, Math.max(2, e.count * 4)),
                    backgroundColor: e.count > 0 ? (cs.status === "ERROR" ? Colors.error : Colors.warning) : Colors.border,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  csRow: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  csHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  csLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusOk: { backgroundColor: Colors.success + "22" },
  statusWarn: { backgroundColor: Colors.warning + "22" },
  statusError: { backgroundColor: Colors.error + "22" },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  csDetails: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  csDetailItem: {
    flex: 1,
  },
  csDetailLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  csDetailValue: {
    fontSize: 12,
    color: Colors.text,
    fontFamily: "Inter_500Medium",
  },
  miniChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 20,
    gap: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 1,
  },
});
