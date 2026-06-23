import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const EVENTO_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function EventoLayout() {
  return <Stack screenOptions={EVENTO_SCREEN_OPTIONS} />;
}
