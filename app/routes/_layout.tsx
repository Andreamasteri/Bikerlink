import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const ROUTES_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.accent,
  headerTitleStyle: { color: Colors.text },
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function RoutesLayout() {
  return (
    <Stack screenOptions={ROUTES_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={{ title: "I Miei Percorsi", headerShown: true }} />
      <Stack.Screen name="create" options={{ title: "Nuovo Percorso", headerShown: true }} />
      <Stack.Screen name="[id]" options={{ title: "Dettaglio Percorso", headerShown: true }} />
    </Stack>
  );
}
