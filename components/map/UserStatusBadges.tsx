import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { formatLastSeen } from "@/components/map/userDetailUtils";

type Props = {
  userDetail: any;
};

export default function UserStatusBadges({ userDetail }: Props) {
  const t = useT();

  if (!userDetail) return null;

  return (
    <>
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: userDetail.isOnline ? "#4CAF5022" : "#66666622" },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: userDetail.isOnline ? Colors.success : "#888" },
            ]}
          />
          <Text
            style={[
              styles.statusBadgeText,
              { color: userDetail.isOnline ? Colors.success : "#888" },
            ]}
          >
            {userDetail.isOnline ? t("map.online") : t("map.offline")}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: userDetail.isAvailable ? "#4CAF5022" : "#66666622" },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: userDetail.isAvailable ? Colors.success : "#888" },
            ]}
          />
          <Text
            style={[
              styles.statusBadgeText,
              { color: userDetail.isAvailable ? Colors.success : "#888" },
            ]}
          >
            {userDetail.isAvailable ? t("home.userAvailable") : t("map.unavailable")}
          </Text>
        </View>
      </View>
      {!userDetail.isOnline && userDetail.lastLoginAt && (
        <Text style={styles.lastSeen}>
          {"Last seen: " + formatLastSeen(userDetail.lastLoginAt)}
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  lastSeen: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
});
