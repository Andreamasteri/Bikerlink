import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function FeedbackLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" options={{ headerTitle: "Bug & Richieste" }} />
    </Stack>
  );
}
