import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { styles } from "@/components/admin/analytics.styles";
import { StyleSheet } from "react-native";

interface SessionsStatsData {
  avgDurationSeconds: {
    today: number;
    last7d: number;
    last30d: number;
  };
  timeBands: Record<string, number>;
  exitType: {
    counts: Record<string, number>;
    total: number;
    pct: Record<string, number>;
  };
  top10: Array<{
    user_id: string;
    nickname: string;
    total_seconds: number;
    session_count: number;
  }>;
}

type PeriodKey = "1" | "7" | "30";

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

const BAND_LABELS: Record<string, string> = {
  "00-06": "Notte (00-06)",
  "06-12": "Mattina (06-12)",
  "12-18": "Pomeriggio (12-18)",
  "18-24": "Sera (18-24)",
};

const EXIT_COLORS: Record<string, string> = {
  background: Colors.textSecondary,
  logout: Colors.accent,
  crash: Colors.error,
};

export function SessionsSection() {
  const [period, setPeriod] = useState<PeriodKey>("7");

  const { data, isLoading } = useQuery<SessionsStatsData>({
    queryKey: ["/api/admin/analytics/sessions/stats", period],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const url = new URL(`/api/admin/analytics/sessions/stats?period=${period}`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const timeBands = data?.timeBands ?? { "00-06": 0, "06-12": 0, "12-18": 0, "18-24": 0 };
  const maxBand = Math.max(...Object.values(timeBands), 1);

  return (
    <View style={styles.onboardingBlock}>
      <Text style={styles.onboardingTitle}>Sessioni — Analytics</Text>

      <View style={localStyles.periodRow}>
        {(["1", "7", "30"] as PeriodKey[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[localStyles.periodBtn, period === p && localStyles.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[localStyles.periodBtnText, period === p && localStyles.periodBtnTextActive]}>
              {p === "1" ? "Oggi" : p === "7" ? "7gg" : "30gg"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento...</Text>
      ) : (
        <>
          <View style={styles.onboardingRows}>
            <View style={styles.onboardingRow}>
              <Text style={styles.onboardingLabel}>Durata media (oggi)</Text>
              <Text style={styles.onboardingValue}>{formatDuration(data?.avgDurationSeconds.today ?? 0)}</Text>
            </View>
            <View style={styles.onboardingRow}>
              <Text style={styles.onboardingLabel}>Durata media (7gg)</Text>
              <Text style={styles.onboardingValue}>{formatDuration(data?.avgDurationSeconds.last7d ?? 0)}</Text>
            </View>
            <View style={styles.onboardingRow}>
              <Text style={styles.onboardingLabel}>Durata media (30gg)</Text>
              <Text style={styles.onboardingValue}>{formatDuration(data?.avgDurationSeconds.last30d ?? 0)}</Text>
            </View>
          </View>

          <Text style={[styles.onboardingTitle, { fontSize: 13, marginTop: 16, marginBottom: 8 }]}>
            Sessioni per fascia oraria (ultimi {period === "1" ? "1 giorno" : `${period} giorni`})
          </Text>
          <View style={styles.onboardingRows}>
            {(["00-06", "06-12", "12-18", "18-24"] as const).map((band) => {
              const count = timeBands[band] ?? 0;
              return (
                <View key={band} style={styles.skipRow}>
                  <Text style={styles.skipLabel}>{BAND_LABELS[band]}</Text>
                  <View style={styles.skipBarTrack}>
                    <View
                      style={[
                        styles.skipBarFill,
                        {
                          width: `${(count / maxBand) * 100}%`,
                          backgroundColor: Colors.accent,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.skipValue}>{count}</Text>
                </View>
              );
            })}
          </View>

          <Text style={[styles.onboardingTitle, { fontSize: 13, marginTop: 16, marginBottom: 8 }]}>
            Tipo di uscita ({data?.exitType.total ?? 0} sessioni)
          </Text>
          <View style={styles.onboardingRows}>
            {(["background", "logout", "crash"] as const).map((et) => {
              const count = data?.exitType.counts[et] ?? 0;
              const pct = data?.exitType.pct[et] ?? 0;
              const barColor = EXIT_COLORS[et];
              const total = data?.exitType.total ?? 1;
              return (
                <View key={et} style={styles.skipRow}>
                  <Text style={[styles.skipLabel, { textTransform: "capitalize" }]}>{et}</Text>
                  <View style={styles.skipBarTrack}>
                    <View
                      style={[
                        styles.skipBarFill,
                        { width: `${(count / total) * 100}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>
                  <Text style={styles.skipValue}>
                    {count} <Text style={styles.funnelPct}>({pct.toFixed(1)}%)</Text>
                  </Text>
                </View>
              );
            })}
          </View>

          {(data?.top10?.length ?? 0) > 0 && (
            <>
              <Text style={[styles.onboardingTitle, { fontSize: 13, marginTop: 16, marginBottom: 8 }]}>
                Top 10 utenti per tempo in-app (30gg)
              </Text>
              <View style={styles.onboardingRows}>
                {data!.top10.map((u, i) => (
                  <View key={u.user_id} style={styles.onboardingRow}>
                    <Text style={styles.onboardingLabel}>
                      {i + 1}. {u.nickname}
                      <Text style={styles.funnelPct}> ({u.session_count} sessioni)</Text>
                    </Text>
                    <Text style={[styles.onboardingValue, { color: Colors.success }]}>
                      {formatDuration(u.total_seconds)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  periodRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  periodBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  periodBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  periodBtnTextActive: {
    color: "#fff",
  },
});
