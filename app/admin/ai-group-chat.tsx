/**
 * Admin — Conversazione osservabile a più agenti (Task #51)
 *
 * L'admin propone un argomento e osserva Bowie/Horus/Quebracho discutere a turni,
 * in diretta. Può riprendere una conversazione interrotta dall'ultimo turno e
 * interromperne una in corso. Solo admin (schermata sotto app/admin).
 */
import React, { useCallback, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import {
  startGroupChat, resumeGroupChat,
  type GroupTurnPersona,
} from "@/lib/admin/ai-group-chat-stream";

interface ConversationMeta {
  id: string;
  topic: string;
  participants: string[];
  maxTurns: number;
  turnCount: number;
  status: string;
  createdAt: string;
}

interface DisplayTurn {
  turnIndex: number;
  persona: string;
  personaName: string;
  content: string;
  streaming?: boolean;
}

const PERSONA_COLORS: Record<string, string> = {
  bowie: "#FF6600",
  horus: "#F59E0B",
  quebracho: "#22C55E",
};

const PERSONA_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  bowie: "robot-happy-outline",
  horus: "eye-outline",
  quebracho: "account-tie-outline",
};

export default function AiGroupChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [topic, setTopic] = useState("");
  const [turns, setTurns] = useState<DisplayTurn[]>([]);
  const [running, setRunning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const list = useQuery<{ conversations: ConversationMeta[] }>({
    queryKey: ["/api/admin/ai/group-chat/conversations"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/group-chat/conversations")).json(),
    refetchInterval: running ? false : 20_000,
  });

  const commonHandlers = useCallback(() => ({
    onConversation: (ev: { id: string; status: string }) => {
      setActiveId(ev.id);
      setStatusMsg(null);
    },
    onTurnStart: (ev: { turnIndex: number; persona: GroupTurnPersona }) => {
      setTurns((prev) => {
        if (prev.some((t) => t.turnIndex === ev.turnIndex)) return prev;
        return [...prev, {
          turnIndex: ev.turnIndex, persona: ev.persona.id, personaName: ev.persona.name,
          content: "", streaming: true,
        }];
      });
    },
    onDelta: (ev: { turnIndex: number; text: string; persona?: GroupTurnPersona }) => {
      // La persona è già nota da turn-start; usiamo un placeholder se assente.
      setTurns((prev) => {
        const idx = prev.findIndex((t) => t.turnIndex === ev.turnIndex);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], content: next[idx].content + ev.text };
        return next;
      });
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    onTurnEnd: (ev: { turnIndex: number; content: string; persona: GroupTurnPersona }) => {
      setTurns((prev) => {
        const idx = prev.findIndex((t) => t.turnIndex === ev.turnIndex);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], content: ev.content, streaming: false };
        return next;
      });
    },
    onDone: (ev: { status: string; turnCount: number }) => {
      setRunning(false);
      abortRef.current = null;
      setStatusMsg(ev.status === "completed"
        ? "Conversazione conclusa."
        : "Turno interrotto — riprendibile.");
      list.refetch();
    },
    onError: (ev: { message: string }) => {
      setRunning(false);
      abortRef.current = null;
      setStatusMsg(`Errore: ${ev.message}`);
      list.refetch();
    },
  }), [list]);

  const handleStart = useCallback(async () => {
    const t = topic.trim();
    if (t.length < 3 || running) return;
    setTurns([]);
    setActiveId(null);
    setStatusMsg(null);
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await startGroupChat({ topic: t, signal: ac.signal, ...commonHandlers() });
    } catch (err) {
      setRunning(false);
      abortRef.current = null;
      if (!ac.signal.aborted) setStatusMsg(`Errore: ${(err as Error).message}`);
    }
  }, [topic, running, commonHandlers]);

  const handleResume = useCallback(async (convo: ConversationMeta) => {
    if (running) return;
    setStatusMsg(null);
    setActiveId(convo.id);
    // Carica i turni già avvenuti prima di riprendere lo stream.
    try {
      const detail = await (await apiRequest("GET", `/api/admin/ai/group-chat/conversations/${convo.id}`)).json();
      const existing: DisplayTurn[] = (detail.turns ?? []).map((t: { turnIndex: number; persona: string; content: string }) => ({
        turnIndex: t.turnIndex,
        persona: t.persona,
        personaName: t.persona.charAt(0).toUpperCase() + t.persona.slice(1),
        content: t.content,
        streaming: false,
      }));
      setTurns(existing);
      setTopic(convo.topic);
    } catch { setTurns([]); }

    if (convo.status !== "running") {
      setStatusMsg(convo.status === "completed" ? "Conversazione già conclusa." : "Conversazione interrotta dall'admin.");
      return;
    }
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await resumeGroupChat(convo.id, { signal: ac.signal, ...commonHandlers() });
    } catch (err) {
      setRunning(false);
      abortRef.current = null;
      if (!ac.signal.aborted) setStatusMsg(`Errore: ${(err as Error).message}`);
    }
  }, [running, commonHandlers]);

  const handleStop = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    if (activeId) {
      try { await apiRequest("POST", `/api/admin/ai/group-chat/conversations/${activeId}/abort`); } catch { /* */ }
    }
    setStatusMsg("Conversazione interrotta.");
    list.refetch();
  }, [activeId, list]);

  const canStart = topic.trim().length >= 3 && !running;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Proponi un argomento: Bowie, Horus e Quebracho ne discutono a turni, in diretta.
        </Text>

        <TextInput
          value={topic}
          onChangeText={setTopic}
          editable={!running}
          placeholder="Argomento della discussione…"
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />

        <View style={styles.actionsRow}>
          {!running ? (
            <TouchableOpacity
              onPress={handleStart}
              disabled={!canStart}
              style={[styles.btn, { backgroundColor: canStart ? colors.accent : colors.border }]}
              testID="group-chat-start"
            >
              <MaterialCommunityIcons name="play" size={18} color="#fff" />
              <Text style={styles.btnTxt}>Avvia discussione</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleStop} style={[styles.btn, { backgroundColor: colors.error }]} testID="group-chat-stop">
              <MaterialCommunityIcons name="stop" size={18} color="#fff" />
              <Text style={styles.btnTxt}>Interrompi</Text>
            </TouchableOpacity>
          )}
          {running && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 12 }} />}
        </View>

        {statusMsg && (
          <Text style={[styles.status, { color: colors.textSecondary }]}>{statusMsg}</Text>
        )}

        {/* Turni in streaming */}
        {turns.map((t) => {
          const color = PERSONA_COLORS[t.persona] ?? colors.accent;
          const icon = PERSONA_ICONS[t.persona] ?? "robot-outline";
          return (
            <View key={t.turnIndex} style={[styles.turn, { backgroundColor: colors.surface, borderLeftColor: color }]}>
              <View style={styles.turnHeader}>
                <MaterialCommunityIcons name={icon} size={16} color={color} />
                <Text style={[styles.turnName, { color }]}>{t.personaName}</Text>
                {t.streaming && <ActivityIndicator size="small" color={color} style={{ marginLeft: 8 }} />}
              </View>
              <Text style={[styles.turnText, { color: colors.text }]}>{t.content || "…"}</Text>
            </View>
          );
        })}

        {/* Conversazioni recenti */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Conversazioni recenti</Text>
        {list.isLoading && <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 8 }} />}
        {list.data?.conversations?.length === 0 && (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessuna conversazione ancora.</Text>
        )}
        {list.data?.conversations?.map((c) => (
          <TouchableOpacity
            key={c.id}
            onPress={() => handleResume(c)}
            disabled={running}
            style={[styles.convoRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
            testID={`group-chat-convo-${c.id}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.convoTopic, { color: colors.text }]} numberOfLines={1}>{c.topic}</Text>
              <Text style={[styles.convoMeta, { color: colors.textSecondary }]}>
                {c.turnCount}/{c.maxTurns} turni · {statusLabel(c.status)}
              </Text>
            </View>
            {c.status === "running" && (
              <View style={[styles.resumeTag, { borderColor: colors.accent }]}>
                <MaterialCommunityIcons name="play" size={12} color={colors.accent} />
                <Text style={[styles.resumeTxt, { color: colors.accent }]}>Riprendi</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed": return "conclusa";
    case "aborted": return "interrotta";
    default: return "in corso";
  }
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  intro: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 12 },
  input: {
    borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 60,
    fontFamily: "Inter_400Regular", fontSize: 14, textAlignVertical: "top",
  },
  actionsRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  btnTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  status: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 10 },
  turn: {
    borderRadius: 10, borderLeftWidth: 3, padding: 12, marginTop: 12,
  },
  turnHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  turnName: { fontFamily: "Inter_700Bold", fontSize: 13, marginLeft: 6 },
  turnText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  divider: { height: 1, marginVertical: 20 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 8 },
  convoRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10,
  },
  convoTopic: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  convoMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  resumeTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  resumeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
});
