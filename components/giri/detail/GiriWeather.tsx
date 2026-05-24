import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { ThemeColors } from '@/constants/colors';

interface WeatherWaypoint {
  lat: number; lng: number; name: string;
  tempMax: number | null; tempMin: number | null; tempNow: number | null;
  precipitation: number; windSpeed: number | null; precipProb: number;
  weatherCode: number; weatherDesc: string; isSuitable: boolean;
}

interface GiriWeatherProps {
  weather: WeatherWaypoint[];
  weatherIcon: (code: number) => keyof typeof Ionicons.glyphMap;
}

export const GiriWeather: React.FC<GiriWeatherProps> = ({ weather, weatherIcon }) => {
  const colors = useColors();
  const s = styles(colors);

  const someUnsuitable = weather.some((w) => !w.isSuitable);

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Meteo lungo il percorso</Text>
      {someUnsuitable && (
        <View style={s.weatherAlert}>
          <Ionicons name="warning-outline" size={18} color={colors.accentRed} />
          <Text style={s.weatherAlertText}>Attenzione: alcune tappe hanno condizioni meteo avverse.</Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {weather.map((w, i) => (
          <View key={i} style={[s.weatherCard, !w.isSuitable && s.weatherBad]}>
            <Text style={s.weatherName} numberOfLines={1}>{w.name}</Text>
            <Ionicons name={weatherIcon(w.weatherCode)} size={24} color={w.isSuitable ? colors.accent : colors.accentRed} />
            <Text style={s.weatherTemp}>{Math.round(w.tempNow ?? 0)}°C</Text>
            <Text style={s.weatherDesc}>{w.weatherDesc}</Text>
            <Text style={s.weatherRain}>Pioggia: {w.precipProb}%</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <View style={[s.suitableDot, { backgroundColor: w.isSuitable ? "#22c55e" : colors.accentRed }]} />
              <Text style={[s.suitableText, { color: w.isSuitable ? "#22c55e" : colors.accentRed }]}>
                {w.isSuitable ? "Ottimale" : "Sconsigliato"}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = (colors: ThemeColors) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginBottom: 12 },
  weatherAlert: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accentRed + "22", borderRadius: 8, padding: 10, marginBottom: 10 },
  weatherAlertText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.accentRed, flex: 1 },
  weatherCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginRight: 10, width: 120, alignItems: "center", gap: 4 },
  weatherBad: { borderWidth: 1, borderColor: colors.accentRed + "55" },
  weatherName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text, textAlign: "center" },
  weatherDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary, textAlign: "center" },
  weatherTemp: { fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text },
  weatherRain: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  suitableDot: { width: 8, height: 8, borderRadius: 4 },
  suitableText: { fontFamily: "Inter_500Medium", fontSize: 11 },
});
