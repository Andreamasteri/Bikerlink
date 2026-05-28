// Task #2641 — Pannello "Contesto": tool call corrente + fonti citate.
import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import type { AiMessageRow } from "@/hooks/admin/ai-console/useAiConversation";
import type { AiStreamState } from "@/hooks/admin/ai-console/useAiConsole";

interface Props {
  messages: AiMessageRow[];
  streamState: AiStreamState;
}

interface Entity { kind: string; id: string }

const ENTITY_RE = /\b(reportId|userId|snapshotId|violationId|runId|matchId)\s*[:=]\s*([0-9a-f-]{8,36})/gi;

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
      <Text style={[styles.section, { color: colors.textSecondary }]}>Tool call in corso</Text>
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
});
