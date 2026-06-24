import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
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
import {
  HUB_SECTIONS,
  FILTER_KEYS,
  SEARCH_TYPE_I18N,
  getTypeIcon,
  getTypeLabelKey,
  MatchBanner,
  ProposalHeader,
} from "@/components/proposals/ProposalsTabPart2";
import { styles } from "@/components/proposals/tab-proposals.styles";

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

function ProposalCard({ item, onPress, t, locale }: { item: ProposalItem; onPress: () => void; t: (key: string) => string; locale: string }) {
  const typeInfo = getTypeIcon(item.proposalType);
  const scheduledDate = item.scheduledAt
    ? new Date(item.scheduledAt).toLocaleDateString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
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

export default function ProposalsScreen() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
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
    routerRef.current.push("/proposals/create");
  }, []);

  const handleProposalPress = useCallback((id: string) => {
    routerRef.current.push(`/proposals/${id}`);
  }, []);

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
          {typeof GiriScreen === "function" ? (
            <GiriScreen />
          ) : (
            <View style={styles.emptyHub}>
              <Text style={styles.emptyHubText}>{t("Sezione non disponibile")}</Text>
            </View>
          )}
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
                <MatchBanner
                  count={totalPendingCount}
                  onPress={() => router.push("/(tabs)/match" as never)}
                  t={t}
                />
              );
            }
            if (item.type === "proposalHeader") {
              return (
                <ProposalHeader title={t("proposals.title")} />
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
