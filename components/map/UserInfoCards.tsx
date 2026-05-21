import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import type { UserDetail } from "@/components/map/userDetailTypes";

type Props = {
  userDetail: UserDetail | null | undefined;
  onClose: () => void;
};

export default function UserInfoCards({ userDetail, onClose }: Props) {
  const router = useRouter();

  if (!userDetail?.primaryClubName && !userDetail?.topTrackName) return null;

  return (
    <View style={styles.section}>
      {userDetail.primaryClubName && (
        <Pressable
          style={styles.infoCard}
          onPress={() => {
            onClose();
            router.push({
              pathname: "/motoclub/[id]" as const,
              params: { id: userDetail.primaryClubId },
            });
          }}
        >
          <MaterialCommunityIcons name="shield-star" size={16} color="#2979FF" />
          <Text style={[styles.infoCardText, { color: "#2979FF" }]}>
            {userDetail.primaryClubName}
          </Text>
        </Pressable>
      )}
      {userDetail.topTrackName && (
        <View style={styles.infoCard}>
          <MaterialCommunityIcons name="music-note" size={16} color={Colors.accent} />
          <Text style={styles.infoCardText} numberOfLines={1}>
            {userDetail.topTrackName}
            {userDetail.topArtistName ? ` — ${userDetail.topArtistName}` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 12 },
  infoCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.background, padding: 10, borderRadius: 8, marginBottom: 6,
  },
  infoCardText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
});
