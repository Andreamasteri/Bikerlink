/**
 * Task #2542 — Card "Sembra che tu rifiuti spesso X — vuoi escluderlo?".
 *
 * Mostra suggerimenti generati automaticamente dal sistema basati sui pattern
 * di rifiuto dell'utente (es. ha rifiutato 5+ profili con bike_brand="Harley").
 * Visibile solo se `/api/match-negative-preferences/suggestions` ritorna almeno
 * 1 suggerimento pending. L'utente può Accettare (crea esclusione permanente)
 * o Rimandare (snooze).
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { SectionErrorState } from "@/components/profile/SectionErrorState";

interface Suggestion {
  id: string;
  kind: string;
  value: unknown;
  rejectCount: number;
}

const KIND_LABEL: Record<string, string> = {
  bike_brand: "marca moto",
  bike_model: "modello moto",
  moto_type_tag: "tipo moto",
  riding_style_tag: "stile di guida",
  music_tag: "genere musicale",
  city: "città",
  region: "regione",
  country: "paese",
};

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    return (v.name as string) ?? (v.value as string) ?? JSON.stringify(value);
  }
  return String(value);
}

export function NegativeSuggestionsCard() {
  const queryClient = useQueryClient();
  const queryKey = ["/api/match-negative-preferences/suggestions"];

  const { data, isLoading, isError, refetch } = useQuery<{ suggestions: Suggestion[] }>({
    queryKey,
    refetchOnWindowFocus: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/match-negative-preferences/suggestions/${id}/accept`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/match-negative-preferences"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ id, snooze }: { id: string; snooze: boolean }) => {
      const res = await apiRequest("POST", `/api/match-negative-preferences/suggestions/${id}/dismiss`, { snooze });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  if (isLoading) return null;

  if (isError) {
    return (
      <SectionErrorState
        title="Suggerimenti di esclusione non disponibili"
        hint="Tocca per riprovare"
        onRetry={() => refetch()}
      />
    );
  }

  if (!data) return null;
  const suggestions = data.suggestions ?? [];
  if (suggestions.length === 0) return null;

  // Mostriamo solo il primo (quello con rejectCount più alto). Gli altri
  // appariranno uno alla volta dopo accept/dismiss.
  const s = suggestions[0];
  const label = KIND_LABEL[s.kind] ?? s.kind;
  const value = formatValue(s.value);
  const busy = acceptMutation.isPending || dismissMutation.isPending;

  return (
    <View style={styles.card} testID="neg-suggestion-card">
      <View style={styles.iconWrap}>
        <Ionicons name="bulb-outline" size={18} color={Colors.accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Sembra che tu rifiuti spesso{" "}
          <Text style={styles.titleBold}>{label} "{value}"</Text>
        </Text>
        <Text style={styles.subtitle}>
          {s.rejectCount} rifiuti recenti. Vuoi escluderlo dai prossimi match?
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.acceptBtn, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={() => acceptMutation.mutate(s.id)}
            testID="neg-suggestion-accept"
          >
            {acceptMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.acceptText}>Escludi</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dismissBtn, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={() => dismissMutation.mutate({ id: s.id, snooze: true })}
            testID="neg-suggestion-snooze"
          >
            <Text style={styles.dismissText}>Più tardi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectBtn, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={() => dismissMutation.mutate({ id: s.id, snooze: false })}
            testID="neg-suggestion-reject"
          >
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 6 },
  title: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text, lineHeight: 18 },
  titleBold: { fontFamily: "Inter_600SemiBold", color: Colors.text },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  actions: { flexDirection: "row", gap: 8, marginTop: 4, alignItems: "center" },
  acceptBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  acceptText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  dismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dismissText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
  rejectBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
});
