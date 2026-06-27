import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const ROUTES_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.accent,
  headerTitleStyle: { color: Colors.text },
  contentStyle: { backgroundColor: Colors.background },
} as const;

// ANTI-LOOP: options per-screen estratte in costante module-level.
const ROUTES_OPTS: Record<string, { title: string; headerShown: boolean }> = {
  "index": { title: "I Miei Percorsi", headerShown: true },
  "create": { title: "Nuovo Percorso", headerShown: true },
  "[id]": { title: "Dettaglio Percorso", headerShown: true },
} as const;

export default function RoutesLayout() {
  return (
    <Stack screenOptions={ROUTES_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={ROUTES_OPTS["index"]} />
      <Stack.Screen name="create" options={ROUTES_OPTS["create"]} />
      <Stack.Screen name="[id]" options={ROUTES_OPTS["[id]"]} />
    </Stack>
  );
}
