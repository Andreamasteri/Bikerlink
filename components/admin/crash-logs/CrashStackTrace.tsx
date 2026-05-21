import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  ScrollView,
  Pressable,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { CrashLogRow, CrashTypeBadge, formatDate } from "./CrashLogTypes";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function classifyLine(line: string): "error" | "app" | "external" {
  if (!line.trimStart().startsWith("at ")) return "error";
  if (line.includes("node_modules") || line.includes("/Libraries/") || line.includes("internal/")) return "external";
  return "app";
}

export function CrashStackTrace({
  visible,
  item,
  onClose,
}: {
  visible: boolean;
  item: CrashLogRow | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!item) return;
    const parts: string[] = [];
    if (item.errorMessage) parts.push(item.errorMessage);
    if (item.stackTrace) parts.push(item.stackTrace);
    await Clipboard.setStringAsync(parts.join("\n\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [item]);

  if (!item) return null;

  const lines = (item.stackTrace ?? "").split("\n");
  const appLineColor = colors.accent ?? "#FF6600";
  const externalColor = colors.textSecondary ?? "#888";
  const errorColor = "#FF4444";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={modalStyles.backdrop} onPress={onClose} />
      <View style={[
        modalStyles.sheet,
        {
          backgroundColor: colors.surface,
          paddingBottom: insets.bottom + 16,
        },
      ]}>
        <View style={[modalStyles.handle, { backgroundColor: colors.border }]} />

        <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
          <View style={modalStyles.headerLeft}>
            <CrashTypeBadge type={item.crashType} />
            <Text style={[modalStyles.headerNick, { color: colors.text }]}>
              {item.nickname ?? item.userId.slice(0, 8)}
            </Text>
            <Text style={[modalStyles.headerDate, { color: externalColor }]}>
              {formatDate(item.reportedAt)}
            </Text>
          </View>
          <View style={modalStyles.headerActions}>
            {(item.errorMessage || item.stackTrace) && (
              <TouchableOpacity
                onPress={handleCopy}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[modalStyles.copyBtn, { backgroundColor: copied ? (colors.accent ?? "#FF6600") + "22" : "transparent" }]}
              >
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={20}
                  color={copied ? (colors.accent ?? "#FF6600") : externalColor}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {item.errorMessage ? (
          <View style={[modalStyles.errorBox, { backgroundColor: "#FF444418" }]}>
            <Text style={[modalStyles.errorText, { color: errorColor, fontFamily: MONO }]} selectable>
              {item.errorMessage}
            </Text>
          </View>
        ) : null}

        {item.stackTrace ? (
          <ScrollView
            style={modalStyles.stackScroll}
            contentContainerStyle={[modalStyles.stackContent, { backgroundColor: colors.background }]}
            showsVerticalScrollIndicator
          >
            <View style={modalStyles.legend}>
              <View style={modalStyles.legendItem}>
                <View style={[modalStyles.legendDot, { backgroundColor: appLineColor }]} />
                <Text style={[modalStyles.legendText, { color: externalColor }]}>App</Text>
              </View>
              <View style={modalStyles.legendItem}>
                <View style={[modalStyles.legendDot, { backgroundColor: externalColor }]} />
                <Text style={[modalStyles.legendText, { color: externalColor }]}>Librerie esterne</Text>
              </View>
            </View>
            {lines.map((line, i) => {
              const kind = classifyLine(line);
              const color =
                kind === "error" ? errorColor :
                kind === "app" ? appLineColor :
                externalColor;
              const weight = kind === "app" ? "600" : "400";
              return (
                <Text
                  key={i}
                  style={[modalStyles.stackLine, { color, fontWeight: weight as "600" | "400" }]}
                  selectable
                >
                  {line || " "}
                </Text>
              );
            })}
          </ScrollView>
        ) : (
          <View style={modalStyles.noStack}>
            <Text style={[modalStyles.noStackText, { color: externalColor }]}>
              Nessuno stack trace disponibile
            </Text>
          </View>
        )}

        {item.sessionId ? (
          <Text style={[modalStyles.sessionId, { color: externalColor }]} selectable>
            Session: {item.sessionId}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerLeft: { gap: 4, flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  copyBtn: { borderRadius: 8, padding: 4 },
  headerNick: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  headerDate: { fontFamily: "Inter_400Regular", fontSize: 12 },
  errorBox: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  stackScroll: {
    marginTop: 8,
    marginHorizontal: 12,
    borderRadius: 8,
    flexShrink: 1,
  },
  stackContent: {
    padding: 10,
    borderRadius: 8,
  },
  legend: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 11 },
  stackLine: {
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 18,
  },
  noStack: {
    padding: 24,
    alignItems: "center",
  },
  noStackText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  sessionId: {
    fontFamily: MONO,
    fontSize: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    opacity: 0.6,
  },
});
