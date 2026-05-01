import { useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useUnits } from "@/lib/units-context";
import { formatDateTime } from "@/lib/units";
import { getCurrentLocale } from "@/lib/i18n";

interface SprintResult {
  id: string;
  sprint0to100Ms: number;
  maxAccelerationG: number | null;
  maxDecelerationG: number | null;
  maxTiltDeg: number | null;
  routeId: string | null;
  createdAt: string;
}

function formatSprintTime(ms: number): string {
  return (ms / 1000).toFixed(3) + "s";
}

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

function getMedalIcon(index: number): { name: IoniconsName; color: string } | null {
  if (index === 0) return { name: "trophy", color: "#FFD700" };
  if (index === 1) return { name: "medal-outline", color: "#C0C0C0" };
  if (index === 2) return { name: "medal-outline", color: "#CD7F32" };
  return null;
}

export default function SprintHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { speedUnit, timeFormat } = useUnits();
  const locale = getCurrentLocale();
  const listRef = useRef<FlatList>(null);

  const targetSpeed = speedUnit === "mph" ? 62 : 100;
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
  });

  const personalBest: SprintResult | null = sprints && sprints.length > 0 ? sprints[0] : null;

  const renderItem = useCallback(
    ({ item, index }: { item: SprintResult; index: number }) => {
      const isRecord = index === 0;
      const medal = getMedalIcon(index);
      const timeMs = item.sprint0to100Ms ?? 0;

      return (
        <View
          style={[
            styles.sprintItem,
            isRecord && styles.sprintItemRecord,
          ]}
        >
          <View style={styles.sprintRank}>
            {medal ? (
              <Ionicons name={medal.name} size={20} color={medal.color} />
            ) : (
              <Text style={styles.rankNumber}>#{index + 1}</Text>
            )}
          </View>

          <View style={styles.sprintMain}>
            <Text
              style={[
                styles.sprintTime,
                isRecord && styles.sprintTimeRecord,
              ]}
            >
              {formatSprintTime(timeMs)}
            </Text>
            <Text style={styles.sprintLabel}>0→{targetLabel}</Text>
          </View>

          <View style={styles.sprintStats}>
            {(item.maxAccelerationG ?? 0) > 0 && (
              <Text style={styles.statChip}>
                <Ionicons name="pulse-outline" size={11} color={Colors.accentRed} />
                {" "}{(item.maxAccelerationG ?? 0).toFixed(2)}G
              </Text>
            )}
            {(item.maxTiltDeg ?? 0) > 0 && (
              <Text style={styles.statChip}>
                <Ionicons name="compass-outline" size={11} color={Colors.accent} />
                {" "}{(item.maxTiltDeg ?? 0).toFixed(1)}°
              </Text>
            )}
          </View>

          <View style={styles.sprintDate}>
            <Text style={styles.dateText} numberOfLines={2}>
              {formatDateTime(item.createdAt, locale, timeFormat)}
            </Text>
          </View>
        </View>
      );
    },
    [targetLabel, locale, timeFormat]
  );

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

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
          <Text style={styles.headerTitle}>I miei sprint</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Personal best banner */}
      {personalBest && (
        <View style={styles.pbBanner}>
          <Ionicons name="trophy" size={22} color="#FFD700" />
          <View style={styles.pbInfo}>
            <Text style={styles.pbLabel}>Record personale</Text>
            <Text style={styles.pbTime}>
              {formatSprintTime(personalBest.sprint0to100Ms ?? 0)}
            </Text>
          </View>
          <Text style={styles.pbSince}>
            {formatDateTime(personalBest.createdAt, locale, timeFormat)}
          </Text>
        </View>
      )}

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : !sprints || sprints.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="timer-outline" size={56} color={Colors.textSecondary} />
          <Text style={styles.emptyTitle}>Nessun sprint ancora</Text>
          <Text style={styles.emptySubtitle}>
            Abilita la modalità 0-100 nel tracking e completa una sessione
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={sprints}
          keyExtractor={(item) => item.id}
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
  pbBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#FFD700" + "50",
    gap: 12,
  },
  pbInfo: {
    flex: 1,
  },
  pbLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  pbTime: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFD700",
    letterSpacing: -0.5,
  },
  pbSince: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "right",
    maxWidth: 90,
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
    paddingBottom: 8,
    textAlign: "center",
  },
  sprintItem: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  sprintItemRecord: {
    borderWidth: 1,
    borderColor: "#FFD700" + "60",
    backgroundColor: Colors.surface,
  },
  sprintRank: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  rankNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  sprintMain: {
    flex: 1,
    minWidth: 80,
  },
  sprintTime: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  sprintTimeRecord: {
    color: "#FFD700",
  },
  sprintLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  sprintStats: {
    alignItems: "flex-end",
    gap: 3,
  },
  statChip: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  sprintDate: {
    alignItems: "flex-end",
    maxWidth: 80,
  },
  dateText: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "right",
    lineHeight: 15,
  },
});
