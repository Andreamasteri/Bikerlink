// Task #2533 — Chat AI watchdog (SSE streaming).
import React, { useState, useRef } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface Msg { role: "user" | "assistant"; content: string }

export function WatchdogChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(next);
    setStreaming(true);
    try {
      const headers = await authFetchHeaders();
      const resp = await fetch(new URL("/api/admin/watchdog/chat", getApiUrl()).toString(), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Accept: "text/event-stream" },
        credentials: "include",
        body: JSON.stringify({ messages: next.slice(0, -1) }),
      });
      if (!resp.ok || !resp.body) {
        const txt = await resp.text();
        throw new Error(txt || `HTTP ${resp.status}`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const lines = ev.split("\n");
          let eventName = "message";
          let data = "";
          for (const l of lines) {
            if (l.startsWith("event: ")) eventName = l.slice(7).trim();
            else if (l.startsWith("data: ")) data += l.slice(6);
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (eventName === "error") { setError(parsed.message || "errore"); continue; }
            if (parsed.type === "text" && typeof parsed.chunk === "string") {
              assistantText += parsed.chunk;
              setMessages((prev) => {
                const c = [...prev]; c[c.length - 1] = { role: "assistant", content: assistantText }; return c;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setError((err as Error).message ?? "errore");
    } finally {
      setStreaming(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView ref={scrollRef} style={styles.list} contentContainerStyle={{ padding: 8 }}>
        {messages.length === 0 ? (
          <Text style={styles.hint}>Chiedi al watchdog: "qual è il problema?" oppure "mostra trend latenza".</Text>
        ) : messages.map((m, i) => (
          <View key={i} style={[styles.msg, m.role === "user" ? styles.userMsg : styles.aiMsg]}>
            <Text style={styles.msgText}>{m.content || (streaming && i === messages.length - 1 ? "…" : "")}</Text>
          </View>
        ))}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input} value={input} onChangeText={setInput}
          placeholder="Chiedi al watchdog…" placeholderTextColor="#6b7280"
          editable={!streaming}
        />
        <TouchableOpacity style={styles.send} onPress={send} disabled={streaming || !input.trim()}>
          {streaming ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Invia</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#111827", borderRadius: 10, overflow: "hidden", minHeight: 280 },
  list: { maxHeight: 320 },
  msg: { padding: 10, borderRadius: 8, marginBottom: 6, maxWidth: "92%" },
  userMsg: { backgroundColor: "#1e3a8a", alignSelf: "flex-end" },
  aiMsg: { backgroundColor: "#1f2937", alignSelf: "flex-start" },
  msgText: { color: "#f3f4f6", fontSize: 13 },
  hint: { color: "#6b7280", textAlign: "center" as const, padding: 16, fontStyle: "italic" as const },
  err: { color: "#f87171", padding: 8, fontSize: 12 },
  inputRow: { flexDirection: "row", padding: 8, gap: 6, borderTopWidth: 1, borderTopColor: "#1f2937" },
  input: {
    flex: 1, color: "#f3f4f6", backgroundColor: "#1f2937",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
  },
  send: { backgroundColor: "#3b82f6", paddingHorizontal: 16, justifyContent: "center", borderRadius: 8 },
  sendText: { color: "#fff", fontWeight: "700" as const },
});
