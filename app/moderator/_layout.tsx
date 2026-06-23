import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const MODERATOR_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function ModeratorLayout() {
  return (
    <Stack screenOptions={MODERATOR_SCREEN_OPTIONS}>
      <Stack.Screen name="index" />
      <Stack.Screen name="campaigns" />
      <Stack.Screen name="feedback" />
    </Stack>
  );
}
