import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const CONTEST_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.text,
  headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
} as const;

export default function ContestLayout() {
  return (
    <Stack screenOptions={CONTEST_SCREEN_OPTIONS}>
      <Stack.Screen name="winners" options={{ headerTitle: "Hall of Fame" }} />
    </Stack>
  );
}
