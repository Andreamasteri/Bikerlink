import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList,
  Alert, 
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

// Extracted components
import { AdminMotoClubStats } from "@/components/admin/motoclubs/AdminMotoClubStats";
import { AdminMotoClubFilters } from "@/components/admin/motoclubs/AdminMotoClubFilters";
import { AdminMotoClubCard } from "@/components/admin/motoclubs/AdminMotoClubCard";
import { 
  AdminMotoClubRequestCard, 
  AdminMotoClubUserCreationCard, 
  AdminMotoClubLocationCard, 
  AdminMotoClubRejectModal,
  ClubRequest,
  PendingLocation
} from "@/components/admin/motoclubs/AdminMotoClubApproval";

interface Club {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  isApproved: boolean;
  memberCount: number;
  activityScore: number | null;
  createdAt: string;
}

export default function AdminMotoclubs() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<"requests" | "clubs" | "user_creation" | "sedi">("requests");
  const [search, setSearch] = useState("");
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showAllRequests, setShowAllRequests] = useState(false);

  const { data: requests = [], isLoading: loadingReqs } = useQuery<ClubRequest[]>({
    queryKey: ["/api/admin/motoclubs/requests"]
  });

  const { data: clubs = [], isLoading: loadingClubs } = useQuery<Club[]>({
    queryKey: ["/api/admin/motoclubs"]
  });

  const { data: pendingLocations = [], isLoading: loadingLocations } = useQuery<PendingLocation[]>({
    queryKey: ["/api/motoclubs/map/pending-locations"],
    enabled: tab === "sedi"
  });

  const approveLocationMutation = useMutation({
    mutationFn: async (clubId: string) => {
      const res = await apiRequest("POST", `/api/motoclubs/${clubId}/approve-location`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs/map/pending-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs/map"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile approvare la sede")
  });

  const rejectLocationMutation = useMutation({
    mutationFn: async (clubId: string) => {
      const res = await apiRequest("POST", `/api/motoclubs/${clubId}/reject-location`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs/map/pending-locations"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile rifiutare la sede")
  });

  const systemRequests = useMemo(() => requests.filter((r) => !r.requestedBy), [requests]);
  const userCreationRequests = useMemo(() => requests.filter((r) => !!r.requestedBy && r.clubType === "custom"), [requests]);

  const pendingCount = systemRequests.filter((r) => r.status === "pending").length;
  const userPendingCount = userCreationRequests.filter((r) => r.status === "pending").length;
  const totalMembers = clubs.reduce((sum, c) => sum + c.memberCount, 0);

  const displayedRequests = useMemo(() => {
    let list = showAllRequests ? systemRequests : systemRequests.filter((r) => r.status === "pending");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.brandName?.toLowerCase().includes(q) || r.modelName?.toLowerCase().includes(q));
    }
    return list;
  }, [systemRequests, search, showAllRequests]);

  const displayedUserCreation = useMemo(() => {
    let list = showAllRequests ? userCreationRequests : userCreationRequests.filter((r) => r.status === "pending");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    return list;
  }, [userCreationRequests, search, showAllRequests]);

  const displayedClubs = useMemo(() => {
    if (!search.trim()) return clubs;
    const q = search.toLowerCase();
    return clubs.filter((c) => c.name.toLowerCase().includes(q) || c.brandName?.toLowerCase().includes(q) || c.modelName?.toLowerCase().includes(q));
  }, [clubs, search]);

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/motoclubs/requests/${id}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile approvare la richiesta")
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/admin/motoclubs/requests/${id}/reject`, { note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs/requests"] });
      setRejectModal(null);
      setRejectNote("");
    },
    onError: () => Alert.alert("Errore", "Impossibile rifiutare la richiesta")
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/motoclubs/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs"] }),
    onError: () => Alert.alert("Errore", "Impossibile eliminare il club")
  });

  function handleApprove(req: ClubRequest) {
    Alert.alert(t("admin.approveClub"), `Approvare "${req.name}"?\n\nVerrà creato un nuovo club e una chat di gruppo dedicata.`, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("admin.approve"), onPress: () => approveMutation.mutate(req.id) },
    ]);
  }

  function handleDelete(club: Club) {
    Alert.alert(
      t("admin.deleteClubTitle"),
      club.memberCount === 1 ? t("admin.deleteClubConfirmSingle").replace("{name}", club.name).replace("{count}", "1") : t("admin.deleteClubConfirmMulti").replace("{name}", club.name).replace("{count}", String(club.memberCount)),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: () => deleteMutation.mutate(club.id) },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <AdminMotoClubStats 
        clubsCount={clubs.length}
        pendingCount={pendingCount}
        totalMembers={totalMembers}
      />

      <AdminMotoClubFilters 
        search={search}
        onSearchChange={setSearch}
        tab={tab}
        onTabChange={setTab}
        pendingCount={pendingCount}
        userPendingCount={userPendingCount}
        clubsCount={clubs.length}
        pendingLocationsCount={pendingLocations.length}
        showAllRequests={showAllRequests}
        onToggleShowAll={() => setShowAllRequests(v => !v)}
      />

      <FlatList
        key={tab}
        data={(
          tab === "requests" ? displayedRequests
          : tab === "user_creation" ? displayedUserCreation
          : tab === "sedi" ? pendingLocations
          : displayedClubs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- data from multiple query shapes
        ) as any[]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          if (tab === "requests") {
            return (
              <AdminMotoClubRequestCard 
                item={item as ClubRequest}
                onApprove={handleApprove}
                onReject={(req) => { setRejectNote(""); setRejectModal({ id: req.id, name: req.name }); }}
                isApproving={approveMutation.isPending}
              />
            );
          }
          if (tab === "user_creation") {
            return (
              <AdminMotoClubUserCreationCard 
                item={item as ClubRequest}
                onApprove={handleApprove}
                onReject={(req) => { setRejectNote(""); setRejectModal({ id: req.id, name: req.name }); }}
                isApproving={approveMutation.isPending}
              />
            );
          }
          if (tab === "sedi") {
            return (
              <AdminMotoClubLocationCard 
                item={item as PendingLocation}
                onApprove={(loc) => Alert.alert("Approva sede", `Approvare la sede proposta per "${loc.name}"?`, [
                  { text: t("common.cancel"), style: "cancel" },
                  { text: t("admin.approve"), onPress: () => approveLocationMutation.mutate(loc.id) },
                ])}
                onReject={(loc) => Alert.alert(t("admin.rejectLocation"), `Rifiutare la sede proposta per "${loc.name}"?`, [
                  { text: t("common.cancel"), style: "cancel" },
                  { text: t("admin.reject"), style: "destructive", onPress: () => rejectLocationMutation.mutate(loc.id) },
                ])}
                isApproving={approveLocationMutation.isPending}
                isRejecting={rejectLocationMutation.isPending}
              />
            );
          }
          return (
            <AdminMotoClubCard 
              club={item as Club}
              onPress={() => router.push(`/admin/motoclub/${item.id}` as never)}
              onDelete={() => handleDelete(item as Club)}
            />
          );
        }}
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="shield-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>
              {(tab === "requests" || tab === "user_creation" ? loadingReqs : tab === "sedi" ? loadingLocations : loadingClubs)
                ? t("admin.loading2")
                : tab === "requests"
                ? t("admin.noRequest")
                : tab === "user_creation"
                ? t("admin.noUserRequest")
                : tab === "sedi"
                ? t("admin.noPendingProposals")
                : t("admin.noActiveClubs")}
            </Text>
          </View>
        }
      />

      <AdminMotoClubRejectModal 
        rejectModal={rejectModal}
        onClose={() => setRejectModal(null)}
        rejectNote={rejectNote}
        onRejectNoteChange={setRejectNote}
        onConfirm={() => rejectMutation.mutate({ id: rejectModal!.id, note: rejectNote })}
        isRejecting={rejectMutation.isPending}
        insetsBottom={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary }
});
