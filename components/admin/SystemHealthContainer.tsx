import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type DotStatus = "ok" | "degraded" | "offline" | "unknown";

const DOT_COLOR: Record<DotStatus, string> = {
  ok: "#22c55e",
  degraded: "#f59e0b",
  offline: "#ef4444",
  unknown: "#6b7280",
};

const STORAGE_KEY = "admin_system_health_collapsed";

interface StatusDotProps {
  label: string;
  status: DotStatus;
}

export function StatusDot({ label, status }: StatusDotProps) {
  const [showLabel, setShowLabel] = useState(false);

  return (
    <TouchableOpacity
      onPress={() => setShowLabel((v) => !v)}
      onLongPress={() => setShowLabel((v) => !v)}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={styles.dotWrapper}
    >
      <View style={[styles.dot, { backgroundColor: DOT_COLOR[status] }]} />
      {showLabel && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export interface SystemStatuses {
  thinkcentre: DotStatus;
  graphhopper: DotStatus;
  valhalla: DotStatus;
  nominatim: DotStatus;
  routing: DotStatus;
}

interface SystemHealthContainerProps {
  statuses: SystemStatuses;
  children: React.ReactNode;
}

const DOT_DEFS: { key: keyof SystemStatuses; label: string }[] = [
  { key: "thinkcentre", label: "ThinkCentre" },
  { key: "graphhopper", label: "GraphHopper" },
  { key: "valhalla", label: "Valhalla" },
  { key: "nominatim", label: "Nominatim" },
  { key: "routing", label: "Routing Engine System" },
];

export function SystemHealthContainer({
  statuses,
  children,
}: SystemHealthContainerProps) {
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val !== null) setCollapsed(val === "1");
      })
      .catch(() => {});
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    AsyncStorage.setItem(STORAGE_KEY, next ? "1" : "0").catch(() => {});
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        activeOpacity={0.7}
        testID="system-health-header"
      >
        <Ionicons name="pulse-outline" size={18} color={Colors.textSecondary} />
        <Text style={styles.title}>System Health</Text>
        <View style={styles.dotsRow}>
          {DOT_DEFS.map(({ key, label }) => (
            <StatusDot key={key} label={label} status={statuses[key]} />
          ))}
        </View>
        <Ionicons
          name={collapsed ? "chevron-down" : "chevron-up"}
          size={18}
          color={Colors.textSecondary}
          style={styles.chevron}
        />
      </TouchableOpacity>

      <View style={[styles.body, collapsed && styles.bodyHidden]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: "visible",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 8,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
    flexShrink: 1,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  },
  chevron: {
    marginLeft: 4,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 0,
  },
  bodyHidden: {
    display: "none",
  },
  dotWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  tooltip: {
    position: "absolute",
    bottom: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    zIndex: 999,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
    }),
  },
  tooltipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.text,
  },
});
