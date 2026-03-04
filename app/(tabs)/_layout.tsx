import React, { useEffect, useCallback } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Platform, BackHandler } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const handler = () => true;
    const sub = BackHandler.addEventListener("hardwareBackPress", handler);
    return () => sub.remove();
  }, []);

  const tabBarHeight = Platform.OS === "web" ? 84 : 56 + insets.bottom;
  const tabBarPaddingBottom = Platform.OS === "web" ? 34 : insets.bottom;

  return (
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
        }}
      />
      <Tabs.Screen
        name="proposals"
        options={{
          title: "Proposte",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone" size={size} color={color} />
          ),
          headerTitle: "Proposte e Richieste",
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: "Tracking",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate" size={size} color={color} />
          ),
          headerTitle: "GPS Tracking",
        }}
      />
      <Tabs.Screen
        name="contest"
        options={{
          title: "Concorso",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera" size={size} color={color} />
          ),
          headerTitle: "Concorso Foto",
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
  );
}
