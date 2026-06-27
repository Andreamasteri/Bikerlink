import React from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

// keyExtractor stabile (module-level): non dipende da props, quindi non va
// ricreato ad ogni render della lista.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- keyExtractor for polymorphic items
function matchKeyExtractor(item: any): string {
  const r = item;
  return r.id?.toString() ?? r.user?.id ?? r.lastfmTrackId ?? String(r.songsInCommon) + (r.user?.id ?? "");
}

interface MatchListProps {
  currentList: Record<string, unknown>[];
  renderItem: ({ item }: { item: Record<string, unknown> }) => React.ReactElement;
  isRefetching: boolean;
  onRefresh: () => void;
  isLoading: boolean;
  isServerBusy: boolean;
  activeTab: string;
  getEmptyIcon: () => keyof typeof Ionicons.glyphMap;
  getEmptyTitle: () => string;
  getEmptyDesc: () => string;
}

export function MatchList({
  currentList,
  renderItem,
  isRefetching,
  onRefresh,
  isLoading,
  isServerBusy,
  activeTab,
  getEmptyIcon,
  getEmptyTitle,
  getEmptyDesc,
}: MatchListProps) {
  if (isServerBusy) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.serverBusyText}>Per favore attendere…</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={currentList}
      keyExtractor={matchKeyExtractor}
      renderItem={renderItem}
      extraData={[currentList, activeTab]}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.accent} />
      }
      scrollEnabled={currentList.length > 0}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name={getEmptyIcon()} size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyTitle}>{getEmptyTitle()}</Text>
          <Text style={styles.emptyDesc}>{getEmptyDesc()}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  serverBusyText: {
    marginTop: 12,
    fontSize: 17,
    color: Colors.textSecondary,
  },
  list: {
    padding: 10,
    paddingBottom: 40,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 16,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
});
