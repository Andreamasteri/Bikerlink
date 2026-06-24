// Task #4842 — Widget chat AI inline per il pannello admin (sezione Marketing).
// NON è un modal, NON è una pagina separata, NON è un pallino flottante: è un
// pannello collassabile embeddato direttamente nella schermata. Riusa l'infra
// SSE esistente (streamAssistantMessage) con platform "admin": il backend
// inietta uno snapshot piattaforma sintetico nel system prompt.
//
// Mostra il provider AI usato (Groq/Gemini/Ollama…) + costo stimato per risposta
// e un pulsante "Nuova conversazione" per azzerare il contesto in-sessione.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { streamAssistantMessage } from "@/lib/ai-assistant/sse-client";
import { useAuth } from "@/lib/auth-context";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  costUsd?: number;
}

// Persistenza locale (AsyncStorage) della conversazione, keyed per admin.
// La chat sopravvive a navigazione/refresh; nessuna persistenza server-side.
const STORAGE_PREFIX = "admin_ai_chat_v1:";

function storageKey(userId: string | undefined): string {
  return STORAGE_PREFIX + (userId ?? "anon");
}

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).slice(2, 9);
}

// Mappa il provider grezzo del backend a un'etichetta leggibile.
function providerLabel(raw: string | undefined): string {
  switch ((raw ?? "").toLowerCase()) {
    case "groq": return "Groq";
    case "google":
    case "gemini": return "Gemini";
    case "openai": return "OpenAI";
    case "ollama": return "Ollama (locale)";
    default: return raw || "AI";
  }
}

function costLabel(costUsd: number | undefined): string {
  if (costUsd == null || costUsd <= 0) return "~$0";
  if (costUsd < 0.0001) return "<$0.0001";
  return `~$${costUsd.toFixed(4)}`;
}

export default function AdminChatWidget() {
  const { user } = useAuth();
  const userId = user?.id;
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Evita di salvare prima che il caricamento iniziale abbia popolato lo stato,
  // altrimenti l'array vuoto sovrascriverebbe la conversazione persistita.
  const hydratedRef = useRef(false);

  // Carica la conversazione persistita all'avvio (e quando cambia l'admin).
  // Finché l'admin autenticato non è noto NON si idrata né si persiste:
  // evita un bucket "anon" condiviso e residui di chat sbagliata.
  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    // Reset visivo al cambio admin; verrà ripopolato dallo storage del nuovo admin.
    setMessages([]);
    if (!userId) {
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey(userId));
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as ChatMsg[];
        // Non sovrascrivere se l'utente ha già iniziato a scrivere durante l'idratazione.
        if (Array.isArray(parsed)) setMessages((prev) => (prev.length > 0 ? prev : parsed));
      } catch {
        // storage corrotto: si parte da conversazione vuota
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Persiste la conversazione (dopo l'idratazione, solo con admin noto).
  // Durante lo streaming si evitano le scritture per ogni delta: si salva
  // quando lo streaming termina.
  useEffect(() => {
    if (!hydratedRef.current || streaming || !userId) return;
    const key = storageKey(userId);
    if (messages.length === 0) {
      AsyncStorage.removeItem(key).catch(() => {});
    } else {
      AsyncStorage.setItem(key, JSON.stringify(messages)).catch(() => {});
    }
  }, [messages, userId, streaming]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const userMsg: ChatMsg = { id: genId(), role: "user", content: text };
    const asstId = genId();
    const asstMsg: ChatMsg = { id: asstId, role: "assistant", content: "" };

    // history PRIMA di aggiungere il turno corrente
    const history = messages
      .filter((m) => m.content)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInput("");
    setStreaming(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await streamAssistantMessage({
        message: text,
        platform: "admin",
        history,
        signal: abort.signal,
        onEvent: (ev) => {
          if (ev.event === "delta") {
            const d = (ev.data as { text?: string }).text ?? "";
            setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, content: m.content + d } : m)));
          } else if (ev.event === "done") {
            const d = ev.data as { text?: string; provider?: string; costUsd?: number };
            setMessages((prev) => prev.map((m) =>
              m.id === asstId
                ? { ...m, content: d.text ?? m.content, provider: d.provider, costUsd: d.costUsd }
                : m,
            ));
          } else if (ev.event === "error") {
            const d = ev.data as { message?: string };
            setMessages((prev) => prev.map((m) =>
              m.id === asstId ? { ...m, content: `⚠️ ${d.message ?? "Errore"}` } : m,
            ));
          }
        },
      });
    } catch (e) {
      setMessages((prev) => prev.map((m) =>
        m.id === asstId ? { ...m, content: `⚠️ ${(e as Error).message}` } : m,
      ));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, streaming]);

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setInput("");
  }, []);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        testID="admin-chat-toggle"
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <MaterialIcons name="auto-awesome" size={16} color="#fff" />
          </View>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>Assistente AI</Text>
            <Text style={styles.headerSub}>Chiedi statistiche, business, OTA, stato servizi</Text>
          </View>
        </View>
        <MaterialIcons
          name={expanded ? "expand-less" : "expand-more"}
          size={24}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="chat-bubble-outline" size={28} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>
                Es: &quot;Quanti utenti attivi nelle ultime 24h?&quot; oppure &quot;Stato dei servizi ThinkCentre?&quot;
              </Text>
            </View>
          ) : (
            <View style={styles.messages}>
              {messages.map((m) => (
                <View key={m.id} style={m.role === "user" ? styles.userRow : styles.asstRow}>
                  <View style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.asstBubble]}>
                    <Text style={m.role === "user" ? styles.userText : styles.asstText}>
                      {m.content || (streaming && m.role === "assistant" ? "…" : "")}
                    </Text>
                  </View>
                  {m.role === "assistant" && m.content && (m.provider || m.costUsd != null) ? (
                    <View style={styles.metaRow}>
                      <View style={styles.providerBadge}>
                        <Text style={styles.providerText}>{providerLabel(m.provider)}</Text>
                      </View>
                      <Text style={styles.costText}>{costLabel(m.costUsd)} / risposta</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              testID="admin-chat-input"
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Scrivi una domanda…"
              placeholderTextColor={Colors.textSecondary}
              editable={!streaming}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              testID="admin-chat-send"
              style={[styles.sendBtn, (!input.trim() || streaming) && styles.btnDisabled]}
              onPress={send}
              disabled={!input.trim() || streaming}
            >
              {streaming ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            testID="admin-chat-reset"
            style={[styles.resetBtn, (messages.length === 0 && !streaming) && styles.btnDisabled]}
            onPress={resetConversation}
            disabled={messages.length === 0 && !streaming}
          >
            <MaterialIcons name="restart-alt" size={16} color={Colors.textSecondary} />
            <Text style={styles.resetText}>Nuova conversazione</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const ACCENT = "#6A1B9A";

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  headerTextBox: { flex: 1 },
  headerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  body: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  empty: { alignItems: "center", gap: 8, paddingVertical: 20 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center", lineHeight: 17, paddingHorizontal: 10 },
  messages: { paddingTop: 12, gap: 10 },
  userRow: { alignItems: "flex-end" },
  asstRow: { alignItems: "flex-start" },
  bubble: { maxWidth: "90%", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  userBubble: { backgroundColor: ACCENT },
  asstBubble: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  userText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#fff" },
  asstText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginLeft: 2 },
  providerBadge: { backgroundColor: ACCENT + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  providerText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: ACCENT },
  costText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 },
  input: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
    minHeight: 42, maxHeight: 120,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.4 },
  resetBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 8 },
  resetText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
});
