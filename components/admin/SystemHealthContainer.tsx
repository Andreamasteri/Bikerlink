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
  showPersistentLabel?: boolean;
  onNavigate?: () => void;
}

export function StatusDot({ label, status, showPersistentLabel, onNavigate }: StatusDotProps) {
  const [showLabel, setShowLabel] = useState(false);

  function handlePress() {
    if (onNavigate) {
      onNavigate();
    } else {
      setShowLabel((v) => !v);
    }
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={styles.dotWrapper}
    >
      <View style={[styles.dot, { backgroundColor: DOT_COLOR[status] }]} />
      {showPersistentLabel && (
        <Text style={styles.dotLabel} numberOfLines={3}>{label}</Text>
      )}
      {!showPersistentLabel && !onNavigate && showLabel && (
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
  photon: DotStatus;
  ollama: DotStatus;
  whisper: DotStatus;
  ufw: DotStatus;
  dragonfly: DotStatus;
  nginx: DotStatus;
  uptimeKuma: DotStatus;
  routing: DotStatus;
  matching: DotStatus;
}

interface SystemHealthContainerProps {
  statuses: SystemStatuses;
  children: React.ReactNode;
  onDotPress: (key: keyof SystemStatuses) => void;
}

const DOT_DEFS: { key: keyof SystemStatuses; label: string }[] = [
  { key: "thinkcentre",  label: "ThinkCentre"    },
  { key: "graphhopper",  label: "GraphHopper"    },
  { key: "valhalla",     label: "Valhalla"        },
  { key: "photon",       label: "Photon"          },
  { key: "ollama",       label: "Ollama AI"       },
  { key: "whisper",      label: "Whisper ASR"     },
  { key: "ufw",          label: "Firewall"        },
  { key: "dragonfly",    label: "DragonflyDB"     },
  { key: "nginx",        label: "nginx"           },
  { key: "uptimeKuma",   label: "Uptime Kuma"     },
  { key: "routing",      label: "Routing"         },
  { key: "matching",     label: "Matching Engine" },
];

export function SystemHealthContainer({
  statuses,
  children,
  onDotPress,
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

  function handleDotPress(key: keyof SystemStatuses) {
    if (collapsed) {
      setCollapsed(false);
      AsyncStorage.setItem(STORAGE_KEY, "0").catch(() => {});
    }
    onDotPress(key);
  }

  return (
    <View style={styles.container}>
      {/* Header row: icon + title + spacer + chevron */}
      <TouchableOpacity
        style={styles.headerRow}
        onPress={toggle}
        activeOpacity={0.7}
        testID="system-health-header"
      >
        <Ionicons name="pulse-outline" size={18} color={Colors.textSecondary} />
        <Text style={styles.title}>System Health</Text>
        <View style={styles.spacer} />
        <Ionicons
          name={collapsed ? "chevron-down" : "chevron-up"}
          size={18}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {/* Dots row: always visible, below the header */}
      <View style={styles.dotsRow}>
        {DOT_DEFS.map(({ key, label }) => (
          <StatusDot
            key={key}
            label={label}
            status={statuses[key]}
            showPersistentLabel={true}
            onNavigate={() => handleDotPress(key)}
          />
        ))}
      </View>

      {/* Body: collapsible */}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
  },
  dotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 4,
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
    justifyContent: "flex-start",
    width: 52,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  dotLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 3,
    textAlign: "center",
    maxWidth: 52,
  },
  tooltip: {
    position: "absolute",
    bottom: 26,
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
    fontSize: 12,
    color: Colors.text,
  },
});
