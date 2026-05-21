import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface WeatherWaypoint {
  lat: number; lng: number; name: string;
  tempNow: number | null; precipProb: number; weatherCode: number;
  weatherDesc: string; isSuitable: boolean;
}

interface WeatherBadgeProps {
  weather: WeatherWaypoint;
}

export const WeatherBadge: React.FC<WeatherBadgeProps> = ({ weather }) => {
  const colors = useColors();
  return (
    <View style={[styles.badge, { backgroundColor: colors.surface }]}>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{weather.name}</Text>
      <View style={styles.info}>
        <Text style={[styles.temp, { color: colors.text }]}>{weather.tempNow !== null ? `${Math.round(weather.tempNow)}°C` : "--°C"}</Text>
        <Text style={[styles.desc, { color: colors.textSecondary }]}>{weather.weatherDesc}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    padding: 8,
    marginRight: 8,
    minWidth: 100,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.1)',
  },
  name: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginBottom: 4,
  },
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  temp: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});
