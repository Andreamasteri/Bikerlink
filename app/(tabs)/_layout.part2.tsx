import React from "react";
import { Tabs } from "expo-router";
import { TabIcon } from "@/components/TabIcons";

export function getTabScreens(t: (key: string) => string, config: {
  gpsTabHref: any;
  globalTrackingActive: boolean;
  globalSprintMeasuring: boolean;
  hasActiveMatches: boolean;
  statusIsAvailable: boolean;
  newMatchCount: number;
  unreadCount: number;
  showCalibrationBadge: boolean;
  isBikerOrCoppia: boolean;
}) {
  const {
    gpsTabHref,
    globalTrackingActive,
    globalSprintMeasuring,
    hasActiveMatches,
    statusIsAvailable,
    newMatchCount,
    unreadCount,
    showCalibrationBadge,
    isBikerOrCoppia
  } = config;

  return [
    <Tabs.Screen
      key="index"
      name="index"
      options={{
        title: t("map.title"),
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="index" color={color} size={size} focused={focused} />
        ),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="proposals"
      name="proposals"
      options={{
        title: t("proposals.hub.tabTitle"),
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon
            name="proposals"
            color={color}
            size={size}
            focused={focused}
            globalTrackingActive={globalTrackingActive}
            globalSprintMeasuring={globalSprintMeasuring}
            hasActiveMatches={hasActiveMatches}
          />
        ),
        headerTitle: t("proposals.hub.headerTitle"),
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="ready"
      name="ready"
      options={{
        title: "Status",
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon
            name="ready"
            color={color}
            size={size}
            focused={focused}
            statusIsAvailable={statusIsAvailable}
          />
        ),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="motoclub"
      name="motoclub"
      options={{
        title: "Clubs",
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="motoclub" color={color} size={size} focused={focused} />
        ),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="eventi"
      name="eventi"
      options={{
        title: t("events.tabTitle"),
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="eventi" color={color} size={size} focused={focused} />
        ),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="match"
      name="match"
      options={{
        title: "Match",
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="match" color={color} size={size} focused={focused} newMatchCount={newMatchCount} />
        ),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="music"
      name="music"
      options={{
        title: t("music.tabTitle"),
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="music" color={color} size={size} focused={focused} />
        ),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="chat"
      name="chat"
      options={{
        title: "Chat",
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon
            name="chat"
            color={color}
            size={size}
            focused={focused}
            unreadCount={unreadCount}
          />
        ),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="contest"
      name="contest"
      options={{
        title: "Pic!",
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="contest" color={color} size={size} focused={focused} />
        ),
        headerTitle: "Pic!",
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="arcade"
      name="arcade"
      options={{
        title: "Arcade",
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="arcade" color={color} size={size} focused={focused} />
        ),
        headerTitle: "Arcade",
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="ride"
      name="ride"
      options={{
        title: "Privacy & GPS",
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="ride" color={color} size={size} focused={focused} />
        ),
        headerTitle: "Privacy & GPS",
        href: null,
      }}
    />,
    <Tabs.Screen
      key="giri"
      name="giri"
      options={{
        title: "Giri",
        href: null,
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="giri" color={color} size={size} focused={focused} />
        ),
        headerShown: false,
      }}
    />,
    <Tabs.Screen
      key="tracking"
      name="tracking"
      options={{
        title: t("tracking.tabTitle"),
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name="tracking" color={color} size={size} focused={focused} />
        ),
        headerTitle: t("tracking.recordRide"),
        href: null,
      }}
    />,
    <Tabs.Screen
      key="garage"
      name="garage"
      options={{
        title: isBikerOrCoppia ? t("garage.tabTitle") : t("garage.tabWishlist"),
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon
            name="garage"
            color={color}
            size={size}
            focused={focused}
            isBikerOrCoppia={isBikerOrCoppia}
          />
        ),
        headerTitle: isBikerOrCoppia ? t("garage.myGarage") : t("garage.myWishlist"),
        href: null,
      }}
    />,
    <Tabs.Screen
      key="profile"
      name="profile"
      options={{
        title: t("profile.title"),
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon
            name="profile"
            color={color}
            size={size}
            focused={focused}
            showCalibrationBadge={showCalibrationBadge}
          />
        ),
        headerTitle: t("profile.myProfile"),
      }}
    />,
  ];
}
