// Task #4825 — Card "Stato AI" fissa sopra le tab della Diagnostica.
// Mostra lo stato live dei 4 provider (Ollama, Groq, Gemini, OpenAI) con polling.
import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { adminFetch } from "@/app/admin/diagnostica-types";
import s from "@/components/admin/diagnostica-styles";

export interface AiProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  available: boolean;
  detail: string;
}

function dotColor(p: AiProviderStatus): string {
  if (!p.configured) return Colors.textSecondary;
  return p.available ? "#22c55e" : "#ef4444";
}

export function AiStatusCard() {
  const { data, isLoading, isFetching, refetch } = useQuery<{ providers: AiProviderStatus[] }>({
    queryKey: ["/api/admin/health-check/ai-status"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/health-check/ai-status");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  const providers = data?.providers ?? [];

  return (
    <View style={s.aiStatusCard}>
      <View style={s.aiStatusHeader}>
        <Text style={s.aiStatusTitle}>Stato AI</Text>
        <TouchableOpacity onPress={() => refetch()} disabled={isFetching} activeOpacity={0.7} hitSlop={8}>
          {isFetching ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Ionicons name="refresh" size={15} color={Colors.accent} />
          )}
        </TouchableOpacity>
      </View>
      <View style={s.aiStatusRow}>
        {isLoading && providers.length === 0 ? (
          <Text style={s.aiStatusLoading}>Verifica provider…</Text>
        ) : (
          providers.map((p) => (
            <View key={p.id} style={s.aiStatusChip}>
              <View style={[s.aiStatusDot, { backgroundColor: dotColor(p) }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.aiStatusName}>{p.label}</Text>
                <Text style={s.aiStatusDetail} numberOfLines={1}>
                  {p.configured ? p.detail : "non configurato"}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
