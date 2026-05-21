import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Alert,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

import { AdminClubHeader } from "@/components/admin/motoclub/detail/AdminClubHeader";
import {
  AdminClubMembersHeader,
  AdminClubMembersEmpty,
  AdminClubMembersFooter,
  MemberItem,
} from "@/components/admin/motoclub/detail/AdminClubMembers";
import { AdminClubActions } from "@/components/admin/motoclub/detail/AdminClubActions";
import { AdminClubSimulateModal } from "@/components/admin/motoclub/detail/AdminClubSimulateModal";

const PAGE_SIZE = 50;

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
  totalCount: number;
  hasMore: boolean;
}

export default function AdminClubDetail() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [extraMembers, setExtraMembers] = useState<Member[]>([]);
  const [nextOffset, setNextOffset] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setExtraMembers([]);
    setNextOffset(PAGE_SIZE);
  }, [id]);

  const firstPageKey = `/api/admin/motoclubs/${id}?limit=${PAGE_SIZE}&offset=0`;

  const { data: club, isLoading, error } = useQuery<ClubDetail>({
    queryKey: [firstPageKey],
  });

  const allMembers: Member[] = [...(club?.members ?? []), ...extraMembers];
  const totalCount = club?.totalCount ?? 0;
  const hasMore = allMembers.length < totalCount;

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await apiRequest("GET", `/api/admin/motoclubs/${id}?limit=${PAGE_SIZE}&offset=${nextOffset}`);
      const data = await res.json() as ClubDetail;
      setExtraMembers((prev) => [...prev, ...data.members]);
      setNextOffset((prev) => prev + PAGE_SIZE);
    } catch {
      Alert.alert("Errore", "Impossibile caricare altri membri");
    } finally {
      setLoadingMore(false);
    }
  }

  function resetPagination() {
    setExtraMembers([]);
    setNextOffset(PAGE_SIZE);
  }

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/motoclubs/${id}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [firstPageKey] });
      resetPagination();
    },
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

  const [simModalVisible, setSimModalVisible] = useState(false);
  const [simMessage, setSimMessage] = useState("");
  const [simCount, setSimCount] = useState(1);

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/motoclubs/${id}/simulate-activity`, {
        message: simMessage.trim() || undefined,
        count: simCount,
      });
      return res.json();
    },
    onSuccess: (data: { message: string; count: number }) => {
      setSimModalVisible(false);
      setSimMessage("");
      setSimCount(1);
      Alert.alert("Fatto", data.message);
    },
    onError: () => Alert.alert(t("common.error"), t("admin.cannotSimulateActivity")),
  });

  function handleRemoveMember(member: Member) {
    Alert.alert(
      t("admin.removeMember"),
      `Rimuovere @${member.nickname} dal club?`,
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("admin.remove"), style: "destructive", onPress: () => removeMemberMutation.mutate(member.userId) },
      ]
    );
  }

  function handleDeleteClub() {
    Alert.alert(
      t("admin.deleteClubTitle"),
      `Eliminare "${club?.name}"?\n\n${totalCount} ${totalCount === 1 ? t("admin.deleteMember") : t("admin.deleteMembers")}. ${t("admin.irreversible")}`,
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: () => deleteClubMutation.mutate() },
      ]
    );
  }

  const topPad = 0;

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

  const remaining = totalCount - allMembers.length;

  return (
    <>
    <FlatList
      style={[styles.container, { paddingTop: topPad }]}
      data={allMembers}
      keyExtractor={(item) => item.membershipId}
      renderItem={({ item }) => (
        <MemberItem
          item={item}
          onRemove={handleRemoveMember}
          isRemoving={removeMemberMutation.isPending}
        />
      )}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      ListHeaderComponent={
        <>
          <AdminClubHeader club={club} />

          <AdminClubMembersHeader
            totalCount={totalCount}
            loadedCount={allMembers.length}
            hasMore={hasMore}
          />

          {totalCount === 0 && <AdminClubMembersEmpty />}
        </>
      }
      ListFooterComponent={
        <View style={{ marginHorizontal: 14 }}>
          <AdminClubMembersFooter
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            remaining={remaining}
            pageSize={PAGE_SIZE}
          />

          <AdminClubActions
            onDelete={handleDeleteClub}
            onSimulateActivity={() => setSimModalVisible(true)}
            isDeleting={deleteClubMutation.isPending}
          />
          <View style={{ height: insets.bottom + 20 }} />
        </View>
      }
    />

    <AdminClubSimulateModal
      visible={simModalVisible}
      onClose={() => { setSimModalVisible(false); setSimMessage(""); setSimCount(1); }}
      onConfirm={() => simulateMutation.mutate()}
      message={simMessage}
      setMessage={setSimMessage}
      count={simCount}
      setCount={setSimCount}
      isPending={simulateMutation.isPending}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.error },
});
