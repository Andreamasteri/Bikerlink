// Task #2641 — Render singolo messaggio. Bubble user/assistant/tool/router,
// scope badges, tool call collapse, link cliccabili a entità citate.
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import ScopeBadges from "./ScopeBadges";
import type { AiMessageRow } from "@/hooks/admin/ai-console/useAiConversation";
import { usePinMessage } from "@/hooks/admin/ai-console/useAiPinned";

interface Props {
  message: AiMessageRow;
}

// Regex per entità citate inline nei messaggi (es. reportId: <uuid>, userId: <uuid>).
const ENTITY_RE = /\b(reportId|userId|snapshotId|violationId|runId|matchId)\s*[:=]\s*([0-9a-f-]{8,36})/gi;

export default function MessageItem({ message }: Props) {
  const colors = useColors();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const pinMut = usePinMessage();

  const isUser = message.role === "user";
  const isRouter = message.role === "router";
  const isAssistant = message.role === "assistant";
  const isTool = message.role === "tool";

  const canPin = isAssistant && message.id && message.id !== "__live__" && message.conversationId && message.conversationId !== "live";
  const onPin = () => {
    if (!canPin || pinned || pinMut.isPending) return;
    // Task #2645 — preserva sia title (snippet) sia note (contenuto integrale)
    // così l'insight nella knowledge base resta utile senza ulteriore editing.
    const title = (message.content || "").slice(0, 80).trim() || "Insight AI";
    pinMut.mutate(
      { conversationId: message.conversationId, messageId: message.id, title, note: message.content ?? "" },
      { onSuccess: () => setPinned(true) },
    );
  };

  const segments = useMemo(() => parseEntities(message.content), [message.content]);

  function openEntity(kind: string, id: string) {
    const k = kind.toLowerCase();
    if (k === "reportid") router.push(`/admin/reports?id=${id}` as never);
    else if (k === "userid") router.push(`/profile/${id}` as never);
    else if (k === "matchid") router.push(`/admin/match-inspector?id=${id}` as never);
    else if (k === "violationid" || k === "runid") router.push(`/admin/db-integrity` as never);
    else if (k === "snapshotid") router.push(`/admin/db-debug` as never);
  }

  const bubbleStyle = [
    styles.bubble,
    {
      backgroundColor: isUser ? colors.accent : colors.surface,
      borderColor: colors.border,
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "92%" as const,
    },
  ];

  return (
    <View style={[styles.wrap, { alignItems: isUser ? "flex-end" : "flex-start" }]}>
      {isRouter ? (
        <View style={[styles.routerCard, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
          <View style={styles.routerHeader}>
            <Ionicons name="git-branch-outline" size={12} color={colors.textSecondary} />
            <Text style={[styles.routerLabel, { color: colors.textSecondary }]}>Router</Text>
            <ScopeBadges scopes={message.scopes} size="sm" />
          </View>
          <Text style={[styles.routerText, { color: colors.text }]} numberOfLines={2}>
            {message.content}
          </Text>
        </View>
      ) : (
        <View style={bubbleStyle as never}>
          {!isUser && message.scopes && message.scopes.length > 0 ? (
            <View style={{ marginBottom: 6 }}>
              <ScopeBadges scopes={message.scopes} size="sm" />
            </View>
          ) : null}
          <Text style={[styles.bubbleText, { color: isUser ? "#fff" : colors.text }]}>
            {segments.map((seg, i) =>
              seg.kind === "entity" ? (
                <Text
                  key={i}
                  style={{ color: isUser ? "#fff" : colors.accent, textDecorationLine: "underline" }}
                  onPress={() => openEntity(seg.entityKind!, seg.entityId!)}
                >
                  {seg.text}
                </Text>
              ) : (
                <Text key={i}>{seg.text}</Text>
              ),
            )}
          </Text>

          {isAssistant && message.toolCalls && message.toolCalls.length > 0 ? (
            <TouchableOpacity onPress={() => setExpanded((e) => !e)} style={styles.toolToggle}>
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={12}
                color={colors.textSecondary}
              />
              <Text style={[styles.toolToggleText, { color: colors.textSecondary }]}>
                {message.toolCalls.length} tool {message.toolCalls.length === 1 ? "call" : "calls"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {expanded && message.toolCalls
            ? message.toolCalls.map((tc, i) => (
                <View
                  key={i}
                  style={[styles.toolCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={[styles.toolName, { color: colors.accent }]}>⚙ {tc.name}</Text>
                  {tc.args ? (
                    <Text style={[styles.toolJson, { color: colors.textSecondary }]} numberOfLines={4}>
                      {safeJson(tc.args)}
                    </Text>
                  ) : null}
                </View>
              ))
            : null}

          {isAssistant && message.costUsd && parseFloat(message.costUsd) > 0 ? (
            <Text style={[styles.cost, { color: colors.textSecondary }]}>
              ${parseFloat(message.costUsd).toFixed(4)} · {message.tokensIn}/{message.tokensOut} tok
            </Text>
          ) : null}

          {canPin ? (
            <TouchableOpacity
              onPress={onPin}
              style={styles.pinBtn}
              accessibilityLabel={pinned ? "Pinnato" : "Pinna insight"}
              testID="ai-pin-message"
            >
              <Ionicons
                name={pinned ? "bookmark" : "bookmark-outline"}
                size={14}
                color={pinned ? colors.accent : colors.textSecondary}
              />
              <Text style={[styles.pinTxt, { color: pinned ? colors.accent : colors.textSecondary }]}>
                {pinned ? "Pinnato" : pinMut.isPending ? "…" : "Pinna"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {isTool ? (
            <Text style={[styles.cost, { color: colors.textSecondary }]}>tool result</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v, null, 2).slice(0, 400); }
  catch { return String(v).slice(0, 200); }
}

interface Segment {
  kind: "text" | "entity";
  text: string;
  entityKind?: string;
  entityId?: string;
}

function parseEntities(content: string): Segment[] {
  if (!content) return [{ kind: "text", text: "" }];
  const out: Segment[] = [];
  let lastIdx = 0;
  const re = new RegExp(ENTITY_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIdx) out.push({ kind: "text", text: content.slice(lastIdx, m.index) });
    out.push({ kind: "entity", text: m[0], entityKind: m[1], entityId: m[2] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < content.length) out.push({ kind: "text", text: content.slice(lastIdx) });
  return out.length ? out : [{ kind: "text", text: content }];
}

const styles = StyleSheet.create({
  wrap: { width: "100%", marginVertical: 4 },
  bubble: { padding: 10, borderRadius: 12, borderWidth: 1 },
  bubbleText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  toolToggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  toolToggleText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  toolCard: { marginTop: 6, borderRadius: 8, borderWidth: 1, padding: 8 },
  toolName: { fontFamily: "Inter_600SemiBold", fontSize: 11, marginBottom: 4 },
  toolJson: { fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14 },
  cost: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 6, opacity: 0.8 },
  pinBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start" },
  pinTxt: { fontFamily: "Inter_500Medium", fontSize: 10 },
  routerCard: { borderRadius: 8, borderWidth: 1, padding: 8, marginVertical: 4, alignSelf: "stretch" },
  routerHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" },
  routerLabel: { fontFamily: "Inter_700Bold", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 },
  routerText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15, fontStyle: "italic" },
});
