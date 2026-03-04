import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function ModeratorLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" options={{ headerTitle: "Pannello Moderatore" }} />
    </Stack>
  );
}
