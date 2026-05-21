import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface AdminClubHeaderProps {
  club: {
    name: string;
    clubType: string;
    brandName: string | null;
    modelName: string | null;
    createdAt: string;
    activityScore: number | null;
    totalCount: number;
  };
}

export const AdminClubHeader: React.FC<AdminClubHeaderProps> = ({ club }) => {
  const brandOrModel = [club.brandName, club.modelName].filter(Boolean).join(" ");

  return (
    <>
      <View style={styles.headerCard}>
        <View style={styles.headerIconWrap}>
          <Ionicons name="shield" size={36} color={Colors.accent} />
        </View>
        <Text style={styles.clubName}>{club.name}</Text>
        {brandOrModel ? <Text style={styles.clubSub}>{brandOrModel}</Text> : null}
        <View style={styles.headerBadges}>
          <View style={[styles.badge, { backgroundColor: Colors.accent + "22" }]}>
            <Text style={[styles.badgeText, { color: Colors.accent }]}>
              {club.clubType === "brand" ? "Marca" : "Modello"}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: Colors.success + "22" }]}>
            <Text style={[styles.badgeText, { color: Colors.success }]}>Approvato</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="people" size={20} color={Colors.accent} />
          <Text style={styles.statValue}>{club.totalCount}</Text>
          <Text style={styles.statLabel}>Membri</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="flame" size={20} color="#F59E0B" />
          <Text style={styles.statValue}>{club.activityScore ?? 0}</Text>
          <Text style={styles.statLabel}>Activity</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.statValue}>
            {new Date(club.createdAt).toLocaleDateString("it-IT", { month: "short", year: "numeric" })}
          </Text>
          <Text style={styles.statLabel}>Creato</Text>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  headerCard: {
    margin: 14,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  clubName: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
  },
  clubSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  headerBadges: { flexDirection: "row", gap: 8, marginTop: 12 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 14,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 16, gap: 4 },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
});
