import React from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MatchListProps {
  currentList: any[];
  renderItem: ({ item }: { item: any }) => React.ReactElement;
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
      keyExtractor={(item) => item.id?.toString() ?? item.user?.id ?? item.lastfmTrackId ?? String(item.songsInCommon) + (item.user?.id ?? "")}
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
