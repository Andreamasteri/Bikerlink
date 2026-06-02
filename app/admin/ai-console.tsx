// Task #2641 — AI Console unificata. Layout 3 colonne (desktop) / tab (mobile).
// Task #2645 — params conversationId/messageId, onboarding tour, "Spiegami questo"
// auto-seed, WS alerts subscriber, scrollToMessageId.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Platform,
  useWindowDimensions, ScrollView,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useColors } from "@/hooks/useColors";
import ConversationSidebar from "@/components/admin/ai-console/ConversationSidebar";
import MessageList from "@/components/admin/ai-console/MessageList";
import ContextPanel from "@/components/admin/ai-console/ContextPanel";
import ActionQueuePanel from "@/components/admin/ai-console/ActionQueuePanel";
import BudgetIndicator from "@/components/admin/ai-console/BudgetIndicator";
import OnboardingTour from "@/components/admin/ai-console/OnboardingTour";
import { useAiConsole } from "@/hooks/admin/ai-console/useAiConsole";
import { useAiConversationMessages } from "@/hooks/admin/ai-console/useAiConversation";
import { consumeExplainPending, useExplainPending } from "@/hooks/admin/ai-console/useAiExplain";
import { apiRequest } from "@/lib/query-client";
import { useAiAlertsSubscriber, clearAiAlertsUnread } from "@/hooks/admin/ai-console/useAiAlerts";
import { useAdminPrefs, useUpdateAdminPrefs } from "@/hooks/admin/ai-console/useAdminPrefs";

type MobileTab = "list" | "chat" | "ctx";

export default function AiConsoleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  // Task #2645 — accetta deep-link da search/notifica/Spiegami.
  const params = useLocalSearchParams<{ conversationId?: string; messageId?: string }>();

  const [convId, setConvId] = useState<string | null>(params.conversationId ?? null);
  const [scrollMsgId, setScrollMsgId] = useState<string | null>(params.messageId ?? null);
  const [input, setInput] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  // Task #2645 — WS alerts (sostituisce polling 30s).
  useAiAlertsSubscriber();
  useEffect(() => { clearAiAlertsUnread(); }, [convId]);

  // Task #2645 — onboarding 3-step gated by adminPrefs.aiConsoleOnboarded.
  const { data: prefsData } = useAdminPrefs();
  const updatePrefs = useUpdateAdminPrefs();
  const [tourOpen, setTourOpen] = useState(false);
  const tourDecidedRef = useRef(false);
  useEffect(() => {
    if (tourDecidedRef.current) return;
    if (!prefsData) return;
    tourDecidedRef.current = true;
    const onboarded = Boolean(prefsData.prefs?.aiConsoleOnboarded);
    if (!onboarded) setTourOpen(true);
  }, [prefsData]);
  const finishTour = useCallback(() => {
    setTourOpen(false);
    updatePrefs.mutate({ aiConsoleOnboarded: true });
  }, [updatePrefs]);

  const { data: thread, isLoading } = useAiConversationMessages(convId);
  const { state, send, reset } = useAiConsole(convId, (id) => setConvId(id));

  // Quando cambia conversazione, reset stream.
  useEffect(() => { reset(); }, [convId, reset]);

  // Task #2645 — applica params su mount/cambio link.
  useEffect(() => {
    if (params.conversationId && params.conversationId !== convId) {
      setConvId(params.conversationId);
    }
    if (params.messageId) setScrollMsgId(params.messageId);
  }, [params.conversationId, params.messageId, convId]);

  // Task #2645 — "Spiegami questo": ogni volta che arriva un nuovo pending,
  // crea una NUOVA conversazione con system-context preloadato e invia il seed
  // user direttamente in quel conversationId (override per evitare closure
  // stale). Il ref è chiave-per-pending così è ri-attivabile più volte nella
  // stessa sessione (non più one-shot per mount).
  const explainHandledKeyRef = useRef<string | null>(null);
  const pendingExplain = useExplainPending(); // reattivo: ri-trigger se l'utente è già sulla pagina
  useEffect(() => {
    if (!pendingExplain) return;
    const key = `${pendingExplain.type}:${pendingExplain.id}:${pendingExplain.at ?? ""}`;
    if (explainHandledKeyRef.current === key) return;
    const pending = consumeExplainPending();
    if (!pending) return;
    explainHandledKeyRef.current = key;
    const seed = pending.seed ?? `Spiega ${pending.type} ${pending.id}`;
    if (!isDesktop) setMobileTab("chat");
    (async () => {
      let newId: string | null = null;
      try {
        const res = await apiRequest("POST", "/api/admin/ai/console/conversations", {
          title: `Spiega ${pending.type}: ${pending.label ?? pending.id}`.slice(0, 200),
          preload: {
            role: "system",
            content: `Contesto "Spiegami questo": entità ${pending.type} id=${pending.id}${pending.label ? ` ("${pending.label}")` : ""}. Rispondi in italiano, sintetico, con azioni concrete.`,
          },
        });
        const data = await res.json() as { conversation?: { id?: string } };
        newId = data?.conversation?.id ?? null;
      } catch {
        // Fallback: convId resta null e send creerà una conv on-the-fly.
      }
      setConvId(newId);
      reset();
      void send(seed, { conversationIdOverride: newId });
    })();
  }, [send, reset, isDesktop, pendingExplain]);

  const onSend = () => {
    const t = input.trim();
    if (!t || state.streaming) return;
    setInput("");
    void send(t);
  };

  const handleNew = () => { reset(); setConvId(null); setScrollMsgId(null); if (!isDesktop) setMobileTab("chat"); };
  const handleSelect = (id: string | null, messageId?: string | null) => {
    setConvId(id);
    setScrollMsgId(messageId ?? null);
    if (!isDesktop) setMobileTab("chat");
  };

  const webTop = Platform.OS === "web" ? 67 : 0;
  const webBottom = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: webTop, paddingBottom: webBottom }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={0}
      >
        {isDesktop ? (
          <View style={styles.row}>
            <View style={[styles.colSide, { borderColor: colors.border }]}>
              <ConversationSidebar selectedId={convId} onSelect={handleSelect} onNew={handleNew} />
            </View>
            <View style={[styles.colChat]}>
              <ChatPane
                streamState={state}
                messages={thread?.messages ?? []}
                loading={isLoading}
                input={input}
                onChangeInput={setInput}
                onSend={onSend}
                colors={colors}
                bottomPad={insets.bottom}
                scrollToMessageId={scrollMsgId}
              />
            </View>
            <View style={[styles.colCtx, { borderColor: colors.border }]}>
              <ScrollView contentContainerStyle={{ padding: 10, gap: 10 }}>
                <BudgetIndicator />
                <ContextPanel messages={thread?.messages ?? []} streamState={state} />
                <ActionQueuePanel />
              </ScrollView>
            </View>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={[styles.tabBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TabBtn label="Lista" active={mobileTab === "list"} onPress={() => setMobileTab("list")} colors={colors} icon="list" />
              <TabBtn label="Chat" active={mobileTab === "chat"} onPress={() => setMobileTab("chat")} colors={colors} icon="chatbubble-ellipses" />
              <TabBtn label="Contesto" active={mobileTab === "ctx"} onPress={() => setMobileTab("ctx")} colors={colors} icon="information-circle" />
            </View>
            {mobileTab === "list" ? (
              <ConversationSidebar selectedId={convId} onSelect={handleSelect} onNew={handleNew} />
            ) : mobileTab === "chat" ? (
              <ChatPane
                streamState={state}
                messages={thread?.messages ?? []}
                loading={isLoading}
                input={input}
                onChangeInput={setInput}
                onSend={onSend}
                colors={colors}
                bottomPad={insets.bottom}
                scrollToMessageId={scrollMsgId}
              />
            ) : (
              <ScrollView contentContainerStyle={{ padding: 10, gap: 10 }}>
                <BudgetIndicator />
                <ContextPanel messages={thread?.messages ?? []} streamState={state} />
                <ActionQueuePanel />
              </ScrollView>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
      <OnboardingTour visible={tourOpen} onDone={finishTour} />
    </View>
  );
}

interface ChatPaneProps {
  streamState: ReturnType<typeof useAiConsole>["state"];
  messages: NonNullable<ReturnType<typeof useAiConversationMessages>["data"]>["messages"];
  loading: boolean;
  input: string;
  onChangeInput: (v: string) => void;
  onSend: () => void;
  colors: ReturnType<typeof useColors>;
  bottomPad: number;
  scrollToMessageId?: string | null;
}

function ChatPane({ streamState, messages, loading, input, onChangeInput, onSend, colors, bottomPad, scrollToMessageId }: ChatPaneProps) {
  const disabled = streamState.streaming || !input.trim();
  return (
    <View style={{ flex: 1 }}>
      <MessageList messages={messages} streamState={streamState} loading={loading} scrollToMessageId={scrollToMessageId} />
      <View
        style={[
          styles.inputBar,
          { borderColor: colors.border, backgroundColor: colors.surface, paddingBottom: Math.max(bottomPad, 8) },
        ]}
      >
        <TextInput
          value={input}
          onChangeText={onChangeInput}
          placeholder="Scrivi all'AI… (es: 'analizza report critici aperti')"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceLight }]}
          editable={!streamState.streaming}
          multiline
          onSubmitEditing={onSend}
        />
        <TouchableOpacity
          onPress={onSend}
          disabled={disabled}
          style={[styles.send, { backgroundColor: colors.accent, opacity: disabled ? 0.5 : 1 }]}
          accessibilityLabel="Invia"
          testID="ai-console-send"
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TabBtn({
  label, active, onPress, colors, icon,
}: {
  label: string; active: boolean; onPress: () => void;
  colors: ReturnType<typeof useColors>;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tabBtn, active && { borderBottomColor: colors.accent }]}
    >
      <Ionicons name={icon} size={16} color={active ? colors.accent : colors.textSecondary} />
      <Text
        style={[
          styles.tabTxt,
          { color: active ? colors.accent : colors.textSecondary, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: "row" },
  colSide: { width: 260, borderRightWidth: 1 },
  colChat: { flex: 1 },
  colCtx: { width: 320, borderLeftWidth: 1 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: {
    flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabTxt: { fontSize: 12 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    padding: 10, borderTopWidth: 1,
  },
  input: {
    flex: 1, fontFamily: "Inter_400Regular", fontSize: 14,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120,
  },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
