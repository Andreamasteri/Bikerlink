// Task #2641 — Drawer compatto del FAB: input + ultimi 5 messaggi + link console.
import React, { useState, useEffect } from "react";
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  useWindowDimensions,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAiConsole } from "@/hooks/admin/ai-console/useAiConsole";
import {
  useAiConversations,
  useAiConversationMessages,
} from "@/hooks/admin/ai-console/useAiConversation";
import MessageItem from "./MessageItem";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FabDrawer({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = windowHeight * 0.75;
  const router = useRouter();
  const [input, setInput] = useState("");
  const { data: convs } = useAiConversations();
  const lastId = convs?.conversations?.[0]?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setActiveId(lastId);
  }, [visible, lastId]);

  const { data: thread } = useAiConversationMessages(activeId);
  const { state, send } = useAiConsole(activeId, (id) => setActiveId(id));

  const recent = (thread?.messages ?? []).slice(-5);

  const openFull = () => {
    onClose();
    router.push("/admin/ai-console" as never);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={[styles.backdropTap, { top: 0, left: 0, right: 0, bottom: 0 }]} onPress={onClose} activeOpacity={1} />
        <KeyboardAvoidingView behavior="position">
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                paddingBottom: insets.bottom + 8,
                height: sheetHeight,
              },
            ]}
          >
            <View style={[styles.header, { borderColor: colors.border }]}>
              <Ionicons name="sparkles" size={16} color={colors.accent} />
              <Text style={[styles.title, { color: colors.text }]}>AI Console</Text>
              <TouchableOpacity onPress={openFull} style={styles.openBtn}>
                <Text style={[styles.openTxt, { color: colors.accent }]}>Apri completa</Text>
                <Ionicons name="open-outline" size={14} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} accessibilityLabel="Chiudi">
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

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

            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
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
          </View>
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
  title: { fontFamily: "Inter_700Bold", fontSize: 14, flex: 1 },
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
});
