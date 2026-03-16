import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { getCurrentLocale } from "@/lib/i18n";

type Club = {
  id: string;
  name: string;
  clubType: "brand" | "model" | "custom";
  brandName?: string | null;
  modelName?: string | null;
  country?: string | null;
  region?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  isApproved: boolean;
  isFeatured: boolean;
  memberCount: number;
  activityScore: number;
  createdAt?: string;
};

type UserClub = {
  id: string;
  name: string;
  clubType: string;
  brandName?: string | null;
  modelName?: string | null;
  logoUrl?: string | null;
  country?: string | null;
  memberCount?: number;
  joinedAt?: string;
  role?: string;
  conversationId?: string | null;
};

type Invite = {
  id: string;
  status: string;
  clubId: string;
  createdAt: string;
};

type MarketplaceMoto = {
  id: string;
  brand: string;
  model: string;
  displacement?: number | null;
  motorcycleType?: string;
  saleDescription?: string | null;
  seller: {
    id: string;
    nickname: string;
    avatarUrl?: string | null;
  };
};

const COUNTRY_LABELS: Record<string, string> = {
  IT: "🇮🇹 Italia",
  DE: "🇩🇪 Germania",
  FR: "🇫🇷 Francia",
  ES: "🇪🇸 Spagna",
  AT: "🇦🇹 Austria",
  CH: "🇨🇭 Svizzera",
  PT: "🇵🇹 Portogallo",
  NL: "🇳🇱 Paesi Bassi",
  BE: "🇧🇪 Belgio",
  PL: "🇵🇱 Polonia",
};

function countryFlag(code?: string | null): string {
  if (!code) return "";
  const flag = COUNTRY_LABELS[code.toUpperCase()];
  return flag ? flag.split(" ")[0] : code.toUpperCase();
}

function ClubAvatar({ club, size = 48 }: { club: Club | UserClub; size?: number }) {
  if (club.logoUrl) {
    return (
      <View style={[styles.avatarBox, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={{ fontSize: size * 0.45 }}>{countryFlag(club.country) || "🏍️"}</Text>
      </View>
    );
  }
  const initials = (club.brandName || club.name || "?").slice(0, 2).toUpperCase();
  const colors = ["#FF6600", "#4A90D9", "#E91E8C", "#4CAF50", "#FF9800", "#9C27B0"];
  const idx = initials.charCodeAt(0) % colors.length;
  return (
    <View
      style={[
        styles.avatarBox,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors[idx] },
      ]}
    >
      <Text style={[styles.avatarInitials, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

function ClubCard({
  club,
  myClubIds,
  onJoin,
  onLeave,
  onOpenChat,
  joinedAt,
  role,
  conversationId,
}: {
  club: Club;
  myClubIds: Set<string>;
  onJoin: (id: string) => void;
  onLeave: (id: string, name: string) => void;
  onOpenChat?: (conversationId: string) => void;
  joinedAt?: string;
  role?: string;
  conversationId?: string | null;
}) {
  const isMember = myClubIds.has(club.id);

  const cardBodyContent = (
    <>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {club.name}
        </Text>
        {club.isFeatured && (
          <View style={styles.featuredPill}>
            <Text style={styles.featuredText}>⭐ Mese</Text>
          </View>
        )}
        {isMember && conversationId && (
          <Ionicons name="chatbubbles" size={14} color={Colors.accent} />
        )}
      </View>
      <Text style={styles.cardSub} numberOfLines={1}>
        {club.clubType === "brand"
          ? `Club ufficiale ${club.brandName}`
          : club.clubType === "model"
          ? `${club.brandName} ${club.modelName}`
          : "Club custom"}
        {club.country ? `  ${countryFlag(club.country)}` : ""}
      </Text>
      <View style={styles.cardStats}>
        <Ionicons name="people" size={12} color={Colors.textSecondary} />
        <Text style={styles.statText}>{club.memberCount ?? 0} membri</Text>
        {isMember && joinedAt && (
          <>
            <Text style={styles.dotSep}>·</Text>
            <Text style={styles.statText}>
              {new Date(joinedAt).toLocaleDateString(getCurrentLocale(), { month: "short", year: "numeric" })}
            </Text>
          </>
        )}
        {isMember && role === "admin" && (
          <>
            <Text style={styles.dotSep}>·</Text>
            <Text style={[styles.statText, { color: Colors.accent }]}>Admin</Text>
          </>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <ClubAvatar club={club} size={52} />
        {isMember && (
          <View style={styles.memberBadge}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          </View>
        )}
      </View>
      {isMember && conversationId && onOpenChat ? (
        <TouchableOpacity
          style={styles.cardBody}
          onPress={() => onOpenChat(conversationId)}
          activeOpacity={0.7}
        >
          {cardBodyContent}
        </TouchableOpacity>
      ) : (
        <View style={styles.cardBody}>{cardBodyContent}</View>
      )}
      <TouchableOpacity
        style={[styles.joinBtn, isMember && styles.leaveBtn]}
        onPress={() =>
          isMember ? onLeave(club.id, club.name) : onJoin(club.id)
        }
        activeOpacity={0.8}
      >
        <Text style={[styles.joinBtnText, isMember && styles.leaveBtnText]}>
          {isMember ? "Iscritto" : "Entra"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function InvitesBanner({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  if (count === 0) return null;
  return (
    <TouchableOpacity style={styles.invitesBanner} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="mail" size={18} color={Colors.accent} />
      <Text style={styles.invitesText}>
        Hai {count} invito{count > 1 ? " in attesa" : ""}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
    </TouchableOpacity>
  );
}

function FeaturedBanner({ club, myClubIds, onJoin }: { club: Club; myClubIds: Set<string>; onJoin: (id: string) => void }) {
  const isMember = myClubIds.has(club.id);
  return (
    <View style={styles.featuredBanner}>
      <View style={styles.featuredBannerLeft}>
        <Text style={styles.featuredLabel}>🏆 Club del Mese</Text>
        <Text style={styles.featuredName}>{club.name}</Text>
        <Text style={styles.featuredStats}>
          {club.memberCount} membri · {countryFlag(club.country)}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.joinBtn, isMember && styles.leaveBtn, { alignSelf: "center" }]}
        onPress={() => !isMember && onJoin(club.id)}
        activeOpacity={0.8}
      >
        <Text style={[styles.joinBtnText, isMember && styles.leaveBtnText]}>
          {isMember ? "Iscritto" : "Entra"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MotoclubScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [tab, setTab] = useState<"all" | "mine" | "market">("all");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"" | "brand" | "model" | "custom">("");
  const [filterCountry, setFilterCountry] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showInvites, setShowInvites] = useState(false);

  const clubsUrl = React.useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.append("search", search.trim());
    if (filterType) p.append("type", filterType);
    if (filterCountry) p.append("country", filterCountry);
    const qs = p.toString();
    return qs ? `/api/motoclubs?${qs}` : "/api/motoclubs";
  }, [search, filterType, filterCountry]);

  const { data: clubs = [], isLoading: loadingClubs, refetch: refetchClubs } = useQuery<Club[]>({
    queryKey: [clubsUrl],
  });

  const { data: myClubs = [], refetch: refetchMine } = useQuery<UserClub[]>({
    queryKey: ["/api/motoclubs/me/clubs"],
  });

  const { data: featured } = useQuery<Club | null>({
    queryKey: ["/api/motoclubs/featured"],
  });

  const { data: invites = [] } = useQuery<Invite[]>({
    queryKey: ["/api/motoclubs/invites"],
  });

  const { data: marketplaceData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/marketplace-enabled"],
  });
  const marketplaceEnabled = marketplaceData?.enabled !== false;

  const { data: marketplaceMotos = {}, refetch: refetchMarket } = useQuery<Record<string, MarketplaceMoto[]>>({
    queryKey: ["/api/motoclubs/marketplace-all", myClubs.map(c => c.id).join(",")],
    queryFn: async () => {
      if (!myClubs.length) return {};
      const results: Record<string, MarketplaceMoto[]> = {};
      await Promise.all(
        myClubs.map(async (club) => {
          try {
            const res = await fetch(new URL(`/api/motoclubs/${club.id}/marketplace`, getApiUrl()).toString(), { credentials: "include" });
            if (res.ok) {
              const data = await res.json();
              if (data.length > 0) results[club.id] = data;
            }
          } catch {}
        })
      );
      return results;
    },
    enabled: marketplaceEnabled && myClubs.length > 0 && tab === "market",
  });

  const pendingInvites = invites.filter((i) => i.status === "pending");

  const myClubIds = new Set(myClubs.map((c) => c.id));
  const myClubMap = new Map(myClubs.map((c) => [c.id, c]));

  const joinMut = useMutation({
    mutationFn: (clubId: string) =>
      apiRequest("POST", `/api/motoclubs/${clubId}/join`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs/me/clubs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs/featured"] });
    },
  });

  const leaveMut = useMutation({
    mutationFn: (clubId: string) =>
      apiRequest("POST", `/api/motoclubs/${clubId}/leave`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs/me/clubs"] });
    },
  });

  const respondMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "reject" }) =>
      apiRequest("PUT", `/api/motoclubs/invites/${id}/respond`, { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs/invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/motoclubs/me/clubs"] });
    },
  });

  const handleJoin = useCallback(
    (clubId: string) => {
      joinMut.mutate(clubId);
    },
    [joinMut]
  );

  const handleLeave = useCallback(
    (clubId: string, name: string) => {
      Alert.alert("Lascia Club", `Vuoi uscire da "${name}"?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Esci", style: "destructive", onPress: () => leaveMut.mutate(clubId) },
      ]);
    },
    [leaveMut]
  );

  const handleOpenChat = useCallback(
    (conversationId: string) => {
      router.push(`/chat/${conversationId}` as any);
    },
    [router]
  );

  const displayedClubs = tab === "mine"
    ? clubs.filter((c) => myClubIds.has(c.id))
    : clubs;

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  if (showInvites && pendingInvites.length > 0) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.inviteHeader}>
          <TouchableOpacity onPress={() => setShowInvites(false)}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.inviteHeaderTitle}>Inviti ai Club</Text>
        </View>
        <FlatList
          data={pendingInvites}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const club = clubs.find((c) => c.id === item.clubId);
            return (
              <View style={styles.inviteCard}>
                {club && <ClubAvatar club={club} size={44} />}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.inviteClubName}>{club?.name ?? "Club"}</Text>
                  <Text style={styles.inviteDate}>
                    {new Date(item.createdAt).toLocaleDateString(getCurrentLocale())}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => respondMut.mutate({ id: item.id, action: "accept" })}
                >
                  <Text style={styles.acceptText}>Accetta</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => respondMut.mutate({ id: item.id, action: "reject" })}
                >
                  <Text style={styles.rejectText}>Rifiuta</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.topBar}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cerca brand, modello..."
              placeholderTextColor={Colors.textSecondary}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.filterIconBtn, showFilters && styles.filterIconBtnActive]}
            onPress={() => setShowFilters((v) => !v)}
          >
            <Ionicons
              name="options"
              size={20}
              color={showFilters ? Colors.accent : Colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filterRow}>
            <ScrollFilterChip
              label="Tutti i tipi"
              selected={filterType === ""}
              onPress={() => setFilterType("")}
            />
            <ScrollFilterChip
              label="Brand"
              selected={filterType === "brand"}
              onPress={() => setFilterType("brand")}
            />
            <ScrollFilterChip
              label="Modello"
              selected={filterType === "model"}
              onPress={() => setFilterType("model")}
            />
            <ScrollFilterChip
              label="Custom"
              selected={filterType === "custom"}
              onPress={() => setFilterType("custom")}
            />
            <Text style={styles.filterSeparator}>|</Text>
            {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
              <ScrollFilterChip
                key={code}
                label={label}
                selected={filterCountry === code}
                onPress={() => setFilterCountry(filterCountry === code ? "" : code)}
              />
            ))}
          </View>
        )}

        <View style={styles.segmented}>
          <TouchableOpacity
            style={[styles.seg, tab === "all" && styles.segActive]}
            onPress={() => setTab("all")}
          >
            <Text style={[styles.segText, tab === "all" && styles.segTextActive]}>
              Tutti
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.seg, tab === "mine" && styles.segActive]}
            onPress={() => setTab("mine")}
          >
            <Text style={[styles.segText, tab === "mine" && styles.segTextActive]}>
              I Miei
            </Text>
          </TouchableOpacity>
          {marketplaceEnabled && (
            <TouchableOpacity
              style={[styles.seg, tab === "market" && styles.segActive]}
              onPress={() => setTab("market")}
            >
              <Text style={[styles.segText, tab === "market" && styles.segTextActive]}>
                Mercatino
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {tab === "market" && marketplaceEnabled ? (
        <MarketplaceTab
          myClubs={myClubs}
          marketplaceMotos={marketplaceMotos}
          onRefresh={() => { refetchMarket(); }}
          bottomInset={Platform.OS === "web" ? 34 : insets.bottom}
        />
      ) : loadingClubs ? (
        <View style={styles.loader}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={displayedClubs}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 32 + (Platform.OS === "web" ? 34 : insets.bottom) }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => { refetchClubs(); refetchMine(); }}
              tintColor={Colors.accent}
            />
          }
          ListHeaderComponent={
            <>
              <InvitesBanner
                count={pendingInvites.length}
                onPress={() => setShowInvites(true)}
              />
              {tab === "all" && featured && !search && !filterType && !filterCountry && (
                <FeaturedBanner
                  club={featured}
                  myClubIds={myClubIds}
                  onJoin={handleJoin}
                />
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>
                {tab === "mine"
                  ? "Non sei ancora iscritto a nessun club.\nCerca un brand o modello!"
                  : "Nessun club trovato."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const myData = myClubMap.get(item.id);
            return (
              <ClubCard
                club={item}
                myClubIds={myClubIds}
                onJoin={handleJoin}
                onLeave={handleLeave}
                onOpenChat={handleOpenChat}
                joinedAt={myData?.joinedAt}
                role={myData?.role}
                conversationId={myData?.conversationId}
              />
            );
          }}
        />
      )}
    </View>
  );
}

function MarketplaceTab({
  myClubs,
  marketplaceMotos,
  onRefresh,
  bottomInset,
}: {
  myClubs: UserClub[];
  marketplaceMotos: Record<string, MarketplaceMoto[]>;
  onRefresh: () => void;
  bottomInset: number;
}) {
  const router = useRouter();
  const clubsWithMotos = myClubs.filter((c) => (marketplaceMotos[c.id] || []).length > 0);
  const totalMotos = Object.values(marketplaceMotos).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <FlatList
      data={clubsWithMotos}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + bottomInset }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={Colors.accent} />}
      ListHeaderComponent={
        totalMotos > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Ionicons name="pricetag" size={18} color="#FF9800" />
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary }}>
              {totalMotos} {totalMotos === 1 ? "moto in vendita" : "moto in vendita"} nei tuoi club
            </Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="pricetag-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>
            {myClubs.length === 0
              ? "Iscriviti a un club per vedere il mercatino"
              : "Nessuna moto in vendita nei tuoi club"}
          </Text>
        </View>
      }
      renderItem={({ item: club }) => {
        const motos = marketplaceMotos[club.id] || [];
        return (
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ionicons name="shield-checkmark" size={16} color={Colors.accent} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent }}>{club.name}</Text>
            </View>
            {motos.map((moto) => (
              <TouchableOpacity
                key={moto.id}
                style={styles.marketCard}
                activeOpacity={0.7}
                onPress={() => router.push(`/profile/${moto.seller.id}`)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceLight, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="bicycle" size={20} color="#FF9800" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text }}>
                      {moto.brand} {moto.model}
                      {moto.displacement ? ` (${moto.displacement}cc)` : ""}
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 }}>
                      di {moto.seller.nickname}
                    </Text>
                    {!!moto.saleDescription && (
                      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, fontStyle: "italic", marginTop: 4 }} numberOfLines={2}>
                        {moto.saleDescription}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );
      }}
    />
  );
}

function ScrollFilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { backgroundColor: Colors.surface, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontFamily: "Inter_400Regular" },
  filterIconBtn: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  filterIconBtnActive: { borderColor: Colors.accent },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  chipTextActive: { color: Colors.text },
  filterSeparator: { color: Colors.border, alignSelf: "center", marginHorizontal: 4 },
  segmented: { flexDirection: "row", marginTop: 6, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  seg: { flex: 1, paddingVertical: 7, alignItems: "center", backgroundColor: Colors.background },
  segActive: { backgroundColor: Colors.accent },
  segText: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_600SemiBold" },
  segTextActive: { color: Colors.text },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  cardLeft: { position: "relative" },
  avatarBox: { alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceLight },
  avatarInitials: { color: Colors.text, fontFamily: "Inter_700Bold" },
  memberBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 1,
  },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 15, color: Colors.text, fontFamily: "Inter_600SemiBold", flex: 1 },
  featuredPill: {
    backgroundColor: Colors.warning + "33",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  featuredText: { fontSize: 11, color: Colors.warning, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardStats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  statText: { fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  dotSep: { color: Colors.textSecondary },
  joinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  joinBtnText: { fontSize: 13, color: Colors.text, fontFamily: "Inter_600SemiBold" },
  leaveBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.border },
  leaveBtnText: { color: Colors.textSecondary },
  featuredBanner: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.warning + "55",
    borderRadius: 14,
    margin: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "space-between",
  },
  featuredBannerLeft: { flex: 1 },
  featuredLabel: { fontSize: 11, color: Colors.warning, fontFamily: "Inter_700Bold", marginBottom: 2 },
  featuredName: { fontSize: 16, color: Colors.text, fontFamily: "Inter_700Bold" },
  featuredStats: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },
  invitesBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.accent + "22",
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
  },
  invitesText: { flex: 1, fontSize: 14, color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  inviteHeaderTitle: { fontSize: 18, color: Colors.text, fontFamily: "Inter_700Bold" },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  inviteClubName: { fontSize: 15, color: Colors.text, fontFamily: "Inter_600SemiBold" },
  inviteDate: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  acceptBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.success,
  },
  acceptText: { fontSize: 12, color: Colors.text, fontFamily: "Inter_600SemiBold" },
  rejectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rejectText: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_600SemiBold" },
  marketCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#FF9800",
  },
});
