import React from "react";
import {
  Modal,
  Pressable,
  View,
  Text,
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { apiRequest } from "@/lib/query-client";

type Props = {
  visible: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- map user from useHomeMapState
  selectedUser: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- events from API
  myOrganizedEvents: any[];
  targetUserEventIds: string[];
};

export default function InviteEventModal({
  visible,
  onClose,
  selectedUser,
  myOrganizedEvents,
  targetUserEventIds,
}: Props) {
  const t = useT();
  const [inviteSending, setInviteSending] = React.useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.inviteSheet, { maxHeight: "70%" }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.inviteHeader, { marginBottom: 4 }]}>
            <MaterialCommunityIcons name="calendar-star" size={24} color="#F57C00" />
            <Text style={styles.inviteTitle}>{t("home.inviteToRally")}</Text>
          </View>
          <Text style={[styles.inviteDesc, { fontSize: 13, marginBottom: 8 }]}>
            {t("home.inviteModalDesc1")}{" "}
            {selectedUser?.nickname ?? t("home.fallbackUserLower")}{" "}
            {t("home.inviteModalDesc2")}
          </Text>
          <FlatList
            data={myOrganizedEvents.filter((ev) => !targetUserEventIds.includes(ev.id))}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.border,
                  gap: 10,
                  opacity: inviteSending ? 0.6 : 1,
                }}
                disabled={inviteSending}
                onPress={async () => {
                  if (!selectedUser?.id) return;
                  setInviteSending(true);
                  try {
                    const res = await apiRequest("POST", `/api/events/${item.id}/invite-user`, {
                      userId: selectedUser.id,
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API error shape
                      Alert.alert(t("common.error"), (err as any).message || t("home.inviteError"));
                    } else {
                      Alert.alert(
                        t("home.inviteSent"),
                        `${selectedUser.nickname} ${t("home.inviteBodyPart")} "${item.title}".`
                      );
                      onClose();
                    }
                  } catch {
                    Alert.alert(t("common.error"), t("home.inviteError"));
                  } finally {
                    setInviteSending(false);
                  }
                }}
              >
                <MaterialCommunityIcons name="flag-checkered" size={20} color="#F57C00" />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text }}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                    {item.eventDate
                      ? new Date(item.eventDate).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : ""}
                    {item.locationName ? `  ·  ${item.locationName}` : ""}
                  </Text>
                </View>
                {inviteSending ? (
                  <ActivityIndicator size="small" color="#F57C00" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={{ textAlign: "center", color: Colors.textSecondary, paddingVertical: 16 }}>
                {myOrganizedEvents.length === 0
                  ? t("home.noRally")
                  : `${selectedUser?.nickname ?? t("home.fallbackUser")} ${t("home.alreadyJoinedAll")}`}
              </Text>
            }
          />
          <Pressable
            style={[styles.inviteCloseBtn, { marginTop: 8 }]}
            onPress={onClose}
          >
            <Text style={styles.inviteCloseBtnText}>{t("common.cancel")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  inviteSheet: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    maxWidth: 420,
    width: "90%",
    alignSelf: "center",
  },
  inviteHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  inviteTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.text },
  inviteDesc: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 20,
  },
  inviteCloseBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  inviteCloseBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background },
});
