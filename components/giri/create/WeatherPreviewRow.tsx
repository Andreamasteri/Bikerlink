import React from "react";
import type { ThemeColors } from '@/constants/colors';
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { WeatherBadge } from "./WeatherBadge";

interface WeatherWaypoint {
  lat: number; lng: number; name: string;
  tempNow: number | null; precipProb: number; weatherCode: number;
  weatherDesc: string; isSuitable: boolean;
}

interface WeatherPreviewRowProps {
  weather: WeatherWaypoint[];
  colors: ThemeColors;
}

export const WeatherPreviewRow: React.FC<WeatherPreviewRowProps> = ({ weather, colors }) => {
  if (!weather || weather.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Anteprima Meteo per tappa</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {weather.map((w, i) => (
          <WeatherBadge key={i} weather={w} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  scroll: {
    flexDirection: "row",
  },
});
