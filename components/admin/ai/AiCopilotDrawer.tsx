/**
 * Task #2532 — Drawer/Modal chat copilot. Streaming SSE via fetch reader.
 * Mostra messaggi, draft suggeriti (AiSuggestionItem), input testo.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { isAiKeyMissingResponse, AI_KEY_MISSING_MESSAGE } from "@/lib/ai-errors";
import AiSuggestionItem, { type AiDraft } from "./AiSuggestionItem";

interface Msg { role: "user" | "assistant"; content: string; drafts?: AiDraft[] }

export default function AiCopilotDrawer({
  visible, onClose, scope, contextId, initialMessage,
}: {
  visible: boolean;
  onClose: () => void;
  scope: "report" | "user" | "pattern" | "free";
  contextId?: string;
  initialMessage?: string;
}) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Re-monta logicamente il drawer ad ogni apertura/contesto: previene il leak
  // di messaggi residui (cross-scope contamination) nell'auto-seed iniziale.
  const sessionKey = `${scope}:${contextId ?? ""}:${visible ? "1" : "0"}`;
  useEffect(() => {
    if (visible) {
      setMessages([]);
      setErrorMsg(null);
      if (initialMessage) {
        // Auto-send con baseMessages=[] esplicito (no stale closure su messages).
        setTimeout(() => { void send(initialMessage, []); }, 200);
      }
    } else {
      abortRef.current?.abort();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  async function send(text: string, baseMessages?: Msg[]) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setInput("");
    const base = baseMessages ?? messages;
    const newMessages: Msg[] = [...base, { role: "user", content: trimmed }, { role: "assistant", content: "" }];
    setMessages(newMessages);
    setStreaming(true);
    setErrorMsg(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const url = new URL("/api/admin/ai/chat", getApiUrl()).toString();
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authFetchHeaders()) },
        credentials: "include",
        body: JSON.stringify({
          scope, contextId,
          messages: newMessages.filter((m) => m.role === "user" || m.content.length > 0)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: ac.signal,
      });
      if (!resp.ok) {
        const bodyTxt = await resp.text().catch(() => "");
        let m: string | undefined;
        try { const j = JSON.parse(bodyTxt) as { message?: unknown }; if (typeof j?.message === "string") m = j.message; } catch { /* non JSON */ }
        if (isAiKeyMissingResponse(resp.status, m)) { setErrorMsg(AI_KEY_MISSING_MESSAGE); return; }
        throw new Error(m || `HTTP ${resp.status}`);
      }
      if (!resp.body) throw new Error(`HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";
      let drafts: AiDraft[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const lines = ev.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine.slice(6));
            if (!eventLine) {
              if (payload.chunk) {
                accumulated += payload.chunk;
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: accumulated, drafts };
                  return copy;
                });
              }
            } else if (eventLine.includes("done")) {
              if (Array.isArray(payload.drafts)) drafts = payload.drafts as AiDraft[];
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: payload.final ?? accumulated, drafts };
                return copy;
              });
            } else if (eventLine.includes("error")) {
              setErrorMsg(payload.message ?? "Errore AI");
            }
          } catch { /* ignore parse */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setErrorMsg((err as Error).message ?? "Errore stream");
      }
    } finally {
      setStreaming(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <View style={[styles.container, { paddingTop: Platform.OS === "ios" ? 0 : insets.top }]}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="robot" size={20} color={Colors.accent} />
          <Text style={styles.title}>Co-Pilot AI</Text>
          <Text style={styles.scope}>{scope}{contextId ? ` • ${contextId.slice(0, 8)}` : ""}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            style={styles.thread}
            contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 && !streaming ? (
              <Text style={styles.placeholder}>
                Chiedi un&apos;analisi, una sintesi del pattern, o una bozza di azione. L&apos;AI non eseguirà nulla senza la tua conferma.
              </Text>
            ) : null}
            {messages.map((m, i) => (
              <View key={i} style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAi]}>
                <Text style={[styles.bubbleText, m.role === "user" && { color: "#fff" }]}>{m.content || "…"}</Text>
                {m.drafts?.map((d, di) => (
                  <AiSuggestionItem key={di} draft={d} />
                ))}
              </View>
            ))}
            {streaming ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 8 }} /> : null}
            {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
          </ScrollView>

          <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
            <TextInput
              value={input} onChangeText={setInput}
              placeholder="Scrivi al Co-Pilot…"
              placeholderTextColor={Colors.textSecondary}
              style={styles.input} multiline
              editable={!streaming}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (streaming || !input.trim()) && { opacity: 0.5 }]}
              onPress={() => send(input)} disabled={streaming || !input.trim()}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 16 },
  scope: { color: Colors.textSecondary, fontSize: 11, fontFamily: "Inter_400Regular", flex: 1, marginLeft: 4 },
  thread: { flex: 1 },
  placeholder: { color: Colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 40, paddingHorizontal: 24, fontFamily: "Inter_400Regular" },
  bubble: { padding: 10, borderRadius: 10, marginBottom: 8, maxWidth: "92%" },
  bubbleUser: { backgroundColor: Colors.accent, alignSelf: "flex-end" },
  bubbleAi: { backgroundColor: Colors.surface, alignSelf: "flex-start", borderWidth: 1, borderColor: Colors.border },
  bubbleText: { color: Colors.text, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  error: { color: Colors.error, fontSize: 12, marginTop: 8, fontFamily: "Inter_500Medium" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  input: { flex: 1, color: Colors.text, fontFamily: "Inter_400Regular", fontSize: 14, backgroundColor: Colors.surfaceLight, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120 },
  sendBtn: { backgroundColor: Colors.accent, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
