import { Stack } from "expo-router";
import { useMemo } from "react";
import { useColors } from "@/hooks/useColors";

export default function SensorsLayout() {
  const colors = useColors();
  const screenOptions = useMemo(
    () => ({
      headerShown: true,
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.accent,
      headerTitleStyle: { color: colors.text, fontFamily: "Inter_600SemiBold" },
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors.surface, colors.accent, colors.text, colors.background],
  );
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Sensori — Diagnostica" }} />
      <Stack.Screen name="raw" options={{ title: "Dati Grezzi" }} />
      <Stack.Screen name="final" options={{ title: "Dati Finali" }} />
      <Stack.Screen name="accelerometer" options={{ title: "Accelerometer" }} />
      <Stack.Screen name="gyroscope" options={{ title: "Gyroscope" }} />
      <Stack.Screen name="magnetometer" options={{ title: "Magnetometer" }} />
      <Stack.Screen name="magnetometer-uncalibrated" options={{ title: "Magnetometer Uncalibrated" }} />
      <Stack.Screen name="barometer" options={{ title: "Barometer" }} />
      <Stack.Screen name="device-motion" options={{ title: "DeviceMotion" }} />
      <Stack.Screen name="pedometer" options={{ title: "Pedometer" }} />
      <Stack.Screen name="light-sensor" options={{ title: "LightSensor" }} />
    </Stack>
  );
}
