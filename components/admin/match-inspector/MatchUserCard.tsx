import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MatchUserCardProps {
  user: {
    nickname: string;
    avatarUrl: string | null;
    userType: string;
    role: string;
  };
  gpsRouteCount: number;
  totalMatches: number;
  needsRecalculate?: boolean;
}

export const MatchUserCard: React.FC<MatchUserCardProps> = ({
  user,
  gpsRouteCount,
  totalMatches,
  needsRecalculate,
}) => {
  return (
    <View style={styles.wrapper}>
      <View style={styles.userCard}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter}>{user.nickname.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.userMeta}>
          <Text style={styles.userNickname}>{user.nickname}</Text>
          <Text style={styles.userType}>{user.userType} · {user.role}</Text>
          <Text style={styles.gpsInfo}>
            <MaterialCommunityIcons name="map-marker-path" size={12} color={Colors.textSecondary} />
            {" "}{gpsRouteCount} percorsi GPS
          </Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalNum}>{totalMatches}</Text>
          <Text style={styles.totalLabel}>match totali</Text>
        </View>
      </View>

      {needsRecalculate && (
        <View style={styles.recalcBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.warning} />
          <Text style={styles.recalcBannerText}>Nessun match — ricalcolo consigliato</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { gap: 0 },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 0,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent + "33",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.accent },
  userMeta: { flex: 1, gap: 2 },
  userNickname: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text },
  userType: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  gpsInfo: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  totalBadge: { alignItems: "center" },
  totalNum: { fontFamily: "Inter_700Bold", fontSize: 24, color: Colors.accent },
  totalLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  recalcBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.warning + "1A",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.warning + "66",
  },
  recalcBannerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.warning,
    flex: 1,
  },
});
