import React from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  Alert,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import {
  formatLastSeen,
  getUserColor,
  getUserIcon,
  getUserTypeLabel,
} from "@/components/map/userDetailUtils";

type Props = {
  selectedUser: any;
  selectedUserDetail: any;
  selectedUserProposals: any[];
  detailLoading: boolean;
  onClose: () => void;
  onPhotoPress: (uri: string) => void;
  myOrganizedEvents: any[];
  onInvitePress: () => void;
};

export default function UserDetailContent({
  selectedUser,
  selectedUserDetail,
  selectedUserProposals,
  detailLoading,
  onClose,
  onPhotoPress,
  myOrganizedEvents,
  onInvitePress,
}: Props) {
  const t = useT();
  const router = useRouter();
  const baseUrl = getApiUrl();

  return (
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
                {selectedUserDetail.topArtistName ? ` — ${selectedUserDetail.topArtistName}` : ""}
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
              const pUri = p.photoUrl?.startsWith("http") ? p.photoUrl : `${baseUrl}${p.photoUrl}`;
              return (
                <TouchableOpacity key={p.id} onPress={() => onPhotoPress(pUri)} activeOpacity={0.8}>
                  <Image source={{ uri: pUri }} style={{ width: 80, height: 80, borderRadius: 10, marginRight: 8 }} />
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
                {m.brand} {m.model}{m.motorcycleType ? ` · ${m.motorcycleType}` : ""}
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
              onPress={() => { onClose(); router.push(`/proposals/${p.id}` as any); }}
            >
              <Ionicons name="navigate" size={16} color={Colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.proposalTitle}>{p.title}</Text>
                {p.location && <Text style={styles.proposalSub}>{p.location}</Text>}
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
            onPress={onInvitePress}
          >
            <MaterialCommunityIcons name="calendar-star" size={16} color="#fff" />
            <Text style={[styles.profileBtnText, { color: "#fff" }]}>{t("home.inviteBtn")}</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.profileBtn}
          onPress={() => { onClose(); router.push(`/profile/${selectedUser?.id}` as any); }}
        >
          <Text style={styles.profileBtnText}>{t("home.goToProfile")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  name: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  type: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  lastSeen: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 12 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  infoCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.background, padding: 10, borderRadius: 8, marginBottom: 6,
  },
  infoCardText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  proposalCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.background, padding: 10, borderRadius: 8, marginBottom: 6,
  },
  proposalTitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  proposalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
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
