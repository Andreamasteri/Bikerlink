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
import { friendlyChatErrorMessage, friendlyChatErrorFromEvent } from "@/lib/ai-assistant/friendly-error";
import { currentAssistantPlatform } from "@/hooks/useAssistantConfig";
import { useAssistantRoster } from "@/hooks/useAssistantRoster";
import { rosterPersonaName, normalizePersonaId } from "@/lib/ai-assistant/roster";
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
  const { language, setLanguage } = useLanguage();
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingAction, setPendingAction] = useState<AssistantProposedAction | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Task #44 — cronologia + testo dell'ultima richiesta inviata, per poter
  // rimandare l'IDENTICA richiesta con "Riprova" senza duplicare la bolla
  // utente. La reply-cache server-side (Task #11) rende un retry identico
  // idempotente: se il server aveva già finito, la risposta torna all'istante.
  const lastRequestRef = useRef<{ text: string; history: Array<{ role: "user" | "assistant"; content: string }> } | null>(null);
  // Task #8 — L'elenco degli agenti mostrati in UI riflette il roster server
  // (agenti configurati/raggiungibili), con degradazione all'elenco noto.
  const { personas: roster } = useAssistantRoster(visible);

  const runSend = useCallback(async (
    asstId: string,
    text: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ) => {
    setStreaming(true);
    const platform = (Platform.OS === "web" ? "web" : currentAssistantPlatform()) as "android" | "ios" | "web";
    const abort = new AbortController();
    abortRef.current = abort;
    const collectedActions: AssistantProposedAction[] = [];
    try {
      await streamAssistantMessage({
        message: text,
        platform,
        history,
        signal: abort.signal,
        // Task #107 — lingua app corrente: il server recupera la traduzione
        // corrispondente del manuale (Nadir) invece del solo italiano.
        language,
        onEvent: (ev) => {
          if (ev.event === "delta") {
            const d = (ev.data as { text?: string }).text ?? "";
            // Task #141 — arrivato il testo: la fase di ragionamento è finita.
            setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content: m.content + d, thinking: false } : m));
          } else if (ev.event === "thinking") {
            // Task #141 — il modello sta ragionando (nessun testo ancora): la UI
            // mostra "sta pensando…" per dare feedback immediato (qwen3 ragiona
            // ~45–60s prima del primo token).
            setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, thinking: true } : m));
          } else if (ev.event === "persona") {
            // Task #5197 — il server annuncia CHI risponde (Bowie/Horus/Ares).
            // Task #599 — normalizza ID obsoleti (es. "quebracho" da sessioni
            // storiche in DB) prima che raggiungano la UI.
            const raw = ev.data as { id: string; name: string };
            const p: AssistantPersona = { ...raw, id: normalizePersonaId(raw.id) };
            setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, persona: p } : m));
          } else if (ev.event === "action") {
            const a = ev.data as AssistantProposedAction;
            collectedActions.push(a);
          } else if (ev.event === "done") {
            const d = ev.data as { text?: string; persona?: { id: string; name: string } };
            // Task #599 — normalizza ID persona obsoleti (es. "quebracho") prima
            // che raggiungano la UI, sia nell'evento "done" che in "persona".
            const donePersona: AssistantPersona | undefined = d.persona
              ? { ...d.persona, id: normalizePersonaId(d.persona.id) }
              : undefined;
            setMessages((prev) => prev.map((m) =>
              m.id === asstId
                ? {
                    ...m,
                    content: d.text ?? m.content,
                    actions: collectedActions.length ? collectedActions : undefined,
                    persona: donePersona ?? m.persona,
                    errorRecoverable: false,
                    thinking: false,
                  }
                : m,
            ));
          } else if (ev.event === "error") {
            // Task #44 (parità BikerBlog D4) — il server marca `recoverable` gli
            // errori transitori (rete/provider): solo quelli offrono "Riprova".
            const d = ev.data as { code?: number; message?: string; recoverable?: boolean };
            const text = friendlyChatErrorFromEvent(d.code, d.message);
            setMessages((prev) => prev.map((m) =>
              m.id === asstId ? { ...m, content: `⚠️ ${text}`, errorRecoverable: d.recoverable === true } : m,
            ));
          }
        },
      });
    } catch (e) {
      // Task #8 — Ogni interruzione dello stream (fetch iniziale o reader.read()
      // a metà lettura, tunnel Cloudflare che cade) diventa un messaggio
      // amichevole in italiano, mai il testo grezzo del browser. "" = abort
      // volontario dell'utente → non mostrare alcun errore.
      const text = friendlyChatErrorMessage(e);
      if (text) {
        // Task #44 — un drop di connessione lato client è per definizione
        // transitorio (il server potrebbe aver comunque completato e cachato
        // la risposta): offriamo "Riprova" anche qui, non solo sugli errori
        // segnalati dal server nello stream.
        setMessages((prev) => prev.map((m) =>
          m.id === asstId
            ? { ...m, content: m.content ? `${m.content}\n\n⚠️ ${text}` : `⚠️ ${text}`, errorRecoverable: true }
            : m,
        ));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [language]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const userMsg: AssistantChatMessage = { id: genId(), role: "user", content: text, createdAt: Date.now() };
    const asstId = genId();
    const asstMsg: AssistantChatMessage = { id: asstId, role: "assistant", content: "", createdAt: Date.now() };
    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInput("");
    // Task #5233 — Includi la poesia di Bowie come primo turno "assistant" nella
    // history inviata: così il backend NON la considera una conversazione nuova e
    // NON re-emette il proprio seed poetico → niente doppione tra bolla client e
    // stream backend. La poesia statica non è salvata nel DB lato server.
    const history = [BOWIE_GREETING_MESSAGE, ...messages]
      .filter((m) => m.content)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    lastRequestRef.current = { text, history };
    await runSend(asstId, text, history);
  }, [input, messages, streaming, runSend]);

  // Task #44 — rimanda l'ULTIMA richiesta identica (stesso messaggio + stessa
  // cronologia) senza aggiungere una nuova bolla utente: solo l'ultimo turno
  // assistente può trovarsi in stato d'errore recuperabile, quindi il testo/
  // history salvati in lastRequestRef sono sempre quelli giusti da rimandare.
  const retry = useCallback(async (asstId: string) => {
    const last = lastRequestRef.current;
    if (!last || streaming) return;
    setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content: "", errorRecoverable: false, thinking: false } : m));
    await runSend(asstId, last.text, last.history);
  }, [streaming, runSend]);

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
  // Quebracho rimosso (Task #591 — unificato in Horus).
  // Task #599 — accetta `string` (non solo il tipo union) per gestire ID
  // obsoleti (es. "quebracho") che possono essere già presenti nello state da
  // sessioni storiche; fallback a bowie (accent) per qualsiasi ID sconosciuto.
  const personaColor = useCallback((id: string): string => {
    if (id === "horus") return colors.success;
    if (id === "ares") return colors.warning;
    return colors.accent; // bowie o ID sconosciuto
  }, [colors.success, colors.warning, colors.accent]);

  // Task #8 — nome mostrato risolto dal roster server (fallback: nome inviato
  // dallo stream, poi elenco noto). Così l'identità dell'agente in UI dipende
  // dal roster, non da un elenco hardcoded nel componente.
  const personaName = useCallback(
    (p: AssistantPersona): string => rosterPersonaName(roster, p.id, p.name),
    [roster],
  );

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
                  <Text
                    testID={`persona-label-${item.id}`}
                    style={[styles.personaLabel, { color: personaColor(item.persona.id) }]}
                  >
                    {personaName(item.persona)}
                  </Text>
                ) : null}
                {item.content ? (
                  <Text style={{ color: item.role === "user" ? "#fff" : colors.text }}>
                    {item.content}
                  </Text>
                ) : streaming && item.role === "assistant" ? (
                  // Task #8 — indicatore di stato leggibile invece di un'attesa
                  // muta durante i turni più lenti (modello locale / tool in corso).
                  <View style={styles.typingRow}>
                    <ActivityIndicator size="small" color={colors.textMuted ?? colors.textSecondary} />
                    <Text style={[styles.typingText, { color: colors.textMuted ?? colors.textSecondary }]}>
                      {`${item.persona ? personaName(item.persona) : (t("aiAssistant.title") || "Bowie")} ${
                        item.thinking
                          ? (t("aiAssistant.status.thinking") || "sta pensando…")
                          : (t("aiAssistant.status.typing") || "sta scrivendo…")
                      }`}
                    </Text>
                  </View>
                ) : null}
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
                {item.errorRecoverable && !streaming ? (
                  // Task #44 — errore transitorio (rete/provider): la stessa
                  // richiesta può recuperare la risposta dalla reply-cache o
                  // rigenerarla in fretta, quindi offriamo "Riprova" invece di
                  // lasciare un vicolo cieco.
                  <Pressable
                    testID="assistant-chat-retry"
                    onPress={() => retry(item.id)}
                    style={[styles.actionChip, { borderColor: colors.primary }]}
                  >
                    <Ionicons name="refresh" size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>
                      {t("aiAssistant.retry") || "Riprova"}
                    </Text>
                  </Pressable>
                ) : null}
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
  typingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typingText: { fontSize: 13, fontStyle: "italic" },
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
