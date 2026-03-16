import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";

if (Platform.OS === "web" && typeof window !== "undefined") {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);

  window.addEventListener("unhandledrejection", (event) => {
    const msg: string = event?.reason?.message ?? "";
    if (msg.includes("timeout exceeded") || msg.includes("fontfaceobserver")) {
      event.preventDefault();
    }
  });

  window.addEventListener("error", (event) => {
    const msg: string = event?.message ?? "";
    if (msg.includes("timeout exceeded") || msg.includes("fontfaceobserver")) {
      event.preventDefault();
      return true;
    }
  });
}
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient, apiRequest } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LocationProvider } from "@/lib/location-context";
import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

function AppStateHandler() {
  const { user } = useAuth();
  const wasAvailableRef = useRef<boolean | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!user) return;

    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (appStateRef.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        try {
          const profileRes = await apiRequest("GET", "/api/users/profile");
          const profile = await profileRes.json();
          wasAvailableRef.current = profile?.isAvailable ?? false;
          if (wasAvailableRef.current) {
            await apiRequest("PUT", "/api/users/me/availability", { isAvailable: false });
          }
        } catch {}
      } else if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
        if (wasAvailableRef.current === true) {
          try {
            await apiRequest("PUT", "/api/users/me/availability", { isAvailable: true });
          } catch {}
          wasAvailableRef.current = null;
        }
        queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      }
      appStateRef.current = nextAppState;
    });

    return () => subscription.remove();
  }, [user]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="proposals" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="route" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="moderator" options={{ headerShown: false }} />
      <Stack.Screen name="contest" options={{ headerShown: false }} />
      <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
      <Stack.Screen name="feedback/index" options={{ headerShown: true, headerTitle: "Feedback", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web"
      ? {}
      : { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold }
  );

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LocationProvider>
            <AppStateHandler />
            <GestureHandlerRootView style={{ flex: 1 }}>
              {Platform.OS === "web" ? (
                <RootLayoutNav />
              ) : (
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              )}
            </GestureHandlerRootView>
          </LocationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
