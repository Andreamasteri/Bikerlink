// Task #2641 — Pannello "Contesto": tool call corrente + fonti citate.
// Task #2969 — Card "Provider AI": stato health + reset cooldown da admin.
import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import type { AiMessageRow } from "@/hooks/admin/ai-console/useAiConversation";
import type { AiStreamState } from "@/hooks/admin/ai-console/useAiConsole";

interface Props {
  messages: AiMessageRow[];
  streamState: AiStreamState;
}

interface Entity { kind: string; id: string }

interface ProviderHealth {
  id: string;
  available: boolean;
  lastError?: string;
  lastErrorAt?: string;
  cooldownRemainingMs?: number;
  isQuotaError?: boolean;
}

const ENTITY_RE = /\b(reportId|userId|snapshotId|violationId|runId|matchId)\s*[:=]\s*([0-9a-f-]{8,36})/gi;

function formatRemaining(ms: number): string {
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function ProviderHealthCard() {
  const colors = useColors();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<{ providers: ProviderHealth[] }, Error, { providers: ProviderHealth[] }>({
    queryKey: ["/api/admin/ai/providers/health"],
    queryFn: async (): Promise<{ providers: ProviderHealth[] }> => {
      const res = await apiRequest("GET", "/api/admin/ai/providers/health");
      return res.json() as Promise<{ providers: ProviderHealth[] }>;
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const resetMutation = useMutation<{ ok: boolean; providers: ProviderHealth[] }, Error, string | undefined>({
    mutationFn: async (providerId?: string): Promise<{ ok: boolean; providers: ProviderHealth[] }> => {
      const res = await apiRequest("POST", "/api/admin/ai/providers/reset", providerId ? { providerId } : {});
      return res.json() as Promise<{ ok: boolean; providers: ProviderHealth[] }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/providers/health"] });
    },
  });

  const providers: ProviderHealth[] = data?.providers ?? [];
  const anyInCooldown = providers.some((p: ProviderHealth) => !p.available);
  const hasQuotaError = providers.some((p: ProviderHealth) => !p.available && p.isQuotaError);

  return (
    <View style={[styles.providerCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.providerHeader}>
        <Text style={[styles.section, { color: colors.textSecondary, marginBottom: 0 }]}>Provider AI</Text>
        {anyInCooldown && (
          <TouchableOpacity
            style={[styles.resetBtn, { backgroundColor: colors.accent, opacity: resetMutation.isPending ? 0.6 : 1 }]}
            onPress={() => resetMutation.mutate(undefined)}
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" style={{ width: 12, height: 12 }} />
            ) : (
              <Ionicons name="refresh" size={11} color="#fff" />
            )}
            <Text style={styles.resetBtnText}>Sblocca tutti</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading && (
        <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 8 }} />
      )}
      {isError && (
        <Text style={[styles.empty, { color: colors.error ?? colors.textSecondary }]}>Errore caricamento stato provider.</Text>
      )}

      {hasQuotaError && (
        <View style={[styles.warningBanner, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
          <Ionicons name="warning-outline" size={12} color={colors.warning} />
          <Text style={[styles.warningText, { color: colors.warning }]}>
            Quota probabilmente esaurita — il provider potrebbe fallire di nuovo subito dopo lo sblocco.
          </Text>
        </View>
      )}

      {providers.map((p) => {
        const remaining = p.cooldownRemainingMs ? formatRemaining(p.cooldownRemainingMs) : null;
        const isOk = p.available;
        return (
          <View
            key={p.id}
            style={[styles.providerRow, { borderColor: colors.border }]}
          >
            <Ionicons
              name={isOk ? "checkmark-circle" : "time-outline"}
              size={14}
              color={isOk ? colors.success : colors.error ?? "#e55"}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colors.text }]}>{p.id}</Text>
              {!isOk && remaining && (
                <Text style={[styles.providerMeta, { color: colors.warning }]}>
                  {p.isQuotaError ? "quota · " : ""}{remaining} rimasti
                </Text>
              )}
              {!isOk && p.lastError && (
                <Text style={[styles.providerError, { color: colors.textSecondary }]} numberOfLines={2}>
                  {p.lastError.slice(0, 120)}
                </Text>
              )}
            </View>
            {!isOk && (
              <TouchableOpacity
                style={[styles.unlockBtn, { borderColor: colors.border, opacity: resetMutation.isPending ? 0.5 : 1 }]}
                onPress={() => resetMutation.mutate(p.id)}
                disabled={resetMutation.isPending}
              >
                <Ionicons name="lock-open-outline" size={11} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function ContextPanel({ messages, streamState }: Props) {
  const colors = useColors();
  const router = useRouter();

  const entities = useMemo(() => extractEntities(messages), [messages]);

  function openEntity(e: Entity) {
    const k = e.kind.toLowerCase();
    if (k === "reportid") router.push(`/admin/reports?id=${e.id}` as never);
    else if (k === "userid") router.push(`/profile/${e.id}` as never);
    else if (k === "matchid") router.push(`/admin/match-inspector?id=${e.id}` as never);
    else if (k === "violationid" || k === "runid") router.push(`/admin/db-integrity` as never);
    else if (k === "snapshotid") router.push(`/admin/db-debug` as never);
  }

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: colors.surface }]} contentContainerStyle={{ padding: 12 }}>
      <ProviderHealthCard />

      <Text style={[styles.section, { color: colors.textSecondary, marginTop: 16 }]}>Tool call in corso</Text>
      {streamState.toolCalls.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessuna chiamata.</Text>
      ) : (
        streamState.toolCalls.slice(-6).map((tc, i) => (
          <View key={i} style={[styles.toolCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.toolHead}>
              <Ionicons
                name={tc.result !== undefined ? "checkmark-circle" : "ellipse-outline"}
                size={12}
                color={tc.result !== undefined ? colors.success : colors.warning}
              />
              <Text style={[styles.toolName, { color: colors.text }]} numberOfLines={1}>
                {tc.name}
              </Text>
            </View>
          </View>
        ))
      )}

      <Text style={[styles.section, { color: colors.textSecondary, marginTop: 16 }]}>Fonti citate</Text>
      {entities.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessuna entità citata.</Text>
      ) : (
        entities.slice(0, 20).map((e, i) => (
          <TouchableOpacity
            key={`${e.kind}-${e.id}-${i}`}
            style={[styles.entRow, { borderColor: colors.border }]}
            onPress={() => openEntity(e)}
          >
            <Text style={[styles.entKind, { color: colors.accent }]}>{e.kind}</Text>
            <Text style={[styles.entId, { color: colors.text }]} numberOfLines={1}>
              {e.id.slice(0, 12)}…
            </Text>
            <Ionicons name="open-outline" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function extractEntities(messages: AiMessageRow[]): Entity[] {
  const seen = new Set<string>();
  const out: Entity[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i].content ?? "";
    const re = new RegExp(ENTITY_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(c)) !== null) {
      const key = `${m[1]}:${m[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ kind: m[1], id: m[2] });
      }
    }
    if (out.length >= 30) break;
  }
  return out;
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  section: { fontFamily: "Inter_700Bold", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 11, fontStyle: "italic" },
  toolCard: { borderRadius: 8, borderWidth: 1, padding: 8, marginBottom: 6 },
  toolHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  toolName: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  entRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1,
  },
  entKind: { fontFamily: "Inter_600SemiBold", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 },
  entId: { fontFamily: "Inter_400Regular", fontSize: 11, flex: 1 },

  providerCard: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  providerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  providerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  providerName: { fontFamily: "Inter_600SemiBold", fontSize: 12, textTransform: "capitalize" },
  providerMeta: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 1 },
  providerError: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2, fontStyle: "italic" },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  resetBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#fff" },
  unlockBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, padding: 5 },
  warningBanner: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderWidth: 1, borderRadius: 7, padding: 8, marginBottom: 8 },
  warningText: { fontFamily: "Inter_400Regular", fontSize: 10, flex: 1, lineHeight: 14 },
});
