import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";

import { ClubHeader } from "@/components/motoclub/detail/ClubHeader";
import { Member, MemberCard } from "@/components/motoclub/detail/ClubMembersList";
import { ClubActions } from "@/components/motoclub/detail/ClubActions";
import { ClubLocationSection } from "@/components/motoclub/detail/ClubLocationSection";
import { ProposeLocationModal } from "@/components/motoclub/detail/ProposeLocationModal";

const PAGE_SIZE = 30;
const INITIAL_VISIBLE = 5;

interface ClubDetail {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  isApproved: boolean;
  activityScore: number | null;
  createdAt: string;
  conversationId: string | null;
  latitude: number | null;
  longitude: number | null;
  hasPendingLocationProposal?: boolean;
  allowZavorrine: boolean;
  members: Member[];
  totalCount: number;
  hasMore: boolean;
}

interface PublicClubInfo {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  region: string | null;
  country: string | null;
  logoUrl: string | null;
  isApproved: boolean;
  memberCount: number;
  activityScore: number;
  createdAt: string;
}

export default function ClubDetailScreen() {
  const t = useT();
  const { id, conversationId: convParam } = useLocalSearchParams<{ id: string; conversationId?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: currentUser } = useAuth();

  const conversationId = convParam ?? null;

  const [expanded, setExpanded] = useState(false);
  const [extraMembers, setExtraMembers] = useState<Member[]>([]);
  const [nextOffset, setNextOffset] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showProposeModal, setShowProposeModal] = useState(false);

  useEffect(() => {
    setExpanded(false);
    setExtraMembers([]);
    setNextOffset(PAGE_SIZE);
  }, [id]);

  const queryKey = `/api/motoclubs/${id}/detail?limit=${PAGE_SIZE}&offset=0`;

  const { data: club, isLoading, error } = useQuery<ClubDetail>({
    queryKey: [queryKey],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(new URL(queryKey, getApiUrl()).toString(), { credentials: "include" });
      if (res.status === 403) {
        const e = new Error("Non sei membro di questo club") as Error & { status: number };
        e.status = 403;
        throw e;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || `${res.status}`);
      }
      return res.json() as Promise<ClubDetail>;
    },
  });

  const isNotMember = (error as (Error & { status?: number }) | null)?.status === 403;

  const { data: publicClub, isLoading: isLoadingPublic } = useQuery<PublicClubInfo>({
    queryKey: [`/api/motoclubs/${id}/public`],
    enabled: !!id && isNotMember,
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/motoclubs/${id}/join`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      queryClient.invalidateQueries({ queryKey: [`/api/motoclubs/${id}/public`] });
      Alert.alert("Benvenuto!", "Sei entrato nel club con successo.");
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const allMembers: Member[] = [...(club?.members ?? []), ...extraMembers];
  const totalCount = club?.totalCount ?? 0;
  const hasMorePages = allMembers.length < totalCount;

  const visibleMembers = expanded ? allMembers : allMembers.slice(0, INITIAL_VISIBLE);
  const hiddenCount = totalCount - INITIAL_VISIBLE;

  async function loadMorePages() {
    if (loadingMore || !hasMorePages) return;
    setLoadingMore(true);
    try {
      const res = await apiRequest("GET", `/api/motoclubs/${id}/detail?limit=${PAGE_SIZE}&offset=${nextOffset}`);
      const data = (await res.json()) as ClubDetail;
      setExtraMembers((prev) => [...prev, ...data.members]);
      setNextOffset((prev) => prev + PAGE_SIZE);
    } catch {
      // no-op: silent failure for loading more members
    } finally {
      setLoadingMore(false);
    }
  }

  const myRole = club?.members?.find((m) => m.profileId === currentUser?.id)?.role ?? null;
  const isClubAdmin = myRole === "admin";

  const settingsMutation = useMutation({
    mutationFn: async (allowZavorrine: boolean) => {
      const res = await apiRequest("PATCH", `/api/motoclubs/${id}/settings`, { allowZavorrine });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Errore aggiornamento impostazioni");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const proposeLocationMutation = useMutation({
    mutationFn: async ({ latitude, longitude, address }: { latitude: number; longitude: number; address: string }) => {
      const res = await apiRequest("POST", `/api/motoclubs/${id}/propose-location`, { latitude, longitude, address: address || null });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API error response shape
        throw new Error((err as any).message || t("motoclub.proposalError"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/motoclubs/${id}/detail?limit=${PAGE_SIZE}&offset=0`] });
      setShowProposeModal(false);
      Alert.alert(t("motoclub.locationProposalSent"), t("motoclub.locationProposalMsg"));
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  function handleSubmitPropose(coords: { latitude: number; longitude: number }, address: string) {
    proposeLocationMutation.mutate({ latitude: coords.latitude, longitude: coords.longitude, address });
  }

  const resolvedConvId = conversationId ?? club?.conversationId ?? null;
  const topPad = insets.top;

  function handleBack() {
    router.back();
  }

  function handleOpenChat() {
    if (!resolvedConvId) return;
    router.push(`/chat/${resolvedConvId}` as never);
  }

  if (isLoading || (isNotMember && isLoadingPublic)) {
    return (
      <View style={[styles.center, { paddingTop: topPad }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (isNotMember && publicClub) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>{publicClub.name}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <ClubHeader
            name={publicClub.name}
            logoUrl={publicClub.logoUrl}
            brandName={publicClub.brandName}
            modelName={publicClub.modelName}
            clubType={publicClub.clubType}
            isApproved={publicClub.isApproved}
            memberCount={publicClub.memberCount}
            activityScore={publicClub.activityScore}
            createdAt={publicClub.createdAt}
            region={publicClub.region}
            country={publicClub.country}
          />

          <ClubActions
            isMember={false}
            isJoining={joinMutation.isPending}
            onJoin={() => joinMutation.mutate()}
            onOpenChat={handleOpenChat}
            hasChat={!!resolvedConvId}
          />
        </View>
      </View>
    );
  }

  if (!club || error) {
    return (
      <View style={[styles.center, { paddingTop: topPad }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.border} />
        <Text style={styles.errorText}>Club non trovato</Text>
        <TouchableOpacity onPress={handleBack} style={styles.backFallbackBtn}>
          <Text style={styles.backFallbackText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{club.name}</Text>
        {resolvedConvId ? (
          <TouchableOpacity onPress={handleOpenChat} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chatbubbles" size={24} color={Colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <FlatList
        data={visibleMembers}
        keyExtractor={(item) => item.profileId}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 100 }}
        ListHeaderComponent={
          <>
            <ClubHeader
              name={club.name}
              logoUrl={null}
              brandName={club.brandName}
              modelName={club.modelName}
              clubType={club.clubType}
              isApproved={club.isApproved}
              memberCount={totalCount}
              activityScore={club.activityScore ?? 0}
              createdAt={club.createdAt}
            />

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Membri ({totalCount})</Text>
            </View>

            {totalCount === 0 && (
              <View style={styles.emptyWrap}>
                <Ionicons name="people-outline" size={40} color={Colors.border} />
                <Text style={styles.emptyText}>Nessun membro ancora</Text>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <MemberCard item={item} currentUserId={currentUser?.id} />
        )}
        ListFooterComponent={
          <View style={{ marginTop: 4 }}>
            {!expanded && totalCount > INITIAL_VISIBLE && (
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => setExpanded(true)}
              >
                <Ionicons name="chevron-down" size={16} color={Colors.accent} />
                <Text style={styles.toggleBtnText}>
                  Mostra tutti {hiddenCount > 0 ? `(+${hiddenCount})` : ""}
                </Text>
              </TouchableOpacity>
            )}
            {expanded && (
              <>
                {hasMorePages && (
                  <TouchableOpacity
                    style={[styles.toggleBtn, loadingMore && { opacity: 0.6 }]}
                    onPress={loadMorePages}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : (
                      <>
                        <Ionicons name="chevron-down" size={16} color={Colors.accent} />
                        <Text style={styles.toggleBtnText}>
                          Carica altri {Math.min(totalCount - allMembers.length, PAGE_SIZE)}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.toggleBtn, { borderColor: Colors.border }]}
                  onPress={() => setExpanded(false)}
                >
                  <Ionicons name="chevron-up" size={16} color={Colors.textSecondary} />
                  <Text style={[styles.toggleBtnText, { color: Colors.textSecondary }]}>
                    Mostra meno
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <ClubActions
              isMember={true}
              isJoining={false}
              onJoin={() => {}}
              onOpenChat={handleOpenChat}
              hasChat={!!resolvedConvId}
            />

            {club.isApproved && (
              <ClubLocationSection
                latitude={club.latitude}
                longitude={club.longitude}
                hasPendingProposal={!!club.hasPendingLocationProposal}
                onPropose={() => setShowProposeModal(true)}
              />
            )}

            {isClubAdmin && (
              <View style={styles.adminSection}>
                <Text style={styles.adminSectionTitle}>Impostazioni club</Text>
                <View style={styles.adminToggleRow}>
                  <View style={styles.adminToggleInfo}>
                    <Ionicons name="people-outline" size={18} color={Colors.textSecondary} />
                    <View style={styles.adminToggleText}>
                      <Text style={styles.adminToggleLabel}>Accetta zavorrine</Text>
                      <Text style={styles.adminToggleDesc}>Le zavorrine possono vedere e unirsi al club</Text>
                    </View>
                  </View>
                  <Switch
                    value={club.allowZavorrine}
                    onValueChange={(v) => settingsMutation.mutate(v)}
                    disabled={settingsMutation.isPending}
                    trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
                    thumbColor={club.allowZavorrine ? Colors.accent : Colors.textSecondary}
                  />
                </View>
              </View>
            )}
          </View>
        }
      />

      <ProposeLocationModal
        visible={showProposeModal}
        onClose={() => setShowProposeModal(false)}
        onSubmit={handleSubmitPropose}
        isPending={proposeLocationMutation.isPending}
        clubName={club.name}
        hintText={t("motoclub.hqLocationHint")}
        sendingText={t("motoclub.sendingProposal")}
        sendText={t("motoclub.sendProposal")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  backFallbackBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
  },
  backFallbackText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },

  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  navTitle: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center",
    marginHorizontal: 8,
  },
  sectionHeader: { paddingBottom: 10 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },

  emptyWrap: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },

  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
    marginBottom: 10,
  },
  toggleBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.accent },

  adminSection: {
    marginTop: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  adminSectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  adminToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  adminToggleInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  adminToggleText: { flex: 1 },
  adminToggleLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  adminToggleDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
