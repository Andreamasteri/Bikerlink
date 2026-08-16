import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { type TaskbarStyle } from "@/lib/taskbar-style-context";
import { useT } from "@/lib/language-context";
import { isCommunityRouteName } from "@/lib/navigation-registry";

export interface TabItem {
  name: string;
  title: string;
  icon: (color: string, size: number) => React.ReactNode;
  isFocused: boolean;
  onPress: () => void;
}

interface CustomTabBarProps {
  tabs: TabItem[];
  style: TaskbarStyle;
}

const MAX_SCORRI_VISIBLE = 6;

function TabIcon({ tab, isActive }: { tab: TabItem; isActive: boolean }) {
  const colors = useColors();
  const color = isActive ? colors.accent : colors.textSecondary;
  return (
    <Pressable style={staticStyles.tabItem} onPress={tab.onPress}>
      {tab.icon(color, 24)}
      <Text style={[staticStyles.tabLabel, { color }]} numberOfLines={2}>
        {tab.title}
      </Text>
    </Pressable>
  );
}

function ScrollTabIcon({
  tab,
  isActive,
  itemWidth,
}: {
  tab: TabItem;
  isActive: boolean;
  itemWidth: number;
}) {
  const colors = useColors();
  const color = isActive ? colors.accent : colors.textSecondary;
  return (
    <Pressable
      style={[staticStyles.tabItem, { width: itemWidth, flex: 0 }]}
      onPress={tab.onPress}
    >
      {tab.icon(color, 24)}
      <Text style={[staticStyles.tabLabel, { color }]} numberOfLines={2}>
        {tab.title}
      </Text>
    </Pressable>
  );
}

export default function CustomTabBar({
  tabs,
  style,
}: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const tabBarPaddingBottom = insets.bottom;
  const tabBarHeight = 60 + insets.bottom;
  const colors = useColors();
  const t = useT();
  const [communityOpen, setCommunityOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const barStyle = {
    height: tabBarHeight,
    paddingBottom: tabBarPaddingBottom,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  };

  if (style === "scorri") {
    // "bowie" is a Community-modal-only tab: accessible only via the raggruppa
    // Community modal, not as a direct entry in the scorri scroll bar.
    const scorriTabs = tabs.filter((t) => t.name !== "bowie");
    const screenWidth = Dimensions.get("window").width;
    const arrowWidth = 32;
    const availableWidth = screenWidth - arrowWidth * 2;
    const itemWidth = Math.floor(availableWidth / MAX_SCORRI_VISIBLE);

    return (
      <View style={[barStyle, staticStyles.scorriBar]}>
        <Pressable
          style={staticStyles.arrowBtn}
          onPress={() => scrollRef.current?.scrollTo({ x: 0, animated: true })}
        >
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
        </Pressable>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={staticStyles.scorriContent}
          style={{ flex: 1 }}
        >
          {scorriTabs.map((tab) => (
            <ScrollTabIcon
              key={tab.name}
              tab={tab}
              isActive={tab.isFocused}
              itemWidth={itemWidth}
            />
          ))}
        </ScrollView>
        <Pressable
          style={staticStyles.arrowBtn}
          onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    );
  }

  if (style === "raggruppa") {
    const communityMembers = tabs.filter((t) => isCommunityRouteName(t.name));
    const communityFocused = communityMembers.some((t) => t.isFocused);

    const displayItems: Array<TabItem | "community"> = [];
    let communityInserted = false;
    tabs.forEach((tab) => {
      if (isCommunityRouteName(tab.name)) {
        if (!communityInserted) {
          displayItems.push("community");
          communityInserted = true;
        }
      } else {
        displayItems.push(tab);
      }
    });

    return (
      <>
        <View style={[staticStyles.bar, barStyle]}>
          {displayItems.map((item) => {
            if (item === "community") {
              return (
                <Pressable
                  key="community"
                  style={staticStyles.tabItem}
                  onPress={() => setCommunityOpen(true)}
                >
                  <Ionicons
                    name="people"
                    size={24}
                    color={communityFocused ? colors.accent : colors.textSecondary}
                  />
                  <Text
                    style={[
                      staticStyles.tabLabel,
                      { color: communityFocused ? colors.accent : colors.textSecondary },
                    ]}
                  >
                    {t("navigation.community")}
                  </Text>
                </Pressable>
              );
            }
            return (
              <TabIcon
                key={item.name}
                tab={item}
                isActive={item.isFocused}
              />
            );
          })}
        </View>

        <Modal
          visible={communityOpen}
          transparent
          animationType="none"
          onRequestClose={() => setCommunityOpen(false)}
        >
          <Pressable
            style={staticStyles.communityOverlay}
            onPress={() => setCommunityOpen(false)}
          >
            <View
              style={[
                staticStyles.communityMenu,
                { bottom: tabBarHeight, backgroundColor: colors.surface },
              ]}
            >
              {communityMembers.map((tab) => (
                <Pressable
                  key={tab.name}
                  style={[
                    staticStyles.communityItem,
                    tab.isFocused && { backgroundColor: colors.background },
                  ]}
                  onPress={() => {
                    setCommunityOpen(false);
                    tab.onPress();
                  }}
                >
                  {tab.icon(tab.isFocused ? colors.accent : colors.text, 22)}
                  <Text
                    style={[
                      staticStyles.communityItemLabel,
                      { color: tab.isFocused ? colors.accent : colors.text },
                    ]}
                  >
                    {tab.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </>
    );
  }

  return null;
}

const staticStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  scorriBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  scorriContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  arrowBtn: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItem: {
    flex: 1,
    minWidth: 56,
    maxWidth: 90,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  communityOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  communityMenu: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 14,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  communityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 16,
    borderRadius: 10,
  },
  communityItemLabel: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
});
