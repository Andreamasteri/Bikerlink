// Task #2641 — Inverted FlatList per chat AI Console (no scrollToEnd).
import React, { useMemo } from "react";
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/useColors";
import MessageItem from "./MessageItem";
import ScopeBadges from "./ScopeBadges";
import type { AiMessageRow } from "@/hooks/admin/ai-console/useAiConversation";
import type { AiStreamState } from "@/hooks/admin/ai-console/useAiConsole";

interface Props {
  messages: AiMessageRow[];
  streamState: AiStreamState;
  loading?: boolean;
}

export default function MessageList({ messages, streamState, loading }: Props) {
  const colors = useColors();

  // Inverted: dati con il messaggio più recente in cima.
  const data = useMemo(() => [...messages].reverse(), [messages]);

  const liveAssistant: AiMessageRow | null =
    streamState.streaming || streamState.text
      ? {
          id: "__live__",
          conversationId: "live",
          role: "assistant",
          content: streamState.text || (streamState.streaming ? "…" : ""),
          scopes: streamState.router?.scopes ?? null,
          toolCalls: streamState.toolCalls.map((t) => ({ name: t.name, args: t.args, result: t.result })),
          entities: null,
          model: streamState.doneMeta?.model ?? null,
          provider: streamState.doneMeta?.provider ?? null,
          tokensIn: streamState.doneMeta?.tokensIn ?? 0,
          tokensOut: streamState.doneMeta?.tokensOut ?? 0,
          costUsd: String(streamState.doneMeta?.costUsd ?? "0"),
          createdAt: new Date().toISOString(),
        }
      : null;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      data={data}
      inverted
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => <MessageItem message={item} />}
      ListHeaderComponent={
        liveAssistant ? (
          <View>
            {streamState.router ? (
              <View style={[styles.routerLive, { borderColor: colors.border, backgroundColor: colors.surfaceLight }]}>
                <Text style={[styles.routerLiveLabel, { color: colors.textSecondary }]}>Router</Text>
                <ScopeBadges scopes={streamState.router.scopes} size="sm" />
                {streamState.router.cached ? (
                  <Text style={[styles.cached, { color: colors.textSecondary }]}>(cache)</Text>
                ) : null}
              </View>
            ) : null}
            <MessageItem message={liveAssistant} />
            {streamState.streaming ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 6 }} size="small" />
            ) : null}
            {streamState.error ? (
              <Text style={[styles.error, { color: colors.error }]}>{streamState.error}</Text>
            ) : null}
          </View>
        ) : null
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nuova conversazione</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Chiedi all&apos;AI di analizzare report, watchdog, OTA o integrità DB/app.
              L&apos;assistente non eseguirà azioni senza la tua conferma.
            </Text>
          </View>
        )
      }
      scrollEnabled={data.length > 0 || !!liveAssistant}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, flexGrow: 1 },
  empty: { padding: 32, alignItems: "center", transform: [{ scaleY: -1 }] },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 6 },
  emptySub: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, textAlign: "center" },
  routerLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  routerLiveLabel: { fontFamily: "Inter_700Bold", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 },
  cached: { fontFamily: "Inter_400Regular", fontSize: 10, fontStyle: "italic" },
  error: { fontFamily: "Inter_500Medium", fontSize: 12, padding: 10, textAlign: "center" },
});
