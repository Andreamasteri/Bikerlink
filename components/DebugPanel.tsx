import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { DebugLogEntry } from "@/hooks/useApiDebugLog";

interface DebugPanelProps {
  logs: DebugLogEntry[];
  onClear: () => void;
}

const STATUS_COLOR = {
  success: "#22c55e",
  fallback: "#f59e0b",
  error: "#ef4444",
} as const;

const STATUS_LABEL = {
  success: "OK",
  fallback: "FALLBACK",
  error: "ERR",
} as const;

function relativeTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s fa`;
  const mins = Math.floor(secs / 60);
  return `${mins}m fa`;
}

function formatAllLogs(logs: DebugLogEntry[]): string {
  return logs
    .map((l) => {
      const ts = new Date(l.timestamp).toISOString();
      const status = l.statusCode != null ? ` HTTP ${l.statusCode}` : "";
      const dur = l.durationMs != null ? ` ${l.durationMs}ms` : "";
      const flag = l.isFallback ? " [FALLBACK]" : l.missingKey ? " [NO-KEY]" : "";
      return `[${ts}] ${l.method} ${l.endpoint}${status}${dur}${flag}\n${l.preview}`;
    })
    .join("\n\n---\n\n");
}

export default function DebugPanel({ logs, onClear }: DebugPanelProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = formatAllLogs(logs);
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [logs]);

  const s = styles(colors);

  return (
    <View style={s.container}>
      <Pressable style={s.header} onPress={() => setExpanded((v) => !v)}>
        <View style={s.headerLeft}>
          <View style={s.badge}>
            <Text style={s.badgeText}>DEBUG</Text>
          </View>
          <Text style={s.headerTitle}>API Log</Text>
          {logs.length > 0 && (
            <View style={[s.countBadge, { backgroundColor: logs.some((l) => l.status === "error") ? "#ef444433" : "#22c55e22" }]}>
              <Text style={[s.countText, { color: logs.some((l) => l.status === "error") ? "#ef4444" : "#22c55e" }]}>
                {logs.length}
              </Text>
            </View>
          )}
        </View>
        <View style={s.headerRight}>
          {logs.length > 0 && (
            <>
              <Pressable
                style={s.iconBtn}
                onPress={(e) => { e.stopPropagation(); handleCopy(); }}
                hitSlop={8}
              >
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={14}
                  color={copied ? "#22c55e" : colors.textSecondary}
                />
              </Pressable>
              <Pressable
                style={s.iconBtn}
                onPress={(e) => { e.stopPropagation(); onClear(); }}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={14} color={colors.textSecondary} />
              </Pressable>
            </>
          )}
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.textSecondary}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={s.body}>
          {logs.length === 0 ? (
            <Text style={s.empty}>Nessuna chiamata API registrata ancora.</Text>
          ) : (
            <ScrollView
              style={s.logScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {logs.map((entry) => (
                <View key={entry.id} style={[s.logRow, { borderLeftColor: STATUS_COLOR[entry.status] }]}>
                  <View style={s.logMeta}>
                    <View style={[s.statusTag, { backgroundColor: STATUS_COLOR[entry.status] + "22" }]}>
                      <Text style={[s.statusText, { color: STATUS_COLOR[entry.status] }]}>
                        {STATUS_LABEL[entry.status]}
                      </Text>
                    </View>
                    <Text style={s.method}>{entry.method}</Text>
                    <Text style={s.endpoint} numberOfLines={1}>{entry.endpoint}</Text>
                    {entry.statusCode != null && (
                      <Text style={[s.code, { color: entry.statusCode >= 400 ? "#ef4444" : colors.textSecondary }]}>
                        {entry.statusCode}
                      </Text>
                    )}
                  </View>
                  <View style={s.logSub}>
                    <Text style={s.relTime}>{relativeTime(entry.timestamp)}</Text>
                    {entry.durationMs != null && (
                      <Text style={s.duration}>{entry.durationMs}ms</Text>
                    )}
                    {entry.isFallback && (
                      <Text style={s.flagFallback}>FALLBACK</Text>
                    )}
                    {entry.missingKey && (
                      <Text style={s.flagKey}>NO-KEY</Text>
                    )}
                  </View>
                  {entry.preview ? (
                    <Text style={s.preview} numberOfLines={3}>{entry.preview}</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      marginTop: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#f59e0b44",
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
    },
    badge: {
      backgroundColor: "#f59e0b22",
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: {
      fontFamily: "Inter_700Bold",
      fontSize: 10,
      color: "#f59e0b",
      letterSpacing: 0.5,
    },
    headerTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      color: colors.text,
    },
    countBadge: {
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    countText: {
      fontFamily: "Inter_700Bold",
      fontSize: 11,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    iconBtn: {
      padding: 2,
    },
    body: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    empty: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.textSecondary,
      padding: 14,
      textAlign: "center",
    },
    logScroll: {
      maxHeight: 320,
    },
    logRow: {
      borderLeftWidth: 3,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 4,
    },
    logMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    statusTag: {
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    statusText: {
      fontFamily: "Inter_700Bold",
      fontSize: 9,
      letterSpacing: 0.3,
    },
    method: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 10,
      color: colors.textSecondary,
    },
    endpoint: {
      fontFamily: "Inter_500Medium",
      fontSize: 12,
      color: colors.text,
      flex: 1,
    },
    code: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 11,
    },
    logSub: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    relTime: {
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      color: colors.textSecondary,
    },
    duration: {
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      color: colors.textSecondary,
    },
    flagFallback: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 9,
      color: "#f59e0b",
      backgroundColor: "#f59e0b22",
      borderRadius: 3,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    flagKey: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 9,
      color: "#ef4444",
      backgroundColor: "#ef444422",
      borderRadius: 3,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    preview: {
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      color: colors.textSecondary,
      lineHeight: 15,
    },
  });
