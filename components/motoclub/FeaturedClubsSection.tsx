import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Club, countryFlag } from "./MotoClubCard";

interface FeaturedClubsSectionProps {
  club: Club;
  myClubIds: Set<string>;
  onJoin: (id: string) => void;
}

export const FeaturedClubsSection: React.FC<FeaturedClubsSectionProps> = ({
  club,
  myClubIds,
  onJoin,
}) => {
  const isMember = myClubIds.has(club.id);
  return (
    <View style={styles.featuredBanner}>
      <View style={styles.featuredBannerLeft}>
        <Text style={styles.featuredLabel}>🏆 Club del Mese</Text>
        <Text style={styles.featuredName}>{club.name}</Text>
        <Text style={styles.featuredStats}>
          {club.memberCount} membri · {countryFlag(club.country)}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.joinBtn, isMember && styles.leaveBtn, { alignSelf: "center" }]}
        onPress={() => !isMember && onJoin(club.id)}
        activeOpacity={0.8}
      >
        <Text style={[styles.joinBtnText, isMember && styles.leaveBtnText]}>
          {isMember ? "Iscritto" : "Entra"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  featuredBanner: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.warning + "55",
    borderRadius: 14,
    margin: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "space-between",
  },
  featuredBannerLeft: { flex: 1 },
  featuredLabel: { fontSize: 11, color: Colors.warning, fontFamily: "Inter_700Bold", marginBottom: 2 },
  featuredName: { fontSize: 16, color: Colors.text, fontFamily: "Inter_700Bold" },
  featuredStats: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },
  joinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  joinBtnText: { fontSize: 13, color: Colors.text, fontFamily: "Inter_600SemiBold" },
  leaveBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.border },
  leaveBtnText: { color: Colors.textSecondary },
});
