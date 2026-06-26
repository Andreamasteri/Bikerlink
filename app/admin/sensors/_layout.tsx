import { Stack } from "expo-router";
import Colors from "@/constants/colors";

// ANTI-LOOP: costante statica — stessa fix del AdminLayout e dei tab (#187).
const SENSORS_SCREEN_OPTIONS = {
  headerShown: true,
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.accent,
  headerTitleStyle: { color: Colors.text, fontFamily: "Inter_600SemiBold" },
  contentStyle: { backgroundColor: Colors.background },
} as const;

export default function SensorsLayout() {
  return (
    <Stack screenOptions={SENSORS_SCREEN_OPTIONS}>
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
