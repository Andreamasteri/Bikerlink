import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const CONTEST_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.text,
  headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
} as const;

// ANTI-LOOP: options per-screen estratte in costante module-level.
const CONTEST_OPTS: Record<string, { headerTitle: string }> = {
  "winners": { headerTitle: "Hall of Fame" },
} as const;

export default function ContestLayout() {
  return (
    <Stack screenOptions={CONTEST_SCREEN_OPTIONS}>
      <Stack.Screen name="winners" options={CONTEST_OPTS["winners"]} />
    </Stack>
  );
}
