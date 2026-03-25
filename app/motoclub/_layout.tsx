import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function MotoclubLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
