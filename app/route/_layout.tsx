import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const ROUTE_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.accent,
  headerTitleStyle: { color: Colors.text },
  contentStyle: { backgroundColor: Colors.background },
} as const;

// ANTI-LOOP: options per-screen estratte in costante module-level.
const ROUTE_OPTS: Record<string, { title: string; headerShown: boolean }> = {
  "tracking": { title: "Tracking GPS", headerShown: true },
  "[id]": { title: "Dettaglio Percorso", headerShown: true },
} as const;

export default function RouteLayout() {
  return (
    <Stack screenOptions={ROUTE_SCREEN_OPTIONS}>
      <Stack.Screen name="tracking" options={ROUTE_OPTS["tracking"]} />
      <Stack.Screen name="[id]" options={ROUTE_OPTS["[id]"]} />
    </Stack>
  );
}
