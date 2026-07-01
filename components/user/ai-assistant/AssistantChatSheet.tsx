// Task #2698 — Drawer chat AI Assistant utente. Inverted FlatList per messaggi
// reali, NORMALE View per empty state. Streaming via expo/fetch.
import React, { useCallback, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useT, useLanguage } from "@/lib/language-context";
import { apiRequest } from "@/lib/query-client";
import { streamAssistantMessage } from "@/lib/ai-assistant/sse-client";
import { isAiKeyMissingResponse, isAiKeyMissingError, AI_KEY_MISSING_MESSAGE } from "@/lib/ai-errors";
import { currentAssistantPlatform } from "@/hooks/useAssistantConfig";
import { executeClientAction } from "@/lib/ai-assistant/client-actions";
import { BOWIE_INTRO_POEM } from "@shared/bowie-greeting";
import AssistantActionConfirmSheet from "./AssistantActionConfirmSheet";
import type { AssistantChatMessage, AssistantProposedAction, AssistantPersona } from "@/lib/ai-assistant/types";

// Task #5233 — Bolla di apertura poetica di Bowie. Sintetica (NON nello stato
// `messages`): mostrata solo a chat vuota come messaggio di apertura, così la
// chat in-app apre con lo stesso testo del terminale standalone. In send() viene
// però inclusa in cima alla history inviata al backend, così il backend non
// considera la conversazione "nuova" e non re-emette il proprio seed poetico
// (niente doppione tra bolla client e stream).
const BOWIE_GREETING_MESSAGE: AssistantChatMessage = {
  id: "bowie-intro-poem",
  role: "assistant",
  content: BOWIE_INTRO_POEM,
  createdAt: 0,
  persona: { id: "bowie", name: "Bowie" },
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).slice(2, 8);
}

export default function AssistantChatSheet({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const router = useRouter();
  const { setLanguage } = useLanguage();
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingAction, setPendingAction] = useState<AssistantProposedAction | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const userMsg: AssistantChatMessage = { id: genId(), role: "user", content: text, createdAt: Date.now() };
    const asstId = genId();
    const asstMsg: AssistantChatMessage = { id: asstId, role: "assistant", content: "", createdAt: Date.now() };
    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInput("");
    setStreaming(true);
    const platform = (Platform.OS === "web" ? "web" : currentAssistantPlatform()) as "android" | "ios" | "web";
    // Task #5233 — Includi la poesia di Bowie come primo turno "assistant" nella
    // history inviata: così il backend NON la considera una conversazione nuova e
    // NON re-emette il proprio seed poetico → niente doppione tra bolla client e
    // stream backend. La poesia statica non è salvata nel DB lato server.
    const history = [BOWIE_GREETING_MESSAGE, ...messages]
      .filter((m) => m.content)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    const abort = new AbortController();
    abortRef.current = abort;
    const collectedActions: AssistantProposedAction[] = [];
    try {
      await streamAssistantMessage({
        message: text,
        platform,
        history,
        signal: abort.signal,
        onEvent: (ev) => {
          if (ev.event === "delta") {
            const d = (ev.data as { text?: string }).text ?? "";
            setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content: m.content + d } : m));
          } else if (ev.event === "persona") {
            // Task #5197 — il server annuncia CHI risponde (Bowie/Horus/Ares).
            const p = ev.data as AssistantPersona;
            setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, persona: p } : m));
          } else if (ev.event === "action") {
            const a = ev.data as AssistantProposedAction;
            collectedActions.push(a);
          } else if (ev.event === "done") {
            const d = ev.data as { text?: string; persona?: AssistantPersona };
            setMessages((prev) => prev.map((m) =>
              m.id === asstId
                ? {
                    ...m,
                    content: d.text ?? m.content,
                    actions: collectedActions.length ? collectedActions : undefined,
                    persona: d.persona ?? m.persona,
                  }
                : m,
            ));
          } else if (ev.event === "error") {
            const d = ev.data as { code?: number; message?: string };
            const text = isAiKeyMissingResponse(d.code ?? 0, d.message)
              ? AI_KEY_MISSING_MESSAGE
              : (d.message ?? "errore");
            setMessages((prev) => prev.map((m) =>
              m.id === asstId ? { ...m, content: `⚠️ ${text}` } : m,
            ));
          }
        },
      });
    } catch (e) {
      const text = isAiKeyMissingError(e) ? AI_KEY_MISSING_MESSAGE : (e as Error).message;
      setMessages((prev) => prev.map((m) =>
        m.id === asstId ? { ...m, content: `⚠️ ${text}` } : m,
      ));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, streaming]);

  const confirmAction = useCallback(async () => {
    if (!pendingAction) return;
    const platform = (Platform.OS === "web" ? "web" : currentAssistantPlatform()) as "android" | "ios" | "web";
    try {
      await apiRequest("POST", `/api/ai/assistant/action/${encodeURIComponent(pendingAction.actionId)}`, {
        confirmed: true,
        params: pendingAction.params,
        platform,
      });
      await executeClientAction(pendingAction.actionId, pendingAction.params as Record<string, unknown>, {
        router,
        setLanguage: (l) => setLanguage(l as never),
      });
    } catch (e) {
      console.warn("[assistant action]", (e as Error).message);
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, router, setLanguage]);

  // Task #5233 — La bolla poetica di Bowie appare SOLO a chat vuota (nessuna
  // cronologia nella sessione): è l'unico messaggio mostrato all'apertura. Appena
  // l'utente scrive, la conversazione reale prende il posto e la poesia non viene
  // più reinserita. La non-duplicazione col seed del backend è garantita in send()
  // includendo la poesia nella history inviata (vedi sotto).
  const data = React.useMemo(
    () => (messages.length ? [...messages].reverse() : [BOWIE_GREETING_MESSAGE]),
    [messages],
  );

  // Task #5197 — colore distintivo per ciascuna AI nelle etichette di chat.
  const personaColor = useCallback((id: AssistantPersona["id"]): string => {
    if (id === "horus") return colors.success;
    if (id === "ares") return colors.warning;
    return colors.accent; // bowie
  }, [colors.success, colors.warning, colors.accent]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
        behavior="padding"
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Ionicons name="sparkles" size={20} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>{t("aiAssistant.title") || "Bowie"}</Text>
          <Pressable testID="assistant-chat-close" onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <FlatList
            data={data}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 12 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            renderItem={({ item }) => (
              <View style={[
                styles.bubble,
                item.role === "user"
                  ? { backgroundColor: colors.primary, alignSelf: "flex-end" }
                  : { backgroundColor: colors.surface, alignSelf: "flex-start" },
              ]}>
                {item.role === "assistant" && item.persona ? (
                  <Text style={[styles.personaLabel, { color: personaColor(item.persona.id) }]}>
                    {item.persona.name}
                  </Text>
                ) : null}
                <Text style={{ color: item.role === "user" ? "#fff" : colors.text }}>
                  {item.content || (streaming && item.role === "assistant" ? "…" : "")}
                </Text>
                {item.actions?.map((a, i) => (
                  <Pressable
                    key={i}
                    testID={`assistant-action-${a.actionId}`}
                    onPress={() => setPendingAction(a)}
                    style={[styles.actionChip, { borderColor: colors.primary }]}
                  >
                    <Ionicons name="flash-outline" size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>
                      {t(a.confirmKey) || a.actionId}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          />

        <View
          style={[
            styles.inputRow,
            {
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <TextInput
            testID="assistant-chat-input"
            value={input}
            onChangeText={setInput}
            placeholder={t("aiAssistant.inputPlaceholder") || "Scrivi un messaggio…"}
            placeholderTextColor={colors.textMuted ?? colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface }]}
            editable={!streaming}
            multiline
            maxLength={2000}
          />
          <Pressable
            testID="assistant-chat-send"
            disabled={!input.trim() || streaming}
            onPress={send}
            style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: !input.trim() || streaming ? 0.5 : 1 }]}
          >
            {streaming ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>

        <AssistantActionConfirmSheet
          visible={!!pendingAction}
          actionId={pendingAction?.actionId ?? null}
          confirmKey={pendingAction?.confirmKey ?? null}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmAction}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: 17, fontWeight: "600" },
  bubble: { maxWidth: "85%", borderRadius: 14, padding: 10, marginBottom: 8, gap: 8 },
  personaLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  actionChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1,
    alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.6)",
  },
  inputRow: {
    flexDirection: "row", gap: 8, padding: 8,
    borderTopWidth: StyleSheet.hairlineWidth, alignItems: "flex-end",
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 18, fontSize: 15,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
  },
});
