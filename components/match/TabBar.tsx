import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type TabKey = "zavorrine" | "biker" | "proposals" | "propProfile" | "music" | "accepted" | "blacklist";

interface TabBarProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[];
}

export function TabBar({ activeTab, setActiveTab, tabs }: TabBarProps) {
  return (
    <View style={styles.tabRowSpaced}>
      <View style={styles.tabRow}>
        {tabs.slice(0, 4).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            {tab.key !== "zavorrine" && tab.key !== "biker" && (
              <Ionicons
                name={tab.icon}
                size={13}
                color={activeTab === tab.key ? Colors.accent : Colors.textSecondary}
              />
            )}
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.countBadge, { backgroundColor: Colors.accentRed }]}>
                <Text style={[styles.countBadgeText, { color: "#fff" }]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.tabRow, styles.tabRowSecond]}>
        {tabs.slice(4).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, styles.tabSecond, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={14}
              color={activeTab === tab.key ? Colors.accent : Colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.countBadge, { backgroundColor: Colors.accentRed }]}>
                <Text style={[styles.countBadgeText, { color: "#fff" }]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabRowSpaced: {
    marginTop: 4,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
    alignItems: "center",
  },
  tabRowSecond: {
    justifyContent: "center",
    paddingTop: 0,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 5,
    paddingHorizontal: 2,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  tabSecond: {
    flex: 0,
    width: "45%",
  },
  tabActive: {
    backgroundColor: Colors.accent + "20",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  tabText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  countBadge: {
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
