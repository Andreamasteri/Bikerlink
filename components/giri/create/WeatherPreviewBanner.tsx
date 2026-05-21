import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Waypoint { lat: number; lng: number; name: string; }

interface WeatherWaypoint {
  lat: number; lng: number; name: string;
  tempNow: number | null; precipProb: number; weatherCode: number;
  weatherDesc: string; isSuitable: boolean;
}

interface WeatherPreviewBannerProps {
  weatherLoading: boolean;
  weatherPreview: WeatherWaypoint[] | null;
}

export const WeatherPreviewBanner: React.FC<WeatherPreviewBannerProps> = ({
  weatherLoading,
  weatherPreview,
}) => {
  const colors = useColors();

  if (weatherLoading) {
    return (
      <View style={[styles.weatherBanner, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.weatherBannerText, { color: colors.text }]}>Caricamento meteo...</Text>
      </View>
    );
  }

  if (!weatherPreview || weatherPreview.length === 0) return null;

  const suitableCount = weatherPreview.filter(w => w.isSuitable).length;
  const isAllGood = suitableCount === weatherPreview.length;

  return (
    <View style={[styles.weatherBanner, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Ionicons 
        name={isAllGood ? "sunny-outline" : "rainy-outline"} 
        size={18} 
        color={isAllGood ? "#eab308" : colors.accentRed} 
      />
      <Text style={[styles.weatherBannerText, { color: colors.text }]}>
        {isAllGood 
          ? `Meteo ottimo su tutto il percorso`
          : `Attenzione: previste precipitazioni in ${weatherPreview.length - suitableCount} tappe`}
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
    marginTop: 8,
  },
  weatherBannerText: { 
    fontFamily: "Inter_500Medium", 
    fontSize: 13, 
  },
});
