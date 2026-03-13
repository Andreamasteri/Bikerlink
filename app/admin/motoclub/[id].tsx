import React from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Platform, ScrollView,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface Member {
  membershipId: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string;
  nickname: string;
  userType: string;
  avatarUrl: string | null;
  country: string | null;
  isFake: boolean;
}

interface ClubDetail {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  isApproved: boolean;
  activityScore: number | null;
  createdAt: string;
  members: Member[];
}

function userTypeIcon(type: string) {
  if (type === "biker") return "motorcycle";
  if (type === "zavorrina") return "person";
  if (type === "couple") return "people";
  return "person";
}

function userTypeColor(type: string) {
  if (type === "biker") return Colors.accent;
  if (type === "zavorrina") return "#EC4899";
  if (type === "couple") return "#7C3AED";
  return Colors.textSecondary;
}

function countryFlag(code: string | null) {
  if (!code || code.length !== 2) return "";
  const base = 0x1F1E6;
  return String.fromCodePoint(base + code.toUpperCase().charCodeAt(0) - 65) +
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(1) - 65);
}

function AvatarCircle({ nickname, size = 44 }: { nickname: string; size?: number }) {
  const colors = [Colors.accent, "#7C3AED", "#EC4899", "#059669", "#D97706", "#2563EB"];
  const colorIdx = nickname.charCodeAt(0) % colors.length;
  return (
    <View style={[avatarStyles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors[colorIdx] }]}>
      <Text style={[avatarStyles.letter, { fontSize: size * 0.4 }]}>
        {nickname.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  letter: { color: "#fff", fontFamily: "Inter_700Bold" },
});

export default function AdminClubDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: club, isLoading, error } = useQuery<ClubDetail>({
    queryKey: [`/api/admin/motoclubs/${id}`],
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/motoclubs/${id}/members/${userId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/admin/motoclubs/${id}`] }),
    onError: () => Alert.alert("Errore", "Impossibile rimuovere il membro"),
  });

  const deleteClubMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/motoclubs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs"] });
      router.back();
    },
    onError: () => Alert.alert("Errore", "Impossibile eliminare il club"),
  });

  function handleRemoveMember(member: Member) {
    Alert.alert(
      "Rimuovi membro",
      `Rimuovere @${member.nickname} dal club?`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Rimuovi", style: "destructive", onPress: () => removeMemberMutation.mutate(member.userId) },
      ]
    );
  }

  function handleDeleteClub() {
    Alert.alert(
      "Elimina club",
      `Eliminare "${club?.name}"?\n\n${club?.members.length} ${club?.members.length === 1 ? "membro verrà rimosso" : "membri verranno rimossi"}. Operazione irreversibile.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deleteClubMutation.mutate() },
      ]
    );
  }

  function renderMember({ item }: { item: Member }) {
    return (
      <View style={styles.memberCard}>
        <AvatarCircle nickname={item.nickname} size={42} />
        <View style={styles.memberInfo}>
          <View style={styles.memberRow}>
            <Text style={styles.memberName}>@{item.nickname}</Text>
            {item.isFake && (
              <View style={[styles.roleBadge, { backgroundColor: "#6B728022" }]}>
                <Text style={[styles.roleBadgeText, { color: Colors.textSecondary }]}>🤖 fake</Text>
              </View>
            )}
            {item.role === "admin" && (
              <View style={[styles.roleBadge, { backgroundColor: Colors.accent + "22" }]}>
                <Text style={[styles.roleBadgeText, { color: Colors.accent }]}>admin</Text>
              </View>
            )}
          </View>
          <View style={styles.memberRow}>
            <Ionicons name={userTypeIcon(item.userType) as any} size={13} color={userTypeColor(item.userType)} />
            <Text style={[styles.memberSub, { color: userTypeColor(item.userType) }]}>{item.userType}</Text>
            {item.country && (
              <Text style={styles.memberSub}>{countryFlag(item.country)} {item.country}</Text>
            )}
          </View>
          <Text style={styles.memberDate}>
            Dal {new Date(item.joinedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleRemoveMember(item)}
          disabled={removeMemberMutation.isPending}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="person-remove" size={20} color={Colors.error} />
        </TouchableOpacity>
      </View>
    );
  }

  const topPad = Platform.OS === "web" ? 67 : 0;

  if (isLoading) {
    return (
      <View style={[styles.centerWrap, { paddingTop: topPad }]}>
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  if (!club || error) {
    return (
      <View style={[styles.centerWrap, { paddingTop: topPad }]}>
        <Text style={styles.errorText}>Club non trovato</Text>
      </View>
    );
  }

  const brandOrModel = [club.brandName, club.modelName].filter(Boolean).join(" ");

  return (
    <FlatList
      style={[styles.container, { paddingTop: topPad }]}
      data={club.members}
      keyExtractor={(item) => item.membershipId}
      renderItem={renderMember}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      ListHeaderComponent={
        <>
          {/* Club header card */}
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

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="people" size={20} color={Colors.accent} />
              <Text style={styles.statValue}>{club.members.length}</Text>
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

          {/* Members section title */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Membri ({club.members.length})</Text>
          </View>

          {club.members.length === 0 && (
            <View style={styles.emptyMembersWrap}>
              <Ionicons name="people-outline" size={40} color={Colors.border} />
              <Text style={styles.emptyMembersText}>Nessun membro ancora</Text>
            </View>
          )}
        </>
      }
      ListFooterComponent={
        <View style={[styles.dangerZone, { marginBottom: insets.bottom + 20 }]}>
          <Text style={styles.dangerTitle}>Zona pericolosa</Text>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDeleteClub}
            disabled={deleteClubMutation.isPending}
          >
            <MaterialIcons name="delete-forever" size={20} color="#fff" />
            <Text style={styles.deleteBtnText}>
              {deleteClubMutation.isPending ? "Eliminazione..." : "Elimina questo club"}
            </Text>
          </TouchableOpacity>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.error },
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
  sectionHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  memberName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  memberSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  memberDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  roleBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  roleBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  emptyMembersWrap: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyMembersText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  dangerZone: {
    margin: 14,
    marginTop: 24,
    padding: 16,
    backgroundColor: Colors.error + "10",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.error + "40",
  },
  dangerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.error,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.error,
    borderRadius: 12,
    paddingVertical: 14,
  },
  deleteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
