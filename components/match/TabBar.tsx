import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type TabKey = "zavorrine" | "biker" | "proposals" | "propProfile" | "music" | "route" | "telemetry" | "giri" | "accepted" | "blacklist";

interface TabBarProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[];
}

function TabItem({
  tab,
  active,
  onPress,
}: {
  tab: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number };
  active: boolean;
  onPress: () => void;
}) {
  const showIcon = tab.key !== "biker" && tab.key !== "zavorrine";

  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
    >
      {showIcon && (
        <Ionicons
          name={tab.icon}
          size={15}
          color={active ? Colors.accent : Colors.textSecondary}
        />
      )}
      <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
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
  );
}

export function TabBar({ activeTab, setActiveTab, tabs }: TabBarProps) {
  const total = tabs.length;
  const row1 = tabs.slice(0, 3);
  const row2 = tabs.slice(3, Math.min(5, total));
  const row3 = tabs.slice(5, 8);
  const row4 = tabs.slice(8, total);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {row1.map((tab) => (
          <TabItem key={tab.key} tab={tab} active={activeTab === tab.key} onPress={() => setActiveTab(tab.key)} />
        ))}
      </View>
      <View style={styles.row}>
        <View style={styles.innerRowCentered}>
          {row2.map((tab) => (
            <TabItem key={tab.key} tab={tab} active={activeTab === tab.key} onPress={() => setActiveTab(tab.key)} />
          ))}
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.innerRowCentered}>
          {row3.map((tab) => (
            <TabItem key={tab.key} tab={tab} active={activeTab === tab.key} onPress={() => setActiveTab(tab.key)} />
          ))}
        </View>
      </View>
      {row4.length > 0 && (
        <View style={styles.row}>
          <View style={styles.innerRowCentered}>
            {row4.map((tab) => (
              <TabItem key={tab.key} tab={tab} active={activeTab === tab.key} onPress={() => setActiveTab(tab.key)} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 2,
    gap: 3,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 6,
    gap: 4,
  },
  innerRowCentered: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  tabActive: {
    backgroundColor: Colors.accent + "20",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  tabText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    flexShrink: 1,
    textAlign: "center",
  },
  tabTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  countBadge: {
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
