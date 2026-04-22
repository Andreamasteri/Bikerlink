import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type SensorEntry = {
  name: string;
  route: string;
  platform: "android" | "ios" | "cross";
  description: string;
  defaultConfig: string;
};

const SENSORS: SensorEntry[] = [
  {
    name: "Accelerometer",
    route: "accelerometer",
    platform: "cross",
    description: "Forza d'accelerazione su 3 assi (x, y, z)",
    defaultConfig: '{"interval": 500}',
  },
  {
    name: "Gyroscope",
    route: "gyroscope",
    platform: "cross",
    description: "Velocità di rotazione su 3 assi",
    defaultConfig: '{"interval": 500}',
  },
  {
    name: "Magnetometer",
    route: "magnetometer",
    platform: "cross",
    description: "Campo magnetico calibrato su 3 assi (µT)",
    defaultConfig: '{"interval": 500}',
  },
  {
    name: "Magnetometer Uncalibrated",
    route: "magnetometer-uncalibrated",
    platform: "android",
    description: "Campo magnetico grezzo con bias — solo Android",
    defaultConfig: '{"interval": 500}',
  },
  {
    name: "Barometer",
    route: "barometer",
    platform: "cross",
    description: "Pressione atmosferica (hPa) e altitudine relativa",
    defaultConfig: '{"interval": 500}',
  },
  {
    name: "DeviceMotion",
    route: "device-motion",
    platform: "cross",
    description: "Accelerazione, giroscopio, orientamento fusi",
    defaultConfig: '{"interval": 500}',
  },
  {
    name: "Pedometer",
    route: "pedometer",
    platform: "cross",
    description: "Contatore passi in tempo reale",
    defaultConfig: "{}",
  },
  {
    name: "LightSensor",
    route: "light-sensor",
    platform: "android",
    description: "Intensità luminosa (lux) — solo Android",
    defaultConfig: '{"interval": 500}',
  },
];

function PlatformBadge({ platform }: { platform: "android" | "ios" | "cross" }) {
  if (platform === "android") {
    return (
      <View style={[styles.badge, { backgroundColor: "#3ddc84" + "22" }]}>
        <Text style={[styles.badgeText, { color: "#3ddc84" }]}>Android</Text>
      </View>
    );
  }
  if (platform === "ios") {
    return (
      <View style={[styles.badge, { backgroundColor: "#007aff" + "22" }]}>
        <Text style={[styles.badgeText, { color: "#007aff" }]}>iOS</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: Colors.textSecondary + "22" }]}>
      <Text style={[styles.badgeText, { color: Colors.textSecondary }]}>Android · iOS</Text>
    </View>
  );
}

export default function SensorsRaw() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: insets.bottom + 24,
          paddingTop: Platform.OS === "web" ? 67 : 16,
        },
      ]}
    >
      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
        <Text style={styles.infoText}>
          Nessun sensore si avvia automaticamente. Apri un sensore, configura i parametri e premi{" "}
          <Text style={styles.infoEmphasis}>Avvia</Text> per iniziare la lettura.
        </Text>
      </View>

      {SENSORS.map((sensor) => (
        <TouchableOpacity
          key={sensor.route}
          style={styles.card}
          onPress={() => router.push(`/admin/sensors/${sensor.route}` as never)}
          activeOpacity={0.7}
        >
          <View style={styles.cardLeft}>
            <Ionicons name="hardware-chip-outline" size={22} color={Colors.accent} />
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{sensor.name}</Text>
              <Text style={styles.cardDesc}>{sensor.description}</Text>
              <PlatformBadge platform={sensor.platform} />
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 10,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Colors.accent + "11",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "33",
    padding: 12,
    marginBottom: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  infoEmphasis: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
  },
  cardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  cardDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 2,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
