import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Tabs, useRouter, type Href } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { Animated } from "react-native";
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
import { getTabScreens } from "./_layout.part2";
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

  const didRedirectRef = useRef(false);
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!isLoading && hasWaited && user === null && !didRedirectRef.current) {
      didRedirectRef.current = true;
      routerRef.current.replace("/(auth)/login" as Href);
    }
  }, [user, isLoading, hasWaited]);

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
  const tabBarHeight = 60 + insets.bottom;

  const renderCustomTabBar = useCallback((props: BottomTabBarProps) => {
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
  }, [showCalibrationBadge, taskbarStyle, tabBarHeight, tabBarPaddingBottom]);
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

  const tabScreens = useMemo(
    () => getTabScreens(t, {
      gpsTabHref,
      globalTrackingActive,
      globalSprintMeasuring,
      hasActiveMatches,
      statusIsAvailable,
      newMatchCount,
      unreadCount,
      showCalibrationBadge,
      isBikerOrCoppia,
    }),
    [t, gpsTabHref, globalTrackingActive, globalSprintMeasuring,
     hasActiveMatches, statusIsAvailable, newMatchCount, unreadCount,
     showCalibrationBadge, isBikerOrCoppia]
  );

  const tabsScreenOptions = useMemo(() => ({
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
  }), [colors.accent, colors.textSecondary, colors.surface, colors.border,
       colors.text, tabBarHeight, tabBarPaddingBottom]);

  return (
    <>
      {isGpsGateActive && (
        <GpsBanner requestPermission={requestPermission} />
      )}
      <Tabs
        tabBar={renderCustomTabBar}
        screenOptions={tabsScreenOptions}
      >
        {tabScreens}
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

