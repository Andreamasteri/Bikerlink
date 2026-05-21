import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { AdStats } from "@/components/admin/ads/AdStats";

export function AdTabs({ tabs, activeTab, onTabPress }: { tabs: any[], activeTab: string, onTabPress: (key: any) => void }) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && { borderBottomColor: tab.color, borderBottomWidth: 3 }]}
            onPress={() => onTabPress(tab.key)}
          >
            {tab.iconSet === "community" ? (
              <MaterialCommunityIcons name={tab.icon as any} size={22} color={isActive ? tab.color : Colors.textSecondary} />
            ) : tab.iconSet === "ionicons" ? (
              <Ionicons name={tab.icon as any} size={22} color={isActive ? tab.color : Colors.textSecondary} />
            ) : (
              <MaterialIcons name={tab.icon as any} size={22} color={isActive ? tab.color : Colors.textSecondary} />
            )}
            <Text style={[styles.tabLabel, isActive && { color: tab.color }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function AdHealthBanner({ brokenCount, onDismiss }: { brokenCount: number; onDismiss: () => void }) {
  return (
    <View style={styles.brokenBanner}>
      <MaterialIcons name="warning" size={16} color={Colors.error} />
      <Text style={styles.brokenBannerText} numberOfLines={2}>
        {brokenCount === 1
          ? `1 campagna ha un'immagine non raggiungibile`
          : `${brokenCount} campagne hanno immagini non raggiungibili`}
      </Text>
      <TouchableOpacity onPress={onDismiss} style={styles.brokenBannerClose}>
        <MaterialIcons name="close" size={16} color={Colors.error} />
      </TouchableOpacity>
    </View>
  );
}

export function AdToolbar({ 
  campaignCount, 
  cacheStats, 
  onRestartAll, 
  isRestartingAll, 
  activeCampaignCount, 
  onRefresh, 
  onDeleteAll, 
  isDeletingAll, 
  onOpenSettings 
}: { 
  campaignCount: number; 
  cacheStats: any; 
  onRestartAll: () => void; 
  isRestartingAll: boolean; 
  activeCampaignCount: number; 
  onRefresh: () => void; 
  onDeleteAll: () => void; 
  isDeletingAll: boolean; 
  onOpenSettings: () => void; 
}) {
  return (
    <View style={styles.toolbar}>
      <AdStats count={campaignCount} cacheStats={cacheStats} />
      <View style={styles.toolbarActions}>
        <TouchableOpacity
          onPress={onRestartAll}
          disabled={isRestartingAll || activeCampaignCount === 0}
          style={styles.toolbarBtn}
        >
          {isRestartingAll ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <MaterialIcons name="replay" size={20} color={activeCampaignCount > 0 ? Colors.accent : Colors.textSecondary} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.toolbarBtn}
        >
          <MaterialIcons name="refresh" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDeleteAll}
          disabled={isDeletingAll || campaignCount === 0}
          style={styles.toolbarBtn}
        >
          {isDeletingAll ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <MaterialIcons name="delete-sweep" size={22} color={campaignCount > 0 ? Colors.error : Colors.textSecondary} />
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpenSettings} style={styles.toolbarBtn}>
          <MaterialIcons name="settings" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 6,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toolbarBtn: {
    padding: 4,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  brokenBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.error + "18",
    borderBottomWidth: 1,
    borderBottomColor: Colors.error + "44",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  brokenBannerText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.error,
  },
  brokenBannerClose: {
    padding: 2,
  },
});
