import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen
        name="negative-preferences"
        options={{
          headerShown: true,
          title: "Preferenze negative",
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.accent,
          headerTitleStyle: { color: Colors.text },
        }}
      />
    </Stack>
  );
}
