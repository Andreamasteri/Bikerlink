import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";

import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface PhotoWinner {
  id: string;
  entryId: string;
  userId: string;
  weekNumber: number;
  year: number;
  totalVotes: number;
  createdAt: string;
}

function WinnerItem({ item, index }: { item: PhotoWinner; index: number }) {
  const medals = ["gold", "silver", "bronze"] as const;
  const medalColors: Record<string, string> = {
    gold: "#FFD700",
    silver: "#C0C0C0",
    bronze: "#CD7F32",
  };
  const medal = index < 3 ? medals[index] : null;

  return (
    <View style={styles.winnerCard}>
      <View style={styles.winnerRank}>
        {medal ? (
          <MaterialCommunityIcons
            name="trophy"
            size={24}
            color={medalColors[medal]}
          />
        ) : (
          <Text style={styles.rankNumber}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.winnerInfo}>
        <Text style={styles.winnerWeek}>
          Settimana {item.weekNumber}/{item.year}
        </Text>
        <View style={styles.votesRow}>
          <MaterialCommunityIcons name="heart" size={14} color={Colors.dark.rosa} />
          <Text style={styles.winnerVotes}>{item.totalVotes} voti</Text>
        </View>
      </View>
    </View>
  );
}

export default function WinnersScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch } = useQuery<PhotoWinner[]>({
    queryKey: ["/api/contest/winners"],
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("contest.winners"),
          headerStyle: { backgroundColor: Colors.dark.surface },
          headerTintColor: Colors.dark.text,
        }}
      />
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.dark.accent} />
          </View>
        ) : (
          <FlatList
            data={data ?? []}
            renderItem={({ item, index }) => (
              <WinnerItem item={item} index={index} />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: 40 + (Platform.OS === "web" ? 34 : 0) },
            ]}
            showsVerticalScrollIndicator={false}
            scrollEnabled={(data?.length ?? 0) > 0}
            onRefresh={refetch}
            refreshing={isLoading}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons
                  name="trophy-outline"
                  size={48}
                  color={Colors.dark.textMuted}
                />
                <Text style={styles.emptyText}>Nessun vincitore ancora</Text>
                <Text style={styles.emptySubtext}>
                  I vincitori verranno annunciati alla fine di ogni settimana
                </Text>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
  },
  winnerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  winnerRank: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  rankNumber: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    fontWeight: "700" as const,
  },
  winnerInfo: {
    flex: 1,
    gap: 4,
  },
  winnerWeek: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  votesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  winnerVotes: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    fontWeight: "600" as const,
  },
  emptySubtext: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
