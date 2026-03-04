import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";

export default function ProposalsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.dark.background },
      }}
    />
  );
}
