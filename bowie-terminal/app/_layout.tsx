import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";

// Mostra le notifiche anche con app in foreground (le risposte di Bowie).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

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
