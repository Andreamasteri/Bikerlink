import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface HomeStatsRowProps {
  onlineCount: number;
  bikerCount: number;
  zavCount: number;
  onShowOnlineList: () => void;
  onShowBikerList: () => void;
  onShowZavorrinaList: () => void;
  t: (key: string) => string;
}

export const HomeStatsRow: React.FC<HomeStatsRowProps> = ({
  onlineCount,
  bikerCount,
  zavCount,
  onShowOnlineList,
  onShowBikerList,
  onShowZavorrinaList,
  t,
}) => {
  return (
    <View style={styles.statsRow}>
      <Pressable style={styles.statCard} onPress={onShowOnlineList}>
        <View style={styles.statTopRow}>
          <Ionicons name="radio-button-on" size={18} color={Colors.success} />
          <Text style={styles.statNumber}>{onlineCount}</Text>
        </View>
        <Text style={styles.statLabel}>{`${t("home.users")}\nOnline`}</Text>
      </Pressable>
      <Pressable style={styles.statCard} onPress={onShowBikerList}>
        <View style={styles.statTopRow}>
          <Ionicons name="hand-left" size={18} color={Colors.accent} />
          <Text style={styles.statNumber}>{bikerCount}</Text>
        </View>
        <Text style={styles.statLabel}>{`${t("profile.bikerType")}\n${t("home.available")}`}</Text>
      </Pressable>
      <Pressable style={styles.statCard} onPress={onShowZavorrinaList}>
        <View style={styles.statTopRow}>
          <MaterialCommunityIcons name="seat-passenger" size={18} color={Colors.femaleIcon} />
          <Text style={styles.statNumber}>{zavCount}</Text>
        </View>
        <Text style={styles.statLabel}>{`${t("profile.zavorrinaType")}\n${t("home.available")}`}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    marginLeft: 6,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "500",
    lineHeight: 14,
  },
});
