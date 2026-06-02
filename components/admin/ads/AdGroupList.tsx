import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Campaign, AdCard } from "./AdCard";
import { AdGroupHeader } from "./AdGroupHeader";
import { useT } from "@/lib/language-context";

export type ListItem =
  | { type: "campaign"; data: Campaign }
  | { type: "groupHeader"; groupId: string; baseName: string; count: number; allActive: boolean; someActive: boolean };

interface AdGroupListProps {
  listItems: ListItem[];
  flatListRef: React.RefObject<FlatList>;
  isLoading: boolean;
  collapsedGroups: Set<string>;
  onToggleGroupCollapse: (groupId: string) => void;
  onEditGroup: (groupId: string) => void;
  onToggleGroupStatus: (groupId: string, isActive: boolean) => void;
  onEditCampaign: (campaign: Campaign) => void;
  onToggleCampaign: (id: string, isActive: boolean) => void;
  onDeleteCampaign: (campaign: Campaign) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  brokenIdSet?: Set<string>;
  onReupload?: (campaign: Campaign) => void;
}

export function AdGroupList({
  listItems,
  flatListRef,
  isLoading,
  collapsedGroups,
  onToggleGroupCollapse,
  onEditGroup,
  onToggleGroupStatus,
  onEditCampaign,
  onToggleCampaign,
  onDeleteCampaign,
  onRefresh,
  isRefreshing,
  brokenIdSet,
  onReupload,
}: AdGroupListProps) {
  const t = useT();

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "groupHeader") {
      return (
        <AdGroupHeader
          baseName={item.baseName}
          count={item.count}
          allActive={item.allActive}
          someActive={item.someActive}
          isCollapsed={collapsedGroups.has(item.groupId)}
          onToggleCollapse={() => onToggleGroupCollapse(item.groupId)}
          onEdit={() => onEditGroup(item.groupId)}
          onToggleStatus={() => onToggleGroupStatus(item.groupId, !item.allActive)}
        />
      );
    }
    const campaign = item.data;
    return (
      <AdCard
        item={campaign}
        onToggle={() => onToggleCampaign(campaign.id, !campaign.isActive)}
        onDelete={() => onDeleteCampaign(campaign)}
        onEdit={() => onEditCampaign(campaign)}
        isBroken={brokenIdSet?.has(campaign.id) ?? false}
        onReupload={onReupload}
      />
    );
  };

  if (isLoading && listItems.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={listItems}
      keyExtractor={(item) => (item.type === "groupHeader" ? `group-${item.groupId}` : `ad-${item.data.id}`)}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      onRefresh={onRefresh}
      refreshing={isRefreshing}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <MaterialIcons name="info-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>{t("admin.noAdsFound")}</Text>
          <Text style={styles.emptySubtext}>{t("admin.clickPlusToCreate")}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    gap: 10,
  },
  emptyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
