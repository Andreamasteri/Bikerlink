import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

const SCREEN_OPTIONS = {
  headerShown: false as const,
  contentStyle: { backgroundColor: "#0D0D0D" },
  animation: "fade" as const,
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={SCREEN_OPTIONS}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
      </Stack>
    </SafeAreaProvider>
  );
}
