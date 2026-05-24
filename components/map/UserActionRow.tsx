import React from "react";
import { View, Text, Alert, Pressable, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { apiRequest } from "@/lib/query-client";
import type { UserSummary, OrganizedEvent } from "@/components/map/userDetailTypes";

type Props = {
  selectedUser: UserSummary | null | undefined;
  myOrganizedEvents: OrganizedEvent[];
  onClose: () => void;
  onInvitePress: () => void;
};

export default function UserActionRow({
  selectedUser,
  myOrganizedEvents,
  onClose,
  onInvitePress,
}: Props) {
  const t = useT();
  const router = useRouter();

  return (
    <View style={styles.btnRow}>
      <Pressable
        style={styles.chatBtn}
        onPress={async () => {
          try {
            const res = await apiRequest("POST", "/api/chat/conversations", {
              conversationType: "private",
              participantIds: [selectedUser?.id],
            });
            const conv = await res.json();
            onClose();
            router.push(`/chat/${conv.id}` as never);
          } catch (e: unknown) {
            Alert.alert(t("common.error"), (e as Error).message || t("home.cannotOpenChat"));
          }
        }}
      >
        <Ionicons name="chatbubble" size={20} color={Colors.background} />
        <Text style={styles.chatBtnText}>Messaggio</Text>
      </Pressable>
      {myOrganizedEvents.length > 0 && (
        <Pressable
          style={[styles.profileBtn, { backgroundColor: "#F57C00" }]}
          onPress={onInvitePress}
        >
          <MaterialCommunityIcons name="calendar-star" size={16} color="#fff" />
          <Text style={[styles.profileBtnText, { color: "#fff" }]}>{t("home.inviteBtn")}</Text>
        </Pressable>
      )}
      <Pressable
        style={styles.profileBtn}
        onPress={() => { onClose(); router.push(`/profile/${selectedUser?.id}` as never); }}
      >
        <Text style={styles.profileBtnText}>{t("home.goToProfile")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  btnRow: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 8 },
  chatBtn: {
    flex: 1, backgroundColor: Colors.accent, padding: 14, borderRadius: 12,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6,
  },
  chatBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background },
  profileBtn: {
    flex: 1, backgroundColor: Colors.surface, padding: 14, borderRadius: 12,
    alignItems: "center", borderWidth: 1, borderColor: Colors.border,
  },
  profileBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
});
