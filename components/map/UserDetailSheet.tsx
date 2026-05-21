import React from "react";
import {
  Modal,
  Pressable,
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import FavoriteStar from "@/components/FavoriteStar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatLastSeen(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mo}/'${yy} - ${hh}.${mm}`;
}

function getUserColor(u: any) {
  if (u?.userType === "coppia") return Colors.accent;
  if (u?.sex === "F") return Colors.femaleIcon;
  if (u?.sex === "M") return Colors.maleIcon;
  if (u?.userType?.startsWith("zavorrina")) return Colors.femaleIcon;
  if (u?.userType?.startsWith("biker")) return Colors.maleIcon;
  return Colors.accent;
}

function getUserIcon(u: any): "people" | "person" | "bicycle" {
  if (u?.userType === "coppia") return "people";
  if (u?.userType?.startsWith("zavorrina")) return "person";
  return "bicycle";
}

function getUserTypeLabel(u: any, t: (k: string) => string) {
  if (u?.userType?.startsWith("biker")) return t("profile.bikerType");
  if (u?.userType?.startsWith("zavorrina")) return t("profile.zavorrinaType");
  return t("profile.coupleType");
}

type Props = {
  selectedUser: any;
  selectedUserDetail: any;
  selectedUserProposals: any[];
  detailLoading: boolean;
  onClose: () => void;
  onPhotoPress: (uri: string) => void;
  myOrganizedEvents: any[];
  targetUserEventIds: string[];
  currentUserId: string | null | undefined;
};

export default function UserDetailSheet({
  selectedUser,
  selectedUserDetail,
  selectedUserProposals,
  detailLoading,
  onClose,
  onPhotoPress,
  myOrganizedEvents,
  targetUserEventIds,
  currentUserId,
}: Props) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const baseUrl = getApiUrl();
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [inviteSending, setInviteSending] = React.useState(false);

  return (
    <>
      <Modal
        visible={!!selectedUser}
        transparent
        animationType="slide"
        onRequestClose={() => { onClose(); setShowInviteModal(false); }}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom || 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            {detailLoading ? (
              <ActivityIndicator size="large" color={Colors.accent} style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                <View style={styles.header}>
                  <Ionicons
                    name={getUserIcon(selectedUser)}
                    size={32}
                    color={getUserColor(selectedUser)}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{selectedUser?.nickname}</Text>
                    <Text style={styles.type}>{getUserTypeLabel(selectedUser, t)}</Text>
                    {(selectedUser?.country || selectedUser?.region) && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                        <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
                        <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular" }}>
                          {[
                            selectedUser?.region || null,
                            selectedUser?.country
                              ? `${getCountryFlag(selectedUser.country)} ${getCountryName(selectedUser.country)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </Text>
                      </View>
                    )}
                    {selectedUserDetail && (
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: selectedUserDetail.isOnline ? "#4CAF5022" : "#66666622" },
                          ]}
                        >
                          <View
                            style={[
                              styles.statusDot,
                              { backgroundColor: selectedUserDetail.isOnline ? Colors.success : "#888" },
                            ]}
                          />
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: selectedUserDetail.isOnline ? Colors.success : "#888" },
                            ]}
                          >
                            {selectedUserDetail.isOnline ? t("map.online") : t("map.offline")}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: selectedUserDetail.isAvailable ? "#4CAF5022" : "#66666622" },
                          ]}
                        >
                          <View
                            style={[
                              styles.statusDot,
                              { backgroundColor: selectedUserDetail.isAvailable ? Colors.success : "#888" },
                            ]}
                          />
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: selectedUserDetail.isAvailable ? Colors.success : "#888" },
                            ]}
                          >
                            {selectedUserDetail.isAvailable ? t("home.userAvailable") : t("map.unavailable")}
                          </Text>
                        </View>
                      </View>
                    )}
                    {selectedUserDetail && !selectedUserDetail.isOnline && selectedUserDetail.lastLoginAt && (
                      <Text style={styles.lastSeen}>
                        {"Last seen: " + formatLastSeen(selectedUserDetail.lastLoginAt)}
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={onClose}>
                    <Ionicons name="close" size={24} color={Colors.textSecondary} />
                  </Pressable>
                </View>

                {selectedUserDetail?.bio && (
                  <Text style={styles.bio}>{selectedUserDetail.bio}</Text>
                )}

                {(selectedUserDetail?.primaryClubName || selectedUserDetail?.topTrackName) && (
                  <View style={styles.section}>
                    {selectedUserDetail?.primaryClubName && (
                      <Pressable
                        style={styles.infoCard}
                        onPress={() => {
                          onClose();
                          router.push({
                            pathname: "/motoclub/[id]" as const,
                            params: { id: selectedUserDetail.primaryClubId },
                          });
                        }}
                      >
                        <MaterialCommunityIcons name="shield-star" size={16} color="#2979FF" />
                        <Text style={[styles.infoCardText, { color: "#2979FF" }]}>
                          {selectedUserDetail.primaryClubName}
                        </Text>
                      </Pressable>
                    )}
                    {selectedUserDetail?.topTrackName && (
                      <View style={styles.infoCard}>
                        <MaterialCommunityIcons name="music-note" size={16} color={Colors.accent} />
                        <Text style={styles.infoCardText} numberOfLines={1}>
                          {selectedUserDetail.topTrackName}
                          {selectedUserDetail.topArtistName
                            ? ` — ${selectedUserDetail.topArtistName}`
                            : ""}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {selectedUserDetail?.photos && selectedUserDetail.photos.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Foto</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {selectedUserDetail.photos.map((p: any) => {
                        const pUri = p.photoUrl?.startsWith("http")
                          ? p.photoUrl
                          : `${baseUrl}${p.photoUrl}`;
                        return (
                          <TouchableOpacity
                            key={p.id}
                            onPress={() => onPhotoPress(pUri)}
                            activeOpacity={0.8}
                          >
                            <Image
                              source={{ uri: pUri }}
                              style={{ width: 80, height: 80, borderRadius: 10, marginRight: 8 }}
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {selectedUserDetail?.motorcycles && selectedUserDetail.motorcycles.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t("home.garage")}</Text>
                    {selectedUserDetail.motorcycles.map((m: any) => (
                      <View key={m.id} style={styles.infoCard}>
                        <Ionicons name="bicycle" size={18} color={Colors.accent} />
                        <Text style={styles.infoCardText}>
                          {m.brand} {m.model}
                          {m.motorcycleType ? ` · ${m.motorcycleType}` : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {selectedUserProposals.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t("home.rideProposals")}</Text>
                    {selectedUserProposals.map((p: any) => (
                      <Pressable
                        key={p.id}
                        style={styles.proposalCard}
                        onPress={() => {
                          onClose();
                          router.push(`/proposals/${p.id}` as any);
                        }}
                      >
                        <Ionicons name="navigate" size={16} color={Colors.accent} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.proposalTitle}>{p.title}</Text>
                          {p.location && (
                            <Text style={styles.proposalSub}>{p.location}</Text>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                      </Pressable>
                    ))}
                  </View>
                )}

                {selectedUserProposals.length === 0 && !detailLoading && (
                  <View style={{ alignItems: "center", paddingVertical: 12 }}>
                    <Text style={styles.type}>{t("home.noActiveProposals")}</Text>
                  </View>
                )}

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
                        router.push(`/chat/${conv.id}` as any);
                      } catch (e: any) {
                        Alert.alert(t("common.error"), e.message || t("home.cannotOpenChat"));
                      }
                    }}
                  >
                    <Ionicons name="chatbubble" size={20} color={Colors.background} />
                    <Text style={styles.chatBtnText}>Messaggio</Text>
                  </Pressable>
                  {myOrganizedEvents.length > 0 && (
                    <Pressable
                      style={[styles.profileBtn, { backgroundColor: "#F57C00" }]}
                      onPress={() => setShowInviteModal(true)}
                    >
                      <MaterialCommunityIcons name="calendar-star" size={16} color="#fff" />
                      <Text style={[styles.profileBtnText, { color: "#fff" }]}>{t("home.inviteBtn")}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.profileBtn}
                    onPress={() => {
                      onClose();
                      router.push(`/profile/${selectedUser?.id}` as any);
                    }}
                  >
                    <Text style={styles.profileBtnText}>{t("home.goToProfile")}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showInviteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowInviteModal(false)}>
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
                        Alert.alert(t("common.error"), (err as any).message || t("home.inviteError"));
                      } else {
                        Alert.alert(
                          t("home.inviteSent"),
                          `${selectedUser.nickname} ${t("home.inviteBodyPart")} "${item.title}".`
                        );
                        setShowInviteModal(false);
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
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text }} numberOfLines={1}>
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
              onPress={() => setShowInviteModal(false)}
            >
              <Text style={styles.inviteCloseBtnText}>{t("common.cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  name: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  type: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  lastSeen: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 12 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  infoCardText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  proposalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  proposalTitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  proposalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 8 },
  chatBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  chatBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background },
  profileBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
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
