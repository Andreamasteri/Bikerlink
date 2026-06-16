// Task #3396 — Pannello read-only "Il tuo stile di guida".
// Mostra le label di stile + i bucket chiave calcolati dal job telemetry-affinity
// (user_telemetry_profile). Stato "dati insufficienti" sotto la soglia embedding.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";

type StyleProfile = {
  speedBucket: string;
  leanBucket: string;
  durationBucket: string;
  avgSpeedKmh: number;
  p75SpeedKmh: number;
  avgLeanAngle: number;
  maxLeanAvg: number;
  avgDurationMin: number;
  fractionMorning: number;
  fractionEvening: number;
  updatedAt: string;
};

type MyStyleResponse = {
  hasEnoughData: boolean;
  dataQuality: number;
  minSessions: number;
  totalSessions: number;
  labels: string[];
  profile: StyleProfile | null;
};

const LABEL_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  calm_rider: "leaf-outline",
  steady_rider: "speedometer-outline",
  fast_rider: "flash-outline",
  sport_rider: "rocket-outline",
  touring_lean: "compass-outline",
  dynamic_lean: "swap-horizontal-outline",
  aggressive_lean: "trending-up-outline",
  short_rides: "time-outline",
  medium_rides: "time-outline",
  long_rides: "infinite-outline",
  morning_rider: "sunny-outline",
  evening_rider: "moon-outline",
};

function speedBucketLabel(b: string): string {
  switch (b) {
    case "slow": return "Tranquilla";
    case "fast": return "Veloce";
    case "sport": return "Sportiva";
    default: return "Regolare";
  }
}

function leanBucketLabel(b: string): string {
  switch (b) {
    case "sport": return "Dinamica";
    case "aggressive": return "Aggressiva";
    default: return "Da turismo";
  }
}

function durationBucketLabel(b: string): string {
  switch (b) {
    case "short": return "Brevi";
    case "long": return "Lunghe";
    default: return "Medie";
  }
}

export default function MyStylePanel() {
  const colors = useColors();
  const { user } = useAuth();
  const t = useT();

  const { data, isLoading } = useQuery<MyStyleResponse>({
    queryKey: ["/api/proposals/my-telemetry-style"],
    enabled: !!user,
    staleTime: 60_000,
  });

  if (isLoading || !data) return null;

  const accentSoft = colors.accent + "33";

  return (
    <View style={styles.section}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: accentSoft }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>Il tuo stile di guida</Text>
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => {
              Alert.alert(
                "Come funziona il tuo stile",
                "• Velocità — basata sulla velocità tipica delle tue sessioni (75° percentile). Sale se fai uscite più rapide su strade aperte o autostrade.\n\n• Piega — angolo medio di inclinazione rilevato dall'accelerometro. Cresce guidando su curve strette e strade montane.\n\n• Durata — media dei minuti per uscita. Uscite più lunghe (>60 min) la fanno salire nella fascia \"Lunga\".\n\n• Come si registra una sessione valida: avvia il tracking GPS durante un'uscita reale in moto. Il sistema scarta soste e tragitti a piedi automaticamente.\n\n• Il profilo si aggiorna dopo ogni nuova sessione registrata. Più esci, più il calcolo diventa preciso.",
                [{ text: "Capito", style: "default" }]
              );
            }}
          >
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {!data.hasEnoughData ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Dati ancora insufficienti
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Registra almeno {data.minSessions} uscite in moto per calcolare il tuo
              stile di guida. Ne hai {data.totalSessions} finora.
            </Text>
            <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${Math.max(0, Math.min(100, (data.totalSessions / data.minSessions) * 100))}%` as `${number}%`,
                  },
                ]}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.chipsRow}>
              {data.labels.map((label) => {
                const icon = LABEL_ICON[label];
                if (!icon) return null;
                return (
                  <View
                    key={label}
                    style={[styles.chip, { backgroundColor: colors.accent + "1A", borderColor: accentSoft }]}
                  >
                    <Ionicons name={icon} size={12} color={colors.accent} />
                    <Text style={[styles.chipText, { color: colors.accent }]}>
                      {t(`match.styleLabel.${label}`)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {data.profile && (
              <View style={styles.bucketsRow}>
                <View style={styles.bucketItem}>
                  <Text style={[styles.bucketValue, { color: colors.text }]}>
                    {speedBucketLabel(data.profile.speedBucket)}
                  </Text>
                  <Text style={[styles.bucketLabel, { color: colors.textSecondary }]}>Velocità</Text>
                  <Text style={[styles.bucketDetail, { color: colors.textSecondary }]}>
                    ~{Math.round(data.profile.avgSpeedKmh)} km/h
                  </Text>
                </View>
                <View style={[styles.bucketDivider, { backgroundColor: colors.border }]} />
                <View style={styles.bucketItem}>
                  <Text style={[styles.bucketValue, { color: colors.text }]}>
                    {leanBucketLabel(data.profile.leanBucket)}
                  </Text>
                  <Text style={[styles.bucketLabel, { color: colors.textSecondary }]}>Piega</Text>
                  <Text style={[styles.bucketDetail, { color: colors.textSecondary }]}>
                    ~{Math.round(data.profile.avgLeanAngle)}°
                  </Text>
                </View>
                <View style={[styles.bucketDivider, { backgroundColor: colors.border }]} />
                <View style={styles.bucketItem}>
                  <Text style={[styles.bucketValue, { color: colors.text }]}>
                    {durationBucketLabel(data.profile.durationBucket)}
                  </Text>
                  <Text style={[styles.bucketLabel, { color: colors.textSecondary }]}>Durata</Text>
                  <Text style={[styles.bucketDetail, { color: colors.textSecondary }]}>
                    ~{Math.round(data.profile.avgDurationMin)} min
                  </Text>
                </View>
              </View>
            )}

            <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
              Basato su {data.totalSessions} uscite. Più registri, più il match migliora.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 0,
  },
  card: {
    borderRadius: 12,
    padding: 10,
    gap: 4,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  emptyState: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 0,
  },
  emptyTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    width: "100%",
    marginTop: 4,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  bucketsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  bucketItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  bucketValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  bucketLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  bucketDetail: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  bucketDivider: {
    width: 1,
    height: 32,
  },
  footerNote: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
});
