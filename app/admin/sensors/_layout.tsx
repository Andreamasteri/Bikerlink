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

// ANTI-LOOP: options per-screen estratte in costante module-level (no nuovo
// oggetto literal ad ogni render → niente setOptions cascade). Vedi ADMIN_OPTS.
const SENSORS_OPTS: Record<string, { title: string }> = {
  "index": { title: "Sensori — Diagnostica" },
  "raw": { title: "Dati Grezzi" },
  "final": { title: "Dati Finali" },
  "accelerometer": { title: "Accelerometer" },
  "gyroscope": { title: "Gyroscope" },
  "magnetometer": { title: "Magnetometer" },
  "magnetometer-uncalibrated": { title: "Magnetometer Uncalibrated" },
  "barometer": { title: "Barometer" },
  "device-motion": { title: "DeviceMotion" },
  "pedometer": { title: "Pedometer" },
  "light-sensor": { title: "LightSensor" },
} as const;

export default function SensorsLayout() {
  return (
    <Stack screenOptions={SENSORS_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={SENSORS_OPTS["index"]} />
      <Stack.Screen name="raw" options={SENSORS_OPTS["raw"]} />
      <Stack.Screen name="final" options={SENSORS_OPTS["final"]} />
      <Stack.Screen name="accelerometer" options={SENSORS_OPTS["accelerometer"]} />
      <Stack.Screen name="gyroscope" options={SENSORS_OPTS["gyroscope"]} />
      <Stack.Screen name="magnetometer" options={SENSORS_OPTS["magnetometer"]} />
      <Stack.Screen name="magnetometer-uncalibrated" options={SENSORS_OPTS["magnetometer-uncalibrated"]} />
      <Stack.Screen name="barometer" options={SENSORS_OPTS["barometer"]} />
      <Stack.Screen name="device-motion" options={SENSORS_OPTS["device-motion"]} />
      <Stack.Screen name="pedometer" options={SENSORS_OPTS["pedometer"]} />
      <Stack.Screen name="light-sensor" options={SENSORS_OPTS["light-sensor"]} />
    </Stack>
  );
}
