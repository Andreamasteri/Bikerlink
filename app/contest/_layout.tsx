import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function ContestLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
      }}
    >
      <Stack.Screen name="winners" options={{ headerTitle: "Hall of Fame" }} />
    </Stack>
  );
}
