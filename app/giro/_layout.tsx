import { Stack } from "expo-router";
import Colors from "@/constants/colors";

// ANTI-LOOP: costante statica — stessa fix AdminLayout/tab (#187).
const GIRO_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function GiroLayout() {
  return <Stack screenOptions={GIRO_SCREEN_OPTIONS} />;
}
