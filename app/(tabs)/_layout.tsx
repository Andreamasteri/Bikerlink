import React, { useRef, useEffect, useState } from "react";
import { Tabs, useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Pressable, Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth-context";
import { useLocationGate } from "@/lib/location-context";
import { useQuery } from "@tanstack/react-query";
import { useTaskbarStyle } from "@/lib/taskbar-style-context";
import { useT } from "@/lib/language-context";
import CustomTabBar, { type TabItem } from "@/components/CustomTabBar";
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];
import { useTabBadges } from "@/hooks/useTabBadges";
import { useNewMatchAlert } from "@/hooks/useNewMatchAlert";
import { TabIcon } from "@/components/TabIcons";
import { GpsBanner } from "@/components/layout/GpsBanner";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { useAutoTelemetry } from "@/lib/auto-telemetry-context";
import { SafetyOverlay } from "@/components/layout/SafetyOverlay";
import { GarageReminderModal } from "@/components/layout/GarageReminderModal";
import { FakeHomeIntroModal } from "@/components/layout/FakeHomeIntroModal";
import {
  registerHandsOffCallback,
  registerSprintMeasuringCallback,
  registerTrackingActiveCallback,
} from "@/lib/tracking-active";

const FAKE_HOME_INTRO_KEY = "fake_home_intro_seen_v1";

interface LayoutGatingMeData {
  profile?: { fakeHomeLatitude?: number | null; fakeHomeLongitude?: number | null } | null;
}

function useLayoutGating(
  user: { id?: string | number | null } | null | undefined,
  meData: LayoutGatingMeData | null | undefined
) {
  const [showFakeHomeGlobal, setShowFakeHomeGlobal] = useState(false);
  const [fakeHomeDontShowGlobal, setFakeHomeDontShowGlobal] = useState(false);

  useEffect(() => {
    if (!meData || !user) return;
    const p = meData?.profile;
    if (!p) return;
    const unconfigured = p.fakeHomeLatitude == null || p.fakeHomeLongitude == null;
    if (unconfigured) {
      AsyncStorage.getItem(FAKE_HOME_INTRO_KEY).then((val) => {
        if (val !== "dismissed") setShowFakeHomeGlobal(true);
      }).catch(() => {});
    }
  }, [meData, user]);

  return {
    showFakeHomeGlobal,
    setShowFakeHomeGlobal,
    fakeHomeDontShowGlobal,
    setFakeHomeDontShowGlobal,
  };
}

export default function TabLayout() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    sendStartupBeacon("tabs_layout_mount", { hasUser: !!user, authLoading: isLoading });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { isGpsGateActive, requestPermission } = useLocationGate();
  const { taskbarStyle } = useTaskbarStyle();
  const { unreadCount, hasActiveMatches } = useTabBadges();
  const { newMatchCount } = useNewMatchAlert();
  const { alwaysActive, isCalibrated, isAutoRiding } = useAutoTelemetry();
  const showCalibrationBadge = alwaysActive && (!isCalibrated || !isAutoRiding);

  // ── Global Hands-Off overlay ────────────────────────────────────────────────
  const [globalHandsOffActive, setGlobalHandsOffActive] = useState(false);
  const [handsOffThreshold, setHandsOffThreshold] = useState(50);
  const handsOffBlinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsub = registerHandsOffCallback((active, thresholdKmh) => {
      setGlobalHandsOffActive(active);
      setHandsOffThreshold(thresholdKmh);
    });
    return unsub;
  }, []);

  // ── Global 0-100 Sprint nav-lock overlay ────────────────────────────────────
  const [globalSprintMeasuring, setGlobalSprintMeasuring] = useState(false);

  useEffect(() => {
    const unsub = registerSprintMeasuringCallback(setGlobalSprintMeasuring);
    return unsub;
  }, []);

  // ── Tracking Active (per icona cromatica tab "Ride!") ────────────────────
  const [globalTrackingActive, setGlobalTrackingActive] = useState(false);

  useEffect(() => {
    const unsub = registerTrackingActiveCallback(setGlobalTrackingActive);
    return unsub;
  }, []);

  useEffect(() => {
    if (globalHandsOffActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(handsOffBlinkAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
          Animated.timing(handsOffBlinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      handsOffBlinkAnim.setValue(1);
    }
  }, [globalHandsOffActive, handsOffBlinkAnim]);

  const [hasWaited, setHasWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHasWaited(true), 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isLoading && hasWaited && user === null) {
      router.replace("/(auth)/login");
    }
  }, [user, isLoading, hasWaited, router]);

  const isBikerOrCoppia = user?.userType === "biker" || user?.userType === "coppia";
  const isZavorrina = user?.userType === "zavorrina";
  const needsGarageReminder = isBikerOrCoppia || isZavorrina;

  const [showGarageReminder, setShowGarageReminder] = useState(false);
  const reminderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  interface ProfileData {
    isAvailable?: boolean;
    ghostMode?: boolean;
    hideFromMap?: boolean;
  }

  const { data: profileData } = useQuery<ProfileData>({
    queryKey: ["/api/users/profile"],
    enabled: !!user,
  });

  const { data: motorcyclesData } = useQuery({
    queryKey: ["/api/motorcycles"],
    enabled: !!user && isBikerOrCoppia,
  });

  interface WishlistResponse {
    wishlist?: { description?: string };
    motos?: { id: number }[];
  }

  const { data: wishlistData } = useQuery<WishlistResponse>({
    queryKey: ["/api/wishlist"],
    enabled: !!user && isZavorrina,
  });

  const { data: meData } = useQuery({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });
  const tabBarPaddingBottom = insets.bottom;

  const renderCustomTabBar = (props: BottomTabBarProps) => {
    const { state, descriptors, navigation } = props;

    const tabs: TabItem[] = state.routes
      .filter((route) => {
        const options = descriptors[route.key].options as Record<string, unknown>;
        // Exclude href:null screens (tabBarButton is a null-returning function)
        if (typeof options.tabBarButton === "function") return false;
        // Exclude auto-discovered / phantom routes that have no icon configured
        if (!options.tabBarIcon) return false;
        return true;
      })
      .map((route) => {
        const descriptor = descriptors[route.key];
        const options = descriptor.options as Record<string, unknown>;
        const routeIndex = state.routes.indexOf(route);
        const isFocused = state.index === routeIndex;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            const extraParams =
              route.name === "profile" && showCalibrationBadge
                ? { focusTelemetry: "1" }
                : undefined;
            navigation.navigate(
              route.name,
              { ...(route.params as object | undefined), ...extraParams } as never
            );
          }
        };

        const iconRenderer = options.tabBarIcon as
          | ((args: { color: string; size: number; focused: boolean }) => React.ReactNode)
          | undefined;

        return {
          name: route.name,
          title: (options.title as string | undefined) || route.name,
          icon: (color: string, size: number) =>
            iconRenderer ? iconRenderer({ color, size, focused: isFocused }) : null,
          isFocused,
          onPress,
        } satisfies TabItem;
      });

    return (
      <CustomTabBar
        tabs={tabs}
        style={taskbarStyle}
        tabBarHeight={tabBarHeight}
        tabBarPaddingBottom={tabBarPaddingBottom}
      />
    );
  };
  const gpsTabHref: Href | null | undefined = undefined;

  const garageIsEmpty: boolean | undefined = isBikerOrCoppia
    ? (motorcyclesData === undefined ? undefined : Array.isArray(motorcyclesData) ? motorcyclesData.length === 0 : false)
    : isZavorrina
    ? (wishlistData === undefined ? undefined : (wishlistData.motos?.length ?? 0) === 0)
    : false;

  useEffect(() => {
    if (!needsGarageReminder || garageIsEmpty !== true) {
      if (reminderIntervalRef.current) {
        clearInterval(reminderIntervalRef.current);
        reminderIntervalRef.current = null;
      }
      return;
    }
    if (reminderIntervalRef.current) return;
    reminderIntervalRef.current = setInterval(() => {
      setShowGarageReminder(true);
    }, 900000);
    return () => {
      if (reminderIntervalRef.current) {
        clearInterval(reminderIntervalRef.current);
        reminderIntervalRef.current = null;
      }
    };
  }, [needsGarageReminder, garageIsEmpty]);

  const {
    showFakeHomeGlobal,
    setShowFakeHomeGlobal,
    fakeHomeDontShowGlobal,
    setFakeHomeDontShowGlobal,
  } = useLayoutGating(user, meData as LayoutGatingMeData | null | undefined);

  // ── Stato disponibilità (per icona cromatica "Status") ──────────────────
  const statusIsAvailable = profileData?.isAvailable || false;

  const tabBarHeight = 60 + insets.bottom;

  return (
    <>
      {isGpsGateActive && (
        <GpsBanner requestPermission={requestPermission} />
      )}
      <Tabs
        tabBar={renderCustomTabBar}
        screenOptions={{
          tabBarActiveTintColor: colors.accent as string,
          tabBarInactiveTintColor: colors.textSecondary as string,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: tabBarHeight,
            paddingBottom: tabBarPaddingBottom,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: "Inter_500Medium",
          },
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("map.title"),
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="index" color={color} size={size} focused={focused} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
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
        />
        <Tabs.Screen
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
        />
        <Tabs.Screen
          name="motoclub"
          options={{
            title: "Clubs",
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="motoclub" color={color} size={size} focused={focused} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="eventi"
          options={{
            title: t("events.tabTitle"),
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="eventi" color={color} size={size} focused={focused} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="match"
          options={{
            title: "Match",
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="match" color={color} size={size} focused={focused} newMatchCount={newMatchCount} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="music"
          options={{
            title: t("music.tabTitle"),
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="music" color={color} size={size} focused={focused} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
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
        />
        <Tabs.Screen
          name="contest"
          options={{
            title: "Pic!",
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="contest" color={color} size={size} focused={focused} />
            ),
            headerTitle: "Pic!",
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="arcade"
          options={{
            title: "Arcade",
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="arcade" color={color} size={size} focused={focused} />
            ),
            headerTitle: "Arcade",
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="ride"
          options={{
            title: "Privacy & GPS",
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="ride" color={color} size={size} focused={focused} />
            ),
            headerTitle: "Privacy & GPS",
            href: null,
          }}
        />
        <Tabs.Screen
          name="giri"
          options={{
            title: "Giri",
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="giri" color={color} size={size} focused={focused} />
            ),
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="tracking"
          options={{
            title: t("tracking.tabTitle"),
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name="tracking" color={color} size={size} focused={focused} />
            ),
            headerTitle: t("tracking.recordRide"),
            href: null,
            headerLeft: () => (
              <Pressable onPress={() => router.back()} style={{ marginLeft: 8 }}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen
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
        />
        <Tabs.Screen
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
        />
      </Tabs>

      {globalSprintMeasuring && (
        <SafetyOverlay
          type="sprint"
          icon="🏁"
          title={t("common.measurement0100")}
          message={t("tracking.navigateCompleteRide")}
        />
      )}

      {globalHandsOffActive && (
        <SafetyOverlay
          type="handsoff"
          title="⚠ ATTENZIONE!"
          message="HANDS OFF"
          subMessage="Rallenta per sbloccare i controlli"
          threshold={handsOffThreshold}
          blinkAnim={handsOffBlinkAnim}
        />
      )}

      <GarageReminderModal
        visible={showGarageReminder}
        onClose={() => setShowGarageReminder(false)}
        isBikerOrCoppia={isBikerOrCoppia}
        text={isBikerOrCoppia ? t("profile.garageReminder") : t("profile.wishlistReminder")}
        buttonText="Ok"
      />

      <FakeHomeIntroModal
        visible={showFakeHomeGlobal}
        onClose={(dontShowAgain) => {
          if (dontShowAgain) AsyncStorage.setItem(FAKE_HOME_INTRO_KEY, "dismissed").catch(() => {});
          setShowFakeHomeGlobal(false);
        }}
        dontShowAgain={fakeHomeDontShowGlobal}
        setDontShowAgain={setFakeHomeDontShowGlobal}
      />
    </>
  );
}

