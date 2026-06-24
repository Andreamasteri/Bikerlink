/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Tabs } from "expo-router";

export function getTabScreens(t: (key: string) => string, config: {
  gpsTabHref: any;
  isBikerOrCoppia: boolean;
}) {
  const { gpsTabHref, isBikerOrCoppia } = config;

  return [
    <Tabs.Screen
      key="index"
      name="index"
      options={{
        title: t("map.title"),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="proposals"
      name="proposals"
      options={{
        title: t("proposals.hub.tabTitle"),
        headerTitle: t("proposals.hub.headerTitle"),
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="ready"
      name="ready"
      options={{
        title: "Status",
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="motoclub"
      name="motoclub"
      options={{
        title: "Clubs",
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="eventi"
      name="eventi"
      options={{
        title: t("events.tabTitle"),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="match"
      name="match"
      options={{
        title: "Match",
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="music"
      name="music"
      options={{
        title: t("music.tabTitle"),
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="chat"
      name="chat"
      options={{
        title: "Chat",
        headerShown: false,
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="contest"
      name="contest"
      options={{
        title: "Pic!",
        headerTitle: "Pic!",
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="arcade"
      name="arcade"
      options={{
        title: "Arcade",
        headerTitle: "Arcade",
        href: gpsTabHref,
      }}
    />,
    <Tabs.Screen
      key="ride"
      name="ride"
      options={{
        title: "Privacy & GPS",
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
        headerShown: false,
      }}
    />,
    <Tabs.Screen
      key="tracking"
      name="tracking"
      options={{
        title: t("tracking.tabTitle"),
        headerTitle: t("tracking.recordRide"),
        href: null,
      }}
    />,
    <Tabs.Screen
      key="garage"
      name="garage"
      options={{
        title: isBikerOrCoppia ? t("garage.tabTitle") : t("garage.tabWishlist"),
        headerTitle: isBikerOrCoppia ? t("garage.myGarage") : t("garage.myWishlist"),
        href: null,
      }}
    />,
    <Tabs.Screen
      key="profile"
      name="profile"
      options={{
        title: t("profile.title"),
        headerTitle: t("profile.myProfile"),
      }}
    />,
  ];
}
