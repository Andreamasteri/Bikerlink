import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { CrashLogRow, CrashTypeBadge, formatDate, formatDuration, getTypeMeta } from "./CrashLogTypes";
import { Platform } from "react-native";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function extractSignalContext(errorMessage: string | null): string | null {
  if (!errorMessage) return null;
  const match = errorMessage.match(/^\[resume:[^\]]+\]\s*(.*)/s);
  return match ? match[1].trim() : null;
}

function SignalContextRow({ type, message }: { type: string; message: string | null }) {
  if (!message) return null;
  const meta = getTypeMeta(type);

  // For gps_flood: extract fix/sec
  if (type === "gps_flood") {
    const fsMatch = message.match(/(\d+(?:\.\d+)?)\s*fix\/sec/i);
    const accMatch = message.match(/accuracy=(\S+)m/i);
    return (
      <View style={[sigCtxStyles.row, { backgroundColor: meta.color + "11", borderColor: meta.color + "33" }]}>
        {fsMatch && (
          <View style={sigCtxStyles.chip}>
            <MaterialCommunityIcons name="map-marker-alert" size={11} color={meta.color} />
            <Text style={[sigCtxStyles.chipText, { color: meta.color }]}>{fsMatch[1]} fix/sec</Text>
          </View>
        )}
        {accMatch && (
          <View style={sigCtxStyles.chip}>
            <MaterialCommunityIcons name="crosshairs-gps" size={11} color={meta.color} />
            <Text style={[sigCtxStyles.chipText, { color: meta.color }]}>acc: {accMatch[1]}m</Text>
          </View>
        )}
      </View>
    );
  }

  // For memory_pressure: extract heap %
  if (type === "memory_pressure") {
    const ratioMatch = message.match(/(\d+)%/);
    const mbMatch = message.match(/(\d+)\/(\d+)MB/);
    const isOsWarning = message.toLowerCase().includes("memorywarning");
    return (
      <View style={[sigCtxStyles.row, { backgroundColor: meta.color + "11", borderColor: meta.color + "33" }]}>
        {isOsWarning && (
          <View style={sigCtxStyles.chip}>
            <MaterialCommunityIcons name="alert" size={11} color={meta.color} />
            <Text style={[sigCtxStyles.chipText, { color: meta.color }]}>OS memoryWarning</Text>
          </View>
        )}
        {ratioMatch && !isOsWarning && (
          <View style={sigCtxStyles.chip}>
            <MaterialCommunityIcons name="memory" size={11} color={meta.color} />
            <Text style={[sigCtxStyles.chipText, { color: meta.color }]}>heap: {ratioMatch[1]}%</Text>
          </View>
        )}
        {mbMatch && (
          <View style={sigCtxStyles.chip}>
            <MaterialCommunityIcons name="chart-donut" size={11} color={meta.color} />
            <Text style={[sigCtxStyles.chipText, { color: meta.color }]}>{mbMatch[1]}/{mbMatch[2]} MB</Text>
          </View>
        )}
      </View>
    );
  }

  // For js_thread_freeze: extract freeze duration
  if (type === "js_thread_freeze") {
    const secMatch = message.match(/~(\d+(?:\.\d+)?)s/i);
    const gapMatch = message.match(/gap=(\d+)ms/i);
    return (
      <View style={[sigCtxStyles.row, { backgroundColor: meta.color + "11", borderColor: meta.color + "33" }]}>
        {secMatch && (
          <View style={sigCtxStyles.chip}>
            <MaterialCommunityIcons name="timer-alert-outline" size={11} color={meta.color} />
            <Text style={[sigCtxStyles.chipText, { color: meta.color }]}>freeze ~{secMatch[1]}s</Text>
          </View>
        )}
        {gapMatch && (
          <View style={sigCtxStyles.chip}>
            <MaterialCommunityIcons name="clock-outline" size={11} color={meta.color} />
            <Text style={[sigCtxStyles.chipText, { color: meta.color }]}>gap: {gapMatch[1]}ms</Text>
          </View>
        )}
      </View>
    );
  }

  // For appstate_transition: extract prev→new state
  if (type === "appstate_transition") {
    const prevMatch = message.match(/prev(?:State)?[=:\s]+(\w+)/i);
    const newMatch = message.match(/new(?:State)?[=:\s]+(\w+)/i);
    return (
      <View style={[sigCtxStyles.row, { backgroundColor: meta.color + "11", borderColor: meta.color + "33" }]}>
        {(prevMatch || newMatch) ? (
          <View style={sigCtxStyles.chip}>
            <MaterialCommunityIcons name="transit-connection" size={11} color={meta.color} />
            <Text style={[sigCtxStyles.chipText, { color: meta.color }]}>
              {prevMatch?.[1] ?? "?"} → {newMatch?.[1] ?? "?"}
            </Text>
          </View>
        ) : (
          <Text style={[sigCtxStyles.chipText, { color: meta.color }]} numberOfLines={1}>{message.slice(0, 80)}</Text>
        )}
      </View>
    );
  }

  // Default: show raw context truncated
  return (
    <View style={[sigCtxStyles.row, { backgroundColor: meta.color + "11", borderColor: meta.color + "33" }]}>
      <Text style={[sigCtxStyles.chipText, { color: meta.color }]} numberOfLines={2}>{message.slice(0, 120)}</Text>
    </View>
  );
}

const sigCtxStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
  },
  chip: { flexDirection: "row", alignItems: "center", gap: 3 },
  chipText: { fontFamily: "Inter_400Regular", fontSize: 11 },
});

export function CrashLogCard({
  item,
  onOpenStack,
}: {
  item: CrashLogRow;
  onOpenStack: (item: CrashLogRow) => void;
}) {
  const colors = useColors();
  const duration = formatDuration(item.sessionStartedAt, item.sessionEndedAt ?? item.reportedAt);
  const hasStack = !!item.stackTrace;
  const displayType = item.derivedType ?? item.crashType;
  const isSignal = ["js_thread_freeze", "gps_flood", "memory_pressure", "native_module_missing", "appstate_transition"].includes(displayType);
  const signalContext = isSignal ? extractSignalContext(item.errorMessage) : null;

  return (
    <TouchableOpacity
      style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => onOpenStack(item)}
      activeOpacity={0.8}
    >
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <CrashTypeBadge type={displayType} />
          <Text style={[cardStyles.nickname, { color: colors.text }]}>
            {item.nickname ?? item.userId.slice(0, 8)}
          </Text>
        </View>
        <View style={cardStyles.headerRight}>
          <Text style={[cardStyles.date, { color: colors.textSecondary }]}>
            {formatDate(item.reportedAt)}
          </Text>
          {hasStack && (
            <View style={[cardStyles.stackBadge, { backgroundColor: (colors.accent ?? "#FF6600") + "22" }]}>
              <MaterialCommunityIcons name="code-braces" size={11} color={colors.accent ?? "#FF6600"} />
              <Text style={[cardStyles.stackBadgeText, { color: colors.accent ?? "#FF6600" }]}>stack</Text>
            </View>
          )}
        </View>
      </View>

      <View style={cardStyles.meta}>
        {item.platform ? (
          <View style={cardStyles.metaItem}>
            <Ionicons name="phone-portrait-outline" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>
              {item.platform}{item.osVersion ? ` ${item.osVersion}` : ""}
            </Text>
          </View>
        ) : null}
        {(item.deviceBrand || item.deviceModel) ? (
          <View style={cardStyles.metaItem}>
            <MaterialCommunityIcons name="cellphone" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>
              {[item.deviceBrand, item.deviceModel].filter(Boolean).join(" ")}
            </Text>
          </View>
        ) : null}
        {item.totalMemoryMb != null ? (
          <View style={cardStyles.metaItem}>
            <MaterialCommunityIcons name="memory" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: item.totalMemoryMb < 2048 ? "#FF6B35" : colors.textSecondary }]}>
              {(item.totalMemoryMb / 1024).toFixed(1)} GB RAM
            </Text>
          </View>
        ) : null}
        {item.appVersion ? (
          <View style={cardStyles.metaItem}>
            <MaterialCommunityIcons name="tag-outline" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>v{item.appVersion}</Text>
          </View>
        ) : null}
        {duration ? (
          <View style={cardStyles.metaItem}>
            <Ionicons name="timer-outline" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>Sessione {duration}</Text>
          </View>
        ) : null}
        {item.sessionId ? (
          <View style={cardStyles.metaItem}>
            <MaterialCommunityIcons name="identifier" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.sessionId.length > 12 ? item.sessionId.slice(0, 12) + "…" : item.sessionId}
            </Text>
          </View>
        ) : null}
      </View>

      {isSignal && signalContext ? (
        <SignalContextRow type={displayType} message={signalContext} />
      ) : item.errorMessage ? (
        <Text
          style={[cardStyles.errorMessage, { color: "#FF4444", backgroundColor: "#FF444411" }]}
          numberOfLines={2}
        >
          {item.errorMessage}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10, gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { gap: 6, flex: 1 },
  headerRight: { alignItems: "flex-end", gap: 4 },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  date: { fontFamily: "Inter_400Regular", fontSize: 12 },
  stackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stackBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  errorMessage: { fontFamily: MONO, fontSize: 12, borderRadius: 6, padding: 8, lineHeight: 18 },
});
