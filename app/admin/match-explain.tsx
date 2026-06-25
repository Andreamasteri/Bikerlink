/**
 * Task #2546 — Schermata "Spiega match" admin.
 *
 * Apertura: navigate to /admin/match-explain?userA=...&userB=...&nickA=...&nickB=...
 * Carica /api/admin/matching/explain e mostra BioAffinityCard + breakdown.
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { BioAffinityCard } from "@/components/admin/match-inspector/BioAffinityCard";

const MATCH_EXPLAIN_SCREEN_OPTIONS = { title: "Spiega Match" } as const;

interface ExplainResponse {
  userA: string;
  userB: string;
  isSupermatch?: boolean;
  musicAffinity?: {
    combinedScore?: number | null;
    embeddingScore?: number | null;
    tagScore?: number | null;
  } | null;
  bioAffinity: {
    similarity: number | null;
    threshold: number;
    bioA: string | null;
    bioB: string | null;
    model: string | null;
  } | null;
  breakdown?: Record<string, unknown>;
}

export default function MatchExplainScreen() {
  const insets = useSafeAreaInsets();
  const { userA, userB, nickA, nickB } = useLocalSearchParams<{
    userA: string;
    userB: string;
    nickA?: string;
    nickB?: string;
  }>();

  const queryKey = ["/api/admin/matching/explain", userA, userB];

  const { data, isLoading, error } = useQuery<ExplainResponse>({
    queryKey,
    queryFn: async () => {
      const url = new URL("/api/admin/matching/explain", getApiUrl());
      url.searchParams.set("userA", userA!);
      url.searchParams.set("userB", userB!);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json?.data ?? json) as ExplainResponse;
    },
    enabled: !!userA && !!userB,
  });

  return (
    <>
      <Stack.Screen options={MATCH_EXPLAIN_SCREEN_OPTIONS} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 16 }}
      >
        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        )}
        {error && (
          <View style={styles.center}>
            <Text style={styles.errorText}>Errore caricamento explain</Text>
          </View>
        )}
        {data && (
          <>
            <View style={styles.headerCard}>
              <Text style={styles.label}>Coppia</Text>
              <Text style={styles.pair}>
                {nickA ?? userA?.slice(0, 8)} ↔ {nickB ?? userB?.slice(0, 8)}
              </Text>
              {data.isSupermatch && <Text style={styles.super}>⭐ Supermatch</Text>}
            </View>

            <BioAffinityCard
              bioAffinity={data.bioAffinity}
              nicknameA={nickA}
              nicknameB={nickB}
            />

            {data.musicAffinity && (
              <View style={styles.miniCard}>
                <Text style={styles.miniTitle}>🎵 Affinità Musicale</Text>
                <Text style={styles.miniRow}>
                  Combined: {data.musicAffinity.combinedScore != null ? `${Math.round((data.musicAffinity.combinedScore ?? 0) * 100)}%` : "—"}
                </Text>
                <Text style={styles.miniRow}>
                  Embedding: {data.musicAffinity.embeddingScore != null ? `${Math.round((data.musicAffinity.embeddingScore ?? 0) * 100)}%` : "—"}
                </Text>
                <Text style={styles.miniRow}>
                  Tag (Jaccard): {data.musicAffinity.tagScore != null ? `${Math.round((data.musicAffinity.tagScore ?? 0) * 100)}%` : "—"}
                </Text>
              </View>
            )}

            {data.breakdown && Object.keys(data.breakdown).length > 0 && (
              <View style={styles.miniCard}>
                <Text style={styles.miniTitle}>🔬 Breakdown completo</Text>
                {Object.entries(data.breakdown).map(([key, value]) => {
                  const display =
                    typeof value === "number"
                      ? value.toFixed(3)
                      : typeof value === "string" || typeof value === "boolean"
                        ? String(value)
                        : value == null
                          ? "—"
                          : JSON.stringify(value);
                  return (
                    <Text key={key} style={styles.miniRow} numberOfLines={3}>
                      <Text style={styles.breakdownKey}>{key}:</Text> {display}
                    </Text>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: "center", justifyContent: "center", padding: 32 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.error },
  headerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  pair: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text, marginTop: 4 },
  super: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent, marginTop: 4 },
  miniCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  miniTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 4 },
  miniRow: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text },
  breakdownKey: { fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
});
