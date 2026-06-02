// Task #2535 — UI chat assistente OTA (frontend admin).
// Render conversazione + card di conferma per azioni mutanti + tail log per publish.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useTheme } from "@/lib/theme-context";
import { apiRequest } from "@/lib/query-client";

interface PendingMutation {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  toolCalls?: Array<{ tool: string; args: unknown; result?: unknown }>;
  pendingMutations?: PendingMutation[];
  publishRunId?: string;
  provider?: string;
  model?: string;
}

interface AssistantResponse {
  runId: string;
  response: string;
  toolCalls: Array<{ tool: string; args: unknown; result?: unknown }>;
  pendingMutations: PendingMutation[];
  provider?: string;
  model?: string;
}

const SUGGESTIONS = [
  "Mostrami gli ultimi 5 OTA con tasso di successo sotto 80%",
  "Quando conviene pubblicare la prossima OTA?",
  "Ci sono release approved che andrebbero rollbackate?",
  "Elenca le release pending",
];

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function OtaAssistantChat() {
  const { colors } = useTheme();
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [publishLogs, setPublishLogs] = useState<Record<string, { text: string; done: boolean }>>({});
  const scrollRef = useRef<ScrollView | null>(null);

  const sendPrompt = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userTurn: ChatTurn = { id: newId(), role: "user", text: text.trim() };
    setTurns((t) => [...t, userTurn]);
    setPrompt("");
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/ota/assistant", { prompt: text.trim() });
      const data = (await res.json()) as AssistantResponse;
      setTurns((t) => [
        ...t,
        {
          id: newId(),
          role: "assistant",
          text: data.response || "(nessun testo)",
          toolCalls: data.toolCalls,
          pendingMutations: data.pendingMutations,
          provider: data.provider,
          model: data.model,
        },
      ]);
    } catch (err) {
      setTurns((t) => [
        ...t,
        { id: newId(), role: "system", text: `Errore: ${err instanceof Error ? err.message : "richiesta fallita"}` },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [loading]);

  const confirmMutation = useCallback(async (turnId: string, m: PendingMutation) => {
    const key = `${turnId}:${m.tool}:${JSON.stringify(m.args)}`;
    setConfirmingKey(key);
    try {
      const res = await apiRequest("POST", "/api/admin/ota/assistant/confirm", { tool: m.tool, args: m.args });
      const data = await res.json() as Record<string, unknown>;
      const publishRunId = typeof data.runId === "string" && m.tool === "publishOta" ? data.runId : undefined;
      setTurns((t) => [
        ...t,
        {
          id: newId(),
          role: "system",
          text: publishRunId
            ? `▶ Publish avviato — runId=${publishRunId}. I log appariranno qui sotto in tempo reale.`
            : `✓ ${m.tool} eseguito`,
          publishRunId,
        },
      ]);
    } catch (err) {
      Alert.alert("Errore esecuzione", err instanceof Error ? err.message : "Esecuzione fallita");
    } finally {
      setConfirmingKey(null);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, []);

  // Poll log per publish runs attive
  useEffect(() => {
    const activeRunIds = turns.filter((t) => t.publishRunId).map((t) => t.publishRunId!);
    if (activeRunIds.length === 0) return;
    const interval = setInterval(async () => {
      for (const runId of activeRunIds) {
        if (publishLogs[runId]?.done) continue;
        try {
          const res = await apiRequest("GET", `/api/admin/ota/assistant/run/${runId}/log`);
          const data = (await res.json()) as { log: string; done: boolean };
          setPublishLogs((prev) => ({ ...prev, [runId]: { text: data.log, done: data.done } }));
        } catch { /* ignore */ }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [turns, publishLogs]);

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.surfaceLight }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>🤖 Assistente OTA</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Chat operativa — propone azioni, richiede conferma esplicita prima di eseguirle.
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingVertical: 8 }}
        nestedScrollEnabled
      >
        {turns.length === 0 && (
          <View>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>Esempi di richieste:</Text>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => sendPrompt(s)}
                style={[styles.suggestion, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Text style={[styles.suggestionText, { color: colors.text }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {turns.map((t) => (
          <View key={t.id} style={styles.turn}>
            <Text style={[styles.roleLabel, { color: t.role === "user" ? colors.accent : t.role === "assistant" ? colors.success : colors.textSecondary }]}>
              {t.role === "user" ? "Tu" : t.role === "assistant" ? "Assistente" : "Sistema"}
            </Text>
            <View style={[styles.bubble, {
              backgroundColor: t.role === "user" ? colors.accent + "18" : colors.surface,
              borderColor: colors.border,
            }]}>
              <Text style={[styles.bubbleText, { color: colors.text }]}>{t.text}</Text>
              {t.role === "assistant" && t.provider && (
                <Text style={[styles.providerTag, { color: colors.textSecondary }]}>
                  Risposto da: {t.provider}{t.model ? ` (${t.model})` : ""}
                </Text>
              )}
              {t.toolCalls && t.toolCalls.length > 0 && (
                <View style={styles.toolCallsBox}>
                  {t.toolCalls.filter((tc) => tc.tool !== "proposeMutation").map((tc, i) => (
                    <View key={i} style={[styles.toolCallChip, { borderColor: colors.border }]}>
                      <Text style={[styles.toolCallTool, { color: colors.textSecondary }]}>↳ {tc.tool}</Text>
                      <Text style={[styles.toolCallArgs, { color: colors.textSecondary }]} numberOfLines={3}>
                        {JSON.stringify(tc.result).slice(0, 600)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {t.pendingMutations && t.pendingMutations.length > 0 && (
                <View style={styles.confirmCardsWrap}>
                  {t.pendingMutations.map((m, i) => {
                    const key = `${t.id}:${m.tool}:${JSON.stringify(m.args)}`;
                    return (
                      <View key={i} style={[styles.confirmCard, { borderColor: colors.accent, backgroundColor: colors.accent + "11" }]}>
                        <Text style={[styles.confirmTitle, { color: colors.text }]}>⚠ Conferma azione: {m.tool}</Text>
                        <Text style={[styles.confirmSummary, { color: colors.text }]}>{m.summary}</Text>
                        <Text style={[styles.confirmArgs, { color: colors.textSecondary }]}>
                          args: {JSON.stringify(m.args)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => confirmMutation(t.id, m)}
                          disabled={confirmingKey !== null}
                          style={[styles.confirmBtn, { backgroundColor: colors.accent }]}
                        >
                          {confirmingKey === key
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.confirmBtnText}>Conferma ed esegui</Text>}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
              {t.publishRunId && publishLogs[t.publishRunId] && (
                <View style={[styles.logBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={[styles.logHeader, { color: colors.textSecondary }]}>
                    Log publish {t.publishRunId} {publishLogs[t.publishRunId].done ? "✓" : "(in corso…)"}
                  </Text>
                  <Text style={[styles.logText, { color: colors.text }]} numberOfLines={20}>
                    {publishLogs[t.publishRunId].text.slice(-3000)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))}

        {loading && (
          <View style={styles.turn}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
      </ScrollView>

      <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Es. pubblica un OTA con messaggio: fix mappa"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          multiline
          editable={!loading}
          onSubmitEditing={() => sendPrompt(prompt)}
        />
        <TouchableOpacity
          onPress={() => sendPrompt(prompt)}
          disabled={loading || !prompt.trim()}
          style={[styles.sendBtn, { backgroundColor: loading || !prompt.trim() ? colors.border : colors.accent }]}
        >
          <Text style={styles.sendBtnText}>Invia</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  headerRow: { marginBottom: 8 },
  title: { fontSize: 16, fontWeight: "700" as const },
  subtitle: { fontSize: 12, marginTop: 2 },
  scroll: { maxHeight: 480, minHeight: 180 },
  hint: { fontSize: 12, marginBottom: 6 },
  suggestion: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  suggestionText: { fontSize: 13 },
  turn: { marginVertical: 6 },
  roleLabel: { fontSize: 11, fontWeight: "700" as const, marginBottom: 4, letterSpacing: 0.5 },
  bubble: { borderWidth: 1, borderRadius: 10, padding: 10 },
  bubbleText: { fontSize: 13, lineHeight: 18 },
  providerTag: { fontSize: 10, marginTop: 6, fontStyle: "italic" as const },
  toolCallsBox: { marginTop: 8, gap: 4 },
  toolCallChip: { borderWidth: 1, borderRadius: 6, padding: 6 },
  toolCallTool: { fontSize: 11, fontWeight: "600" as const },
  toolCallArgs: { fontSize: 11, marginTop: 2 },
  confirmCardsWrap: { marginTop: 10, gap: 8 },
  confirmCard: { borderWidth: 1, borderRadius: 8, padding: 10 },
  confirmTitle: { fontSize: 13, fontWeight: "700" as const, marginBottom: 4 },
  confirmSummary: { fontSize: 13, marginBottom: 6 },
  confirmArgs: { fontSize: 11, marginBottom: 8 },
  confirmBtn: { borderRadius: 6, paddingVertical: 8, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontWeight: "700" as const, fontSize: 13 },
  logBox: { borderWidth: 1, borderRadius: 6, padding: 8, marginTop: 8 },
  logHeader: { fontSize: 11, fontWeight: "600" as const, marginBottom: 4 },
  logText: { fontSize: 11, fontFamily: "monospace" as const, lineHeight: 14 },
  inputRow: { flexDirection: "row", gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    minHeight: 40,
    maxHeight: 100,
  },
  sendBtn: { borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  sendBtnText: { color: "#fff", fontWeight: "700" as const, fontSize: 13 },
});
