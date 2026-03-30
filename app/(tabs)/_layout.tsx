import React, { useRef, useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Platform, View, Pressable, Text, StyleSheet, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useLocationGate } from "@/lib/location-context";
import { useQuery } from "@tanstack/react-query";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { isGpsGateActive, requestPermission } = useLocationGate();
  const prevUnreadRef = useRef<number>(0);

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace("/(auth)/login");
    }
  }, [user, isLoading]);

  const isBikerOrCoppia = user?.userType === "biker" || user?.userType === "coppia";

  const { data: profileData } = useQuery({
    queryKey: ["/api/users/profile"],
    enabled: !!user,
  });

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

  return (
    <>
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
            title: isBikerOrCoppia ? "Proposte" : "Richieste",
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
            title: "Motoclub",
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
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={isBikerOrCoppia ? "build" : "heart"} size={size} color={color} />
            ),
            headerTitle: isBikerOrCoppia ? "Il Mio Garage" : "La Mia Wishlist",
            href: null,
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
