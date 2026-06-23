import { Stack } from "expo-router";
import Colors from "@/constants/colors";

const PROPOSALS_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function ProposalsLayout() {
  return <Stack screenOptions={PROPOSALS_SCREEN_OPTIONS} />;
}
