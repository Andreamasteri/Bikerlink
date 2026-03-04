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
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/lib/auth-context";
import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

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
      <Stack.Screen name="create-proposal" options={{ headerShown: true, headerTitle: "Nuova Proposta", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text, presentation: "modal" }} />
      <Stack.Screen name="route/[id]" options={{ headerShown: true, headerTitle: "Dettaglio Percorso", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="profile/[id]" options={{ headerShown: true, headerTitle: "Profilo", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
      <Stack.Screen name="profile/edit" options={{ headerShown: true, headerTitle: "Modifica Profilo", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text, presentation: "modal" }} />
      <Stack.Screen name="profile/easter-eggs" options={{ headerShown: true, headerTitle: "Easter Eggs", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="moderator" options={{ headerShown: false }} />
      <Stack.Screen name="contest/winners" options={{ headerShown: true, headerTitle: "Hall of Fame", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
