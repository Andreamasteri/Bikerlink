import React, { useRef, useEffect, useState } from "react";
import { Tabs, useRouter, usePathname, type Href } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Platform, View, Pressable, Text, StyleSheet, Linking, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useLocationGate } from "@/lib/location-context";
import { useQuery } from "@tanstack/react-query";
import { useTaskbarStyle } from "@/lib/taskbar-style-context";
import CustomTabBar, { type TabItem } from "@/components/CustomTabBar";
import { MiniPlayer, MINI_PLAYER_HEIGHT } from "@/components/MiniPlayer";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const { isGpsGateActive, requestPermission } = useLocationGate();
  const { taskbarStyle } = useTaskbarStyle();
  const prevUnreadRef = useRef<number>(0);

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace("/(auth)/login");
    }
  }, [user, isLoading]);

  const isBikerOrCoppia = user?.userType === "biker" || user?.userType === "coppia";
  const isZavorrina = user?.userType === "zavorrina";
  const needsGarageReminder = isBikerOrCoppia || isZavorrina;

  const [showGarageReminder, setShowGarageReminder] = useState(false);
  const reminderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: profileData } = useQuery({
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
      if (Platform.OS === "web" && typeof window !== "undefined" && (window as any).AudioContext) {
        try {
          const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800;
          gain.gain.value = 0.1;
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        } catch {}
      }
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const isAvailable = (profileData as any)?.isAvailable || false;

  const tabBarHeight = Platform.OS === "web" ? 84 : 60 + insets.bottom;
  const tabBarPaddingBottom = Platform.OS === "web" ? 34 : insets.bottom;

  const gpsTabHref = isGpsGateActive ? null : undefined;

  const HIDDEN_TAB_NAMES = new Set(["tracking", "garage"]);
  if (isGpsGateActive) {
    ["index", "proposals", "ready", "motoclub", "match", "music", "chat", "contest"].forEach(
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

  const miniPlayerBottom = tabBarHeight + 8;
  const isMusicScreen = pathname === "/music" || pathname.includes("/music");

  return (
    <>
      {!isMusicScreen && <MiniPlayer bottomOffset={miniPlayerBottom} />}
      {isGpsGateActive && (
        <View style={[gpsBannerStyles.banner, { paddingTop: Platform.OS === "web" ? 67 + 12 : insets.top + 12 }]}>
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
              if (!granted && Platform.OS !== "web") {
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
        tabBar={taskbarStyle !== "tutti" ? renderCustomTabBar : undefined}
        screenOptions={{
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textSecondary,
          tabBarStyle: {
            backgroundColor: Colors.surface,
            borderTopColor: Colors.border,
            height: tabBarHeight,
            paddingBottom: tabBarPaddingBottom,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: "Inter_500Medium",
          },
          headerStyle: {
            backgroundColor: Colors.surface,
          },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Mappa",
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
            title: "Trip",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="megaphone" size={size} color={color} />
            ),
            headerTitle: isBikerOrCoppia ? "Proposte e Richieste" : "Le Mie Richieste",
            href: gpsTabHref,
          }}
        />
        <Tabs.Screen
          name="ready"
          options={{
            title: "Ride!",
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name="bicycle"
                size={22}
                color={isAvailable ? Colors.success : Colors.accentRed}
              />
            ),
            headerTitle: "Ride!",
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
            title: "Musica",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="musical-notes-outline" size={size} color={color} />
            ),
            headerTitle: "Musica",
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
                      backgroundColor: Colors.accent,
                    }}
                  />
                )}
              </View>
            ),
            headerTitle: "Chat",
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
          name="tracking"
          options={{
            title: "Registra Giro e Performance",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="navigate" size={size} color={color} />
            ),
            headerTitle: "Registra Giro e Performance",
            href: null,
            headerLeft: () => (
              <Pressable onPress={() => router.back()} style={{ marginLeft: 8 }}>
                <Ionicons name="arrow-back" size={24} color={Colors.text} />
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen
          name="garage"
          options={{
            title: isBikerOrCoppia ? "Garage" : "Wishlist",
            tabBarIcon: ({ color, size }) =>
              isBikerOrCoppia ? (
                <MaterialCommunityIcons name="motorbike" size={size} color={color} />
              ) : (
                <Ionicons name="heart" size={size} color={color} />
              ),
            headerTitle: isBikerOrCoppia ? "Il Mio Garage" : "La Mia Wishlist",
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profilo",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
            headerTitle: "Il Mio Profilo",
          }}
        />
      </Tabs>

      <Modal
        visible={showGarageReminder}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGarageReminder(false)}
      >
        <View style={reminderStyles.overlay}>
          <View style={reminderStyles.card}>
            <Ionicons
              name={isBikerOrCoppia ? "build" : "heart"}
              size={36}
              color={Colors.accent}
              style={{ marginBottom: 12 }}
            />
            <Text style={reminderStyles.text}>
              {isBikerOrCoppia
                ? "Ehi, ricordati di parcheggiare le tue moto nel garage!! Lo trovi sotto Profilo Utente, in fondo a destra"
                : "Ehi, ricordati di condividere la tua lista dei desideri motociclistica! La trovi sotto Profilo Utente, in fondo a destra"}
            </Text>
            <Pressable
              style={reminderStyles.btn}
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
    </>
  );
}

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
    backgroundColor: Colors.surface,
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
    color: Colors.text,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  btn: {
    backgroundColor: Colors.accent,
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
