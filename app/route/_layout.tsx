import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const ROUTE_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.accent,
  headerTitleStyle: { color: Colors.text },
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function RouteLayout() {
  return (
    <Stack screenOptions={ROUTE_SCREEN_OPTIONS}>
      <Stack.Screen name="tracking" options={{ title: "Tracking GPS", headerShown: true }} />
      <Stack.Screen name="[id]" options={{ title: "Dettaglio Percorso", headerShown: true }} />
    </Stack>
  );
}
