import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import ElevationProfile from '@/components/ElevationProfile';

interface GiriElevationProps {
  elevation: any | null;
  elevationLoading: boolean;
  elevationError: boolean;
  onLoadElevation: () => void;
}

export const GiriElevation: React.FC<GiriElevationProps> = ({
  elevation,
  elevationLoading,
  elevationError,
  onLoadElevation,
}) => {
  const colors = useColors();
  const s = styles(colors);

  if (!elevation && !elevationLoading && !elevationError) return null;

  return (
    <View style={s.eleCard}>
      <View style={s.eleTitleRow}>
        <Ionicons name="analytics-outline" size={18} color={colors.accent} />
        <Text style={s.eleTitle}>Profilo Altimetrico</Text>
      </View>

      {elevationLoading && (
        <View style={{ height: 100, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {elevationError && (
        <Pressable onPress={onLoadElevation} style={s.eleRetryRow}>
          <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
          <Text style={s.eleRetryText}>Errore nel caricamento. Riprova.</Text>
        </Pressable>
      )}

      {elevation && (
        <View style={s.eleChartWrap}>
          <ElevationProfile
            profile={elevation.elevations.map((alt: number, i: number) => ({
              distanceKm: elevation.distanceKm[i],
              altitudeM: alt,
            }))}
            gainM={elevation.totalGain}
            lossM={elevation.totalLoss}
            minM={elevation.minEle}
            maxM={elevation.maxEle}
          />
          <View style={s.eleAxisRow}>

            <Text style={s.eleAxisLabel}>0 km</Text>
            <Text style={s.eleAxisLabel}>{elevation.distanceKm[elevation.distanceKm.length - 1].toFixed(1)} km</Text>
          </View>

          <View style={s.eleStatsRow}>
            <View style={s.eleStat}>
              <Text style={s.eleStatValue}>+{elevation.totalGain}m</Text>
              <Text style={s.eleStatLabel}>Salita</Text>
            </View>
            <View style={s.eleStatDivider} />
            <View style={s.eleStat}>
              <Text style={s.eleStatValue}>{elevation.minEle}m</Text>
              <Text style={s.eleStatLabel}>Min</Text>
            </View>
            <View style={s.eleStatDivider} />
            <View style={s.eleStat}>
              <Text style={s.eleStatValue}>{elevation.maxEle}m</Text>
              <Text style={s.eleStatLabel}>Max</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  eleCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 16, gap: 10 },
  eleTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eleTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.text },
  eleChartWrap: { borderRadius: 10, overflow: "hidden", gap: 4 },
  eleAxisRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 },
  eleAxisLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary },
  eleStatsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: colors.background, borderRadius: 10, padding: 10 },
  eleStat: { alignItems: "center", flex: 1 },
  eleStatValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text },
  eleStatLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  eleStatDivider: { width: 1, height: 32, backgroundColor: colors.border },
  eleRetryRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  eleRetryText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, flex: 1 },
});
