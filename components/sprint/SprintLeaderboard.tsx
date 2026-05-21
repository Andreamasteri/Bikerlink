import React, { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

function formatSprintTime(ms: number): string {
  return (ms / 1000).toFixed(3) + "s";
}

import { getMedalIcon } from "./SprintCard";

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

interface SprintLeaderboardProps {
  leaderboard: LeaderboardEntry[] | undefined;
  isLoading: boolean;
  isRefetching: boolean;
  onRefresh: () => void;
  focusUserId: string | null;
  bottomPad: number;
}

export const SprintLeaderboard: React.FC<SprintLeaderboardProps> = ({
  leaderboard,
  isLoading,
  isRefetching,
  onRefresh,
  focusUserId,
  bottomPad,
}) => {
  const leaderboardListRef = useRef<FlatList>(null);
  const focusIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!focusUserId || !leaderboard || leaderboard.length === 0) return;
    const idx = leaderboard.findIndex((e) => e.userId === focusUserId);
    if (idx < 0) return;
    focusIndexRef.current = idx;
    const timer = setTimeout(() => {
      leaderboardListRef.current?.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.4,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [focusUserId, leaderboard]);

  const renderLeaderboardItem = useCallback(
    ({ item, index }: { item: LeaderboardEntry; index: number }) => {
      const isRecord = index === 0;
      const medal = getMedalIcon(index);
      const motoLabel = [item.motorcycleBrand, item.motorcycleModel].filter(Boolean).join(" ");
      const isFocused = focusUserId != null && item.userId === focusUserId && !item.isCurrentUser;

      return (
        <View
          style={[
            styles.sprintItem,
            isRecord && styles.sprintItemRecord,
            item.isCurrentUser && styles.sprintItemMe,
            isFocused && styles.sprintItemFocused,
          ]}
        >
          <View style={styles.sprintRank}>
            {medal ? (
              <Ionicons name={medal.name} size={20} color={medal.color} />
            ) : (
              <Text style={styles.rankNumber}>#{item.rank}</Text>
            )}
          </View>

          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {(item.nickname || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.lbMain}>
            <Text style={styles.lbNickname} numberOfLines={1}>
              {item.nickname}
              {item.isCurrentUser ? " (tu)" : ""}
            </Text>
            <Text style={[styles.sprintTime, styles.lbTime, isRecord && styles.sprintTimeRecord]}>
              {formatSprintTime(item.sprint0to100Ms)}
            </Text>
            {motoLabel.length > 0 && (
              <Text style={styles.lbMoto} numberOfLines={1}>
                {motoLabel}
                {item.displacement ? ` · ${item.displacement}cc` : ""}
              </Text>
            )}
          </View>

          <View style={styles.sprintStats}>
            {(item.maxAccelerationG ?? 0) > 0 && (
              <Text style={styles.statChip}>
                <Ionicons name="pulse-outline" size={11} color={Colors.accentRed} />
                {" "}
                {(item.maxAccelerationG ?? 0).toFixed(2)}G
              </Text>
            )}
            {(item.maxTiltDeg ?? 0) > 0 && (
              <Text style={styles.statChip}>
                <Ionicons name="compass-outline" size={11} color={Colors.accent} />
                {" "}
                {(item.maxTiltDeg ?? 0).toFixed(1)}°
              </Text>
            )}
          </View>
        </View>
      );
    },
    [focusUserId]
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="trophy-outline" size={56} color={Colors.textSecondary} />
        <Text style={styles.emptyTitle}>Nessuno sprint registrato</Text>
        <Text style={styles.emptySubtitle}>
          Sii il primo a registrare uno sprint per apparire in classifica!
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={leaderboardListRef}
      data={leaderboard}
      keyExtractor={(item) => item.userId}
      renderItem={renderLeaderboardItem}
      contentContainerStyle={{ paddingBottom: bottomPad + 16, paddingTop: 8 }}
      showsVerticalScrollIndicator={false}
      onScrollToIndexFailed={(info) => {
        leaderboardListRef.current?.scrollToIndex({
          index: info.highestMeasuredFrameIndex,
          animated: false,
        });
        const targetIndex = focusIndexRef.current ?? info.index;
        setTimeout(() => {
          leaderboardListRef.current?.scrollToIndex({
            index: targetIndex,
            animated: true,
            viewPosition: 0.4,
          });
        }, 350);
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={onRefresh}
          tintColor={Colors.accent}
          colors={[Colors.accent]}
        />
      }
      ListHeaderComponent={
        <Text style={styles.listHeader}>
          Top {leaderboard.length} — miglior tempo per pilota
        </Text>
      }
    />
  );
};

const styles = StyleSheet.create({
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
    borderColor: "#FFD70060",
    backgroundColor: Colors.surface,
  },
  sprintItemMe: {
    borderWidth: 1,
    borderColor: Colors.accentRed + "80",
  },
  sprintItemFocused: {
    borderWidth: 1.5,
    borderColor: Colors.accent + "90",
    backgroundColor: Colors.accent + "12",
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
  sprintTime: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  sprintTimeRecord: {
    color: "#FFD700",
  },
  sprintStats: {
    alignItems: "flex-end",
    gap: 3,
  },
  statChip: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  lbMain: {
    flex: 1,
    minWidth: 100,
  },
  lbNickname: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 2,
  },
  lbTime: {
    fontSize: 20,
  },
  lbMoto: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
