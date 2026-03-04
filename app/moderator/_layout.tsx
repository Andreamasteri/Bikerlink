import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";

export default function ModeratorLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.dark.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="logs" />
    </Stack>
  );
}
