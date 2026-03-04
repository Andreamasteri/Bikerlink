import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";

export default function RouteLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.dark.surface },
        headerTintColor: Colors.dark.accent,
        headerTitleStyle: { color: Colors.dark.text },
        contentStyle: { backgroundColor: Colors.dark.background },
      }}
    >
      <Stack.Screen name="tracking" options={{ title: "Tracking GPS", headerShown: true }} />
      <Stack.Screen name="[id]" options={{ title: "Dettaglio Percorso", headerShown: true }} />
    </Stack>
  );
}
