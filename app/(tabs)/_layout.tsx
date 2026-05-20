import React, { useRef, useEffect, useState } from "react";
import { Tabs, useRouter, usePathname, type Href } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { View, Pressable, Text, StyleSheet, Linking, Modal, Animated, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth-context";
import { useLocationGate } from "@/lib/location-context";
import { useQuery } from "@tanstack/react-query";
import { useTaskbarStyle } from "@/lib/taskbar-style-context";
import { useT } from "@/lib/language-context";
import CustomTabBar, { type TabItem } from "@/components/CustomTabBar";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { registerHandsOffCallback, registerSprintMeasuringCallback, registerTrackingActiveCallback } from "@/lib/tracking-active";

const FAKE_HOME_INTRO_KEY = "fake_home_intro_seen_v1";

export default function TabLayout() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const { isGpsGateActive, requestPermission } = useLocationGate();
  const { taskbarStyle } = useTaskbarStyle();
  const prevUnreadRef = useRef<number>(0);

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
  }, [globalHandsOffActive]);

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace("/welcome");
    }
  }, [user, isLoading]);

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

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/chat/unread-total"],
    enabled: !!user,
    refetchInterval: 6000,
  });

  const unreadCount = unreadData?.count ?? 0;

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current >= 0) {
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // ── Query proposte attive (per icona cromatica "Ride!") ──────────────────
  const { data: proposalMatchesData } = useQuery<{ status: string }[]>({
    queryKey: ["/api/proposals/matches"],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const hasActiveMatches = (proposalMatchesData ?? []).some(
    (m) => m.status === "pending" || m.status === "accepted"
  );

  // ── Fake Home first-access global gate (shown at login/startup) ──────────
  const [showFakeHomeGlobal, setShowFakeHomeGlobal] = useState(false);
  const [fakeHomeDontShowGlobal, setFakeHomeDontShowGlobal] = useState(false);

  const { data: meData } = useQuery({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!meData || !user) return;
    const p = (meData as any)?.profile;
    if (!p) return;
    const unconfigured = p.fakeHomeLatitude == null || p.fakeHomeLongitude == null;
    if (unconfigured) {
      AsyncStorage.getItem(FAKE_HOME_INTRO_KEY).then((val) => {
        if (val !== "dismissed") setShowFakeHomeGlobal(true);
      }).catch(() => {});
    }
  }, [meData, user]);

  // ── Stato visibilità mappa (per icona cromatica "Status") ────────────────
  const ghostMode = profileData?.ghostMode || false;
  const hideFromMap = profileData?.hideFromMap || false;
  const isVisibleOnMap = !ghostMode && !hideFromMap;

  const tabBarHeight = 60 + insets.bottom;
  const tabBarPaddingBottom = insets.bottom;

  const isWeb = Platform.OS === "web";
  const gpsTabHref = (isGpsGateActive && !isWeb) ? null : undefined;

  const HIDDEN_TAB_NAMES = isWeb
    ? new Set<string>([])
    : new Set(["tracking", "garage", "giri", "ride"]);
  if (isGpsGateActive && !isWeb) {
    ["index", "proposals", "ready", "motoclub", "match", "music", "chat", "contest", "eventi", "arcade", "giri"].forEach(
      (n) => HIDDEN_TAB_NAMES.add(n)
    );
  }

  const renderCustomTabBar = (props: BottomTabBarProps) => {
    const { state, descriptors, navigation } = props;

    const tabs: TabItem[] = state.routes
      .filter((route) => !HIDDEN_TAB_NAMES.has(route.name))
      .map((route, _idx) => {
        const descriptor = descriptors[route.key];
        const options = descriptor.options;
        const index = state.routes.findIndex((r) => r.key === route.key);
        const isFocused = state.index === index;
        const iconFn = options.tabBarIcon;

        return {
          name: route.name,
          title:
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : (options.title ?? route.name),
          isFocused,
          icon: (color: string, size: number) => {
            if (!iconFn) return null;
            return iconFn({ focused: isFocused, color, size }) as React.ReactNode;
          },
          onPress: () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          },
        };
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

  return (
    <>
      {isGpsGateActive && !isWeb && (
        <View style={[gpsBannerStyles.banner, { paddingTop: insets.top + 12 }]}>
          <Ionicons name="navigate-outline" size={28} color="#fff" />
          <Text style={gpsBannerStyles.title}>GPS non attivo</Text>
          <Text style={gpsBannerStyles.text}>
            BikerLink ha bisogno della posizione per funzionare.{"\n"}
            Senza GPS puoi accedere solo al Profilo.
          </Text>
          <Pressable
            style={gpsBannerStyles.btn}
            onPress={async () => {
              const granted = await requestPermission();
              if (!granted) {
                Linking.openSettings();
              }
            }}
          >
            <Ionicons name="location" size={18} color="#fff" />
            <Text style={gpsBannerStyles.btnText}>Attiva posizione</Text>
          </Pressable>
        </View>
      )}
      <Tabs
        tabBar={renderCustomTabBar}
        screenOptions={{
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
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
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="map" size={size} color={color} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="proposals"
          options={{
            title: t("proposals.hub.tabTitle"),
            tabBarIcon: () => (
              <MaterialCommunityIcons
                name="motorbike"
                size={22}
                color={
                  globalTrackingActive || globalSprintMeasuring || hasActiveMatches
                    ? "#f97316"
                    : colors.text
                }
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
            tabBarIcon: () => (
              <Ionicons
                name="location"
                size={22}
                color={isVisibleOnMap ? colors.success : colors.accentRed}
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
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="shield" size={size} color={color} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="eventi"
          options={{
            title: t("events.tabTitle"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar" size={size} color={color} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="match"
          options={{
            title: "Match",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="flash" size={size} color={color} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="music"
          options={{
            title: t("music.tabTitle"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="musical-notes-outline" size={size} color={color} />
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: "Chat",
            tabBarIcon: ({ color, size }) => (
              <View>
                <Ionicons name="chatbubbles" size={size} color={color} />
                {unreadCount > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -4,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.accent,
                    }}
                  />
                )}
              </View>
            ),
            headerShown: false,
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="contest"
          options={{
            title: "Pic!",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="camera" size={size} color={color} />
            ),
            headerTitle: "Pic!",
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="arcade"
          options={{
            title: "Arcade",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="game-controller" size={size} color={color} />
            ),
            headerTitle: "Arcade",
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="ride"
          options={{
            title: "Privacy & GPS",
            tabBarIcon: () => null,
            headerTitle: "Privacy & GPS",
            href: null,
          }}
        />
        <Tabs.Screen
          name="giri"
          options={{
            title: "Giri",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="map-marker-path" size={size} color={color} />
            ),
            headerShown: false,
            href: null,
          }}
        />
        <Tabs.Screen
          name="tracking"
          options={{
            title: t("tracking.tabTitle"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="navigate" size={size} color={color} />
            ),
            headerTitle: t("tracking.recordRide"),
            href: isWeb ? undefined : null,
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
            tabBarIcon: ({ color, size }) =>
              isBikerOrCoppia ? (
                <MaterialCommunityIcons name="motorbike" size={size} color={color} />
              ) : (
                <Ionicons name="heart" size={size} color={color} />
              ),
            headerTitle: isBikerOrCoppia ? t("garage.myGarage") : t("garage.myWishlist"),
            href: isWeb ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t("profile.title"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
            headerTitle: t("profile.myProfile"),
          }}
        />
      </Tabs>

      {globalSprintMeasuring && (
        <View style={sprintLockOverlayStyles.overlay} pointerEvents="box-only">
          <Text style={sprintLockOverlayStyles.icon}>🏁</Text>
          <Text style={sprintLockOverlayStyles.title}>{t("common.measurement0100")}</Text>
          <Text style={sprintLockOverlayStyles.msg}>{t("tracking.navigateCompleteRide")}</Text>
        </View>
      )}

      {globalHandsOffActive && (
        <View
          style={handsOffOverlayStyles.overlay}
          pointerEvents="box-only"
        >
          <Animated.View style={{ opacity: handsOffBlinkAnim, alignItems: "center" }}>
            <Text style={handsOffOverlayStyles.title}>⚠ ATTENZIONE!</Text>
            <Text style={handsOffOverlayStyles.msg}>
              SOPRA {handsOffThreshold} km/h — HANDS OFF
            </Text>
            <Text style={handsOffOverlayStyles.sub}>Rallenta per sbloccare i controlli</Text>
          </Animated.View>
        </View>
      )}

      <Modal
        visible={showGarageReminder}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGarageReminder(false)}
      >
        <View style={reminderStyles.overlay}>
          <View style={[reminderStyles.card, { backgroundColor: colors.surface }]}>
            <Ionicons
              name={isBikerOrCoppia ? "build" : "heart"}
              size={36}
              color={colors.accent}
              style={{ marginBottom: 12 }}
            />
            <Text style={[reminderStyles.text, { color: colors.text }]}>
              {isBikerOrCoppia
                ? t("profile.garageReminder")
                : t("profile.wishlistReminder")}
            </Text>
            <Pressable
              style={[reminderStyles.btn, { backgroundColor: colors.accent }]}
              onPress={() => {
                setShowGarageReminder(false);
                router.push("/garage" as Href);
              }}
            >
              <Text style={reminderStyles.btnText}>Ok</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showFakeHomeGlobal} transparent animationType="fade" onRequestClose={() => setShowFakeHomeGlobal(false)}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 24, width: "100%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <Ionicons name="home" size={28} color={colors.accent} />
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.text, flex: 1 }}>Configura Fake Home</Text>
            </View>
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary, lineHeight: 20, marginBottom: 16 }}>
              La zona Fake Home non è ancora configurata.{"\n\n"}Vai in Privacy & GPS per impostare la posizione reale di casa e quella fittizia: quando sei nel raggio, la tua posizione visibile verrà sostituita automaticamente.
            </Text>
            <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }} onPress={() => setFakeHomeDontShowGlobal(!fakeHomeDontShowGlobal)}>
              <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: fakeHomeDontShowGlobal ? colors.accent : colors.border, backgroundColor: fakeHomeDontShowGlobal ? colors.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
                {fakeHomeDontShowGlobal && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Non mostrare più</Text>
            </Pressable>
            <Pressable style={{ backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center" }} onPress={() => {
              if (fakeHomeDontShowGlobal) AsyncStorage.setItem(FAKE_HOME_INTRO_KEY, "dismissed").catch(() => {});
              setShowFakeHomeGlobal(false);
            }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const sprintLockOverlayStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9998,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#facc15",
    textAlign: "center",
    marginBottom: 8,
  },
  msg: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#ffffff",
    textAlign: "center",
  },
});

const handsOffOverlayStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(220, 38, 38, 0.18)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 8,
  },
  msg: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 12,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#ef4444",
    textAlign: "center",
  },
});

const gpsBannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: "#D32F2F",
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#fff",
  },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});

const reminderStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#000",
  },
});
