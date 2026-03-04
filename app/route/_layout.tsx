import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function RouteLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.accent,
        headerTitleStyle: { color: Colors.text },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="tracking" options={{ title: "Tracking GPS", headerShown: true }} />
      <Stack.Screen name="[id]" options={{ title: "Dettaglio Percorso", headerShown: true }} />
    </Stack>
  );
}
