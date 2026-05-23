import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import Colors from "@/constants/colors";
import { LogItem } from "./LogItem";
import { formatTimestamp, eventIcon, eventLabel, type SystemEvent } from "./systemUtils";

interface RecentEventsSectionProps {
  events: SystemEvent[];
  t: (key: string) => string;
  topPadding: number;
  bottomPadding: number;
  ListHeaderComponent: React.ReactElement;
}

export function RecentEventsSection({
  events,
  t,
  topPadding,
  bottomPadding,
  ListHeaderComponent,
}: RecentEventsSectionProps) {
  return (
    <FlatList
      data={events}
      keyExtractor={(item, index) => `${item.timestamp}-${index}`}
      contentContainerStyle={[
        styles.listContent,
        { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 16 },
      ]}
      ListHeaderComponent={
        <>
          {ListHeaderComponent}
          <Text style={styles.sectionTitle}>Eventi Recenti</Text>
        </>
      }
      renderItem={({ item }) => (
        <LogItem
          event={item}
          formatTimestamp={formatTimestamp}
          eventIcon={eventIcon}
          eventLabel={eventLabel}
          t={t}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Nessun evento registrato</Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border ?? "#333",
  },
  emptyWrap: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});
