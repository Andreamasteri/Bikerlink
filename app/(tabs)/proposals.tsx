import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT, useLocale } from "@/lib/language-context";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import TrackingScreen from "@/app/(tabs)/tracking";
import RoutesScreen from "@/app/routes/index";
import GiriScreen from "@/app/(tabs)/giri";
import {
  MountAxisCalibration,
  MountCalibWizard,
  loadMountCalibration
} from "@/components/MountCalibWizard";
import { CalibrationBanner } from "@/components/CalibrationBanner";

interface ProposalItem {
  id: string;
  userId: string;
  proposalType: string;
  searchType?: string | null;
  title: string;
  description: string | null;
  departureAddress: string | null;
  departureLatitude: number | null;
  departureLongitude: number | null;
  scheduledAt: string | null;
  departureTimeFrom: string | null;
  departureTimeTo: string | null;
  searchRadius: number | null;
  maxParticipants: number | null;
  status: string;
  createdAt: string;
  creatorNickname: string;
  creatorUserType: string;
  participantCount: number;
  motoInfo?: { brand: string; model: string; motorcycleType: string; ridingStyle: string } | null;
}

const FILTER_KEYS = [
  { key: "all", i18nKey: "proposals.filter.all" },
  { key: "giro", i18nKey: "proposals.filter.bikers" },
  { key: "con_zavorrina", i18nKey: "proposals.filter.passenger" },
  { key: "passaggio_al_volo", i18nKey: "proposals.filter.ride" },
  { key: "richieste", i18nKey: "proposals.filter.requests" },
];

const SEARCH_TYPE_I18N: Record<string, string> = {
  find_a_friend: "FindAFriend",
  find_a_guest: "proposals.searchType.findPassenger",
  hitcher: "Hitcher",
  hitchhiker: "HitchHiker",
  find_a_biker: "FindABiker"
};

function getTypeIcon(type: string): { name: keyof typeof Ionicons.glyphMap; color: string; dual?: boolean } {
  switch (type) {
    case "giro":
    case "find_a_friend": return { name: "people", color: Colors.maleIcon };
    case "con_zavorrina":
    case "find_a_guest": return { name: "bicycle", color: Colors.maleIcon, dual: true };
    case "passaggio_al_volo":
    case "hitcher":
    case "hitchhiker": return { name: "car", color: Colors.success };
    case "richieste": return { name: "thumbs-up", color: Colors.femaleIcon };
    case "find_a_biker": return { name: "bicycle", color: Colors.maleIcon };
    default: return { name: "megaphone", color: Colors.textSecondary };
  }
}

function getTypeLabelKey(type: string): string {
  switch (type) {
    case "giro":
    case "find_a_friend": return "proposals.type.bikers";
    case "con_zavorrina":
    case "find_a_guest": return "proposals.type.passenger";
    case "passaggio_al_volo":
    case "hitcher":
    case "hitchhiker": return "proposals.type.quickride";
    case "richieste": return "proposals.type.requests";
    case "find_a_biker": return "proposals.type.bikerSearch";
    default: return type;
  }
}

function ProposalCard({ item, onPress, t, locale }: { item: ProposalItem; onPress: () => void; t: (key: string) => string; locale: string }) {
  const typeInfo = getTypeIcon(item.proposalType);
  const scheduledDate = item.scheduledAt
    ? new Date(item.scheduledAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
      })
    : null;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        {typeInfo.dual ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="bicycle" size={20} color={Colors.maleIcon} />
            <Ionicons name="person" size={20} color={Colors.femaleIcon} />
          </View>
        ) : (
          <Ionicons name={typeInfo.name} size={24} color={typeInfo.color} />
        )}
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.nickname}>{item.creatorNickname}</Text>
          <Text style={styles.type}>
            {item.searchType ? (SEARCH_TYPE_I18N[item.searchType]?.includes(".") ? t(SEARCH_TYPE_I18N[item.searchType]) : SEARCH_TYPE_I18N[item.searchType] || item.searchType) : t(getTypeLabelKey(item.proposalType))}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: (typeInfo.dual ? Colors.femaleIcon : typeInfo.color) + "30" }]}>
          <Text style={[styles.badgeText, { color: typeInfo.dual ? Colors.femaleIcon : typeInfo.color }]}>
            {t(getTypeLabelKey(item.proposalType))}
          </Text>
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

      {item.motoInfo && (
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="motorbike" size={14} color={Colors.accent} />
          <Text style={[styles.infoText, { color: Colors.accent }]}>
            {item.motoInfo.brand} {item.motoInfo.model} • {item.motoInfo.ridingStyle}
          </Text>
        </View>
      )}

      {item.description && (
        <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
      )}

      {item.departureAddress && (
        <View style={styles.infoRow}>
          <Ionicons name="location" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText} numberOfLines={1}>{item.departureAddress}</Text>
        </View>
      )}

      {scheduledDate && (
        <View style={styles.infoRow}>
          <Ionicons name="time" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText}>{scheduledDate}</Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.infoRow}>
          <Ionicons name="people" size={14} color={Colors.accent} />
          <Text style={[styles.infoText, { color: Colors.accent }]}>
            {item.participantCount}{item.maxParticipants ? `/${item.maxParticipants}` : ""}
          </Text>
        </View>
        {!!item.searchRadius && (
          <View style={styles.infoRow}>
            <Ionicons name="radio-button-on" size={12} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{item.searchRadius}km</Text>
          </View>
        )}
      </View>

      {item.status !== "active" && (
        <View style={[styles.badge, { backgroundColor: Colors.warning + "30", marginTop: 6, alignSelf: "flex-start" as const }]}>
          <Text style={[styles.badgeText, { color: Colors.warning }]}>{item.status}</Text>
        </View>
      )}
    </Pressable>
  );
}

const HUB_SECTIONS = [
  { key: "proposte", i18nKey: "proposals.hub.proposalsRequests" },
  { key: "giri", i18nKey: "proposals.hub.ridesPerformance" },
  { key: "percorsi", i18nKey: "proposals.hub.myRoutes" },
  { key: "pianificati", i18nKey: "proposals.hub.myRides" },
] as const;

export default function ProposalsScreen() {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeHub, setActiveHub] = useState<"proposte" | "giri" | "percorsi" | "pianificati">("proposte");
  const [mountCalib, setMountCalib] = useState<MountAxisCalibration | null>(null);
  const [showMountCalibWizard, setShowMountCalibWizard] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadMountCalibration().then(setMountCalib).catch(() => {});
    }, [])
  );

  const queryKey =
    activeFilter === "all"
      ? ["/api/proposals"]
      : ["/api/proposals?filter=" + activeFilter];

  const { data: proposals, isLoading, refetch, isRefetching } = useQuery<ProposalItem[]>({
    queryKey,
    select: (res) =>
      Array.isArray(res)
        ? res
        : ((res as { data?: ProposalItem[] } | null)?.data ?? []),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches from API
  const { data: matches } = useQuery<any[]>({
    queryKey: ["/api/proposals/matches"],
    select: (res) => {
      if (Array.isArray(res)) return res;
      const obj = res as Record<string, unknown>;
      return Array.isArray(obj?.data) ? obj.data : [];
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proposal profile matches from API
  const { data: propProfileMatches } = useQuery<any[]>({
    queryKey: ["/api/proposals/proposal-profile-matches"],
    select: (res) => {
      if (Array.isArray(res)) return res;
      const obj = res as Record<string, unknown>;
      return Array.isArray(obj?.data) ? obj.data : [];
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match item from API
  const pendingMatchCount = Array.isArray(matches) ? matches.filter((m: any) => m.status === "pending").length : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proposal match item from API
  const pendingPropProfileCount = Array.isArray(propProfileMatches) ? propProfileMatches.filter((m: any) => m.status === "new").length : 0;
  const totalPendingCount = pendingMatchCount + pendingPropProfileCount;

  const handleCreatePress = useCallback(() => {
    router.push("/proposals/create");
  }, [router]);

  const handleProposalPress = useCallback((id: string) => {
    router.push(`/proposals/${id}`);
  }, [router]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixed list of proposal types
  const allData: any[] = [];
  if (totalPendingCount > 0) {
    allData.push({ type: "matchBanner", key: "mb" });
  }
  allData.push({ type: "proposalHeader", key: "ph" });
  (Array.isArray(proposals) ? proposals : []).forEach((p) => allData.push({ type: "proposal", key: `p-${p.id}`, data: p }));

  const handleHubPress = (key: "proposte" | "giri" | "percorsi" | "pianificati") => {
    setActiveHub(key);
  };

  return (
    <View style={styles.container}>
      <InlineMiniPlayer />
      <View style={styles.hubRow}>
        {HUB_SECTIONS.map((section) => {
          const isActive = section.key === activeHub;
          return (
            <Pressable
              key={section.key}
              style={[styles.hubBtn, isActive && styles.hubBtnActive]}
              onPress={() => handleHubPress(section.key)}
            >
              <Text style={[styles.hubText, isActive && styles.hubTextActive]} numberOfLines={2} textBreakStrategy="simple">
                {t(section.i18nKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeHub === "giri" ? (
        <View style={{ flex: 1 }}>
          <CalibrationBanner
            isCalibrated={mountCalib !== null}
            calibrationTimestamp={mountCalib?.timestamp ?? null}
            onCalibrate={() => setShowMountCalibWizard(true)}
          />
          <View style={{ flex: 1 }}>
            <TrackingScreen />
          </View>
          {showMountCalibWizard && (
            <MountCalibWizard
              onComplete={(calib) => {
                setMountCalib(calib);
                setShowMountCalibWizard(false);
              }}
              onDismiss={() => setShowMountCalibWizard(false)}
            />
          )}
        </View>
      ) : activeHub === "percorsi" ? (
        <View style={{ flex: 1 }}>
          <RoutesScreen />
        </View>
      ) : activeHub === "pianificati" ? (
        <View style={{ flex: 1 }}>
          <GiriScreen />
        </View>
      ) : (
        <>
      <View style={styles.filterRow}>
        {FILTER_KEYS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterBtn, activeFilter === f.key && styles.filterBtnActive]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>
              {t(f.i18nKey)}
            </Text>
            {f.key === "all" && totalPendingCount > 0 && (
              <View style={styles.matchBadge}>
                <Text style={styles.matchBadgeText}>{totalPendingCount}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={allData}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.accent} />
          }
          scrollEnabled={allData.length > 1}
          renderItem={({ item }) => {
            if (item.type === "matchBanner") {
              return (
                <TouchableOpacity
                  style={styles.matchBannerCard}
                  onPress={() => router.push("/(tabs)/match" as never)}
                >
                  <Ionicons name="flash" size={20} color={Colors.accent} />
                  <Text style={styles.matchBannerText}>
                    {totalPendingCount} {t("match.pendingBanner")}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.accent} />
                </TouchableOpacity>
              );
            }
            if (item.type === "proposalHeader") {
              return (
                <View style={styles.sectionHeader}>
                  <Ionicons name="megaphone" size={18} color={Colors.text} />
                  <Text style={styles.sectionTitle}>{t("proposals.title")}</Text>
                </View>
              );
            }
            return (
              <ProposalCard
                item={item.data}
                onPress={() => handleProposalPress(item.data.id)}
                t={t}
                locale={locale}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>{t("common.noResults")}</Text>
            </View>
          }
        />
      )}

      <Pressable style={styles.fab} onPress={handleCreatePress}>
        <Ionicons name="add" size={28} color={Colors.background} />
      </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  hubRow: { flexDirection: "row", paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, gap: 6 },
  hubBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minHeight: 48
  },
  hubBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18"
  },
  hubText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center"
  },
  hubTextActive: {
    color: Colors.accent
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", padding: 6, paddingHorizontal: 8, gap: 4 },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surface, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, height: 32 },
  filterBtnActive: { backgroundColor: Colors.accent + "20" },
  filterText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent },
  matchBadge: { backgroundColor: Colors.accentRed, borderRadius: 10, width: 20, height: 20, justifyContent: "center", alignItems: "center" },
  matchBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" as const },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 8, paddingBottom: 80 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 10, marginBottom: 6 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  cardHeaderInfo: { flex: 1 },
  nickname: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  type: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 4 },
  description: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, marginBottom: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fab: {
    position: "absolute",
    bottom: 16,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
      android: {},
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.3)" }
    })
  },
  matchBannerCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    backgroundColor: Colors.accent + "15",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "30"
  },
  matchBannerText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent
  }
});
