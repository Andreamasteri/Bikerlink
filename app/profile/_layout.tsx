import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const PROFILE_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

const NEG_PREFS_OPTIONS = {
  headerShown: true,
  title: "Preferenze negative",
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.accent,
  headerTitleStyle: { color: Colors.text },
} as const;

export default function ProfileLayout() {
  return (
    <Stack screenOptions={PROFILE_SCREEN_OPTIONS}>
      <Stack.Screen name="negative-preferences" options={NEG_PREFS_OPTIONS} />
    </Stack>
  );
}
