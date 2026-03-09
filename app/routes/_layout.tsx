import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function RoutesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.accent,
        headerTitleStyle: { color: Colors.text },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "I Miei Percorsi", headerShown: true }} />
      <Stack.Screen name="create" options={{ title: "Nuovo Percorso", headerShown: true }} />
      <Stack.Screen name="[id]" options={{ title: "Dettaglio Percorso", headerShown: true }} />
    </Stack>
  );
}
