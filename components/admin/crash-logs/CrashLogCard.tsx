import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { CrashLogRow, CrashTypeBadge, formatDate, formatDuration } from "./CrashLogTypes";
import { Platform } from "react-native";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

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

  return (
    <TouchableOpacity
      style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => onOpenStack(item)}
      activeOpacity={0.8}
    >
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <CrashTypeBadge type={item.crashType} />
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

      {item.errorMessage ? (
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
