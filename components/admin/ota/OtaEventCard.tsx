import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface OtaDbRelease {
  id: string;
  version: string;
  runtime_version: string | null;
  status: string;
  slot: string | null;
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
}

export interface OtaUpdate {
  updateNumber: number;
  publishedAt?: string;
  message?: string;
  note?: string;
  status?: string;
  platforms?: string[];
  updateGroupId?: string;
  releaseId?: string;
  runtimeVersion?: string;
  runtime_version?: string;
  androidUpdateId?: string | null;
  iosUpdateId?: string | null;
  [key: string]: unknown;
}

interface OtaEventCardProps {
  update: OtaUpdate;
  deviceCount?: number;
  dbRelease?: OtaDbRelease;
  statusColor: (status?: string) => string;
  statusLabel: (status?: string) => string;
  formatOtaDate: (dateStr?: string) => string;
}

export const OtaEventCard: React.FC<OtaEventCardProps> = ({
  update: u,
  deviceCount,
  dbRelease: dbRel,
  statusColor,
  statusLabel,
  formatOtaDate,
}) => {
  return (
    <View style={styles.releaseCard}>
      <View style={styles.releaseHeader}>
        <View style={styles.releaseHeaderLeft}>
          <MaterialCommunityIcons
            name="update"
            size={16}
            color={statusColor(u.status)}
          />
          <Text style={[styles.otaNumber, { color: statusColor(u.status) }]}>
            OTA-{u.updateNumber}
          </Text>
          <View style={styles.rvBadge}>
            <Text style={styles.rvText}>
              {u.runtimeVersion ?? u.runtime_version
                ? `rv ${u.runtimeVersion ?? u.runtime_version}`
                : "legacy"}
            </Text>
          </View>
        </View>
        <View style={styles.releaseHeaderRight}>
          {deviceCount !== undefined && deviceCount > 0 && (
            <View style={styles.adoptionBadge}>
              <MaterialCommunityIcons name="devices" size={11} color={Colors.accent} />
              <Text style={styles.adoptionText}>{deviceCount}</Text>
            </View>
          )}
          <View style={styles.statusBadge}>
            <Text style={[styles.statusText, { color: statusColor(u.status) }]}>
              {statusLabel(u.status)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.releaseMessage}>{u.message || "—"}</Text>

      {dbRel != null && (
        <View style={styles.approvalBadge}>
          {dbRel.approved ? (
            <>
              <Ionicons name="checkmark-circle" size={12} color="#34C759" />
              <Text style={[styles.approvalText, { color: "#34C759" }]}>
                Approvata{dbRel.approved_by ? ` da ${dbRel.approved_by}` : ""}{dbRel.approved_at ? ` · ${formatOtaDate(dbRel.approved_at)}` : ""}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="time-outline" size={12} color="#FF9500" />
              <Text style={[styles.approvalText, { color: "#FF9500" }]}>In attesa di approvazione</Text>
            </>
          )}
        </View>
      )}

      <View style={styles.releaseMeta}>
        <Text style={styles.releaseMetaText}>{formatOtaDate(u.publishedAt)}</Text>
        {u.platforms && u.platforms.length > 0 && (
          <Text style={styles.releaseMetaText}>{u.platforms.join(", ")}</Text>
        )}
      </View>

      {u.note ? (
        <Text style={styles.releaseNote} numberOfLines={3}>
          {u.note}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  releaseCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  releaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  releaseHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  releaseHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rvBadge: {
    backgroundColor: Colors.textSecondary + "22",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rvText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  adoptionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.accent + "18",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adoptionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.accent,
  },
  otaNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.background,
  },
  statusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  releaseMessage: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 6,
    lineHeight: 20,
  },
  releaseMeta: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  releaseMetaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  releaseNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
  },
  approvalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  approvalText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    flexShrink: 1,
  },
});
