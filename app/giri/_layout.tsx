import { Stack } from "expo-router";
import Colors from "@/constants/colors";

// ANTI-LOOP: costante statica — stessa fix AdminLayout/tab (#187).
const GIRI_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function GiriLayout() {
  return <Stack screenOptions={GIRI_SCREEN_OPTIONS} />;
}
