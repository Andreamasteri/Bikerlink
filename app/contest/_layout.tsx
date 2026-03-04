import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function ContestLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="winners" options={{ headerTitle: "Hall of Fame" }} />
    </Stack>
  );
}
