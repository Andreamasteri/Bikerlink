import React from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";

type Verdict = "platform_recycle" | "sigkill_oom" | "internal_crash" | "clean_exit";
type EventType = "crash" | "snapshot";

interface CrashEvent {
  ts: string;
  type: EventType;
  session_id: string;
  exit_code?: number;
  signal_name?: string;
  verdict?: Verdict;
  uptime_secs?: number;
  oom_found?: number;
  mem_free_mb?: number;
  mem_total_mb?: number;
  load_1min?: string;
  pid_state?: string;
}

interface VerdictSummary {
  platform_recycle: number;
  sigkill_oom: number;
  internal_crash: number;
  clean_exit: number;
  total_crash: number;
  total_snapshot: number;
  oom_snapshots: number;
  dominant: string | null;
  dominant_pct: number;
  first_ts: string | null;
  last_ts: string | null;
}

interface MetroCrashResponse {
  events: CrashEvent[];
  summary: VerdictSummary;
}

const VERDICT_COLOR: Record<Verdict, string> = {
  platform_recycle: "#34C759",
  sigkill_oom:      "#FF3B30",
  internal_crash:   "#FF9500",
  clean_exit:       "#8E8E93",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  platform_recycle: "PLATFORM RECYCLE",
  sigkill_oom:      "SIGKILL / OOM",
  internal_crash:   "INTERNAL CRASH",
  clean_exit:       "CLEAN EXIT",
};

const VERDICT_ICON: Record<Verdict, React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  platform_recycle: "recycle",
  sigkill_oom:      "skull-outline",
  internal_crash:   "alert-octagon",
  clean_exit:       "check-circle-outline",
};

function verdictVisual(verdict: Verdict | undefined): {
  color: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
} {
  if (!verdict) return { color: "#8E8E93", icon: "help-circle-outline", label: "—" };
  return {
    color: VERDICT_COLOR[verdict] ?? "#8E8E93",
    icon: VERDICT_ICON[verdict] ?? "help-circle-outline",
    label: VERDICT_LABEL[verdict] ?? verdict,
  };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function dominantLabel(dominant: string | null): string {
  if (!dominant) return "—";
  return VERDICT_LABEL[dominant as Verdict] ?? dominant;
}

function dominantColor(dominant: string | null): string {
  if (!dominant) return "#8E8E93";
  return VERDICT_COLOR[dominant as Verdict] ?? "#8E8E93";
}

export default function MetroCrashesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch, isRefetching } =
    useQuery<MetroCrashResponse>({
      queryKey: ["/api/admin/metro-crash-log"],
      queryFn: async () => {
        const res = await apiRequest("GET", "/api/admin/metro-crash-log");
        return res.json() as Promise<MetroCrashResponse>;
      },
      staleTime: 30_000,
    });

  const events = data?.events ?? [];
  const summary = data?.summary;

  function renderItem({ item }: { item: CrashEvent }) {
    if (item.type === "snapshot") {
      const hasOom = item.oom_found === 1;
      return (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: hasOom ? "#FF3B3055" : colors.border,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: hasOom ? "#FF3B3022" : "#8E8E9322" }]}>
            <MaterialCommunityIcons
              name={hasOom ? "memory" : "camera-metering-spot"}
              size={22}
              color={hasOom ? "#FF3B30" : "#8E8E93"}
            />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.reasonLabel, { color: colors.text }]} numberOfLines={1}>
                Snapshot sistema
              </Text>
              {hasOom && (
                <View style={[styles.badge, { backgroundColor: "#FF3B3022" }]}>
                  <Text style={[styles.badgeText, { color: "#FF3B30" }]}>OOM</Text>
                </View>
              )}
            </View>
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
              {formatDateTime(item.ts)}
            </Text>
            {(item.mem_free_mb !== undefined && item.mem_total_mb !== undefined) && (
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                RAM libera: {item.mem_free_mb}/{item.mem_total_mb} MB
                {item.load_1min ? `  ·  load: ${item.load_1min}` : ""}
              </Text>
            )}
          </View>
        </View>
      );
    }

    const { color, icon, label } = verdictVisual(item.verdict as Verdict | undefined);
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor:
              item.verdict === "internal_crash" || item.verdict === "sigkill_oom"
                ? `${color}55`
                : colors.border,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
          <MaterialCommunityIcons name={icon} size={22} color={color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.reasonLabel, { color: colors.text }]} numberOfLines={1}>
              {item.signal_name && item.signal_name !== "none"
                ? `${item.signal_name} (exit ${item.exit_code})`
                : `exit ${item.exit_code}`}
            </Text>
            <View style={[styles.badge, { backgroundColor: `${color}22` }]}>
              <Text style={[styles.badgeText, { color }]}>{label}</Text>
            </View>
          </View>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {formatDateTime(item.ts)}
          </Text>
          <Text style={[styles.detailText, { color: colors.textSecondary }]}>
            uptime: {item.uptime_secs ?? 0}s
            {item.session_id ? `  ·  sess: ${item.session_id.slice(0, 8)}` : ""}
          </Text>
        </View>
      </View>
    );
  }

  const ListHeader = summary ? (
    <View style={styles.headerWrap}>
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.summaryTitle, { color: colors.text }]}>Riepilogo</Text>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Crash totali</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{summary.total_crash}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Snapshot</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{summary.total_snapshot}</Text>
        </View>
        {summary.oom_snapshots > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: "#FF3B30" }]}>Snapshot OOM</Text>
            <Text style={[styles.summaryValue, { color: "#FF3B30" }]}>{summary.oom_snapshots}</Text>
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.summaryRow}>
          <View style={[styles.dot, { backgroundColor: VERDICT_COLOR.platform_recycle }]} />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Platform recycle</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{summary.platform_recycle}</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.dot, { backgroundColor: VERDICT_COLOR.sigkill_oom }]} />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>SIGKILL / OOM</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{summary.sigkill_oom}</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.dot, { backgroundColor: VERDICT_COLOR.internal_crash }]} />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Internal crash</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{summary.internal_crash}</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.dot, { backgroundColor: VERDICT_COLOR.clean_exit }]} />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Clean exit</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{summary.clean_exit}</Text>
        </View>

        {summary.total_crash > 0 && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.dominantRow}>
              <Text style={[styles.dominantLabel, { color: colors.textSecondary }]}>
                Verdetto dominante
              </Text>
              {summary.dominant !== null ? (
                <View
                  style={[
                    styles.dominantBadge,
                    { backgroundColor: `${dominantColor(summary.dominant)}22` },
                  ]}
                >
                  <Text
                    style={[
                      styles.dominantBadgeText,
                      { color: dominantColor(summary.dominant) },
                    ]}
                  >
                    {dominantLabel(summary.dominant)} {summary.dominant_pct}%
                  </Text>
                </View>
              ) : (
                <View style={[styles.dominantBadge, { backgroundColor: "#8E8E9322" }]}>
                  <Text style={[styles.dominantBadgeText, { color: "#8E8E93" }]}>
                    distribuzione frammentata ({summary.dominant_pct}% max)
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {summary.first_ts && (
          <Text style={[styles.tsRange, { color: colors.textSecondary }]}>
            {formatDateTime(summary.first_ts)} → {formatDateTime(summary.last_ts ?? summary.first_ts)}
          </Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        {events.length} {events.length === 1 ? "record" : "record"} · più recenti in basso
      </Text>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : isError && !data ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Errore caricamento log crash Metro
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.retryBtnText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item, idx) => `${item.ts}-${idx}`}
          renderItem={renderItem}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="check-circle-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Nessun crash registrato
              </Text>
              <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>
                Il file JSONL non è ancora presente
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 12,
  },
  list: { padding: 16 },
  headerWrap: { marginBottom: 12, gap: 12 },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  summaryTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  summaryValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  dominantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  dominantLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  dominantBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dominantBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  tsRange: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  reasonLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },
  detailText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  emptySubText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
