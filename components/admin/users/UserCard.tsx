import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface AdminUser {
  id: string;
  nickname: string;
  email: string;
  phone?: string;
  userType: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
  lastAppVersion?: string | null;
  lastOtaVersion?: string | null;
  lastPlatform?: string | null;
  lastDeviceModel?: string | null;
  isFake?: boolean;
  isPrimal?: boolean;
  hasLastfmData?: boolean;
  mapTester?: boolean;
  telemetryDisabled?: boolean;
  matchingDisabled?: boolean;
}

interface UserCardProps {
  item: AdminUser;
  onOpenStats: (user: AdminUser) => void;
  onOpenEdit: (user: AdminUser) => void;
  onStatusChange: (user: AdminUser) => void;
  onMakeModerator: (user: AdminUser) => void;
  onClearLastfm: (user: AdminUser) => void;
  onDeleteUser: (user: AdminUser) => void;
  onTogglePrimal: (id: string, isPrimal: boolean) => void;
  onToggleMapTester?: (id: string, enabled: boolean) => void;
  onToggleTelemetryDisabled?: (id: string, disabled: boolean) => void;
  onToggleMatchingDisabled?: (id: string, disabled: boolean) => void;
  onOpenPrivacy?: (user: AdminUser) => void;
  isLastfmPending?: boolean;
  currentAppVersion?: string;
}

export const UserCard: React.FC<UserCardProps> = ({
  item,
  onOpenStats,
  onOpenEdit,
  onStatusChange,
  onMakeModerator,
  onClearLastfm,
  onDeleteUser,
  onTogglePrimal,
  onToggleMapTester,
  onToggleTelemetryDisabled,
  onToggleMatchingDisabled,
  onOpenPrivacy,
  isLastfmPending,
  currentAppVersion = "1.0.0",
}) => {
  function getStatusColor(status: string) {
    switch (status) {
      case "active": return Colors.success;
      case "suspended": return Colors.warning;
      case "blocked": return Colors.error;
      default: return Colors.textSecondary;
    }
  }

  function getRoleColor(role: string) {
    switch (role) {
      case "admin": return Colors.accent;
      case "moderator": return Colors.maleIcon;
      default: return Colors.textSecondary;
    }
  }

  return (
    <TouchableOpacity style={styles.card} onPress={() => onOpenStats(item)} activeOpacity={0.7}>
      <View style={styles.userInfo}>
        {item.isFake === true && (
          <Text style={{ fontSize: 10, fontWeight: "bold" as const, color: "#FF00FF" }}>FAKE</Text>
        )}
        {item.isPrimal === true && (
          <Text style={{ fontSize: 10, fontWeight: "bold" as const, color: "#FF3B30" }}>PRIMAL</Text>
        )}
        {item.mapTester === true && (
          <Text style={{ fontSize: 10, fontWeight: "bold" as const, color: "#0EA5E9" }}>MAP TESTER</Text>
        )}
        {item.telemetryDisabled === true && (
          <Text style={{ fontSize: 10, fontWeight: "bold" as const, color: "#ef4444" }}>SENSORI OFF</Text>
        )}
        {item.matchingDisabled === true && (
          <Text style={{ fontSize: 10, fontWeight: "bold" as const, color: "#f97316" }}>NON MATCHABILE</Text>
        )}
        <Text style={styles.nickname}>{item.nickname}</Text>
        <Text style={styles.email}>{item.email}</Text>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) + "33" }]}>
            <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: getRoleColor(item.role) + "33" }]}>
            <Text style={[styles.badgeText, { color: getRoleColor(item.role) }]}>{item.role}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: Colors.surfaceLight }]}>
            <Text style={[styles.badgeText, { color: Colors.textSecondary }]}>{item.userType}</Text>
          </View>
        </View>
        <Text style={styles.lastLogin}>
          {item.lastLoginAt
            ? `Ultimo accesso: ${new Date(item.lastLoginAt).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
            : "Mai connesso"}
        </Text>
        {(() => {
          const hasVer = !!item.lastAppVersion && item.lastAppVersion !== "unknown";
          const hasOta = !!item.lastOtaVersion && item.lastOtaVersion !== "unknown";
          const otaText = hasOta ? `OTA ${item.lastOtaVersion}` : null;
          if (!hasVer) {
            return (
              <View style={styles.versionRow}>
                <Text style={styles.versionMissing}>v—</Text>
                {otaText && <Text style={styles.otaBadge}>{otaText}</Text>}
              </View>
            );
          }
          const verOk = item.lastAppVersion === currentAppVersion;
          const color = verOk ? Colors.success : Colors.error;
          return (
            <View style={styles.versionRow}>
              <Text style={[styles.versionBadge, { color, textDecorationLine: verOk ? "none" : "underline" as const }]}>
                {`v${item.lastAppVersion}`}
              </Text>
              {otaText && <Text style={styles.otaBadge}>{otaText}</Text>}
            </View>
          );
        })()}
        {(item.lastDeviceModel || item.lastPlatform) && (
          <Text style={styles.deviceModel} numberOfLines={2}>
            {[item.lastPlatform, item.lastDeviceModel].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => onOpenEdit(item)} style={styles.actionBtn}>
          <Ionicons name="create-outline" size={22} color={Colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onStatusChange(item)} style={styles.actionBtn}>
          <Ionicons name="ban-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        {item.role === "user" && (
          <TouchableOpacity onPress={() => onMakeModerator(item)} style={styles.actionBtn}>
            <Ionicons name="shield-checkmark-outline" size={22} color={Colors.maleIcon} />
          </TouchableOpacity>
        )}
        {item.hasLastfmData && (
          <TouchableOpacity
            onPress={() => onClearLastfm(item)}
            style={styles.actionBtn}
            disabled={isLastfmPending}
          >
            <Ionicons
              name="musical-notes-outline"
              size={22}
              color={isLastfmPending ? Colors.border : "#E31005"}
            />
          </TouchableOpacity>
        )}
        {onOpenPrivacy && (
          <TouchableOpacity onPress={() => onOpenPrivacy(item)} style={styles.actionBtn}>
            <Ionicons name="shield-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => onDeleteUser(item)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={22} color={Colors.error} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onTogglePrimal(item.id, !item.isPrimal)}
          style={styles.actionBtn}
        >
          <Ionicons name="star" size={22} color={item.isPrimal ? "#FF3B30" : Colors.border} />
        </TouchableOpacity>
        {onToggleMapTester && (
          <TouchableOpacity
            onPress={() => onToggleMapTester(item.id, !item.mapTester)}
            style={styles.actionBtn}
          >
            <Ionicons name="map" size={22} color={item.mapTester ? "#0EA5E9" : Colors.border} />
          </TouchableOpacity>
        )}
        {onToggleTelemetryDisabled && (
          <TouchableOpacity
            onPress={() => onToggleTelemetryDisabled(item.id, !item.telemetryDisabled)}
            style={styles.actionBtn}
          >
            <Ionicons
              name="pulse"
              size={22}
              color={item.telemetryDisabled ? "#ef4444" : Colors.border}
            />
          </TouchableOpacity>
        )}
        {onToggleMatchingDisabled && (
          <TouchableOpacity
            onPress={() => onToggleMatchingDisabled(item.id, !item.matchingDisabled)}
            style={styles.actionBtn}
          >
            <Ionicons
              name="ban"
              size={22}
              color={item.matchingDisabled ? "#f97316" : Colors.border}
            />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userInfo: { flex: 1 },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  email: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  lastLogin: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 6 },
  versionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" },
  versionBadge: { fontFamily: "Inter_500Medium", fontSize: 17 },
  versionMissing: { fontFamily: "Inter_400Regular", fontSize: 17, color: Colors.textSecondary },
  otaBadge: { fontFamily: "Inter_500Medium", fontSize: 17, color: Colors.accent },
  deviceModel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: "column", gap: 10 },
  actionBtn: { padding: 4 },
});
