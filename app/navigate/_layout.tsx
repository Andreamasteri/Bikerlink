import { Stack } from "expo-router";
import Colors from "@/constants/colors";

// ANTI-LOOP: costante statica — stessa fix AdminLayout/tab (#187).
const NAVIGATE_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function NavigateLayout() {
  return <Stack screenOptions={NAVIGATE_SCREEN_OPTIONS} />;
}
