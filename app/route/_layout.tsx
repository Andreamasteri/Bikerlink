import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function RouteLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="[id]" options={{ headerTitle: "Dettaglio Percorso" }} />
    </Stack>
  );
}
