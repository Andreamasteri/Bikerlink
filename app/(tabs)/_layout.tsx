import React, { useEffect } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Platform, BackHandler, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const isBikerOrCoppia = user?.userType === "biker" || user?.userType === "coppia";

  const { data: profileData } = useQuery({
    queryKey: ["/api/users/profile"],
    enabled: !!user,
  });

  const isAvailable = (profileData as any)?.profile?.isAvailable || false;

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const handler = () => true;
    const sub = BackHandler.addEventListener("hardwareBackPress", handler);
    return () => sub.remove();
  }, []);

  const tabBarHeight = Platform.OS === "web" ? 84 : 60 + insets.bottom;
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
        tabBarLabelStyle: {
          fontSize: 9,
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
        name="ready"
        options={{
          title: "Ready\nto Ride",
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name="bicycle"
              size={22}
              color={isAvailable ? Colors.success : Colors.accentRed}
            />
          ),
          headerTitle: "Ready to Ride",
          tabBarLabel: ({ focused }) => (
            <Text style={{
              fontSize: 9,
              fontFamily: "Inter_500Medium",
              color: focused ? Colors.accent : Colors.textSecondary,
              textAlign: "center",
              lineHeight: 11,
            }}>
              {"Ready\nto Ride"}
            </Text>
          ),
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
      {isBikerOrCoppia ? (
        <Tabs.Screen
          name="garage"
          options={{
            title: "Garage",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="build" size={size} color={color} />
            ),
            headerTitle: "Il Mio Garage",
          }}
        />
      ) : (
        <Tabs.Screen
          name="garage"
          options={{
            href: null,
          }}
        />
      )}
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
