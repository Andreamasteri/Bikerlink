import React, { useRef, useEffect, useState, useCallback } from "react";
import { Tabs, useRouter, type Href } from "expo-router";
import { Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

// ANTI-LOOP (root cause fix OTA #187):
// tabsScreenOptions era un useMemo([colors.surface, colors.text]). Quando il tema
// BikerLink caricava dal server al boot (300-700ms, rete), colors cambiava → nuovo
// ref di tabsScreenOptions → React Navigation eseguiva forEach su tutti i 15 Tab.Screen
// producendo nuovi merged-options object ad ogni iterazione → setOptions → navigation
// state cambia → useLayoutEffect([navigation]) si ri-attiva → altro forEach → loop
// infinito → "Maximum update depth exceeded".
//
// FIX: tabsScreenOptions diventa costante statica (zero dipendenze dal tema).
// I colori degli header (surface, text) vengono ora gestiti dal NavThemeProviderBridge
// in app/_layout.tsx tramite il ThemeProvider di @react-navigation/native, che aggiorna
// il rendering degli header senza mai chiamare setOptions — non c'è cascata possibile.
const TABS_HEADER_TITLE_STYLE = { fontFamily: "Inter_600SemiBold" } as const;
const TABS_SCREEN_OPTIONS = { headerTitleStyle: TABS_HEADER_TITLE_STYLE } as const;

// ANTI-LOOP (root cause fix OTA #190):
// i children di <Tabs> (Tabs.Screen elements) NON devono mai cambiare dopo il mount.
// Qualsiasi ricreazione di options objects → useLayoutEffect × 15 → setOptions × 15
// → scheduleUpdate × 15 → useSyncState.listeners × 50 → loop sincrono → crash.
// Fix: frozenTabScreensRef creato al primo render, mai aggiornato (vedere uso sotto).

interface LayoutGatingMeData {
  profile?: { fakeHomeLatitude?: number | null; fakeHomeLongitude?: number | null } | null;
}

function useLayoutGating(
  user: { id?: string | number | null } | null | undefined,
  meData: LayoutGatingMeData | null | undefined
) {
  const [showFakeHomeGlobal, setShowFakeHomeGlobal] = useState(false);
  const [fakeHomeDontShowGlobal, setFakeHomeDontShowGlobal] = useState(false);

  // Deps primitivi e stabili: meData (da useQuery) e user sono oggetti che
  // cambiano reference a ogni refetch. Estraiamo i soli campi che contano così
  // l'effetto (e il conseguente setShowFakeHomeGlobal) non si ri-scatena a ogni
  // revalidation, contribuendo alla finestra di re-render del loop boot.
  const userId = user?.id ?? null;
  const hasProfile = meData?.profile != null;
  const fakeHomeLat = meData?.profile?.fakeHomeLatitude ?? null;
  const fakeHomeLng = meData?.profile?.fakeHomeLongitude ?? null;

  useEffect(() => {
    if (userId == null || !hasProfile) return;
    const unconfigured = fakeHomeLat == null || fakeHomeLng == null;
    if (unconfigured) {
      AsyncStorage.getItem(FAKE_HOME_INTRO_KEY).then((val) => {
        if (val !== "dismissed") setShowFakeHomeGlobal(true);
      }).catch(() => {});
    }
  }, [userId, hasProfile, fakeHomeLat, fakeHomeLng]);

  return {
    showFakeHomeGlobal,
    setShowFakeHomeGlobal,
    fakeHomeDontShowGlobal,
    setFakeHomeDontShowGlobal,
  };
}

export default function TabLayout() {
  const t = useT();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    sendStartupBeacon("tabs_layout_mount", { hasUser: !!user, authLoading: isLoading });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // mount-only: beacon di avvio, non si riemette al cambio auth
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
  const statusIsAvailable = profileData?.isAvailable || false;

  // ANTI-LOOP: tutti i valori runtime vengono letti da un ref (sempre aggiornato
  // ad ogni render) invece che dalla closure di useCallback. Così renderCustomTabBar
  // ha deps [] → stesso riferimento funzione per sempre → tabBar prop su <Tabs>
  // non cambia mai → nessun setOptions cascade su Tabs.Screen.
  //
  // Senza questo fix: quando React Query completa un refetch nello stesso tick
  // async in cui setVisible(true) della OnboardingTour viene chiamato, React 18
  // automatic batching raggruppa i due update in un unico commit. Il commit
  // include sia AssistantOnboardingTour (Modal che monta) sia TabLayout (re-render
  // da query data). Con le deps di useCallback che includono i valori React Query
  // (hasActiveMatches, unreadCount, ecc.), renderCustomTabBar ottiene un nuovo ref
  // → tabBar prop cambia → React Navigation setOptions cascade su 15 Tabs.Screen
  // → 50+ update annidati → "Maximum update depth exceeded" crash su Android.
  const isTabBarReady = !isLoading && !!user;
  const tabBarStateRef = useRef({
    showCalibrationBadge,
    taskbarStyle,
    globalTrackingActive,
    globalSprintMeasuring,
    hasActiveMatches,
    statusIsAvailable,
    newMatchCount,
    unreadCount,
    isBikerOrCoppia,
    isReady: isTabBarReady,
  });
  tabBarStateRef.current = {
    showCalibrationBadge,
    taskbarStyle,
    globalTrackingActive,
    globalSprintMeasuring,
    hasActiveMatches,
    statusIsAvailable,
    newMatchCount,
    unreadCount,
    isBikerOrCoppia,
    isReady: isTabBarReady,
  };

  const renderCustomTabBar = useCallback((props: BottomTabBarProps) => {
    // Nasconde il tab bar durante il boot (loading / non autenticato) senza
    // rimontare il TabNavigator. Il ref viene aggiornato ad ogni render di
    // TabLayout senza cambiare la function reference di renderCustomTabBar,
    // prevenendo il loop useScheduleUpdate→flushUpdates→setState×50.
    if (!tabBarStateRef.current.isReady) return null;
    const { state, descriptors, navigation } = props;
    const {
      showCalibrationBadge: _showCalibrationBadge,
      taskbarStyle: _taskbarStyle,
      globalTrackingActive: _globalTrackingActive,
      globalSprintMeasuring: _globalSprintMeasuring,
      hasActiveMatches: _hasActiveMatches,
      statusIsAvailable: _statusIsAvailable,
      newMatchCount: _newMatchCount,
      unreadCount: _unreadCount,
      isBikerOrCoppia: _isBikerOrCoppia,
    } = tabBarStateRef.current;

    const tabs: TabItem[] = state.routes
      .filter((route) => {
        const options = descriptors[route.key].options as Record<string, unknown>;
        // Exclude href:null screens (Expo Router sets tabBarButton to a null fn)
        if (typeof options.tabBarButton === "function") return false;
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
              route.name === "profile" && _showCalibrationBadge
                ? { focusTelemetry: "1" }
                : undefined;
            navigation.navigate(
              route.name,
              { ...(route.params as object | undefined), ...extraParams } as never
            );
          }
        };

        return {
          name: route.name,
          title: (options.title as string | undefined) || route.name,
          icon: (color: string, size: number) => (
            <TabIcon
              name={route.name}
              color={color}
              size={size}
              focused={isFocused}
              globalTrackingActive={_globalTrackingActive}
              globalSprintMeasuring={_globalSprintMeasuring}
              hasActiveMatches={_hasActiveMatches}
              statusIsAvailable={_statusIsAvailable}
              newMatchCount={_newMatchCount}
              unreadCount={_unreadCount}
              showCalibrationBadge={_showCalibrationBadge}
              isBikerOrCoppia={_isBikerOrCoppia}
            />
          ),
          isFocused,
          onPress,
        } satisfies TabItem;
      });

    return (
      <CustomTabBar
        tabs={tabs}
        style={_taskbarStyle}
      />
    );
  }, []);
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

  // ANTI-LOOP (fix definitivo OTA #190):
  // tabScreens viene creato UNA SOLA VOLTA al primissimo render del componente
  // e MAI aggiornato dopo — indipendentemente da isTabBarReady / isBikerOrCoppia.
  //
  // Il fix precedente (OTA #189) era ancora sbagliato: usava BOOT_SCREENS prima
  // di isTabBarReady e poi passava a frozenTabScreensRef.current — quella
  // transizione creava di nuovo 15 nuovi options objects → cascade identico.
  //
  // Regola: i children di <Tabs> (gli elementi React.ReactElement dei Tabs.Screen)
  // NON devono mai cambiare dopo il mount. Qualsiasi cambio ricrea le options objects
  // → useLayoutEffect × 15 → setOptions × 15 → useSyncState.listeners × 50 → loop.
  //
  // Compromesso accettabile: al primo render user=null → isBikerOrCoppia=false →
  // il tab "garage" avrà title=t("garage.tabWishlist"). La screen del garage
  // stessa corregge il proprio header con navigation.setOptions quando l'utente
  // la apre. Il tab "garage" ha href:null → non appare nella tab bar custom.
  const frozenTabScreensRef = React.useRef<React.ReactElement[] | null>(null);
  if (frozenTabScreensRef.current === null) {
    frozenTabScreensRef.current = getTabScreens(t, { gpsTabHref, isBikerOrCoppia });
  }
  const tabScreens = frozenTabScreensRef.current;

  // tabBarStyle / tabBarLabelStyle / tabBarActiveTintColor / tabBarInactiveTintColor
  // NON vengono passati a screenOptions (ignorati con renderCustomTabBar custom).
  //
  // ANTI-LOOP definitivo: un solo <Tabs> per tutto il lifecycle → TabNavigator
  // non si rimonta mai. Prima c'erano due branch (minimal / full) che causavano
  // il remount al boot. Al remount, useScheduleUpdate accodava 15 callbacks×render
  // → flushUpdates → store.setState (senza equality check) → useSyncExternalStore
  // re-render → altri 15 callbacks → 50 iterazioni → "Maximum update depth exceeded".
  // Ora renderCustomTabBar ritorna null mentre !isReady (via ref, deps=[]) e il
  // TabNavigator rimane stabile per tutta la sessione.
  return (
    <>
      {isGpsGateActive && (
        <GpsBanner requestPermission={requestPermission} />
      )}
      <Tabs
        tabBar={renderCustomTabBar}
        screenOptions={TABS_SCREEN_OPTIONS}
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

