import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const MOTOCLUB_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function MotoclubLayout() {
  return <Stack screenOptions={MOTOCLUB_SCREEN_OPTIONS} />;
}
