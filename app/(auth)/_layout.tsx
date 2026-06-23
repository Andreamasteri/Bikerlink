import { Stack } from "expo-router";
import React from "react";
import Colors from "@/constants/colors";

const AUTH_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
  animation: "slide_from_right",
} as const;

export default function AuthLayout() {
  return (
    <Stack screenOptions={AUTH_SCREEN_OPTIONS}>
      <Stack.Screen name="splash" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify-email" />
    </Stack>
  );
}
