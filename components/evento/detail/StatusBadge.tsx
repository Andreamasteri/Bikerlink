import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface StatusBadgeProps {
  status: string;
  rejectionReason?: string | null;
}

export default function StatusBadge({ status, rejectionReason }: StatusBadgeProps) {
  const t = useT();
  if (status === "approved") return null;
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: t("events.pendingApproval"), color: Colors.warning },
    rejected: { label: t("events.rejected"), color: Colors.error },
    cancelled: { label: t("events.cancelledStatus"), color: Colors.textSecondary },
  };
  const info = map[status];
  if (!info) return null;
  return (
    <View>
      <View style={[styles.badge, { backgroundColor: info.color + "22", borderColor: info.color }]}>
        <Text style={[styles.label, { color: info.color }]}>{info.label}</Text>
      </View>
      {status === "rejected" && rejectionReason && (
        <Text style={styles.reason}>{t("events.reason")}: {rejectionReason}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  reason: {
    marginTop: 4,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.error,
  },
});
