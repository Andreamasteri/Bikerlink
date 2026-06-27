import { useRef, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useUnits } from "@/lib/units-context";
import { getCurrentLocale } from "@/lib/i18n";
import { useT } from "@/lib/language-context";

import { SprintCard } from "@/components/sprint/SprintCard";
import { SprintFilters } from "@/components/sprint/SprintFilters";
import { SprintStats } from "@/components/sprint/SprintStats";
import { SprintLeaderboard } from "@/components/sprint/SprintLeaderboard";
import { PublishSprintModal } from "@/components/sprint/PublishSprintModal";

interface SprintResult {
  id: string;
  sprint0to100Ms: number;
  maxAccelerationG: number | null;
  maxDecelerationG: number | null;
  maxTiltDeg: number | null;
  routeId: string | null;
  createdAt: string;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  sprint0to100Ms: number;
  maxAccelerationG: number | null;
  maxTiltDeg: number | null;
  createdAt: string;
  motorcycleBrand: string | null;
  motorcycleModel: string | null;
  motorcycleType: string | null;
  displacement: number | null;
  isCurrentUser: boolean;
}

type Tab = "mine" | "leaderboard";

const keyExtractor = (item: SprintResult) => item.id;

export default function SprintHistoryScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { speedUnit, timeFormat } = useUnits();
  const locale = getCurrentLocale();
  const listRef = useRef<FlatList>(null);
  const params = useLocalSearchParams<{ tab?: string; focusUserId?: string }>();
  const focusUserId = params.focusUserId ?? null;
  const [tab, setTab] = useState<Tab>(params.tab === "leaderboard" ? "leaderboard" : "mine");

  const targetLabel = speedUnit === "mph" ? "62 mph" : "100 km/h";

  const {
    data: sprints,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<SprintResult[]>({
    queryKey: ["/api/sprints"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: tab === "mine",
  });

  const {
    data: leaderboard,
    isLoading: isLoadingLeaderboard,
    refetch: refetchLeaderboard,
    isRefetching: isRefetchingLeaderboard,
  } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/sprints/leaderboard", focusUserId ?? ""],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const url = new URL("/api/sprints/leaderboard", getApiUrl());
      if (focusUserId) url.searchParams.set("includeUserId", focusUserId);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore leaderboard");
      return res.json();
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: tab === "leaderboard",
  });

  const personalBest: SprintResult | null = sprints && sprints.length > 0 ? sprints[0] : null;

  const [publishSprint, setPublishSprint] = useState<SprintResult | null>(null);
  const [publishCaption, setPublishCaption] = useState("");

  const publishMutation = useMutation({
    mutationFn: async (data: { performanceData: string; caption: string }) => {
      await apiRequest("POST", "/api/contest/entries", data);
    },
    onSuccess: () => {
      setPublishSprint(null);
      setPublishCaption("");
      queryClient.invalidateQueries({ queryKey: ["/api/contest/entries"] });
      Alert.alert(t("tracking.published"), t("tracking.publishedMsg"));
    },
    onError: () => Alert.alert(t("common.error"), t("tracking.publishError")),
  });

  // La mutation è ref-stabile nei metodi (.mutate) ma cambia riferimento a ogni
  // transizione di stato: tenerla in un ref evita di rigenerare handlePublish — e
  // a cascata il modal — quando si pubblica. exhaustive-deps esenta i ref.
  const publishMutationRef = useRef(publishMutation);
  publishMutationRef.current = publishMutation;

  const handlePublish = useCallback(() => {
    if (!publishSprint) return;
    const perfData = JSON.stringify({
      type: "sprint",
      sprint0to100Ms: publishSprint.sprint0to100Ms ?? 0,
      targetSpeedKmh: 100,
      maxAccelerationG: publishSprint.maxAccelerationG ?? 0,
      maxDecelerationG: publishSprint.maxDecelerationG ?? 0,
      maxTiltDeg: publishSprint.maxTiltDeg ?? 0,
      date: publishSprint.createdAt,
    });
    publishMutationRef.current.mutate({ performanceData: perfData, caption: publishCaption });
  }, [publishSprint, publishCaption]);

  const renderItem = useCallback(
    ({ item, index }: { item: SprintResult; index: number }) => (
      <SprintCard
        item={item}
        index={index}
        targetLabel={targetLabel}
        locale={locale}
        timeFormat={timeFormat}
        onPublish={(sprint) => {
          setPublishCaption("");
          setPublishSprint(sprint);
        }}
      />
    ),
    [targetLabel, locale, timeFormat]
  );

  const topPadding = insets.top;
  const bottomPad = insets.bottom;

  const isMineTab = tab === "mine";

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="speedometer-outline" size={20} color={Colors.accentRed} />
          <Text style={styles.headerTitle}>Sprint 0→{targetLabel}</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <SprintFilters tab={tab} onTabChange={setTab} />

      {isMineTab ? (
        <>
          <SprintStats personalBest={personalBest} locale={locale} timeFormat={timeFormat} />

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.accent} />
            </View>
          ) : !sprints || sprints.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="timer-outline" size={56} color={Colors.textSecondary} />
              <Text style={styles.emptyTitle}>Nessun sprint ancora</Text>
              <Text style={styles.emptySubtitle}>{t("sprint.enableHint")}</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={sprints}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              contentContainerStyle={{ paddingBottom: bottomPad + 16, paddingTop: 8 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={refetch}
                  tintColor={Colors.accent}
                  colors={[Colors.accent]}
                />
              }
              ListHeaderComponent={
                <Text style={styles.listHeader}>
                  {sprints.length} {sprints.length === 1 ? "sessione" : "sessioni"} — ordinate per tempo
                </Text>
              }
            />
          )}
        </>
      ) : (
        <SprintLeaderboard
          leaderboard={leaderboard}
          isLoading={isLoadingLeaderboard}
          isRefetching={isRefetchingLeaderboard}
          onRefresh={refetchLeaderboard}
          focusUserId={focusUserId}
          bottomPad={bottomPad}
        />
      )}

      <PublishSprintModal
        publishSprint={publishSprint}
        publishCaption={publishCaption}
        setPublishCaption={setPublishCaption}
        onClose={() => setPublishSprint(null)}
        onPublish={handlePublish}
        isPending={publishMutation.isPending}
        targetLabel={targetLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  listHeader: {
    fontSize: 12,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    textAlign: "center",
  },
});
