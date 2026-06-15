// Task #2641 — Drawer compatto del FAB: input + ultimi 5 messaggi + link console.
// Task #3894 — Aggiunto tab "Raccolta Bug" con lista errori consolidata.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, useWindowDimensions,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useColors } from "@/hooks/useColors";
import { useAiConsole } from "@/hooks/admin/ai-console/useAiConsole";
import {
  useAiConversations,
  useAiConversationMessages,
} from "@/hooks/admin/ai-console/useAiConversation";
import {
  useBugReport,
  formatBugReportClipboard,
  relativeTime,
  type BugItem,
} from "@/hooks/admin/ai-console/useBugReport";
import MessageItem from "./MessageItem";

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Tab = "console" | "bugs";

function severityColor(severity: string, colors: ReturnType<typeof useColors>): string {
  return severity === "critical" ? (colors.error ?? "#E53E3E") : (colors.warning ?? "#FFB300");
}

function sourceIcon(source: BugItem["source"]): string {
  if (source === "crash") return "nuclear-outline";
  if (source === "signal") return "pulse-outline";
  return "eye-outline";
}

function trunc80(s: string): string {
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

export default function FabDrawer({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = windowHeight * 0.75;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("console");
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: convs } = useAiConversations();
  const lastId = convs?.conversations?.[0]?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(null);

  const { query: bugQuery, markSeen, clearAll } = useBugReport();
  const bugItems = useMemo(() => bugQuery.data?.items ?? [], [bugQuery.data]);
  // Task #4080: Copia e Invia restano attivi anche in caso di errore di caricamento,
  // così l'utente può almeno copiare/inviare il messaggio d'errore contestuale.
  const canCopyOrSend = bugItems.length > 0 || bugQuery.isError;

  useEffect(() => {
    if (visible) setActiveId(lastId);
  }, [visible, lastId]);

  useEffect(() => {
    if (visible && activeTab === "bugs") markSeen();
  }, [visible, activeTab, markSeen]);

  const { data: thread } = useAiConversationMessages(activeId);
  const { state, send } = useAiConsole(activeId, (id) => setActiveId(id));

  const recent = (thread?.messages ?? []).slice(-5);

  const openFull = () => {
    onClose();
    router.push("/admin/ai-console" as never);
  };

  const handleCopy = useCallback(async () => {
    // Task #4080: se c'è un errore di caricamento, copia un messaggio diagnostico
    const text = bugQuery.isError && bugItems.length === 0
      ? `[BikerLink Bug Report - errore caricamento]\n\nImpossibile caricare la Raccolta Bug. Controllare i log del backend.`
      : formatBugReportClipboard(bugItems);
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [bugItems, bugQuery.isError]);

  const handleSendToConsole = useCallback(() => {
    // Task #4080: se c'è un errore di caricamento, invia il messaggio diagnostico
    const digest = bugQuery.isError && bugItems.length === 0
      ? `[Errore caricamento Raccolta Bug]\n\nImpossibile caricare i dati dalla Raccolta Bug. Controllare i log del backend (tabelle app_crash_logs, system_signals, ai_watchdog_log).`
      : formatBugReportClipboard(bugItems);
    setInput(`Analizza questi errori recenti di BikerLink:\n\n${digest}\n\nCosa consigli?`);
    setActiveTab("console");
  }, [bugItems, bugQuery.isError]);

  const bugCount = bugQuery.data?.total ?? 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={[styles.backdropTap, { top: 0, left: 0, right: 0, bottom: 0 }]} onPress={onClose} activeOpacity={1} />
        <KeyboardAvoidingView
          behavior="padding"
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              height: sheetHeight,
            },
          ]}
        >
          {/* Header con selettore tab */}
          <View style={[styles.header, { borderColor: colors.border }]}>
            <Ionicons name={activeTab === "bugs" ? "bug" : "sparkles"} size={16} color={colors.accent} />
            <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setActiveTab("console")}
                style={[styles.tab, activeTab === "console" && { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.tabTxt, { color: activeTab === "console" ? "#fff" : colors.textSecondary }]}>
                  AI Console
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setActiveTab("bugs"); markSeen(); }}
                style={[styles.tab, activeTab === "bugs" && { backgroundColor: colors.error ?? "#E53E3E" }]}
              >
                <Text style={[styles.tabTxt, { color: activeTab === "bugs" ? "#fff" : colors.textSecondary }]}>
                  🐛 Raccolta Bug{bugCount > 0 ? ` (${bugCount})` : ""}
                </Text>
              </TouchableOpacity>
            </View>
            {activeTab === "console" && (
              <TouchableOpacity onPress={openFull} style={styles.openBtn}>
                <Text style={[styles.openTxt, { color: colors.accent }]}>Apri</Text>
                <Ionicons name="open-outline" size={14} color={colors.accent} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} accessibilityLabel="Chiudi">
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* AI Console tab */}
          {activeTab === "console" && (
            <>
              <View style={styles.thread}>
                {recent.length === 0 && !state.streaming && !state.text ? (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>
                    Scrivi una domanda per iniziare.
                  </Text>
                ) : (
                  recent.map((m) => <MessageItem key={m.id} message={m} />)
                )}
                {state.streaming || state.text ? (
                  <MessageItem
                    message={{
                      id: "__live__", conversationId: activeId ?? "live", role: "assistant",
                      content: state.text || "…", scopes: state.router?.scopes ?? null,
                      toolCalls: state.toolCalls.map((t) => ({ name: t.name, args: t.args, result: t.result })),
                      entities: null, model: null, provider: null,
                      tokensIn: 0, tokensOut: 0, costUsd: "0",
                      createdAt: new Date().toISOString(),
                    }}
                  />
                ) : null}
              </View>
              <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surface, paddingBottom: (insets.bottom || 8) }]}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Chiedi all'AI…"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceLight }]}
                  editable={!state.streaming}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.send, { backgroundColor: colors.accent, opacity: state.streaming || !input.trim() ? 0.5 : 1 }]}
                  onPress={() => { const t = input; setInput(""); void send(t); }}
                  disabled={state.streaming || !input.trim()}
                  accessibilityLabel="Invia"
                >
                  <Ionicons name="send" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Raccolta Bug tab */}
          {activeTab === "bugs" && (
            <View style={styles.bugContainer}>
              <ScrollView style={styles.bugList} contentContainerStyle={styles.bugListContent}>
                {bugQuery.isLoading ? (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>Caricamento…</Text>
                ) : bugQuery.isError ? (
                  <View style={[styles.errorBox, { backgroundColor: (colors.error ?? "#E53E3E") + "18", borderColor: colors.error ?? "#E53E3E" }]}>
                    <Ionicons name="warning-outline" size={18} color={colors.error ?? "#E53E3E"} />
                    <Text style={[styles.errorTxt, { color: colors.error ?? "#E53E3E" }]}>
                      Errore nel caricamento
                    </Text>
                  </View>
                ) : bugItems.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessun errore recente. ✅</Text>
                ) : bugItems.map((item) => (
                  <View key={item.id} style={[styles.bugItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.bugItemHeader}>
                      <Ionicons
                        name={sourceIcon(item.source) as never}
                        size={14}
                        color={severityColor(item.severity, colors)}
                      />
                      <Text style={[styles.bugTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                      {/* Severity badge */}
                      <View style={[styles.severityBadge, { backgroundColor: severityColor(item.severity, colors) + "33" }]}>
                        <Text style={[styles.severityTxt, { color: severityColor(item.severity, colors) }]}>
                          {item.severity}
                        </Text>
                      </View>
                      {/* Repeat count badge — visibile solo se > 1 occorrenza */}
                      {item.count > 1 && (
                        <View style={[styles.countBadge, { backgroundColor: colors.textSecondary + "22", borderColor: colors.border }]}>
                          <Text style={[styles.countTxt, { color: colors.textSecondary }]}>×{item.count}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.bugMsg, { color: colors.textSecondary }]} numberOfLines={2}>
                      {trunc80(item.message)}
                    </Text>
                    <Text style={[styles.bugDate, { color: colors.textSecondary }]}>{relativeTime(item.createdAt)}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={[styles.bugActions, { borderColor: colors.border, backgroundColor: colors.surface, paddingBottom: (insets.bottom || 8) }]}>
                <TouchableOpacity
                  style={[styles.bugBtn, { backgroundColor: copied ? (colors.success ?? "#38A169") : colors.surfaceLight, borderColor: colors.border, opacity: canCopyOrSend ? 1 : 0.4 }]}
                  onPress={() => { void handleCopy(); }}
                  disabled={!canCopyOrSend}
                >
                  <Ionicons name={copied ? "checkmark" : "copy-outline"} size={15} color={copied ? "#fff" : colors.text} />
                  <Text style={[styles.bugBtnTxt, { color: copied ? "#fff" : colors.text }]}>
                    {copied ? "Copiato!" : "Copia"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bugBtn, { backgroundColor: colors.accent, borderColor: colors.accent, opacity: canCopyOrSend ? 1 : 0.4 }]}
                  onPress={handleSendToConsole}
                  disabled={!canCopyOrSend}
                >
                  <Ionicons name="sparkles" size={15} color="#fff" />
                  <Text style={[styles.bugBtnTxt, { color: "#fff" }]}>Invia alla AI Console</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bugBtn, { backgroundColor: (colors.error ?? "#E53E3E") + "18", borderColor: colors.error ?? "#E53E3E", opacity: (bugItems.length === 0 || clearAll.isPending) ? 0.4 : 1 }]}
                  onPress={() => { clearAll.mutate(); }}
                  disabled={bugItems.length === 0 || clearAll.isPending}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.error ?? "#E53E3E"} />
                  <Text style={[styles.bugBtnTxt, { color: colors.error ?? "#E53E3E" }]}>Svuota</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  backdropTap: { position: "absolute" },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, overflow: "hidden" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderBottomWidth: 1,
  },
  tabs: {
    flexDirection: "row", flex: 1, borderRadius: 8,
    borderWidth: 1, overflow: "hidden",
  },
  tab: {
    flex: 1, paddingVertical: 5, alignItems: "center", justifyContent: "center",
  },
  tabTxt: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  openBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  openTxt: { fontFamily: "Inter_500Medium", fontSize: 11 },
  thread: { flex: 1, padding: 10 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", marginTop: 24, fontStyle: "italic" },
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    padding: 10, borderTopWidth: 1,
  },
  input: {
    flex: 1, fontFamily: "Inter_400Regular", fontSize: 13,
    borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, maxHeight: 100,
  },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  bugContainer: { flex: 1, flexDirection: "column" },
  bugList: { flex: 1 },
  bugListContent: { padding: 10, gap: 8 },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1, margin: 12,
  },
  errorTxt: { fontFamily: "Inter_500Medium", fontSize: 13 },
  bugItem: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 4 },
  bugItemHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  bugTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1 },
  severityBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  severityTxt: { fontFamily: "Inter_700Bold", fontSize: 9, textTransform: "uppercase" },
  countBadge: {
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1,
  },
  countTxt: { fontFamily: "Inter_600SemiBold", fontSize: 9 },
  bugMsg: { fontFamily: "Inter_400Regular", fontSize: 11, paddingLeft: 20 },
  bugDate: { fontFamily: "Inter_400Regular", fontSize: 10, paddingLeft: 20, opacity: 0.7 },
  bugActions: {
    flexDirection: "row", gap: 8, padding: 10, borderTopWidth: 1,
  },
  bugBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  bugBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
