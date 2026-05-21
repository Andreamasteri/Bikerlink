import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface GiriStatsProps {
  distanceKm: number;
  durationMinutes: number;
  bikerScore: number;
  scoreColor: string;
  styleLabel: string;
  isMultiDay: boolean;
  elevationGainM?: number | null;
  altitudeMinM?: number | null;
  altitudeMaxM?: number | null;
  realCurvatureScore?: number | null;
  onLoadElevation: () => void;
  elevationLoading: boolean;
}

export const GiriStats: React.FC<GiriStatsProps> = ({
  distanceKm,
  durationMinutes,
  bikerScore,
  scoreColor,
  styleLabel,
  isMultiDay,
  elevationGainM,
  altitudeMinM,
  altitudeMaxM,
  realCurvatureScore,
  onLoadElevation,
  elevationLoading,
}) => {
  const colors = useColors();
  const s = styles(colors);

  const formatDuration = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}min`;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  return (
    <View style={s.heroCard}>
      <View style={s.heroStats}>
        <View style={s.heroStat}>
          <Text style={s.heroValue}>{distanceKm}</Text>
          <Text style={s.heroUnit}>KM</Text>
          <Text style={s.heroLabel}>Distanza</Text>
        </View>
        <View style={s.heroDivider} />
        <View style={s.heroStat}>
          <Text style={s.heroValue}>{formatDuration(durationMinutes)}</Text>
          <Text style={s.heroUnit}>TEMPO</Text>
          <Text style={s.heroLabel}>Durata st.</Text>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={s.heroLabel}>Biker Score (Curvatura)</Text>
          <Text style={[s.heroValue, { fontSize: 18, color: scoreColor }]}>
            {Math.round(bikerScore * 100)}%
          </Text>
        </View>
        <View style={s.bsBarBg}>
          <View style={[s.bsBarFill, { width: `${bikerScore * 100}%` as any, backgroundColor: scoreColor }]} />
        </View>
      </View>

      {realCurvatureScore !== undefined && realCurvatureScore !== null && (
        <View style={s.realScoreBadge}>
          <MaterialCommunityIcons name="bullseye-arrow" size={14} color="#22c55e" />
          <Text style={s.realScoreText}>
            Curvatura Reale: {Math.round(realCurvatureScore * 100)}% (basata su curve effettive)
          </Text>
        </View>
      )}

      {elevationGainM ? (
        <View style={s.elevationBadge}>
          <Ionicons name="trending-up" size={14} color="#3b82f6" />
          <Text style={s.elevationBadgeText}>
            Dislivello: +{elevationGainM}m ({altitudeMinM}m - {altitudeMaxM}m)
          </Text>
        </View>
      ) : (
        <Pressable onPress={onLoadElevation} style={s.elevationBadge} disabled={elevationLoading}>
          <Ionicons name="analytics-outline" size={14} color="#3b82f6" />
          <Text style={s.elevationBadgeText}>
            {elevationLoading ? "Calcolo altimetria..." : "Carica dati altimetrici"}
          </Text>
          {elevationLoading && <ActivityIndicator size="small" color="#3b82f6" />}
        </Pressable>
      )}

      <View style={s.metaRow}>
        <View style={s.metaBadge}>
          <Ionicons name="git-branch-outline" size={12} color={colors.textSecondary} />
          <Text style={s.metaBadgeText}>{styleLabel}</Text>
        </View>
        {isMultiDay && (
          <View style={s.metaBadge}>
            <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
            <Text style={s.metaBadgeText}>Multi-giorno</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  heroCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, gap: 12 },
  heroStats: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  heroStat: { alignItems: "center" },
  heroValue: { fontFamily: "Inter_700Bold", fontSize: 28, color: colors.text },
  heroUnit: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: -4 },
  heroLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  heroDivider: { width: 1, height: 50, backgroundColor: colors.border },
  bsBarBg: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  bsBarFill: { height: "100%" as any, borderRadius: 4 },
  realScoreBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#22c55e18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  realScoreText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#22c55e", flex: 1 },
  elevationBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#3b82f622", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  elevationBadgeText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#3b82f6", flex: 1 },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  metaBadgeText: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary },
});
