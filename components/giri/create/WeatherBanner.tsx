import React from "react";
import type { ThemeColors } from '@/constants/colors';
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface WeatherWaypoint {
  lat: number; lng: number; name: string;
  tempNow: number | null; precipProb: number; weatherCode: number;
  weatherDesc: string; isSuitable: boolean;
}

interface WeatherBannerProps {
  weather: WeatherWaypoint[];
  colors: ThemeColors;
}

function _weatherIcon(code: number): keyof typeof Ionicons.glyphMap {
  if (code === 0) return "sunny-outline";
  if (code <= 3) return "partly-sunny-outline";
  if (code <= 59) return "rainy-outline";
  if (code <= 79) return "snow-outline";
  if (code <= 99) return "thunderstorm-outline";
  return "cloud-outline";
}

export const WeatherBanner: React.FC<WeatherBannerProps> = ({ weather, colors }) => {
  const suitableCount = weather.filter(w => w.isSuitable).length;
  const isAllGood = suitableCount === weather.length;
  const avgTemp = weather.length > 0 
    ? Math.round(weather.reduce((acc, w) => acc + (w.tempNow ?? 0), 0) / weather.length)
    : null;

  return (
    <View style={[styles.weatherBanner, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Ionicons 
        name={isAllGood ? "sunny-outline" : "rainy-outline"} 
        size={18} 
        color={isAllGood ? "#eab308" : colors.accentRed} 
      />
      <Text style={[styles.weatherBannerText, { color: colors.text }]}>
        {isAllGood 
          ? `Meteo ottimo su tutto il percorso${avgTemp !== null ? ` (${avgTemp}°C)` : ''}`
          : `Attenzione: previste precipitazioni in ${weather.length - suitableCount} tappe`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  weatherBanner: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 10, 
    borderRadius: 10, 
    padding: 10, 
    borderWidth: 1,
  },
  weatherBannerText: { 
    fontFamily: "Inter_500Medium", 
    fontSize: 13, 
  },
});
