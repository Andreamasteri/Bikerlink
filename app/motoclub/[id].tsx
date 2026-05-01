import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,

  Modal,
  TextInput,
  Alert,
  Image,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import LeafletPickerMap from "@/components/LeafletPickerMap";
import LeafletMiniMap from "@/components/LeafletMiniMap";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import * as Location from "expo-location";
import FavoriteStar from "@/components/FavoriteStar";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";

const PAGE_SIZE = 30;
const INITIAL_VISIBLE = 5;

interface Member {
  profileId: string;
  role: string;
  joinedAt: string;
  nickname: string;
  userType: string;
  avatarUrl: string | null;
  country: string | null;
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
  conversationId: string | null;
  latitude: number | null;
  longitude: number | null;
  hasPendingLocationProposal?: boolean;
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

function countryFlag(code: string | null) {
  if (!code || code.length !== 2) return "";
  const base = 0x1F1E6;
  return (
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(0) - 65) +
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(1) - 65)
  );
}

function userTypeColor(type: string) {
  if (type === "biker") return Colors.accent;
  if (type === "zavorrina") return "#EC4899";
  if (type === "couple") return "#7C3AED";
  return Colors.textSecondary;
}

function userTypeIcon(type: string): "bicycle" | "person" | "people" {
  if (type === "biker") return "bicycle";
  if (type === "couple") return "people";
  return "person";
}

function AvatarCircle({ nickname, size = 40 }: { nickname: string; size?: number }) {
  const palette = [Colors.accent, "#7C3AED", "#EC4899", "#059669", "#D97706", "#2563EB"];
  const idx = (nickname.charCodeAt(0) || 0) % palette.length;
  return (
    <View
      style={[
        avatarStyles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette[idx] },
      ]}
    >
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
  const [proposeAddress, setProposeAddress] = useState("");
  const [proposeCoords, setProposeCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

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
    onError: (e: Error) => Alert.alert("Errore", e.message),
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
    } finally {
      setLoadingMore(false);
    }
  }

  const proposeLocationMutation = useMutation({
    mutationFn: async ({ latitude, longitude, address }: { latitude: number; longitude: number; address: string }) => {
      const res = await apiRequest("POST", `/api/motoclubs/${id}/propose-location`, { latitude, longitude, address: address || null });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || t("motoclub.proposalError"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/motoclubs/${id}/detail?limit=${PAGE_SIZE}&offset=0`] });
      setShowProposeModal(false);
      setProposeAddress("");
      setProposeCoords(null);
      Alert.alert(t("motoclub.locationProposalSent"), t("motoclub.locationProposalMsg"));
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  async function handleGetGPS() {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permesso negato", "Abilita la posizione nelle impostazioni");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setProposeCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      Alert.alert("Errore", "Impossibile ottenere la posizione GPS");
    } finally {
      setGettingLocation(false);
    }
  }

  function handleSubmitPropose() {
    if (!proposeCoords) {
      Alert.alert("Posizione mancante", "Sposta il pin sulla mappa o usa il GPS per indicare la sede.");
      return;
    }
    const { latitude: lat, longitude: lng } = proposeCoords;
    proposeLocationMutation.mutate({ latitude: lat, longitude: lng, address: proposeAddress });
  }

  const resolvedConvId = conversationId ?? club?.conversationId ?? null;
  const topPad = insets.top;

  function handleBack() {
    router.back();
  }

  function handleOpenChat() {
    if (!resolvedConvId) return;
    router.push(`/chat/${resolvedConvId}` as any);
  }

  if (isLoading || (isNotMember && isLoadingPublic)) {
    return (
      <View style={[styles.center, { paddingTop: topPad }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (isNotMember && publicClub) {
    const pubBrandOrModel = [publicClub.brandName, publicClub.modelName].filter(Boolean).join(" ");
    const clubTypeLabel =
      publicClub.clubType === "brand" ? "Marca" :
      publicClub.clubType === "model" ? "Modello" : "Custom";
    const locationLabel = [publicClub.region, publicClub.country ? countryFlag(publicClub.country) + " " + publicClub.country.toUpperCase() : null].filter(Boolean).join(" · ");
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
          <View style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              {publicClub.logoUrl ? (
                <Image source={{ uri: publicClub.logoUrl }} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="contain" />
              ) : (
                <Ionicons name="shield" size={40} color={Colors.accent} />
              )}
            </View>
            <Text style={styles.heroName}>{publicClub.name}</Text>
            {pubBrandOrModel ? <Text style={styles.heroSub}>{pubBrandOrModel}</Text> : null}
            {locationLabel ? <Text style={[styles.heroSub, { fontSize: 13, marginTop: 2 }]}>{locationLabel}</Text> : null}
            <View style={styles.heroBadges}>
              <View style={[styles.badge, { backgroundColor: Colors.accent + "22" }]}>
                <Text style={[styles.badgeText, { color: Colors.accent }]}>{clubTypeLabel}</Text>
              </View>
              {publicClub.isApproved && (
                <View style={[styles.badge, { backgroundColor: Colors.success + "22" }]}>
                  <Text style={[styles.badgeText, { color: Colors.success }]}>Approvato</Text>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.statsRow, { marginBottom: 24 }]}>
            <View style={styles.statItem}>
              <Ionicons name="people" size={20} color={Colors.accent} />
              <Text style={styles.statValue}>{publicClub.memberCount}</Text>
              <Text style={styles.statLabel}>Membri</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="flame" size={20} color="#F59E0B" />
              <Text style={styles.statValue}>{publicClub.activityScore}</Text>
              <Text style={styles.statLabel}>{t("motoclub.activity")}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.statValue}>
                {new Date(publicClub.createdAt).toLocaleDateString("it-IT", { month: "short", year: "numeric" })}
              </Text>
              <Text style={styles.statLabel}>Creato</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.joinBtn, joinMutation.isPending && { opacity: 0.6 }]}
            onPress={() => joinMutation.mutate()}
            disabled={joinMutation.isPending}
            activeOpacity={0.8}
          >
            {joinMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="person-add" size={18} color="#fff" />
                <Text style={styles.joinBtnText}>Entra nel club</Text>
              </>
            )}
          </TouchableOpacity>
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

  const brandOrModel = [club.brandName, club.modelName].filter(Boolean).join(" ");

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
            <View style={styles.heroCard}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="shield" size={40} color={Colors.accent} />
              </View>
              <Text style={styles.heroName}>{club.name}</Text>
              {brandOrModel ? (
                <Text style={styles.heroSub}>{brandOrModel}</Text>
              ) : null}
              <View style={styles.heroBadges}>
                <View style={[styles.badge, { backgroundColor: Colors.accent + "22" }]}>
                  <Text style={[styles.badgeText, { color: Colors.accent }]}>
                    {club.clubType === "brand" ? "Marca" : club.clubType === "model" ? "Modello" : "Custom"}
                  </Text>
                </View>
                {club.isApproved && (
                  <View style={[styles.badge, { backgroundColor: Colors.success + "22" }]}>
                    <Text style={[styles.badgeText, { color: Colors.success }]}>Approvato</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="people" size={20} color={Colors.accent} />
                <Text style={styles.statValue}>{totalCount}</Text>
                <Text style={styles.statLabel}>Membri</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="flame" size={20} color="#F59E0B" />
                <Text style={styles.statValue}>{club.activityScore ?? 0}</Text>
                <Text style={styles.statLabel}>{t("motoclub.activity")}</Text>
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
          <TouchableOpacity
            style={styles.memberCard}
            activeOpacity={0.7}
            onPress={() => router.push(`/profile/${item.profileId}` as any)}
          >
            <AvatarCircle nickname={item.nickname} size={42} />
            <View style={styles.memberInfo}>
              <View style={styles.memberRow}>
                <Text style={styles.memberName}>@{item.nickname}</Text>
                {item.profileId !== currentUser?.id && <FavoriteStar targetUserId={item.profileId} size={14} />}
                {item.role === "admin" && (
                  <View style={[styles.rolePill, { backgroundColor: Colors.accent + "22" }]}>
                    <Text style={[styles.rolePillText, { color: Colors.accent }]}>admin</Text>
                  </View>
                )}
              </View>
              <View style={styles.memberRow}>
                <Ionicons
                  name={userTypeIcon(item.userType)}
                  size={12}
                  color={userTypeColor(item.userType)}
                />
                <Text style={[styles.memberSub, { color: userTypeColor(item.userType) }]}>
                  {item.userType}
                </Text>
                {item.country && (
                  <Text style={styles.memberSub}>
                    {countryFlag(item.country)} {item.country}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.border} />
          </TouchableOpacity>
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
            {resolvedConvId && (
              <TouchableOpacity style={styles.chatBtn} onPress={handleOpenChat}>
                <Ionicons name="chatbubbles" size={20} color="#fff" />
                <Text style={styles.chatBtnText}>Apri chat del club</Text>
              </TouchableOpacity>
            )}

            {club.isApproved && (
              <View style={styles.locationSection}>
                {club.latitude != null ? (
                  <>
                    <View style={styles.locationRow}>
                      <MaterialCommunityIcons name="map-marker-check" size={18} color={Colors.success} />
                      <Text style={styles.locationText}>Sede confermata in mappa</Text>
                    </View>
                    <View style={{ height: 160, marginTop: 8, borderRadius: 8, overflow: "hidden" }}>
                      <LeafletMiniMap latitude={club.latitude} longitude={club.longitude!} height={160} />
                    </View>
                  </>
                ) : (
                  <View style={styles.locationRow}>
                    <MaterialCommunityIcons name="map-marker-question" size={18} color={Colors.textSecondary} />
                    <Text style={styles.locationText}>Nessuna sede fisssata</Text>
                  </View>
                )}
                {club.hasPendingLocationProposal && (
                  <View style={styles.locationRow}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color="#F59E0B" />
                    <Text style={[styles.locationText, { color: "#F59E0B" }]}>Proposta in attesa di approvazione</Text>
                  </View>
                )}
                {!club.hasPendingLocationProposal && (
                  <TouchableOpacity
                    style={styles.proposeBtn}
                    onPress={() => setShowProposeModal(true)}
                  >
                    <MaterialCommunityIcons name="map-marker-plus" size={16} color="#fff" />
                    <Text style={styles.proposeBtnText}>Proponi sede</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        }
      />

      <Modal visible={showProposeModal} transparent animationType="slide" onRequestClose={() => setShowProposeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Proponi sede fisica</Text>
            <Text style={styles.modalSub}>{t("motoclub.hqLocationHint").replace("{name}", club.name)}</Text>

            <View style={styles.mapPickerContainer}>
              <LeafletPickerMap
                initialLat={41.9}
                initialLng={12.5}
                initialZoom={5}
                selectedCoord={proposeCoords ? { lat: proposeCoords.latitude, lng: proposeCoords.longitude } : null}
                onCoordPicked={(coord) => setProposeCoords(coord)}
              />
              {!proposeCoords && (
                <View style={styles.mapPickerHint}>
                  <Text style={styles.mapPickerHintText}>Tocca sulla mappa per posizionare il pin</Text>
                </View>
              )}
              {proposeCoords && (
                <View style={styles.mapPickerCoords}>
                  <Text style={styles.mapPickerCoordsText}>
                    {proposeCoords.latitude.toFixed(5)}, {proposeCoords.longitude.toFixed(5)}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.gpsBtn} onPress={handleGetGPS} disabled={gettingLocation}>
              {gettingLocation ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="locate" size={16} color="#fff" />
                  <Text style={styles.gpsBtnText}>Usa la mia posizione GPS</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Indirizzo (opzionale)</Text>
            <TextInput
              style={[styles.coordInput, { height: 60 }]}
              value={proposeAddress}
              onChangeText={setProposeAddress}
              placeholder="Via Roma 1, Milano..."
              placeholderTextColor={Colors.textSecondary}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowProposeModal(false)}>
                <Text style={styles.modalCancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, proposeLocationMutation.isPending && { opacity: 0.6 }]}
                onPress={handleSubmitPropose}
                disabled={proposeLocationMutation.isPending}
              >
                <Text style={styles.modalSubmitBtnText}>
                  {proposeLocationMutation.isPending ? t("motoclub.sendingProposal") : t("motoclub.sendProposal")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 14,
    marginBottom: 12,
  },
  heroIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroName: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
  },
  heroSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  heroBadges: { flexDirection: "row", gap: 8, marginTop: 12 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  statsRow: {
    flexDirection: "row",
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

  sectionHeader: { paddingBottom: 10 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },

  emptyWrap: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },

  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  memberName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  memberSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  rolePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  rolePillText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },

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

  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  chatBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },

  locationSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  proposeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2979FF",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  proposeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 10,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, textAlign: "center" },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginBottom: 8 },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
  },
  gpsBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  inputLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  mapPickerContainer: {
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 4,
    position: "relative",
  },
  mapPicker: {
    flex: 1,
  },
  mapPickerHint: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
  },
  mapPickerHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#fff",
  },
  mapPickerCoords: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: "rgba(0,150,136,0.85)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
  },
  mapPickerCoordsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#fff",
  },
  coordInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  modalBtnRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalCancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  modalSubmitBtn: {
    flex: 2,
    backgroundColor: "#2979FF",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalSubmitBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
  },
  joinBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
});
