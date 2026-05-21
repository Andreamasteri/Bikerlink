import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface Club {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  isApproved: boolean;
  memberCount: number;
  activityScore: number | null;
  createdAt: string;
}

interface AdminMotoClubCardProps {
  club: Club;
  onPress: () => void;
  onDelete: () => void;
}

function clubTypeLabel(type: string) {
  if (type === "brand") return "Marca";
  if (type === "model") return "Modello";
  return type;
}

export function TypeBadge({ type }: { type: string }) {
  const isBrand = type === "brand";
  return (
    <View style={[styles.typeBadge, { backgroundColor: isBrand ? Colors.accent + "22" : "#7C3AED22" }]}>
      <Text style={[styles.typeBadgeText, { color: isBrand ? Colors.accent : "#7C3AED" }]}>
        {clubTypeLabel(type)}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const color = status === "pending" ? "#F59E0B" : status === "approved" ? Colors.success : Colors.error;
  const label = status === "pending" ? t("admin.pendingStatus") : status === "approved" ? t("admin.approvedStatus") : t("admin.rejectedStatus");
  return (
    <View style={[styles.statusBadge, { backgroundColor: color + "22" }]}>
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function AdminMotoClubCard({ club, onPress, onDelete }: AdminMotoClubCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.cardIconWrap}>
        <Ionicons name="shield" size={22} color={Colors.accent} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={[styles.cardName, { flex: 1 }]} numberOfLines={1}>{club.name}</Text>
          <TypeBadge type={club.clubType} />
        </View>
        {(club.brandName || club.modelName) && (
          <Text style={styles.cardSub}>
            {[club.brandName, club.modelName].filter(Boolean).join(" ")}
          </Text>
        )}
        <View style={styles.cardRow}>
          <View style={styles.statChip}>
            <Ionicons name="people" size={12} color={Colors.textSecondary} />
            <Text style={styles.statChipText}>{club.memberCount} {club.memberCount === 1 ? "membro" : "membri"}</Text>
          </View>
          {club.activityScore != null && club.activityScore > 0 && (
            <View style={styles.statChip}>
              <Ionicons name="flame" size={12} color="#F59E0B" />
              <Text style={[styles.statChipText, { color: "#F59E0B" }]}>{club.activityScore} pt</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.chevron}>
        <MaterialIcons name="chevron-right" size={22} color={Colors.textSecondary} />
      </View>
      <TouchableOpacity
        onPress={(e) => { e.stopPropagation(); onDelete(); }}
        style={styles.deleteIconBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  cardBody: { flex: 1, gap: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
  },
  statChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  chevron: { justifyContent: "center", paddingLeft: 4 },
  deleteIconBtn: { justifyContent: "center", paddingLeft: 8 },
});
