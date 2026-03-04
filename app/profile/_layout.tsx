import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="[id]" options={{ headerTitle: "Profilo" }} />
      <Stack.Screen name="edit" options={{ headerTitle: "Modifica Profilo", presentation: "modal" }} />
      <Stack.Screen name="easter-eggs" options={{ headerTitle: "Easter Eggs" }} />
    </Stack>
  );
}
